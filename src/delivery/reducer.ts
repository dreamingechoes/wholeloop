import { contractDigest } from '../contracts/compatibility.js'
import { findBudget, reduceDeliveryBudget } from './budget-events.js'
import { reduceDeliveryCheckpoint } from './checkpoint-events.js'
import { reduceDeliveryEffect } from './effect-events.js'
import {
  type AttemptRecord,
  type AttemptsFacet,
  type ControlPayload,
  type DeliveryEvent,
  DeliveryJournalError,
  type DeliveryProjection,
  type DeliveryState,
  validateDeliveryEvent,
  validateDeliveryProjection,
} from './events.js'
import { reduceDeliveryQueue } from './queue-events.js'
import { reduceDeliveryRecovery } from './recovery-events.js'

const EDGES: Record<DeliveryState, readonly DeliveryState[]> = {
  planned: ['queued', 'waiting-input', 'paused', 'stopping', 'blocked', 'failed', 'exhausted'],
  queued: [
    'running',
    'waiting-input',
    'waiting-external',
    'paused',
    'stopping',
    'blocked',
    'failed',
    'exhausted',
  ],
  running: [
    'queued',
    'waiting-input',
    'waiting-external',
    'paused',
    'stopping',
    'completed',
    'blocked',
    'failed',
    'exhausted',
  ],
  'waiting-input': ['queued', 'paused', 'stopping', 'blocked', 'failed', 'exhausted'],
  'waiting-external': [
    'queued',
    'running',
    'paused',
    'stopping',
    'completed',
    'blocked',
    'failed',
    'exhausted',
  ],
  paused: ['queued', 'stopping', 'blocked', 'failed', 'exhausted'],
  stopping: ['stopped', 'waiting-external', 'blocked', 'failed'],
  stopped: ['queued'],
  exhausted: [],
  completed: [],
  failed: [],
  blocked: [],
}
const ACTIVE = new Set(['claimed', 'started', 'stopping'])
export function deliveryAttempts(state: DeliveryProjection): AttemptsFacet {
  const facet = state.facets.find((entry) => entry.schema === 'wholeloop/delivery-attempts@1')
  if (!facet) throw new DeliveryJournalError('missing-attempt-facet')
  return facet
}
function active(state: DeliveryProjection): boolean {
  return deliveryAttempts(state).records.some((record) => ACTIVE.has(record.state))
}
function control(state: DeliveryProjection, payload: ControlPayload): void {
  const unresolved = state.facets
    .find((facet) => facet.schema === 'wholeloop/delivery-effects@1')
    ?.records.some((record) => ['prepared', 'pending', 'unknown'].includes(record.status))
  if (unresolved && ['completed', 'stopped'].includes(payload.to))
    throw new DeliveryJournalError('unreconciled-effects')
  if (
    payload.basis !== state.basis.digest ||
    payload.from !== state.state ||
    !EDGES[state.state].includes(payload.to)
  )
    throw new DeliveryJournalError('impossible-transition')
  if (payload.to === 'waiting-input' && state.policy.intervention === 'none')
    throw new DeliveryJournalError('forbidden-human-wait')
  if (
    ['queued', 'running'].includes(payload.to) &&
    (state.grant?.status !== 'active' ||
      ![state.basis.digest, state.envelope].includes(state.grant.basis))
  )
    throw new DeliveryJournalError('missing-recorded-grant')
  if (payload.to === 'running' && !active(state)) throw new DeliveryJournalError('missing-attempt')
  if (payload.to === 'queued' && active(state)) throw new DeliveryJournalError('active-attempt')
  if (['completed', 'stopped'].includes(payload.to) && active(state))
    throw new DeliveryJournalError('unconfirmed-stop')
  const terminal = ['completed', 'stopped', 'failed', 'blocked', 'exhausted'].includes(payload.to)
  if (terminal !== (payload.outcome !== undefined))
    throw new DeliveryJournalError('invalid-outcome')
  if (payload.to === 'completed') {
    const outcomes = {
      'research-report': ['research-report-complete', 'completed-with-unknowns'],
      'local-handoff': ['code-ready'],
      'to-pr': ['draft-pr', 'ready-pr'],
      'to-merge': ['merged'],
    }
    if (!payload.evidence || !outcomes[state.policy.endpoint].includes(payload.outcome ?? ''))
      throw new DeliveryJournalError('endpoint-outcome')
  } else if (terminal && payload.outcome !== payload.to && payload.outcome !== 'partial')
    throw new DeliveryJournalError('invalid-outcome')
  state.state = payload.to
  state.reason = payload.reason
  if (payload.outcome !== undefined) state.outcome = payload.outcome
}

