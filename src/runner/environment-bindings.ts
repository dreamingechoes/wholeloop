import type { EnvironmentOperation, EnvironmentOperations } from '../environment/operations.js'
import { DeliveryRunnerError } from './route.js'

type OperationBinding = Pick<EnvironmentOperation, 'id' | 'nonce' | 'command'>
type OperationObservation = ReturnType<EnvironmentOperations['inspect']>[number]

/** Validate every original tuple before the caller opens any private claim. */
export function boundEnvironmentOperations(
  expected: readonly OperationBinding[],
  retained: readonly EnvironmentOperation[],
  provenance: EnvironmentOperation['provenance'],
) {
  if (!expected.length) return []
  const byId = expected.length > 1 ? new Map<string, EnvironmentOperation>() : undefined
  // One lookup needs no index; empty selections must not traverse an unrelated
  // history. Multiple lookups share a fresh first-match vector.
  if (byId)
    for (const operation of retained) {
      const id = operation.id
      if (!byId.has(id)) byId.set(id, operation)
    }
  return expected.map((operation) => {
    const original = byId
      ? byId.get(operation.id)
      : retained.find((item) => item.id === operation.id)
    if (
      Object.keys(operation).sort().join(',') !== 'command,id,nonce' ||
      !original ||
      original.nonce !== operation.nonce ||
      original.command !== operation.command ||
      original.provenance !== provenance
    )
      throw new DeliveryRunnerError('environment-stage-operation-binding')
    return original
  })
}

/** Preserve binding order and missing observations, never infer closure. */
export function selectEnvironmentObservations(
  expected: readonly Pick<EnvironmentOperation, 'id'>[],
  observed: readonly OperationObservation[],
) {
  if (expected.length <= 1)
    return expected.map((operation) => observed.find((item) => item.operation.id === operation.id))
  const byId = new Map<string, OperationObservation>()
  for (const observation of observed) {
    const id = observation.operation.id
    if (!byId.has(id)) byId.set(id, observation)
  }
  return expected.map((operation) => byId.get(operation.id))
}
