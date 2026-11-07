// Queue admissions and assignments and their reducer for the delivery journal.
import { contractDigest } from '../contracts/compatibility.js'
import type { BrokerRole, BrokerScope } from './broker.js'
import type { DeliveryEvent, DeliveryProjection } from './events.js'
import { DeliveryJournalError } from './journal-error.js'
import queueEventSchema from './schemas/queue-event-v1.json' with { type: 'json' }
import queueFacetSchema from './schemas/queue-v1.json' with { type: 'json' }

export { queueEventSchema, queueFacetSchema }
export interface QueueAdmission {
  provenance: 'fixture' | 'host-observed'
  evidence: string
}
export interface QueuePayload {
  schema: 'wholeloop/delivery-queue-event@1'
  action: 'enqueued' | 'deferred' | 'claimed' | 'settled' | 'requeued'
  id: string
  basis: string
  unit?: string
  role?: BrokerRole
  cell?: string
  priority?: number
  repository?: string
  repositoryKey?: string
  remoteKey?: string
  attempt?: string
  generation?: number
  controller?: string
  admission?: QueueAdmission
  reason?: string
  evidence?: string
  outcome?: 'complete' | 'cancelled'
}
export interface QueueRecord {
  id: string
  basis: string
  unit: string
  role: BrokerRole
  cell?: string
  priority: number
  repository?: string
  repositoryKey?: string
  remoteKey?: string
  status: 'pending' | 'claimed' | 'complete' | 'cancelled'
  sequence: number
  enqueuedAt: string
  attempt?: string
  generation?: number
  controller?: string
  admission?: QueueAdmission
  reason?: string
  evidence?: string
}
export interface QueueFacet {
  schema: 'wholeloop/delivery-queue@1'
  records: QueueRecord[]
}
export function deliveryQueue(state: DeliveryProjection): QueueFacet {
  let facet = state.facets.find((entry) => entry.schema === 'wholeloop/delivery-queue@1')
  if (!facet) {
    facet = { schema: 'wholeloop/delivery-queue@1', records: [] }
    // Reducers own mutable states; a frozen journal view (ADR-0239) only reads,
    // so it gets the same empty facet without changing the shared projection.
    if (!Object.isFrozen(state.facets)) state.facets.push(facet)
  }
  return facet
}
export function reduceDeliveryQueue(
  state: DeliveryProjection,
  event: DeliveryEvent,
  payload: QueuePayload,
): void {
  if (event.actor.kind !== 'controller' || payload.basis !== state.basis.digest)
    throw new DeliveryJournalError('queue-basis-or-actor')
  const allowed = {
    enqueued: [
      'unit',
      'role',
      'cell',
      'priority',
      'repository',
      'repositoryKey',
      'remoteKey',
      'reason',
    ],
    deferred: ['reason'],
    claimed: ['attempt', 'generation', 'controller', 'admission'],
    settled: ['attempt', 'generation', 'outcome', 'evidence'],
    requeued: ['attempt', 'generation', 'reason', 'evidence'],
  }
  if (
    Object.keys(payload).some(
      (key) => !['schema', 'action', 'id', 'basis', ...allowed[payload.action]].includes(key),
    )
  )
    throw new DeliveryJournalError('queue-action-fields')
  const records = deliveryQueue(state).records
  const record = records.find((entry) => entry.id === payload.id)
  const attempts =
    state.facets.find((entry) => entry.schema === 'wholeloop/delivery-attempts@1')?.records ?? []
  if (payload.action === 'enqueued') {
    const unit = state.units.find((entry) => entry.id === payload.unit)
    if (
      record ||
      payload.id !==
        `queue-${contractDigest({ run: state.run, basis: payload.basis, unit: payload.unit, role: payload.role, cell: payload.cell ?? null }).slice(0, 32)}` ||
      !unit ||
      !payload.role ||
      payload.priority === undefined ||
      !['planned', 'queued', 'running', 'paused', 'waiting-input', 'waiting-external'].includes(
        state.state,
      ) ||
      (payload.role === 'builder' && (unit.role === 'research' || payload.cell !== undefined)) ||
      (payload.role === 'researcher' && unit.role !== 'research') ||
      payload.repository !== unit.repository ||
      (payload.repository !== undefined) !== (payload.repositoryKey !== undefined) ||
      (payload.remoteKey !== undefined && payload.repository === undefined)
    )
      throw new DeliveryJournalError('queue-enqueue')
    if (
      records.some(
        (entry) =>
          entry.basis === payload.basis &&
          entry.unit === payload.unit &&
          entry.role === payload.role &&
          entry.cell === payload.cell,
      )
    )
      throw new DeliveryJournalError('duplicate-queue-slot')
    records.push({
      id: payload.id,
      basis: payload.basis,
      unit: unit.id,
      role: payload.role,
      priority: payload.priority,
      status: 'pending',
      sequence: event.sequence,
      enqueuedAt: event.ts,
      ...(payload.cell !== undefined ? { cell: payload.cell } : {}),
      ...(payload.repository
        ? { repository: payload.repository, repositoryKey: payload.repositoryKey }
        : {}),
      ...(payload.remoteKey ? { remoteKey: payload.remoteKey } : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
    })
    return
  }
  if (!record || record.basis !== payload.basis)
    throw new DeliveryJournalError('unknown-queue-entry')
  if (payload.action === 'deferred') {
    if (record.status !== 'pending' || !payload.reason)
      throw new DeliveryJournalError('queue-defer')
    record.reason = payload.reason
    return
  }
  const attempt = attempts.find((entry) => entry.id === payload.attempt)
  if (
    !attempt ||
    attempt.basis !== record.basis ||
    attempt.unit !== record.unit ||
    attempt.role !== record.role ||
    attempt.cell !== record.cell ||
    attempt.generation !== payload.generation
  )
    throw new DeliveryJournalError('queue-attempt')
  if (payload.action === 'claimed') {
    if (
      record.status !== 'pending' ||
      attempt.state !== 'claimed' ||
      !payload.controller ||
      !payload.admission ||
      !['queued', 'running'].includes(state.state)
    )
      throw new DeliveryJournalError('queue-claim')
    record.status = 'claimed'
    record.attempt = attempt.id
    record.generation = attempt.generation
    record.controller = payload.controller
    record.admission = structuredClone(payload.admission)
    delete record.reason
  } else {
    if (
      record.attempt !== payload.attempt ||
      record.generation !== payload.generation ||
      !payload.evidence
    )
      throw new DeliveryJournalError('queue-lease')
    if (payload.action === 'settled') {
      if (
        record.status !== 'claimed' ||
        (payload.outcome === 'complete'
          ? attempt.state !== 'completed'
          : payload.outcome !== 'cancelled' || !['failed', 'stopped'].includes(attempt.state))
      )
        throw new DeliveryJournalError('queue-settlement')
      record.status = payload.outcome === 'complete' ? 'complete' : 'cancelled'
      record.evidence = payload.evidence
    } else {
      if (
        !['cancelled', 'complete'].includes(record.status) ||
        !['queued', 'running', 'paused', 'stopped', 'waiting-input', 'waiting-external'].includes(
          state.state,
        ) ||
        attempt.state !== 'fenced' ||
        !payload.reason
      )
        throw new DeliveryJournalError('queue-retry-without-fence')
      record.status = 'pending'
      record.reason = payload.reason
      record.evidence = payload.evidence
      delete record.attempt
      delete record.generation
      delete record.controller
      delete record.admission
    }
  }
}

export interface QueueAssignment {
  queue: string
  run: string
  plan: string
  revision: number
  unit: string
  role: BrokerScope['role']
  cell?: string
  attempt: string
  generation: number
  controller: string
  grant: string
}
export function queueAssignment(state: DeliveryProjection, record: QueueRecord): QueueAssignment {
  if (
    state.basis.digest !== record.basis ||
    !record.attempt ||
    !record.generation ||
    !record.controller ||
    !state.grant ||
    !state.basis.revision
  )
    throw new DeliveryJournalError('missing-queue-lease')
  return {
    queue: record.id,
    run: state.run,
    plan: record.basis,
    revision: state.basis.revision,
    unit: record.unit,
    role: record.role,
    ...(record.cell !== undefined ? { cell: record.cell } : {}),
    attempt: record.attempt,
    generation: record.generation,
    controller: record.controller,
    grant: state.grant.id,
  }
}
