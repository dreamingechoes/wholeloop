import { type Schema, validate } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { safeSourceText } from '../delivery/input.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import artifactSchema from './schemas/acceptance-artifact-v1.json' with { type: 'json' }
import intentSchema from './schemas/acceptance-case-intent-v1.json' with { type: 'json' }
import resultSchema from './schemas/acceptance-case-result-v1.json' with { type: 'json' }
import humanSchema from './schemas/acceptance-human-note-v1.json' with { type: 'json' }
import humanRequestSchema from './schemas/acceptance-human-request-v1.json' with { type: 'json' }
import recordSchema from './schemas/acceptance-plan-record-v1.json' with { type: 'json' }
import planSchema from './schemas/acceptance-plan-v1.json' with { type: 'json' }
import reportSchema from './schemas/acceptance-report-v1.json' with { type: 'json' }

export const ACCEPTANCE_SCHEMAS = {
  plan: planSchema,
  record: recordSchema,
  artifact: artifactSchema,
  intent: intentSchema,
  result: resultSchema,
  human: humanSchema,
  humanRequest: humanRequestSchema,
  report: reportSchema,
}
export interface AcceptanceAssertion {
  id: string
  description: string
  subject: 'exit' | 'stdout' | 'stderr' | 'json' | 'status' | 'header' | 'state' | 'semantic'
  operator: 'equals' | 'contains' | 'present' | 'absent'
  path?: string
  expected?: string
}
export interface AcceptanceCase {
  id: string
  criteria: string[]
  owner: 'machine' | 'human'
  applicability: 'applicable' | 'not-applicable'
  rationale: string
  initial: string
  actions: string[]
  assertions: AcceptanceAssertion[]
  failureConditions: string[]
  runner: {
    kind: 'cli' | 'api' | 'browser' | 'semantic' | 'human'
    capability: string
    input: string
  }
  fixture: { ref: string; sha256: string }
  timeoutMs: number
}
export interface AcceptancePlan {
  schema: 'wholeloop/acceptance-plan@1'
  run: string
  revision: number
  plan: string
  source: string
  cases: AcceptanceCase[]
  retention: { reviewAfterMs: number; expiryAction: 'retain' }
}
export interface AcceptanceBindings {
  environment: string
  recipe: string
  runtime: string
  candidates: { repository: string; head: string; snapshot: string }[]
}
export interface AcceptanceArtifact {
  schema: 'wholeloop/acceptance-artifact@1'
  run: string
  sha256: string
  bytes: number
  mediaType:
    | 'text/plain'
    | 'application/json'
    | 'image/png'
    | 'image/jpeg'
    | 'video/webm'
    | 'application/zip'
    | 'application/octet-stream'
  chunks: { digest: string; bytes: number; ref: string }[]
  retention: 'retain'
  sharing: 'not-authorized'
}
export interface AcceptanceProcess {
  argv: string[]
  cwd: string
  startedAt: string
  endedAt: string
  pid: number
  code?: number
  signal?: string
}
export interface AcceptanceCaseResult {
  schema: 'wholeloop/acceptance-case-result@1'
  plan: string
  case: string
  key: string
  sequence: number
  invocation: string
  bindings: AcceptanceBindings
  status: 'passed' | 'failed' | 'unavailable' | 'interrupted'
  origin: 'controller-observation'
  invocationState: 'stopped' | 'unknown'
  provenance: 'fixture' | 'host-observed'
  host: { id: string; version: string; capability: string }
  startedAt: string
  endedAt: string
  assertions: { id: string; status: 'passed' | 'failed' | 'unavailable'; evidence: string }[]
  artifacts: string[]
  process?: AcceptanceProcess
  reason: string
}
export interface AcceptanceHumanNote {
  schema: 'wholeloop/acceptance-human-note@1'
  sequence: number
  plan: string
  case: string
  bindings: AcceptanceBindings
  by: string
  note: string
  at: string
  origin: 'operator-note'
  provenance: 'fixture' | 'host-observed'
  status: 'passed' | 'failed'
}
export type AcceptanceStatus =
  | 'passed'
  | 'failed'
  | 'pending-human'
  | 'unavailable'
  | 'interrupted'
  | 'stale'
