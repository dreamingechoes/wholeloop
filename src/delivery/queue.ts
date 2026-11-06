import { randomBytes } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import { repository } from '../worktrees/git.js'
import type { DeliveryGrant } from './authority.js'
import type { BrokerScope } from './broker.js'
import type { BudgetClock, BudgetMetering, BudgetPayload } from './budget-events.js'
import {
  currentBudgetReservation,
  deliveryBudgetClock,
  effectiveBudgetView,
  prepareBudgetAdmission,
} from './budget-policy.js'
import { type AttemptPayload, DeliveryJournalError, type DeliveryProjection } from './events.js'
import { DeliveryLifecycle } from './lifecycle.js'
import { type DeliveryPlan, deliveryPlanRoute, observePlanBases } from './plan.js'
import {
  deliveryQueue,
  type QueueAdmission,
  type QueueAssignment,
  type QueueRecord,
  queueAssignment,
} from './queue-events.js'
import { queueCapacity } from './queue-selection.js'
import { deliveryAttempts } from './reducer.js'

export type { QueueAssignment } from './queue-events.js'
export type QueueReadiness =
  | ({ ready: true; metering?: BudgetMetering } & QueueAdmission)
  | {
      ready: false
      reason:
        | 'capability-unavailable'
        | 'environment-unavailable'
        | 'budget-unavailable'
        | 'unaccepted-plan'
        | 'unverified-dependencies'
    }
export interface QueueCandidate {
  run: string
  entry: QueueRecord
  plan: DeliveryPlan
  grant: DeliveryGrant
}
export interface QueueClaimResult {
  assignment: QueueAssignment | null
  deferred: { run: string; queue: string; reason: string }[]
  effects: 'not-performed'
}
export const DEFAULT_QUEUE_CAPACITY = { builders: 2, buildersPerRepository: 1, evaluators: 4 }
const ACTOR = { kind: 'controller', name: 'wholeloop' } as const
const ACTIVE = new Set(['claimed', 'started', 'stopping'])
const execution = (role: string) => ['builder', 'researcher'].includes(role)
const slot = (value: { unit?: string; role: string; cell?: string }) =>
  contractDigest({ unit: value.unit ?? null, role: value.role, cell: value.cell ?? null })

/** Reservations are journaled, not leased by elapsed time. Callbacks only observe trusted hosts. */
export class DeliveryQueue {
  readonly lifecycle: DeliveryLifecycle
  readonly capacity: typeof DEFAULT_QUEUE_CAPACITY
  readonly budgetClock: () => BudgetClock
  constructor(
    store?: string,
    now?: () => string,
    capacity = DEFAULT_QUEUE_CAPACITY,
    clock?: () => BudgetClock,
  ) {
    this.lifecycle = new DeliveryLifecycle(store, now)
    this.budgetClock = clock ?? (() => deliveryBudgetClock(this.lifecycle.journal.now))
    this.capacity = Object.freeze({ ...capacity })
    if (
      Object.keys(this.capacity).sort().join(',') !== 'builders,buildersPerRepository,evaluators' ||
      Object.values(this.capacity).some(
        (value) => !Number.isSafeInteger(value) || value < 1 || value > 1000,
      )
    )
      throw new DeliveryJournalError('invalid-queue-capacity')
  }

