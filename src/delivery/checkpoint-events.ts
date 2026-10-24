import type { DeliveryEvent, DeliveryProjection } from './events.js'
import { DeliveryJournalError } from './journal-error.js'
import checkpointEventSchema from './schemas/checkpoint-event-v1.json' with { type: 'json' }
import checkpointFacetSchema from './schemas/checkpoints-v1.json' with { type: 'json' }

export { checkpointEventSchema, checkpointFacetSchema }
export type CheckpointStage = (typeof checkpointEventSchema.properties.stage.enum)[number]
export interface CheckpointPayload {
  schema: 'wholeloop/delivery-checkpoint-event@1'
  basis: string
  key: string
  stage: CheckpointStage
  manifest: string
  attempt?: { id: string; generation: number }
}
export interface CheckpointsFacet {
  schema: 'wholeloop/delivery-checkpoints@1'
  records: (Omit<CheckpointPayload, 'schema'> & { sequence: number })[]
}
export function deliveryCheckpoints(state: DeliveryProjection): CheckpointsFacet {
  let facet = state.facets.find((entry) => entry.schema === 'wholeloop/delivery-checkpoints@1')
  if (!facet) {
    facet = { schema: 'wholeloop/delivery-checkpoints@1', records: [] }
    state.facets.push(facet)
  }
  return facet
}
export function reduceDeliveryCheckpoint(
  state: DeliveryProjection,
  event: DeliveryEvent,
  payload: CheckpointPayload,
): void {
  const records = deliveryCheckpoints(state).records
  if (
    event.actor.kind !== 'controller' ||
    payload.basis !== state.basis.digest ||
    records.some((record) => record.basis === payload.basis && record.key === payload.key)
  )
    throw new DeliveryJournalError('checkpoint-binding')
  if (
    payload.attempt &&
    !state.facets
      .find((entry) => entry.schema === 'wholeloop/delivery-attempts@1')
      ?.records.some(
        (attempt) =>
          attempt.id === payload.attempt?.id &&
          attempt.generation === payload.attempt.generation &&
          attempt.basis === payload.basis,
      )
  )
    throw new DeliveryJournalError('checkpoint-attempt')
  const { schema: _schema, ...record } = payload
  records.push({ ...structuredClone(record), sequence: event.sequence })
}