export interface AcceptanceReport {
  schema: 'wholeloop/acceptance-report@1'
  plan: string
  bindings: AcceptanceBindings
  at: string
  status: AcceptanceStatus
  cases: {
    id: string
    owner: AcceptanceCase['owner']
    status: AcceptanceStatus | 'not-applicable'
    evidence: string[]
  }[]
  coverage: { criterion: string; cases: string[]; status: AcceptanceStatus }[]
  acceptance: 'delegated-machine' | 'operator-and-machine' | 'fixture-only' | 'not-established'
  publication: 'not-performed'
}
export class AcceptanceError extends Error {
  constructor(readonly problem: string) {
    super(`Acceptance refused: ${problem}; contents omitted`)
  }
}
export function acceptanceShape(value: unknown, schema: Schema) {
  // Literal input and argv may be empty. The delivery prose validator intentionally
  // rejects those values, so retain JSON shape limits without normalizing literals.
  try {
    safeSourceText(JSON.stringify(value), 8 * 1024 * 1024)
    if (validate(value, schema).length) throw new Error('Invalid shape')
    const bounded = (value: unknown, rule: Schema & { maxLength?: number; maxItems?: number }) => {
      if (typeof value === 'string') {
        safeSourceText(value, 8 * 1024 * 1024)
        if (value.length > Number(rule.maxLength ?? 4096)) throw new Error('Text bound')
      }
      if (Array.isArray(value)) {
        if (value.length > Number(rule.maxItems ?? 1000)) throw new Error('Array bound')
        if (rule.items) for (const entry of value) bounded(entry, rule.items)
      } else if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
          const child = rule.properties?.[key]
          if (child) bounded(entry, child)
        }
      }
    }
    bounded(value, schema)
  } catch {
    throw new AcceptanceError('invalid-or-unsafe-shape')
  }
}
export function validateAcceptancePlan(value: unknown, delivery: DeliveryPlan): AcceptancePlan {
  acceptanceShape(value, planSchema)
  const plan = value as AcceptancePlan
  if (
    plan.run !== delivery.run ||
    plan.revision !== delivery.revision ||
    plan.plan !== contractDigest(delivery) ||
    plan.source !== delivery.source
  )
    throw new AcceptanceError('delivery-basis-mismatch')
  if (new Set(plan.cases.map((c) => c.id)).size !== plan.cases.length)
    throw new AcceptanceError('duplicate-case')
  for (const test of plan.cases) {
    if (
      !test.rationale.trim() ||
      new Set(test.criteria).size !== test.criteria.length ||
      new Set(test.assertions.map((a) => a.id)).size !== test.assertions.length
    )
      throw new AcceptanceError('ambiguous-case')
    if ((test.owner === 'human') !== (test.runner.kind === 'human'))
      throw new AcceptanceError('ownership-mismatch')
    for (const criterion of test.criteria) {
      const target = delivery.criteria.find((c) => c.id === criterion)
      if (!target || target.acceptance !== test.owner)
        throw new AcceptanceError('criterion-ownership-mismatch')
    }
    for (const assertion of test.assertions) {
      const expects = ['equals', 'contains'].includes(assertion.operator)
      if (expects !== (assertion.expected !== undefined))
        throw new AcceptanceError('assertion-expectation')
      if (assertion.expected !== undefined) {
        try {
          JSON.parse(assertion.expected)
        } catch {
          throw new AcceptanceError('assertion-json')
        }
      }
    }
  }
  for (const criterion of delivery.criteria)
    if (
      !plan.cases.some((c) => c.applicability === 'applicable' && c.criteria.includes(criterion.id))
    )
      throw new AcceptanceError('missing-criterion-coverage')
  return structuredClone(plan)
}
export function acceptanceBindingKey(bindings: AcceptanceBindings) {
  // Runtime snapshots advance during observation. Candidate bytes and environment/recipe identity determine reuse.
  return contractDigest({
    environment: bindings.environment,
    recipe: bindings.recipe,
    candidates: bindings.candidates,
  })
}
export function acceptanceTime(value: string) {
  const time = Date.parse(value)
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value)
    throw new AcceptanceError('invalid-time')
  return time
}
