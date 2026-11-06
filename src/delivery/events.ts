import { randomUUID } from 'node:crypto'
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import {
  type RunnerFacet,
  type RunnerPayload,
  runnerEventSchema,
  runnerFacetSchema,
} from '../runner/events.js'
import {
  deliveryDecision,
  type OperatorActor,
  validActor,
  validRationale,
} from '../state/attribution.js'
import { currentPersonAttribution } from '../state/attribution-context.js'
import {
  type BudgetFacet,
  type BudgetPayload,
  budgetEventSchema,
  budgetFacetSchema,
} from './budget-events.js'
import {
  type CheckpointPayload,
  type CheckpointsFacet,
  checkpointEventSchema,
  checkpointFacetSchema,
} from './checkpoint-events.js'
import {
  type EffectPayload,
  type EffectsFacet,
  effectEventSchema,
  effectFacetSchema,
} from './effect-events.js'
import { DeliveryJournalError } from './journal-error.js'
import type { DeliveryPolicy } from './plan.js'
import { validateDeliveryShape } from './plan.js'
import {
  type QueueFacet,
  type QueuePayload,
  queueEventSchema,
  queueFacetSchema,
} from './queue-events.js'
import {
  type RecoveryFacet,
  type RecoveryPayload,
  recoveryEventSchema,
  recoveryFacetSchema,
} from './recovery-events.js'
import attemptSchema from './schemas/attempt-event-v1.json' with { type: 'json' }
import attemptsSchema from './schemas/attempts-v1.json' with { type: 'json' }
import controlSchema from './schemas/control-event-v1.json' with { type: 'json' }
import eventSchema from './schemas/event-v1.json' with { type: 'json' }
import grantSchema from './schemas/grant-event-v1.json' with { type: 'json' }
import personAttributionSchema from './schemas/person-attribution-v1.json' with { type: 'json' }
import registrationSchema from './schemas/registration-event-v1.json' with { type: 'json' }
import stateSchema from './schemas/state-v1.json' with { type: 'json' }

export const DELIVERY_EVENT_SCHEMA = eventSchema
export const DELIVERY_STATE_SCHEMA = stateSchema
export const DELIVERY_PAYLOAD_SCHEMAS = [
  registrationSchema,
  grantSchema,
  controlSchema,
  attemptSchema,
  queueEventSchema,
  checkpointEventSchema,
  effectEventSchema,
  recoveryEventSchema,
  budgetEventSchema,
  runnerEventSchema,
  personAttributionSchema,
]
export const DELIVERY_FACET_SCHEMAS = [
  attemptsSchema,
  queueFacetSchema,
  checkpointFacetSchema,
  effectFacetSchema,
  recoveryFacetSchema,
  budgetFacetSchema,
  runnerFacetSchema,
]
export const DELIVERY_STATES = [
  'planned',
  'queued',
  'running',
  'waiting-input',
  'waiting-external',
  'paused',
  'stopping',
  'stopped',
  'exhausted',
  'completed',
  'failed',
  'blocked',
] as const
export type DeliveryState = (typeof DELIVERY_STATES)[number]
export type DeliveryOutcome =
  | 'research-report-complete'
  | 'learning-recorded'
  | 'completed-with-unknowns'
  | 'code-ready'
  | 'draft-pr'
  | 'ready-pr'
  | 'merge-queued'
  | 'merged'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'exhausted'
  | 'stopped'
export type DeliveryActor = OperatorActor
export interface RegistrationPayload {
  schema: 'wholeloop/delivery-registration-event@1'
  basis: { kind: 'plan' | 'envelope'; digest: string; revision?: number }
  source: string
  policy: {
    digest: string
    endpoint: DeliveryPolicy['endpoint']
    intervention: DeliveryPolicy['intervention']
  }
  units: { id: string; role: 'contract' | 'implementation' | 'research'; repository?: string }[]
  previous?: string
  envelope?: string
  /** ADR-0197: the retained failure a correction revision continues from. */
  continues?: { request: string; stage: string; failure: string }
}
export interface GrantPayload {
  schema: 'wholeloop/delivery-grant-event@1'
  id: string
  digest: string
  basis: string
  status: 'active' | 'expired' | 'revoked' | 'clock-invalid'
}
export interface ControlPayload {
  schema: 'wholeloop/delivery-control-event@1'
  from: DeliveryState
  to: DeliveryState
  basis: string
  reason: string
  outcome?: DeliveryOutcome
  evidence?: string
}
export type AttemptRole =
  | 'builder'
  | 'verifier'
  | 'reviewer'
  | 'refuter'
  | 'researcher'
  | 'planner'
  | 'challenger'
export type AttemptAction =
  | 'claimed'
  | 'started'
  | 'heartbeat'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'failed'
  | 'fenced'
export interface AttemptPayload {
  schema: 'wholeloop/delivery-attempt-event@1'
  id: string
  basis: string
  unit?: string
  cell?: string
  role: AttemptRole
  generation: number
  action: AttemptAction
  runtime?: { backend: string; instance: string; worker: string }
  evidence?: string
}
export type DeliveryPayload =
  | PersonAttributionPayload
  | RegistrationPayload
  | GrantPayload
  | ControlPayload
  | AttemptPayload
  | QueuePayload
  | CheckpointPayload
  | EffectPayload
  | RecoveryPayload
  | BudgetPayload
  | RunnerPayload
