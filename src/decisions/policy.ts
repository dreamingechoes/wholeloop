import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPolicy } from '../delivery/plan.js'
import { type DELIVERY_DECISIONS, validateDeliveryShape } from '../delivery/plan.js'
import rubricSchema from './schemas/rubric-v1.json' with { type: 'json' }

export const DECISION_RUBRIC_SCHEMA = rubricSchema
export type DecisionId = (typeof DELIVERY_DECISIONS)[number]
export type DecisionOutcome =
  | 'accept'
  | 'reject'
  | 'go'
  | 'on-hold'
  | 'dropped'
  | 'keep'
  | 'iterate'
  | 'kill'
  | 'unflag'
  | 'propose'
export interface DecisionUnknown {
  id: string
  missing: string
  who: string
}
export interface DecisionRubric {
  schema: 'wholeloop/delegated-decision-rubric@1'
  decision: DecisionId
  purpose: string
  rules: { id: string; text: string }[]
  outcomes: DecisionOutcome[]
  unknowns: { allowed: string[]; defaults: { id: string; value: string; reason: string }[] }
  timeoutMs: number
}
export class DelegatedDecisionError extends Error {
  constructor(readonly problem: string) {
    super(`Delegated decision refused: ${problem}; contents omitted`)
  }
}
const OUTCOMES: Record<DecisionId, readonly DecisionOutcome[]> = {
  'delivery-plan': ['accept', 'reject'],
  'research-plan': ['accept', 'reject'],
  'research-sources': ['accept', 'reject'],
  'frame-outcome': ['go', 'on-hold', 'dropped'],
  'approve-spec': ['accept', 'reject'],
  'approve-scopes': ['accept', 'reject'],
  'approve-build-plan': ['accept', 'reject'],
  acceptance: ['accept', 'reject'],
  'learning-outcome': ['keep', 'iterate', 'kill', 'unflag'],
  'ramp-assessment': ['propose', 'on-hold'],
}
export function uniqueDecisionValues(values: string[]): boolean {
  return new Set(values).size === values.length
}
export function decisionRubric(value: unknown, decision: DecisionId): DecisionRubric {
  validateDeliveryShape(value, rubricSchema)
  const rubric = structuredClone(value) as DecisionRubric
  if (
    rubric.decision !== decision ||
    !uniqueDecisionValues(rubric.rules.map((r) => r.id)) ||
    !uniqueDecisionValues(rubric.outcomes) ||
    !uniqueDecisionValues(rubric.unknowns.allowed) ||
    !uniqueDecisionValues(rubric.unknowns.defaults.map((d) => d.id)) ||
    rubric.outcomes.some((outcome) => !OUTCOMES[decision].includes(outcome)) ||
    rubric.unknowns.defaults.some((d) => !rubric.unknowns.allowed.includes(d.id))
  )
    throw new DelegatedDecisionError('rubric-scope')
  return rubric
}

/** Resolution instructions retain missing facts; selecting a default does not assert that fact. */
export function decisionFallback(input: {
  intervention: DeliveryPolicy['intervention']
  policy: DeliveryPolicy['uncertainty']
  rubric: DecisionRubric
  unknowns: DecisionUnknown[]
  nonDelegable: boolean
  remainingMs: number
}) {
  const common = {
    unknowns: structuredClone(input.unknowns),
    humanApproval: 'not-recorded' as const,
  }
  if (input.nonDelegable)
    return { ...common, action: 'blocked' as const, reason: 'non-delegable-prerequisite' }
  if (input.intervention !== 'none')
    return { ...common, action: 'needs-input' as const, reason: 'operator-intervention-permitted' }
  if (input.remainingMs <= 0)
    return { ...common, action: 'exhausted' as const, reason: 'finite-resolution-budget' }
  const owned = input.unknowns.every((u) => input.rubric.unknowns.allowed.includes(u.id))
  if (!owned || !input.unknowns.length)
    return { ...common, action: 'blocked' as const, reason: 'unowned-or-missing-unknowns' }
  if (input.policy === 'investigate')
    return {
      ...common,
      action: 'investigate' as const,
      reason: 'bounded-investigation',
      deadlineMs: Math.min(input.remainingMs, input.rubric.timeoutMs),
    }
  if (input.policy === 'explicit-default') {
    const defaults = input.unknowns.map((u) =>
      input.rubric.unknowns.defaults.find((d) => d.id === u.id),
    )
    if (defaults.every((d) => d !== undefined))
      return {
        ...common,
        action: 'apply-default' as const,
        reason: 'operator-pinned-default',
        defaults,
      }
  }
  if (input.policy === 'least-scope')
    return {
      ...common,
      action: 'evaluate-least-scope' as const,
      reason: 'independent-reversible-scope-review-required',
    }
  if (input.policy === 'complete-with-unknowns')
    return {
      ...common,
      action: 'complete-with-unknowns' as const,
      reason: 'explicit-owned-unknowns',
    }
  if (input.policy === 'on-hold' && input.rubric.outcomes.includes('on-hold'))
    return { ...common, action: 'on-hold' as const, reason: 'authorized-on-hold' }
  return { ...common, action: 'blocked' as const, reason: 'no-permitted-resolution' }
}

export function decisionPolicyDigest(policy: DeliveryPolicy): string {
  return contractDigest(policy)
}