  enqueue(
    run: string,
    input: { unit: string; role?: BrokerScope['role']; cell?: string; priority?: number },
  ): QueueRecord {
    let id = ''
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = this.state(view(), run)
      this.grant(state)
      const plan = this.plan(state)
      const unit = plan.work.find((entry) => entry.id === input.unit)
      if (!unit) throw new DeliveryJournalError('unknown-queue-unit')
      const role = input.role ?? (unit.role === 'research' ? 'researcher' : 'builder')
      id = `queue-${contractDigest({ run, basis: state.basis.digest, unit: unit.id, role, cell: input.cell ?? null }).slice(0, 32)}`
      const old = deliveryQueue(state).records.find((entry) => entry.id === id)
      if (old) {
        if (old.priority !== (input.priority ?? 0))
          throw new DeliveryJournalError('changed-queue-priority')
        return
      }
      const repo = plan.repositories.find((entry) => entry.id === unit.repository)
      append(run, {
        schema: 'wholeloop/delivery-queue-event@1',
        action: 'enqueued',
        id,
        basis: state.basis.digest,
        unit: unit.id,
        role,
        priority: input.priority ?? 0,
        ...(input.cell !== undefined ? { cell: input.cell } : {}),
        ...(repo
          ? {
              repository: repo.id,
              repositoryKey: contractDigest(repository(repo.root).commonDir),
              ...(repo.remote ? { remoteKey: contractDigest(repo.remote.url) } : {}),
            }
          : {}),
        reason: unit.after.length ? 'dependencies-pending' : 'awaiting-host-admission',
      })
      if (state.state === 'planned')
        append(run, {
          schema: 'wholeloop/delivery-control-event@1',
          from: 'planned',
          to: 'queued',
          basis: state.basis.digest,
          reason: 'Work queued under an existing explicit grant.',
        })
    })
    const record = this.inspect(run).find((entry) => entry.id === id)
    if (!record) throw new DeliveryJournalError('missing-queue-entry')
    return record
  }

  inspect(run: string): QueueRecord[] {
    return deliveryQueue(this.lifecycle.journal.view(run)).records
  }

  assigned(run: string, attempt: string): QueueAssignment {
    const state = this.lifecycle.journal.view(run)
    const record = deliveryQueue(state).records.find((record) => record.attempt === attempt)
    if (!record) throw new DeliveryJournalError('unknown-queue-assignment')
    return this.assignment(state, record)
  }

  claim(
    controller: string,
    admit: (candidate: Readonly<QueueCandidate>) => QueueReadiness = () => ({
      ready: false,
      reason: 'capability-unavailable',
    }),
    selected?: { run: string; queue: string; deadline?: string },
  ): QueueClaimResult {
    if (!/^controller-[a-f0-9]{32}$/.test(controller))
      throw new DeliveryJournalError('invalid-controller')
    if (
      selected &&
      (!/^delivery-[a-f0-9]{16}$/.test(selected.run) ||
        !/^queue-[a-f0-9]{32}$/.test(selected.queue))
    )
      throw new DeliveryJournalError('invalid-queue-selection')
    let assignment: QueueAssignment | null = null
    const deferred: { run: string; queue: string; reason: string }[] = []
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const states = view()
      const candidates = [...states.values()]
        .flatMap((state) =>
          deliveryQueue(state)
            .records.filter(
              (entry) =>
                entry.status === 'pending' &&
                entry.basis === state.basis.digest &&
                (!selected || (state.run === selected.run && entry.id === selected.queue)),
            )
            .map((entry) => ({ run: state.run, entry })),
        )
        .sort(
          (a, b) =>
            b.entry.priority - a.entry.priority ||
            a.entry.sequence - b.entry.sequence ||
            a.entry.id.localeCompare(b.entry.id),
        )
      let recordedDeferrals = 0
      for (const candidate of candidates) {
        const state = this.state(states, candidate.run)
        const entry = candidate.entry
        let reason = ''
        let admission: QueueAdmission | undefined
        let reserved: { attempt: string; generation: number; payloads: BudgetPayload[] } | undefined
        try {
          if (!['queued', 'running'].includes(state.state)) reason = `run-${state.state}`
          else if (this.lifecycle.journal.now() < state.maxObservedAt) reason = 'clock-regression'
          else {
            const plan = this.plan(state),
              grant = this.grant(state)
            const unit = plan.work.find((work) => work.id === entry.unit)
            if (!unit) throw new DeliveryJournalError('unknown-queue-unit')
            if (
              deliveryPlanRoute(plan).next === 'blocked' ||
              (entry.role === 'builder' && deliveryPlanRoute(plan).next !== 'build')
            )
              reason = 'definition-unavailable'
            else if (
              unit.after.some(
                (id) =>
                  !deliveryQueue(state).records.some(
                    (prior) =>
                      prior.basis === entry.basis &&
                      prior.unit === id &&
                      prior.status === 'complete' &&
                      execution(prior.role),
                  ),
              )
            )
              reason = 'dependencies-pending'
            else if (!this.effects(entry, grant)) reason = 'effect-not-granted'
            else {
              observePlanBases(plan.repositories)
              const repo = plan.repositories.find((value) => value.id === entry.repository)
              if (repo && contractDigest(repository(repo.root).commonDir) !== entry.repositoryKey)
                reason = 'repository-identity-changed'
              else if (
                deliveryAttempts(state).records.some(
                  (record) =>
                    slot(record) === slot(entry) &&
                    // ADR-0208: an earlier revision's settled attempt is history;
                    // a continuation reopens only once none is unresolved, and
                    // the journal cannot fence across bases.
                    record.basis === state.basis.digest &&
                    !ACTIVE.has(record.state) &&
                    record.state !== 'fenced',
                )
              )
                reason = 'prior-attempt-unfenced'
              else reason = this.reservations(states, state, entry, plan)
              if (!reason) {
                const ready = admit(structuredClone({ run: state.run, entry, plan, grant }))
                if (!ready.ready) reason = ready.reason
                else if (ready.metering && ready.metering.provenance !== ready.provenance)
                  reason = 'metering-provenance-mismatch'
                else {
                  const siblings = deliveryAttempts(state).records.filter(
                    (record) => slot(record) === slot(entry),
                  )
                  const generation = Math.max(0, ...siblings.map((record) => record.generation)) + 1
                  const attempt = `attempt-${randomBytes(8).toString('hex')}`
                  const budget = prepareBudgetAdmission(
                    state,
                    grant,
                    this.budgetClock(),
                    {
                      ...(selected?.deadline !== undefined ? { deadline: selected.deadline } : {}),
                      id: attempt,
                      kind: 'attempt',
                      unit: entry.unit,
                      role: entry.role,
                      generation,
                      ...(entry.cell !== undefined ? { cell: entry.cell } : {}),
                      ...(ready.metering ? { metering: ready.metering } : {}),
                    },
                    plan.budgets,
                  )
                  if (budget.problem) reason = budget.problem
                  else {
                    reserved = { attempt, generation, payloads: budget.payloads }
                    admission = { provenance: ready.provenance, evidence: ready.evidence }
                  }
                }
              }
            }
          }
        } catch {
          // Missing private artifacts or unavailable Git/hosts must hold, never free, reservations.
          reason = 'basis-or-admission-unavailable'
        }
        if (reason || !admission) {
          reason ||= 'capability-unavailable'
          if (deferred.length < 1000) deferred.push({ run: state.run, queue: entry.id, reason })
          // Clock/reservation and attempt/claim commit together within the segment's event limit.
          if (entry.reason !== reason && recordedDeferrals < 996) {
            append(state.run, {
              schema: 'wholeloop/delivery-queue-event@1',
              action: 'deferred',
              id: entry.id,
              basis: entry.basis,
              reason,
            })
            recordedDeferrals++
          }
          continue
        }
        if (!reserved) throw new DeliveryJournalError('missing-budget-reservation')
        const { generation, attempt } = reserved
        for (const payload of reserved.payloads) append(state.run, payload)
        append(state.run, {
          schema: 'wholeloop/delivery-attempt-event@1',
          action: 'claimed',
          id: attempt,
          basis: entry.basis,
          unit: entry.unit,
          role: entry.role,
          generation,
          ...(entry.cell !== undefined ? { cell: entry.cell } : {}),
        })
        append(state.run, {
          schema: 'wholeloop/delivery-queue-event@1',
          action: 'claimed',
          id: entry.id,
          basis: entry.basis,
          attempt,
          generation,
          controller,
          admission,
        })
        const current = this.state(view(), state.run)
        const claimed = deliveryQueue(current).records.find((record) => record.id === entry.id)
        if (!claimed) throw new DeliveryJournalError('missing-queue-entry')
        assignment = this.assignment(current, claimed)
        break
      }
    })
    return { assignment, deferred, effects: 'not-performed' as const }
  }

  start(assignment: QueueAssignment, runtime: NonNullable<AttemptPayload['runtime']>): void {
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const { state } = this.lease(view(), assignment)
      this.grant(state)
      if (!currentBudgetReservation(state, assignment.attempt, this.budgetClock()))
        throw new DeliveryJournalError('expired-attempt-budget')
      if (
        !['queued', 'running'].includes(state.state) ||
        this.lifecycle.journal.now() < state.maxObservedAt
      )
        throw new DeliveryJournalError('queue-start-state')
      if (
        [...view().values()].some((run) =>
          deliveryAttempts(run).records.some(
            (record) =>
              record.id !== assignment.attempt &&
              ACTIVE.has(record.state) &&
              record.runtime &&
              contractDigest(record.runtime) === contractDigest(runtime),
          ),
        )
      )
        throw new DeliveryJournalError('runtime-already-assigned')
      append(state.run, { ...this.attempt(assignment), action: 'started', runtime })
      if (state.state === 'queued')
        append(state.run, {
          schema: 'wholeloop/delivery-control-event@1',
          from: 'queued',
          to: 'running',
          basis: state.basis.digest,
          reason: 'The trusted host observed this exact worker identity.',
        })
    })
  }

  finish(
    assignment: QueueAssignment,
    action: 'completed' | 'stopped' | 'failed',
    evidence: string,
  ): void {
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const { state } = this.lease(view(), assignment)
      if (action === 'completed') {
        this.grant(state)
        if (!currentBudgetReservation(state, assignment.attempt, this.budgetClock()))
          throw new DeliveryJournalError('expired-attempt-budget')
      }
      append(state.run, { ...this.attempt(assignment), action, evidence })
      append(state.run, {
        schema: 'wholeloop/delivery-queue-event@1',
        action: 'settled',
        id: assignment.queue,
        basis: assignment.plan,
        attempt: assignment.attempt,
        generation: assignment.generation,
        outcome: action === 'completed' ? 'complete' : 'cancelled',
        evidence,
      })
    })
  }

  fence(assignment: QueueAssignment): void {
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      this.lease(view(), assignment)
      append(assignment.run, { ...this.attempt(assignment), action: 'fenced' })
    })
  }

  requeue(assignment: QueueAssignment, evidence: string): void {
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const { state } = this.lease(view(), assignment)
      this.grant(state)
      append(state.run, {
        schema: 'wholeloop/delivery-queue-event@1',
        action: 'requeued',
        id: assignment.queue,
        basis: assignment.plan,
        attempt: assignment.attempt,
        generation: assignment.generation,
        reason: 'The previous attempt is terminal and fenced; retry admission remains required.',
        evidence,
      })
    })
  }

  /** Read-only broker lease check; it performs no nested transaction or external effect. */
  current(scope: Readonly<BrokerScope>): boolean {
    try {
      const state = this.lifecycle.journal.view(scope.run)
      const record = deliveryQueue(state).records.find((entry) => entry.attempt === scope.attempt)
      const attempt = deliveryAttempts(state).records.find((entry) => entry.id === scope.attempt)
      return (
        state.state === 'running' &&
        state.basis.digest === scope.plan &&
        state.basis.revision === scope.revision &&
        state.grant?.id === scope.grant &&
        record?.status === 'claimed' &&
        record.unit === scope.unit &&
        record.role === scope.role &&
        record.generation === scope.generation &&
        attempt?.state === 'started' &&
        attempt.runtime?.instance === scope.runtime &&
        currentBudgetReservation(state, scope.attempt, this.budgetClock())
      )
    } catch {
      return false
    }
  }

  private state(states: ReadonlyMap<string, DeliveryProjection>, run: string): DeliveryProjection {
    const state = states.get(run)
    if (!state) throw new DeliveryJournalError('unknown-run')
    return state
  }
  private plan(state: DeliveryProjection): DeliveryPlan {
    if (state.basis.kind !== 'plan' || !state.basis.revision)
      throw new DeliveryJournalError('queue-needs-plan')
    const prepared = this.lifecycle.authority.planning.getPlan(state.run, state.basis.revision)
    if (prepared.digest !== state.basis.digest)
      throw new DeliveryJournalError('queue-plan-mismatch')
    return prepared.plan
  }
  private grant(state: DeliveryProjection): DeliveryGrant {
    const observed = state.grant ? this.lifecycle.authority.inspect(state.grant.id) : undefined
    if (observed?.status !== 'active' || observed.digest !== state.grant?.digest)
      throw new DeliveryJournalError('inactive-authority')
    return observed.grant
  }
  private effects(entry: QueueRecord, grant: DeliveryGrant): boolean {
    const required =
      entry.role === 'builder'
        ? ['workspace.create', 'code.write']
        : entry.role === 'verifier'
          ? ['test.run']
          : entry.role === 'researcher'
            ? ['source.read', 'report.write']
            : ['report.write']
    return required.every((effect) => grant.effects.some((value) => value === effect))
  }
  private reservations(
    states: ReadonlyMap<string, DeliveryProjection>,
    state: DeliveryProjection,
    entry: QueueRecord,
    plan: DeliveryPlan,
  ): string {
    const limits = effectiveBudgetView(
      state,
      this.grant(state),
      this.budgetClock(),
      plan.budgets,
    ).limits
    return queueCapacity(states, state, entry, limits, this.capacity)
  }
  private assignment(state: DeliveryProjection, record: QueueRecord): QueueAssignment {
    return queueAssignment(state, record)
  }
  private lease(states: ReadonlyMap<string, DeliveryProjection>, assignment: QueueAssignment) {
    const state = this.state(states, assignment.run)
    const record = deliveryQueue(state).records.find((entry) => entry.id === assignment.queue)
    if (
      !record ||
      state.basis.digest !== assignment.plan ||
      contractDigest(this.assignment(state, record)) !== contractDigest(assignment)
    )
      throw new DeliveryJournalError('stale-queue-lease')
    return { state, record }
  }
  private attempt(value: QueueAssignment): Omit<AttemptPayload, 'action'> {
    return {
      schema: 'wholeloop/delivery-attempt-event@1',
      id: value.attempt,
      basis: value.plan,
      unit: value.unit,
      role: value.role,
      generation: value.generation,
      ...(value.cell !== undefined ? { cell: value.cell } : {}),
    }
  }
}
