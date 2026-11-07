// Runner records, stage observations and continuations in the delivery journal.
import type { DeliveryEvent, DeliveryProjection } from '../delivery/events.js'
import { DeliveryJournalError } from '../delivery/journal-error.js'
import eventSchema from './schemas/event-v1.json' with { type: 'json' }
import facetSchema from './schemas/facet-v1.json' with { type: 'json' }

export { eventSchema as runnerEventSchema, facetSchema as runnerFacetSchema }
export type RunnerRuntime = { backend: string; instance: string; worker: string }
export type RunnerObservationStatus =
  | 'passed'
  | 'failed'
  | 'blocked'
  | 'pending'
  | 'unknown'
  | 'stopped'
  | 'not-started'
export interface RunnerPayload {
  schema: 'wholeloop/delivery-runner-event@1'
  action:
    | 'prepared'
    | 'continued'
    | 'claimed'
    | 'registered'
    | 'dispatched'
    | 'started'
    | 'observed'
    | 'released'
    | 'recovered'
    | 'reused'
  basis: string
  request: string
  previous?: string
  origin?: string
  observation?: string
  controller?: string
  generation?: number
  stage?: string
  invocation?: string
  runtime?: RunnerRuntime
  status?: RunnerObservationStatus
  evidence?: string
  provenance?: 'fixture' | 'host-observed'
  reason?: string
}
export interface RunnerStageRecord {
  id: string
  invocation: string
  generation: number
  basis: string
  observation?: string
  status: 'prepared' | 'running' | RunnerObservationStatus
  runtime?: RunnerRuntime
  evidence?: string
  provenance?: 'fixture' | 'host-observed'
  reason?: string
  sequence: number
  /** Set only on a reused record: the request and basis that originally observed it. */
  origin?: { request: string; basis: string }
}
/** A correction revision registered on a failed or blocked run (ADR-0197). */
export interface RunnerContinuation {
  revision: number
  request: string
  stage: string
  failure: string
  sequence: number
}
export interface RunnerRecord {
  request: string
  basis: string
  sequence: number
  controller?: string
  generation: number
  ownership: 'unclaimed' | 'active' | 'released' | 'unknown'
  owner?: { invocation: string; runtime: RunnerRuntime }
  stages: RunnerStageRecord[]
}
export interface RunnerFacet {
  schema: 'wholeloop/delivery-runner@1'
  records: RunnerRecord[]
  continuations?: RunnerContinuation[]
}
export function deliveryRunner(state: DeliveryProjection): RunnerFacet {
  let facet = state.facets.find((f) => f.schema === 'wholeloop/delivery-runner@1')
  if (!facet) {
    facet = { schema: 'wholeloop/delivery-runner@1', records: [] }
    // Reducers own mutable states; a frozen journal view (ADR-0239) only reads,
    // so it gets the same empty facet without changing the shared projection.
    if (!Object.isFrozen(state.facets)) state.facets.push(facet)
  }
  return facet
}
/** A missing heartbeat never grants another controller the right to dispatch an uncertain stage. */
export function reduceRunner(
  state: DeliveryProjection,
  event: DeliveryEvent,
  payload: RunnerPayload,
): void {
  if (
    event.actor.kind !== 'controller' ||
    (payload.basis !== state.basis.digest &&
      !['observed', 'released', 'recovered'].includes(payload.action))
  )
    throw new DeliveryJournalError('runner-basis-or-actor')
  const fields: Record<RunnerPayload['action'], string[]> = {
    prepared: [],
    continued: ['controller', 'generation', 'previous'],
    claimed: ['controller', 'generation'],
    registered: ['controller', 'generation', 'invocation', 'runtime'],
    dispatched: ['controller', 'generation', 'stage', 'invocation'],
    started: ['controller', 'generation', 'stage', 'invocation', 'runtime'],
    observed: [
      'controller',
      'generation',
      'stage',
      'invocation',
      'status',
      'evidence',
      'provenance',
      'reason',
      'observation',
    ],
    released: ['controller', 'generation', 'reason'],
    recovered: ['controller', 'generation', 'status', 'evidence', 'provenance', 'reason'],
    reused: [
      'controller',
      'generation',
      'stage',
      'invocation',
      'status',
      'evidence',
      'provenance',
      'reason',
      'observation',
      'previous',
      'origin',
    ],
  }
  if (
    Object.keys(payload).some(
      (k) => !['schema', 'action', 'basis', 'request', ...fields[payload.action]].includes(k),
    )
  )
    throw new DeliveryJournalError('runner-action-fields')
  const facet = deliveryRunner(state)
  const record = facet.records.find((r) => r.request === payload.request)
  if (payload.action === 'prepared') {
    if (record || !['planned', 'queued'].includes(state.state))
      throw new DeliveryJournalError('runner-prepare-state')
    facet.records.push({
      request: payload.request,
      basis: payload.basis,
      sequence: event.sequence,
      generation: 0,
      ownership: 'unclaimed',
      stages: [],
    })
    return
  }
  if (!record) throw new DeliveryJournalError('runner-missing-request')
  if (payload.action === 'continued') {
    if (
      record.basis !== payload.previous ||
      payload.basis !== state.basis.digest ||
      !state.plans.some((p) => p.digest === payload.previous) ||
      record.controller !== payload.controller ||
      record.generation !== payload.generation ||
      record.ownership !== 'active'
    )
      throw new DeliveryJournalError('runner-derived-plan-owner')
    record.basis = payload.basis
    record.sequence = event.sequence
    return
  }
  if (
    record.basis !== payload.basis &&
    !['observed', 'released', 'recovered'].includes(payload.action)
  )
    throw new DeliveryJournalError('runner-missing-request')
  if (payload.action === 'claimed') {
    if (
      !payload.controller ||
      payload.generation !== record.generation + 1 ||
      !['unclaimed', 'released'].includes(record.ownership) ||
      facet.records.some(
        (r) => r.request !== record?.request && ['active', 'unknown'].includes(r.ownership),
      ) ||
      !['planned', 'queued', 'running'].includes(state.state)
    )
      throw new DeliveryJournalError('runner-owner-conflict')
    delete record.owner
    record.controller = payload.controller
    record.generation = payload.generation
    record.ownership = 'active'
    record.sequence = event.sequence
    return
  }
  if (
    payload.controller !== record.controller ||
    payload.generation !== record.generation ||
    (record.ownership !== 'active' &&
      !(
        ['recovered', 'observed'].includes(payload.action) &&
        ['unknown', 'released'].includes(record.ownership)
      ))
  )
    throw new DeliveryJournalError('runner-stale-controller')
  if (payload.action === 'registered') {
    if (record.owner || !payload.invocation || !payload.runtime)
      throw new DeliveryJournalError('runner-owner-registration')
    record.owner = { invocation: payload.invocation, runtime: payload.runtime }
    record.sequence = event.sequence
    return
  }
  if (payload.action === 'released') {
    if (!payload.reason) throw new DeliveryJournalError('runner-release-reason')
    record.ownership = 'released'
    record.sequence = event.sequence
    return
  }
  if (payload.action === 'reused') {
    // A reused stage is the original passed record of a continuation's predecessor,
    // re-inspected by the controller; it never replaces a stage already issued here.
    const continuation = facet.continuations?.at(-1)
    if (
      !payload.stage ||
      !payload.invocation ||
      !payload.origin ||
      !payload.previous ||
      payload.status !== 'passed' ||
      !payload.evidence ||
      !payload.provenance ||
      !payload.reason ||
      record.ownership !== 'active' ||
      !['queued', 'running'].includes(state.state) ||
      !continuation ||
      state.basis.revision !== continuation.revision ||
      !state.plans.some((plan) => plan.digest === payload.previous) ||
      payload.previous === record.basis ||
      record.stages.some((stage) => stage.id === payload.stage && stage.basis === record.basis)
    )
      throw new DeliveryJournalError('runner-stage-reuse')
    const origin = facet.records
      .find((entry) => entry.request === payload.origin)
      ?.stages.findLast(
        (stage) =>
          stage.id === payload.stage &&
          stage.basis === payload.previous &&
          stage.invocation === payload.invocation &&
          stage.status === 'passed',
      )
    if (!origin || origin.evidence !== payload.evidence || origin.provenance !== payload.provenance)
      throw new DeliveryJournalError('runner-stage-reuse-origin')
    record.stages.push({
      id: payload.stage,
      invocation: payload.invocation,
      generation: record.generation,
      basis: record.basis,
      status: 'passed',
      evidence: payload.evidence,
      provenance: payload.provenance,
      reason: payload.reason,
      sequence: event.sequence,
      ...(payload.observation ? { observation: payload.observation } : {}),
      origin: { request: payload.origin, basis: payload.previous },
    })
    record.sequence = event.sequence
    return
  }
  if (payload.action === 'recovered') {
    if (
      !payload.evidence ||
      !payload.provenance ||
      !['stopped', 'unknown'].includes(payload.status ?? '')
    )
      throw new DeliveryJournalError('runner-owner-observation')
    record.ownership = payload.status === 'stopped' ? 'released' : 'unknown'
    record.sequence = event.sequence
    return
  }
  if (!payload.stage || !payload.invocation) throw new DeliveryJournalError('runner-stage-identity')
  const prior = record.stages.findLast((s) => s.id === payload.stage && s.basis === payload.basis)
  record.sequence = event.sequence
  if (payload.action === 'dispatched') {
    if (
      (prior &&
        (!['stopped', 'not-started', 'failed'].includes(prior.status) ||
          prior.generation >= record.generation ||
          prior.invocation === payload.invocation)) ||
      !['queued', 'running'].includes(state.state)
    )
      throw new DeliveryJournalError('runner-stage-already-issued')
    record.stages.push({
      id: payload.stage,
      invocation: payload.invocation,
      generation: record.generation,
      basis: payload.basis,
      status: 'prepared',
      sequence: event.sequence,
    })
    return
  }
  if (payload.action === 'started') {
    if (
      !payload.runtime ||
      prior?.status !== 'prepared' ||
      prior.invocation !== payload.invocation ||
      !['queued', 'running', 'waiting-external'].includes(state.state)
    )
      throw new DeliveryJournalError('runner-stage-start-identity')
    prior.runtime = payload.runtime
    prior.status = 'running'
    prior.sequence = event.sequence
    return
  }
  if (
    !prior ||
    prior.invocation !== payload.invocation ||
    !payload.status ||
    !payload.evidence ||
    !payload.provenance ||
    !payload.reason ||
    !['prepared', 'running', 'pending', 'unknown'].includes(prior.status)
  )
    throw new DeliveryJournalError('runner-stage-observation')
  if (payload.status === 'passed' && !prior.runtime)
    throw new DeliveryJournalError('runner-stage-late-result')
  if (payload.observation) prior.observation = payload.observation
  prior.status = payload.status
  prior.evidence = payload.evidence
  prior.provenance = payload.provenance
  prior.reason = payload.reason
  prior.sequence = event.sequence
}
