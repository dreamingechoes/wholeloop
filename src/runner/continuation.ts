import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { findBudget } from '../delivery/budget-events.js'
import { deliveryEffects } from '../delivery/effect-events.js'
import { safeSourceText } from '../delivery/input.js'
import type { DeliveryLifecycle } from '../delivery/lifecycle.js'
import { type DeliveryPlan, validateDeliveryPlan } from '../delivery/plan.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import { deliveryRunner } from './events.js'
import { revisionImpact } from './revision-impact.js'
import { DeliveryRunnerError } from './route.js'

const UNRESOLVED = ['prepared', 'running', 'pending', 'unknown']
export interface ContinuationInput {
  request: string
  stage: string
  unit: string
}

/**
 * Preview by default (ADR-0197). A correction revision names one retained failed
 * or blocked integration or acceptance observation and the unit that owns the
 * repair. Accepting it records the immutable next revision only: the run is
 * reopened by tracking that revision under a new exact-plan grant, and the
 * reducer refuses any older or envelope grant.
 */
export function continueDelivery(
  lifecycle: DeliveryLifecycle,
  run: string,
  input: ContinuationInput,
  accept?: { operator: string; reason: string },
) {
  const state = lifecycle.journal.get(run),
    planning = lifecycle.authority.planning,
    revision = state.basis.revision
  if (state.basis.kind !== 'plan' || !revision)
    throw new DeliveryRunnerError('continuation-plan-basis')
  const current = planning.getPlan(run, revision),
    facet = deliveryRunner(state),
    record = facet.records.find((entry) => entry.request === input.request),
    stage = record?.stages.findLast(
      (entry) => entry.id === input.stage && entry.basis === current.digest,
    ),
    reasons: string[] = []
  if (!['failed', 'blocked'].includes(state.state)) reasons.push('run-not-failed-or-blocked')
  if (!record || !stage || !['failed', 'blocked'].includes(stage.status) || !stage.evidence)
    reasons.push('no-retained-failure')
  const origin =
    input.stage === 'acceptance'
      ? ('acceptance' as const)
      : input.stage.startsWith('integration:')
        ? ('integration' as const)
        : undefined
  if (!origin) reasons.push('unsupported-failure-origin')
  if (record && ['active', 'unknown'].includes(record.ownership))
    reasons.push('predecessor-controller-not-released')
  if (facet.records.some((entry) => entry.stages.some((item) => UNRESOLVED.includes(item.status))))
    reasons.push('unresolved-stage')
  if (
    deliveryAttempts(state).records.some((attempt) =>
      ['claimed', 'started', 'stopping'].includes(attempt.state),
    )
  )
    reasons.push('active-attempt')
  if (
    deliveryEffects(state).records.some((effect) =>
      ['prepared', 'pending', 'unknown'].includes(effect.status),
    )
  )
    reasons.push('effects-need-reconciliation')
  const budget = findBudget(state),
    used = (budget?.counters.length ?? 0) + (facet.continuations?.length ?? 0)
  if (!budget?.limits || used >= budget.limits.integrationRepairs)
    reasons.push('repair-budget-exhausted')
  const correction = {
      unit: input.unit,
      origin: origin ?? ('integration' as const),
      request: input.request,
      stage: input.stage,
      failure: stage?.evidence ?? '0'.repeat(64),
    },
    proposed: DeliveryPlan = {
      ...structuredClone(current.plan),
      revision: revision + 1,
      previous: current.digest,
      corrections: [...(current.plan.corrections ?? []), correction],
    }
  let impact: ReturnType<typeof revisionImpact> | undefined
  try {
    validateDeliveryPlan(proposed, planning.sources.get(current.plan.source))
    impact = revisionImpact({ state, current: current.plan, proposed, grant: 'plan' })
  } catch {
    reasons.push('invalid-correction')
  }
  const admission = {
    schema: 'wholeloop/delivery-continuation-admission@1' as const,
    run,
    predecessor: input.request,
    stage: input.stage,
    unit: input.unit,
    origin: origin ?? null,
    failure: stage?.evidence ?? null,
    repairs: { used, limit: budget?.limits?.integrationRepairs ?? 0 },
    status: reasons.length ? ('refused' as const) : ('admissible' as const),
    reasons,
    authority: 'new-exact-plan-grant-required' as const,
  }
  if (!accept) return { admission, impact: impact ?? null, accepted: false as const }
  if (!accept.operator.trim() || !accept.reason.trim())
    throw new DeliveryRunnerError('continuation-operator-and-reason')
  if (reasons.length || !impact) throw new DeliveryRunnerError('continuation-not-admissible')
  const prepared = planning.preparePlan(proposed),
    receipt = {
      schema: 'wholeloop/delivery-continuation@1' as const,
      run,
      revision: proposed.revision,
      digest: prepared.digest,
      previous: current.digest,
      correction,
      operator: accept.operator,
      reason: accept.reason,
      impact: contractDigest(impact),
      authority: 'new-exact-plan-grant-required' as const,
    }
  safeSourceText(JSON.stringify(receipt), 65536)
  planning.sources.files.locked(() => {
    const path = `delivery/continuations/${run}/${proposed.revision}.json`
    if (existsSync(planning.sources.files.path(path)))
      throw new DeliveryRunnerError('continuation-already-recorded')
    planning.sources.files.atomic(path, `${JSON.stringify(receipt)}\n`)
  })
  return { admission, impact, accepted: true as const, record: receipt }
}
