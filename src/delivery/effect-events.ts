import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryEffect } from './authority.js'
import { findBudget } from './budget-events.js'
import type { DeliveryEvent, DeliveryProjection } from './events.js'
import { DeliveryJournalError } from './journal-error.js'
import effectEventSchema from './schemas/effect-event-v1.json' with { type: 'json' }
import effectFacetSchema from './schemas/effects-v1.json' with { type: 'json' }

export { effectEventSchema, effectFacetSchema }
export interface EffectIntent {
  schema: 'wholeloop/delivery-effect-intent@1'
  id: string
  key: string
  run: string
  basis: string
  grant: string
  grantDigest: string
  operation: Exclude<DeliveryEffect, 'source.read'>
  repository?: string
  ref: string
  expectedHead?: string
  inputDigest: string
  attempt?: { id: string; generation: number }
}
export interface EffectObservation {
  binding: string
  status: 'applied' | 'not-applied' | 'unknown'
  evidence: string
  provenance: 'fixture' | 'host-observed' | 'controller-observed'
  invocationState: 'stopped' | 'running' | 'unknown'
  resource?: { ref: string; revision: string }
  reason:
    | 'observed'
    | 'lost-response'
    | 'binding-mismatch'
    | 'unavailable-read'
    | 'transient-provider'
    | 'denied-access'
    | 'invalid-output'
    | 'clock-invalid'
    | 'deadline'
}
export interface EffectPayload {
  schema: 'wholeloop/delivery-effect-event@1'
  action: 'prepared' | 'issued' | 'observed' | 'abandoned'
  basis: string
  id: string
  digest: string
  intent?: EffectIntent
  invocation?: string
  admission?: { evidence: string; provenance: 'fixture' | 'host-observed' }
  deadline?: string
  observation?: EffectObservation
}
export interface EffectRecord {
  intent: EffectIntent
  digest: string
  status: 'prepared' | 'pending' | 'applied' | 'not-applied' | 'unknown' | 'abandoned'
  sequence: number
  invocation?: string
  admission?: { evidence: string; provenance: 'fixture' | 'host-observed' }
  deadline?: string
  observations: EffectObservation[]
}
export interface EffectsFacet {
  schema: 'wholeloop/delivery-effects@1'
  records: EffectRecord[]
}
export function deliveryEffects(state: DeliveryProjection): EffectsFacet {
  let facet = state.facets.find((entry) => entry.schema === 'wholeloop/delivery-effects@1')
  if (!facet) {
    facet = { schema: 'wholeloop/delivery-effects@1', records: [] }
    state.facets.push(facet)
  }
  return facet
}
export function reduceDeliveryEffect(
  state: DeliveryProjection,
  event: DeliveryEvent,
  payload: EffectPayload,
): void {
  if (event.actor.kind !== 'controller' || payload.basis !== state.basis.digest)
    throw new DeliveryJournalError('effect-basis-or-actor')
  const records = deliveryEffects(state).records
  const record = records.find((entry) => entry.intent.id === payload.id)
  if (payload.action === 'prepared') {
    const intent = payload.intent
    if (
      !intent ||
      record ||
      payload.invocation ||
      payload.admission ||
      payload.deadline ||
      payload.observation ||
      intent.run !== state.run ||
      intent.id !== payload.id ||
      intent.id !==
        `effect-${contractDigest({ run: intent.run, basis: intent.basis, key: intent.key }).slice(0, 32)}` ||
      intent.basis !== payload.basis ||
      contractDigest(intent) !== payload.digest ||
      intent.grant !== state.grant?.id ||
      intent.grantDigest !== state.grant.digest ||
      state.grant.status !== 'active'
    )
      throw new DeliveryJournalError('effect-intent-binding')
    if (
      records.some(
        (entry) =>
          entry.intent.basis === intent.basis &&
          (entry.intent.key === intent.key ||
            (['prepared', 'pending', 'unknown'].includes(entry.status) &&
              entry.intent.repository === intent.repository &&
              entry.intent.ref === intent.ref)),
      )
    )
      throw new DeliveryJournalError('effect-conflict')
    records.push({
      intent: structuredClone(intent),
      digest: payload.digest,
      status: 'prepared',
      sequence: event.sequence,
      observations: [],
    })
    return
  }
  if (!record || record.digest !== payload.digest || payload.intent)
    throw new DeliveryJournalError('unknown-effect')
  if (payload.action === 'abandoned') {
    if (
      record.status !== 'prepared' ||
      payload.invocation ||
      payload.observation ||
      payload.admission ||
      payload.deadline
    )
      throw new DeliveryJournalError('cannot-abandon-issued-effect')
    record.status = 'abandoned'
  } else if (payload.action === 'issued') {
    const budget = findBudget(state)
    if (
      budget?.startedAt &&
      (!budget.reservations.some(
        (reservation) =>
          reservation.id === payload.invocation &&
          reservation.kind === 'effect' &&
          reservation.deadline === payload.deadline,
      ) ||
        (record.intent.operation === 'git.push' &&
          records.filter((entry) => entry.intent.operation === 'git.push' && entry.invocation)
            .length >= (budget.limits?.ciPushes ?? 0)))
    )
      throw new DeliveryJournalError('missing-or-exhausted-effect-budget')
    if (
      record.status !== 'prepared' ||
      !payload.invocation ||
      payload.observation ||
      !payload.admission ||
      !payload.deadline ||
      records.some((entry) => entry.invocation === payload.invocation) ||
      !Number.isFinite(Date.parse(payload.deadline)) ||
      new Date(payload.deadline).toISOString() !== payload.deadline ||
      payload.deadline <= event.ts
    )
      throw new DeliveryJournalError('effect-already-issued')
    record.status = 'pending'
    record.invocation = payload.invocation
    record.admission = structuredClone(payload.admission)
    record.deadline = payload.deadline
  } else {
    const observed = payload.observation
    if (
      !observed ||
      !['pending', 'unknown'].includes(record.status) ||
      payload.invocation !== record.invocation ||
      observed.binding !== record.digest ||
      (observed.resource !== undefined && observed.resource.ref !== record.intent.ref) ||
      (observed.provenance === 'controller-observed' && observed.status === 'applied') ||
      (record.admission?.provenance === 'fixture' && observed.provenance === 'host-observed') ||
      payload.admission ||
      payload.deadline ||
      (observed.status === 'applied' && (!observed.resource || observed.reason !== 'observed')) ||
      (observed.status === 'not-applied' &&
        (observed.reason !== 'observed' || observed.invocationState !== 'stopped')) ||
      (observed.status === 'unknown' && observed.resource !== undefined)
    )
      throw new DeliveryJournalError('effect-observation-binding')
    record.status = observed.status
    record.observations.push(structuredClone(observed))
  }
  record.sequence = event.sequence
}
