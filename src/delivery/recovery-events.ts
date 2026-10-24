import { contractDigest } from '../contracts/compatibility.js'
import type { AttemptPayload, DeliveryEvent, DeliveryProjection } from './events.js'
import { DeliveryJournalError } from './journal-error.js'
import { deliveryQueue, queueAssignment } from './queue-events.js'
import recoveryEventSchema from './schemas/recovery-event-v1.json' with { type: 'json' }
import recoveryFacetSchema from './schemas/recovery-v1.json' with { type: 'json' }

export { recoveryEventSchema, recoveryFacetSchema }
export interface RecoveryPayload {
  schema: 'wholeloop/delivery-recovery-event@1'
  basis: string
  assignment: string
  attempt: string
  generation: number
  status: 'running' | 'stopped' | 'not-started' | 'unknown'
  runtime?: NonNullable<AttemptPayload['runtime']>
  owned: boolean
  evidence: string
  provenance: 'fixture' | 'host-observed' | 'controller-observed'
  reason: 'observed' | 'unavailable-host' | 'identity-mismatch' | 'unconfirmed-stop'
}
export interface RecoveryFacet {
  schema: 'wholeloop/delivery-recovery@1'
  records: (Omit<RecoveryPayload, 'schema'> & { sequence: number })[]
}
export function deliveryRecovery(state: DeliveryProjection): RecoveryFacet {
  let facet = state.facets.find((entry) => entry.schema === 'wholeloop/delivery-recovery@1')
  if (!facet) {
    facet = { schema: 'wholeloop/delivery-recovery@1', records: [] }
    state.facets.push(facet)
  }
  return facet
}
export function reduceDeliveryRecovery(
  state: DeliveryProjection,
  event: DeliveryEvent,
  payload: RecoveryPayload,
): void {
  const attempt = state.facets
    .find((entry) => entry.schema === 'wholeloop/delivery-attempts@1')
    ?.records.find((entry) => entry.id === payload.attempt)
  const entry = deliveryQueue(state).records.find((record) => record.attempt === payload.attempt)
  if (
    !entry ||
    contractDigest(queueAssignment(state, entry)) !== payload.assignment ||
    event.actor.kind !== 'controller' ||
    payload.basis !== state.basis.digest ||
    !attempt ||
    attempt.basis !== payload.basis ||
    attempt.generation !== payload.generation ||
    contractDigest(attempt.runtime ?? null) !== contractDigest(payload.runtime ?? null) ||
    (payload.status !== 'unknown' && (!payload.owned || payload.reason !== 'observed')) ||
    (payload.status === 'not-started' &&
      (attempt.state !== 'claimed' || attempt.runtime !== undefined))
  )
    throw new DeliveryJournalError('recovery-observation-binding')
  const { schema: _schema, ...record } = payload
  deliveryRecovery(state).records.push({ ...structuredClone(record), sequence: event.sequence })
}