/** Only registered payload/facet families participate; an unknown version never replays partially. */
export function replayDelivery(events: readonly DeliveryEvent[]): Map<string, DeliveryProjection> {
  const states = new Map<string, DeliveryProjection>(),
    ids = new Set<string>(),
    attempts = new Set<string>(),
    grants = new Map<string, { run: string; digest: string; terminal: boolean }>()
  let previous: DeliveryEvent | undefined
  for (const event of events) {
    validateDeliveryEvent(event)
    if (
      ids.has(event.id) ||
      event.sequence !== (previous?.sequence ?? 0) + 1 ||
      event.previous !== previous?.digest
    )
      throw new DeliveryJournalError('event-order')
    ids.add(event.id)
    previous = event
    const payload = event.payload
    let state = states.get(event.run)
    if (payload.schema === 'wholeloop/delivery-registration-event@1') {
      if (
        payload.basis.kind === 'plan'
          ? !payload.basis.revision
          : payload.basis.revision !== undefined || payload.units.length > 0
      )
        throw new DeliveryJournalError('registration-basis')
      if (new Set(payload.units.map((unit) => unit.id)).size !== payload.units.length)
        throw new DeliveryJournalError('duplicate-unit')
      if (!state) {
        if (
          payload.previous !== undefined ||
          (payload.basis.kind === 'plan' && payload.basis.revision !== 1)
        )
          throw new DeliveryJournalError('initial-revision')
        state = {
          schema: 'wholeloop/delivery-state@1',
          run: event.run,
          sequence: event.sequence,
          digest: event.digest,
          registeredAt: event.ts,
          updatedAt: event.ts,
          maxObservedAt: event.ts,
          clockWentBackwards: false,
          state: 'planned',
          basis: structuredClone(payload.basis),
          source: payload.source,
          policy: structuredClone(payload.policy),
          units: structuredClone(payload.units),
          plans:
            payload.basis.kind === 'plan'
              ? [{ revision: payload.basis.revision ?? 1, digest: payload.basis.digest }]
              : [],
          facets: [{ schema: 'wholeloop/delivery-attempts@1', records: [] }],
          ...(payload.basis.kind === 'envelope'
            ? { envelope: payload.basis.digest }
            : payload.envelope
              ? { envelope: payload.envelope }
              : {}),
        }
        states.set(event.run, state)
      } else {
        if (
          payload.basis.kind !== 'plan' ||
          ['completed', 'failed', 'exhausted', 'blocked'].includes(state.state) ||
          active(state) ||
          state.facets
            .find((facet) => facet.schema === 'wholeloop/delivery-effects@1')
            ?.records.some((record) => ['prepared', 'pending', 'unknown'].includes(record.status))
        )
          throw new DeliveryJournalError('registration-state')
        const last = state.plans.at(-1)
        if (
          payload.basis.revision !== (last?.revision ?? 0) + 1 ||
          payload.previous !== last?.digest ||
          (state.envelope !== undefined && payload.envelope !== state.envelope)
        )
          throw new DeliveryJournalError('revision-predecessor')
        state.basis = structuredClone(payload.basis)
        state.source = payload.source
        state.policy = structuredClone(payload.policy)
        state.units = structuredClone(payload.units)
        state.plans.push({ revision: payload.basis.revision ?? 1, digest: payload.basis.digest })
        if (payload.envelope) state.envelope = payload.envelope
        state.state = 'planned'
        delete state.grant
        delete state.outcome
        delete state.reason
      }
    } else {
      if (!state) throw new DeliveryJournalError('unregistered-run')
      switch (payload.schema) {
        case 'wholeloop/delivery-grant-event@1': {
          if (event.actor.kind !== 'controller')
            throw new DeliveryJournalError('grant-observation-actor')
          if (![state.basis.digest, state.envelope].includes(payload.basis))
            throw new DeliveryJournalError('grant-basis')
          const prior = grants.get(payload.id)
          if (prior && prior.run !== state.run)
            throw new DeliveryJournalError('grant-bound-to-another-run')
          if (prior && prior.digest !== payload.digest)
            throw new DeliveryJournalError('changed-grant')
          if (prior?.terminal && payload.status === 'active')
            throw new DeliveryJournalError('revived-grant')
          if (state.grant && state.grant.id !== payload.id && active(state))
            throw new DeliveryJournalError('active-attempt-grant')
          if (state.grant?.id === payload.id && state.grant.digest !== payload.digest)
            throw new DeliveryJournalError('changed-grant')
          if (
            state.grant?.id === payload.id &&
            ['revoked', 'expired'].includes(state.grant.status) &&
            payload.status === 'active'
          )
            throw new DeliveryJournalError('revived-grant')
          if (
            payload.status === 'active' &&
            [...states.values()].some(
              (other) => other.run !== state?.run && other.grant?.id === payload.id,
            )
          )
            throw new DeliveryJournalError('grant-bound-to-another-run')
          state.grant = structuredClone(payload)
          grants.set(payload.id, {
            run: state.run,
            digest: payload.digest,
            terminal: prior?.terminal === true || ['revoked', 'expired'].includes(payload.status),
          })
          break
        }
        case 'wholeloop/delivery-control-event@1':
          if (payload.to === 'completed' && event.actor.kind !== 'controller')
            throw new DeliveryJournalError('completion-actor')
          control(state, payload)
          break
        case 'wholeloop/delivery-attempt-event@1': {
          if (event.actor.kind !== 'controller') throw new DeliveryJournalError('attempt-actor')
          const facet = deliveryAttempts(state)
          const key = (record: Pick<AttemptRecord, 'unit' | 'role' | 'cell'>) =>
            contractDigest({
              unit: record.unit ?? null,
              role: record.role,
              cell: record.cell ?? null,
            })
          const record = facet.records.find((entry) => entry.id === payload.id)
          if (payload.action === 'claimed') {
            const budget = findBudget(state)
            if (
              budget?.startedAt &&
              !budget.reservations.some(
                (reservation) =>
                  reservation.kind === 'attempt' &&
                  reservation.id === payload.id &&
                  reservation.unit === payload.unit &&
                  reservation.role === payload.role &&
                  reservation.cell === payload.cell &&
                  reservation.generation === payload.generation,
              )
            )
              throw new DeliveryJournalError('missing-attempt-budget')
            if (
              attempts.has(payload.id) ||
              !['queued', 'running'].includes(state.state) ||
              payload.basis !== state.basis.digest ||
              state.grant?.status !== 'active'
            )
              throw new DeliveryJournalError('attempt-admission')
            if (payload.role === 'builder' && payload.cell !== undefined)
              throw new DeliveryJournalError('builder-cell')
            if (
              ['planner', 'challenger'].includes(payload.role)
                ? payload.unit !== undefined
                : !state.units.some((unit) => unit.id === payload.unit)
            )
              throw new DeliveryJournalError('attempt-unit')
            const unit = state.units.find((unit) => unit.id === payload.unit)
            if (
              (payload.role === 'builder' && unit?.role === 'research') ||
              (payload.role === 'researcher' && unit?.role !== 'research')
            )
              throw new DeliveryJournalError('attempt-role')
            const siblings = facet.records.filter((entry) => key(entry) === key(payload))
            if (
              siblings.some((entry) => ACTIVE.has(entry.state)) ||
              payload.generation !== Math.max(0, ...siblings.map((entry) => entry.generation)) + 1
            )
              throw new DeliveryJournalError('attempt-generation')
            const { schema: _schema, action: _action, ...identity } = payload
            facet.records.push({
              ...structuredClone(identity),
              state: 'claimed',
              observedAt: event.ts,
            })
            attempts.add(payload.id)
          } else {
            if (
              !record ||
              record.generation !== payload.generation ||
              record.basis !== payload.basis ||
              key(record) !== key(payload)
            )
              throw new DeliveryJournalError('attempt-identity')
            const allowed: Record<Exclude<typeof record.state, 'heartbeat'>, string[]> = {
              claimed: ['started', 'stopping', 'stopped', 'failed'],
              started: ['heartbeat', 'stopping', 'stopped', 'completed', 'failed'],
              stopping: ['stopped', 'failed'],
              stopped: ['fenced'],
              completed: ['fenced'],
              failed: ['fenced'],
              fenced: [],
            }
            if (!allowed[record.state].includes(payload.action))
              throw new DeliveryJournalError('attempt-transition')
            if (payload.action === 'started' && !payload.runtime)
              throw new DeliveryJournalError('missing-runtime-identity')
            if (['completed', 'stopped', 'failed'].includes(payload.action) && !payload.evidence)
              throw new DeliveryJournalError('missing-attempt-evidence')
            if (
              ['completed', 'heartbeat', 'started'].includes(payload.action) &&
              ['completed', 'failed', 'blocked', 'exhausted', 'stopped'].includes(state.state)
            )
              throw new DeliveryJournalError('terminal-attempt')
            if (
              payload.runtime &&
              record.runtime &&
              contractDigest(payload.runtime) !== contractDigest(record.runtime)
            )
              throw new DeliveryJournalError('changed-runtime-identity')
            if (payload.action !== 'heartbeat') record.state = payload.action
            if (payload.runtime) record.runtime = structuredClone(payload.runtime)
            if (payload.evidence) record.evidence = payload.evidence
            record.observedAt = event.ts
          }
          break
        }
        case 'wholeloop/delivery-queue-event@1':
          reduceDeliveryQueue(state, event, payload)
          break
        case 'wholeloop/delivery-checkpoint-event@1':
          reduceDeliveryCheckpoint(state, event, payload)
          break
        case 'wholeloop/delivery-effect-event@1':
          reduceDeliveryEffect(state, event, payload)
          break
        case 'wholeloop/delivery-recovery-event@1':
          reduceDeliveryRecovery(state, event, payload)
          break
        case 'wholeloop/delivery-budget-event@1':
          reduceDeliveryBudget(state, event, payload)
          break
        default:
          throw new DeliveryJournalError('unsupported-payload-reducer')
      }
    }
    state.sequence = event.sequence
    state.digest = event.digest
    state.updatedAt = event.ts
    state.clockWentBackwards ||= event.ts < state.maxObservedAt
    if (event.ts > state.maxObservedAt) state.maxObservedAt = event.ts
  }
  for (const state of states.values()) validateDeliveryProjection(state)
  return states
}