/** An immutable record reference, never a second approval or a lifecycle transition. */
export interface PersonAttributionPayload {
  schema: 'wholeloop/delivery-person-attribution@1'
  basis: string
  record: string
  invocation: string
  rationale?: string
}
export interface DeliveryEvent {
  schema: 'wholeloop/delivery-event@1'
  id: string
  sequence: number
  ts: string
  run: string
  actor: DeliveryActor
  rationale?: string
  previous?: string
  payload: DeliveryPayload
  digest: string
}
export interface AttemptRecord extends Omit<AttemptPayload, 'schema' | 'action'> {
  state: Exclude<AttemptAction, 'heartbeat'>
  observedAt: string
}
export interface AttemptsFacet {
  schema: 'wholeloop/delivery-attempts@1'
  records: AttemptRecord[]
}
export interface DeliveryProjection {
  schema: 'wholeloop/delivery-state@1'
  run: string
  sequence: number
  digest: string
  registeredAt: string
  updatedAt: string
  maxObservedAt: string
  clockWentBackwards: boolean
  state: DeliveryState
  basis: RegistrationPayload['basis']
  source: string
  policy: RegistrationPayload['policy']
  units: RegistrationPayload['units']
  envelope?: string
  plans: { revision: number; digest: string }[]
  grant?: GrantPayload
  reason?: string
  outcome?: DeliveryOutcome
  facets: (
    | AttemptsFacet
    | QueueFacet
    | CheckpointsFacet
    | EffectsFacet
    | RecoveryFacet
    | BudgetFacet
    | RunnerFacet
  )[]
}
export { DeliveryJournalError }
export function deliveryTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    throw new DeliveryJournalError('invalid-time')
}
function checkedEventFields(value: unknown): DeliveryEvent {
  if (!isObject(value) || value.schema !== 'wholeloop/delivery-event@1')
    throw new DeliveryJournalError('unsupported-event-version')
  const payload = value.payload
  if (!isObject(payload)) throw new DeliveryJournalError('invalid-payload')
  const schema = DELIVERY_PAYLOAD_SCHEMAS.find((rule) => rule.$id === payload.schema)
  if (!schema) throw new DeliveryJournalError('unsupported-payload-version')
  try {
    validateDeliveryShape(value, eventSchema)
    validateDeliveryShape(value.payload, schema)
  } catch {
    throw new DeliveryJournalError('invalid-event')
  }
  const event = value as unknown as DeliveryEvent
  if (
    event.payload.schema === 'wholeloop/delivery-person-attribution@1' &&
    (event.actor.kind !== 'operator' || !validRationale(event.actor, event.payload.rationale, true))
  )
    throw new DeliveryJournalError('invalid-attribution')
  const decision = deliveryDecision(payload as { schema: string; [key: string]: unknown })
  if (
    !validActor(event.actor, 'delivery') ||
    !validRationale(event.actor, event.rationale, decision.decision, decision.delegated)
  )
    throw new DeliveryJournalError('invalid-attribution')
  deliveryTimestamp(event.ts)
  return event
}
function eventPredecessor(event: DeliveryEvent): void {
  if ((event.sequence === 1) !== (event.previous === undefined))
    throw new DeliveryJournalError('event-predecessor')
}
export function validateDeliveryEvent(value: unknown): asserts value is DeliveryEvent {
  const event = checkedEventFields(value)
  const { digest, ...binding } = event
  if (contractDigest(binding) !== digest) throw new DeliveryJournalError('event-digest')
  eventPredecessor(event)
}
export function deliveryEvent(
  run: string,
  actor: DeliveryActor,
  payload: DeliveryPayload,
  previous: DeliveryEvent | undefined,
  ts: string,
  metadata: { rationale?: string } = {},
): DeliveryEvent {
  if (Object.keys(metadata).some((key) => key !== 'rationale'))
    throw new DeliveryJournalError('invalid-attribution')
  const person = currentPersonAttribution()
  if (actor.kind === 'operator' && person) {
    actor = {
      ...actor,
      ...(person.actor?.kind === 'person' && person.actor.channel !== undefined
        ? { channel: person.actor.channel }
        : {}),
    }
    if (payload.schema === 'wholeloop/delivery-control-event@1' && person.rationale !== undefined)
      metadata = { rationale: person.rationale, ...metadata }
  }
  const value = {
    schema: 'wholeloop/delivery-event@1' as const,
    id: `delivery-event-${randomUUID()}`,
    sequence: (previous?.sequence ?? 0) + 1,
    ts,
    run,
    actor: structuredClone(actor),
    ...(metadata.rationale !== undefined ? { rationale: metadata.rationale } : {}),
    ...(previous ? { previous: previous.digest } : {}),
    payload: structuredClone(payload),
  }
  const event = { ...value, digest: contractDigest(value) }
  // Only this constructor owns the complete fresh binding and its new digest.
  // External or later-mutated events always take the full public digest check.
  checkedEventFields(event)
  eventPredecessor(event)
  return event
}

export function validateDeliveryProjection(value: unknown): asserts value is DeliveryProjection {
  try {
    validateDeliveryShape(value, stateSchema)
    const state = value as DeliveryProjection
    const ids = new Set<string>()
    for (const facet of state.facets) {
      const schema = DELIVERY_FACET_SCHEMAS.find((entry) => entry.$id === facet.schema)
      if (!schema || ids.has(facet.schema))
        throw new DeliveryJournalError('unsupported-facet-version')
      ids.add(facet.schema)
      validateDeliveryShape(facet, schema)
    }
    if (!ids.has('wholeloop/delivery-attempts@1'))
      throw new DeliveryJournalError('missing-attempt-facet')
  } catch (error) {
    if (error instanceof DeliveryJournalError) throw error
    throw new DeliveryJournalError('invalid-projection')
  }
}
