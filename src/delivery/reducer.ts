import { contractDigest } from '../contracts/compatibility.js'
import { deliveryRunner, reduceRunner } from '../runner/events.js'
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
  type RegistrationPayload,
  validateDeliveryEvent,
  validateDeliveryProjection,
} from './events.js'
import { reduceDeliveryQueue } from './queue-events.js'
import { reduceDeliveryRecovery } from './recovery-events.js'

const EDGES: Record<DeliveryState, readonly DeliveryState[]> = {
  planned: ['queued', 'waiting-input', 'paused', 'stopping', 'blocked', 'failed', 'exhausted'],
  queued: [
    'running',
    // Only after an applied effect on the current basis (see control()).
    'completed',
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
type DeliveryUnit = DeliveryProjection['units'][number]
interface UnitSelection {
  units: DeliveryProjection['units']
  firstId: string
  first: DeliveryUnit
  index?: Map<string, DeliveryUnit>
}
function selectedUnit(
  state: DeliveryProjection,
  id: string,
  selections: Map<string, UnitSelection>,
) {
  const units = state.units,
    previous = selections.get(state.run)
  if (previous?.units === units) {
    if (previous.firstId === id) return previous.first
    if (!previous.index) {
      previous.index = new Map()
      for (const unit of units) previous.index.set(unit.id, unit)
    }
    return previous.index.get(id)
  }
  const unit = units.find((unit) => unit.id === id)
  // Registration owns unique unit ids and replaces this array on revision.
  // Repeated work for one unit needs no complete index; a second id builds it.
  if (unit) selections.set(state.run, { units, firstId: id, first: unit })
  return unit
}
/**
 * The named predecessor request must hold the exact failed or blocked
 * integration, acceptance or exact owned CI observation, the run must have no effect awaiting
 * reconciliation, and the journal-derived repair budget must remain.
 */
function continuationAdmission(
  state: DeliveryProjection,
  continues: NonNullable<RegistrationPayload['continues']>,
) {
  const facet = deliveryRunner(state),
    record = facet.records.find((entry) => entry.request === continues.request),
    stage = record?.stages.findLast((entry) => entry.id === continues.stage),
    publication = record?.stages.findLast((entry) => entry.id === 'publication'),
    ci =
      continues.stage === 'ci' &&
      stage?.status === 'failed' &&
      stage.provenance === 'host-observed' &&
      stage.runtime?.backend === 'owned-core' &&
      stage.runtime.instance === stage.invocation &&
      publication?.status === 'passed' &&
      publication.provenance === 'host-observed' &&
      publication.basis === stage.basis &&
      publication.sequence < stage.sequence
  if (
    !record ||
    !stage ||
    stage.basis !== state.basis.digest ||
    !['failed', 'blocked'].includes(stage.status) ||
    stage.evidence !== continues.failure ||
    !(ci || continues.stage === 'acceptance' || continues.stage.startsWith('integration:')) ||
    ['active', 'unknown'].includes(record.ownership) ||
    record.stages.some((entry) =>
      ['prepared', 'running', 'pending', 'unknown'].includes(entry.status),
    )
  )
    throw new DeliveryJournalError('continuation-failure')
  const budget = findBudget(state),
    used = (budget?.counters.length ?? 0) + (facet.continuations?.length ?? 0)
  if (!budget?.limits || used >= budget.limits.integrationRepairs)
    throw new DeliveryJournalError('continuation-budget-exhausted')
  return { ...continues }
}
export function deliveryAttempts(state: DeliveryProjection): AttemptsFacet {
  const facet = state.facets.find((entry) => entry.schema === 'wholeloop/delivery-attempts@1')
  if (!facet) throw new DeliveryJournalError('missing-attempt-facet')
  return facet
}
/** At least one applied effect on the current basis: execution the controller observed. */
export function executedThroughEffect(state: DeliveryProjection): boolean {
  return !!state.facets
    .find((facet) => facet.schema === 'wholeloop/delivery-effects@1')
    ?.records.some(
      (record) => record.status === 'applied' && record.intent.basis === state.basis.digest,
    )
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
  // A queued run completes only when its last execution was an observed
  // external effect, such as publication (ADR-0207); metadata alone never
  // completes a run.
  if (payload.from === 'queued' && payload.to === 'completed' && !executedThroughEffect(state))
    throw new DeliveryJournalError('impossible-transition')
  const terminal = ['completed', 'stopped', 'failed', 'blocked', 'exhausted'].includes(payload.to)
  if (terminal !== (payload.outcome !== undefined))
    throw new DeliveryJournalError('invalid-outcome')
  if (payload.to === 'completed') {
    const outcomes = {
      'research-report': ['research-report-complete', 'completed-with-unknowns'],
      'learning-observation': ['learning-recorded', 'completed-with-unknowns'],
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

/** The context owns every derived map; no projection/index is accepted from a caller. */
function deliveryReducer() {
  const states = new Map<string, DeliveryProjection>(),
    ids = new Set<string>(),
    attempts = new Map<string, { run: string; record: AttemptRecord }>(),
    grants = new Map<string, { run: string; digest: string; terminal: boolean }>()
  let lanes: Map<string, AttemptRecord> | undefined
  let unitSelections: Map<string, UnitSelection> | undefined
  let previous: DeliveryEvent | undefined
  const admit = (event: DeliveryEvent) => {
    validateDeliveryEvent(event)
    if (
      ids.has(event.id) ||
      event.sequence !== (previous?.sequence ?? 0) + 1 ||
      event.previous !== previous?.digest
    )
      throw new DeliveryJournalError('event-order')
  }
  const apply = (event: DeliveryEvent) => {
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
        // ADR-0197: only a correction revision naming a retained failure may follow a
        // failed or blocked run; completed and exhausted runs never continue.
        const continuation = payload.continues
          ? continuationAdmission(state, payload.continues)
          : undefined
        if (
          payload.basis.kind !== 'plan' ||
          (continuation
            ? !['failed', 'blocked'].includes(state.state)
            : ['completed', 'failed', 'exhausted', 'blocked'].includes(state.state)) ||
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
        if (continuation) {
          const facet = deliveryRunner(state)
          facet.continuations = [
            ...(facet.continuations ?? []),
            { ...continuation, revision: payload.basis.revision ?? 1, sequence: event.sequence },
          ]
        }
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
          // A continuation is always started under a new exact-plan grant, never by
          // an earlier or envelope grant that outlived the failed run (ADR-0197).
          if (
            deliveryRunner(state).continuations?.at(-1)?.revision === state.basis.revision &&
            state.grant?.id !== payload.id &&
            (prior || payload.basis !== state.basis.digest)
          )
            throw new DeliveryJournalError('continuation-requires-new-grant')
          if (state.grant?.id === payload.id && state.grant.digest !== payload.digest)
            throw new DeliveryJournalError('changed-grant')
          if (
            state.grant?.id === payload.id &&
            ['revoked', 'expired'].includes(state.grant.status) &&
            payload.status === 'active'
          )
            throw new DeliveryJournalError('revived-grant')
          // Every grant assignment enters this exact-owner map, including
          // terminal/replaced observations; the earlier prior check is stronger
          // than searching only grants still attached to current projections.
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
        case 'wholeloop/delivery-person-attribution@1':
          if (payload.basis !== state.basis.digest || state.policy.intervention === 'none')
            throw new DeliveryJournalError('person-attribution-basis')
          // Retain its journal position and digest, but never synthesize an approval facet.
          break
        case 'wholeloop/delivery-attempt-event@1': {
          if (event.actor.kind !== 'controller') throw new DeliveryJournalError('attempt-actor')
          const facet = deliveryAttempts(state)
          const known = attempts.get(payload.id)
          const record = known?.run === state.run ? known.record : undefined
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
            const planning = payload.role === 'planner' || payload.role === 'challenger'
            let unit: DeliveryUnit | undefined
            if (!planning && payload.unit !== undefined) {
              if (state.units.length < 2)
                unit = state.units[0]?.id === payload.unit ? state.units[0] : undefined
              else {
                unitSelections ??= new Map()
                unit = selectedUnit(state, payload.unit, unitSelections)
              }
            }
            if (planning ? payload.unit !== undefined : !unit)
              throw new DeliveryJournalError('attempt-unit')
            if (
              (payload.role === 'builder' && unit?.role === 'research') ||
              (payload.role === 'researcher' && unit?.role !== 'research')
            )
              throw new DeliveryJournalError('attempt-role')
            // Generations strictly increase and terminal attempts cannot revive.
            // Only this lane's latest claim can be active. Keep lanes across plan
            // revisions, and separate runs/roles/cells without delimiter aliases.
            const lane = JSON.stringify([
              state.run,
              payload.unit ?? null,
              payload.role,
              payload.cell ?? null,
            ])
            const latest = lanes?.get(lane)
            if (
              (latest && ACTIVE.has(latest.state)) ||
              payload.generation !== (latest?.generation ?? 0) + 1
            )
              throw new DeliveryJournalError('attempt-generation')
            const { schema: _schema, action: _action, ...identity } = payload
            const claimed: AttemptRecord = {
              ...structuredClone(identity),
              state: 'claimed',
              observedAt: event.ts,
            }
            facet.records.push(claimed)
            attempts.set(payload.id, { run: state.run, record: claimed })
            lanes ??= new Map()
            lanes.set(lane, claimed)
          } else {
            if (
              !record ||
              record.generation !== payload.generation ||
              record.basis !== payload.basis ||
              record.unit !== payload.unit ||
              record.role !== payload.role ||
              record.cell !== payload.cell
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
        case 'wholeloop/delivery-runner-event@1':
          reduceRunner(state, event, payload)
          break
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
  return {
    admit,
    apply,
    validate() {
      for (const state of states.values()) validateDeliveryProjection(state)
      return states
    },
    snapshot: () => structuredClone(states),
  }
}

/** Only registered payload/facet families participate; an unknown version never replays partially. */
export function replayDelivery(events: readonly DeliveryEvent[]): Map<string, DeliveryProjection> {
  const reducer = deliveryReducer()
  for (const event of events) {
    reducer.admit(event)
    reducer.apply(event)
  }
  return reducer.validate()
}

/** Independent event ownership and cloned views keep incremental facts private. */
export function deliveryReplay(events: readonly DeliveryEvent[]) {
  const successful = structuredClone([...events])
  let reducer = deliveryReducer()
  for (const event of successful) {
    reducer.admit(event)
    reducer.apply(event)
  }
  reducer.validate()
  return {
    append(event: DeliveryEvent) {
      const owned = structuredClone(event)
      // Schema/digest/order refusal has not touched any private replay fact.
      // Restoring the complete prefix is required only after mutation begins.
      reducer.admit(owned)
      try {
        reducer.apply(owned)
        // Generic callbacks still observe every append's full projection checks.
        reducer.validate()
      } catch (error) {
        // A reducer can mutate before refusing. Restore only on failure, using
        // successful owned events; a caught refusal must not poison later work.
        reducer = deliveryReducer()
        for (const prior of successful) {
          reducer.admit(prior)
          reducer.apply(prior)
        }
        reducer.validate()
        throw error
      }
      successful.push(owned)
    },
    snapshot: () => reducer.snapshot(),
  }
}
