import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { assertExternal, canonicalPath } from '../state/paths.js'
import type { DeliveryGrant } from './authority.js'
import {
  currentBudgetReservation,
  effectiveBudget,
  prepareBudgetAdmission,
} from './budget-policy.js'
import { DeliveryBudgets } from './budgets.js'
import { type AttemptPayload, DeliveryJournalError, type DeliveryProjection } from './events.js'
import { readSourceBytes, readSourceFile } from './input.js'
import {
  NativeAssignmentHost,
  type NativeRunOptions,
  type NativeRunReceipt,
} from './native-assignment-host.js'
import {
  checkPlanEnvelope,
  type DeliveryEnvelope,
  type DeliveryPlan,
  observePlanBases,
} from './plan.js'
import type { DeliveryQueue } from './queue.js'
import { deliveryQueue } from './queue-events.js'
import { deliveryAttempts } from './reducer.js'
import {
  createWorkerAssignment,
  validateWorkerAssignment,
  type WorkerAssignment,
  type WorkerContext,
  type WorkerExecution,
  workerResumePack,
} from './worker-protocol.js'

export interface NativeReadOnlyLease {
  grant: string
  contextRoot: string
  provenance: 'fixture' | 'host-observed'
  assignment: WorkerAssignment
}
interface NativeReadOnlyClaim<L> {
  run: string
  grant: string
  key: string
  cell: string
  role: 'planner' | 'challenger'
  brief: string
  environment: WorkerAssignment['environment']
  contextRoot: string
  context: WorkerContext[]
  provenance: 'fixture' | 'host-observed'
  deadline?: string
  /** The client's read-only web tools; the assignment validator admits them for research cells only. */
  web?: boolean
  authorize(grant: DeliveryGrant, basis: DeliveryPlan | DeliveryEnvelope): void
  create(assignment: WorkerAssignment): L
}
const ACTIVE = new Set(['claimed', 'started', 'stopping'])
const ACTOR = { kind: 'controller', name: 'wholeloop' } as const

/** Shared original-budget transport; fixed profiles authorize distinct read-only purposes. */
export abstract class NativeReadOnlyAttempts<L extends NativeReadOnlyLease> {
  protected readonly historicalObservations: boolean = false
  protected active(_lease: Readonly<L>): boolean {
    return true
  }
  protected readonly purposeDescription: string = 'delegated decision worker'
  readonly budgets: DeliveryBudgets
  constructor(readonly queue: DeliveryQueue) {
    this.budgets = new DeliveryBudgets(
      queue.lifecycle.journal.files.root,
      queue.lifecycle.journal.now,
      queue.budgetClock,
    )
  }
  private get journal() {
    return this.queue.lifecycle.journal
  }

  protected claimAttempt(input: NativeReadOnlyClaim<L>): L {
    if (!/^[a-f0-9]{64}$/.test(input.key)) throw new DeliveryJournalError('purpose-key')
    if (!['planner', 'challenger'].includes(input.role))
      throw new DeliveryJournalError('purpose-role')
    assertExternal(input.contextRoot)
    const contextRoot = canonicalPath(input.contextRoot)
    let lease: L | undefined
    this.journal.transaction(ACTOR, (view, append) => {
      const state = view().get(input.run)
      if (!state) throw new DeliveryJournalError('unknown-run')
      const { grant, basis } = this.basis(state, input.grant)
      input.authorize(grant.grant, basis)
      const cell = input.cell
      const records = deliveryAttempts(state).records
      // A repeated controller call never creates a second process or a new allowance.
      // Even known failures need a new authorized purpose; an unknown original stays held.
      if (records.some((item) => item.role === input.role && item.cell === cell))
        throw new DeliveryJournalError('purpose-already-claimed')
      const active = [...view().values()].flatMap((run) =>
          deliveryAttempts(run)
            .records.filter((item) => ACTIVE.has(item.state))
            .map((attempt) => ({ run, attempt })),
        ),
        evaluators = active.filter(
          ({ attempt }) => !['builder', 'researcher'].includes(attempt.role),
        )
      if (
        evaluators.some(
          ({ run, attempt }) =>
            !deliveryQueue(run).records.some((record) => record.attempt === attempt.id),
        )
      )
        throw new DeliveryJournalError('purpose-unresolved-evaluator')
      const budget = effectiveBudget(state, grant.grant, this.queue.budgetClock(), basis.budgets)
      if (
        evaluators.length >= this.queue.capacity.evaluators ||
        evaluators.filter(({ run }) => run.run === input.run).length >= budget.limits.evaluators
      )
        throw new DeliveryJournalError('purpose-evaluator-capacity')
      const attempt = `attempt-${randomBytes(8).toString('hex')}`
      const admission = prepareBudgetAdmission(
        state,
        grant.grant,
        this.queue.budgetClock(),
        {
          id: attempt,
          kind: 'attempt',
          role: input.role,
          cell,
          generation: 1,
        },
        basis.budgets,
      )
      if (admission.problem) throw new DeliveryJournalError(admission.problem)
      let deadline = admission.reservation.deadline
      if (input.deadline !== undefined) {
        const time = Date.parse(input.deadline)
        if (
          !Number.isFinite(time) ||
          new Date(time).toISOString() !== input.deadline ||
          time <= Date.parse(this.journal.now())
        )
          throw new DeliveryJournalError('purpose-deadline')
        deadline = new Date(Math.min(time, Date.parse(deadline))).toISOString()
      }
      const assignment = createWorkerAssignment(
        {
          identity: {
            run: state.run,
            plan: state.basis.digest,
            revision: state.basis.revision ?? 0,
            role: input.role,
            attempt,
            generation: 1,
            cell,
          },
          grantDigest: grant.digest,
          source: state.source,
          brief: input.brief,
          endpoint: basis.policy.endpoint,
          intervention: basis.policy.intervention,
          environment: input.environment,
          candidates: [],
          criteria: [],
          findings: [],
          contracts: [],
          context: input.context,
          deadline,
          limits: budget.limits,
        },
        { web: input.web === true },
      )
      workerResumePack(assignment, (artifact) =>
        readSourceBytes(contextRoot, artifact.ref, 1024 * 1024),
      )
      lease = input.create(assignment)
      this.validate(lease)
      // Publish the binding before the claim becomes visible. An orphan file grants nothing.
      this.journal.files.atomic(this.path(attempt), `${JSON.stringify(lease)}\n`)
      for (const payload of admission.payloads) append(input.run, payload)
      append(input.run, { ...this.event(assignment), action: 'claimed' })
    })
    if (!lease) throw new DeliveryJournalError('purpose-not-claimed')
    return structuredClone(lease)
  }

  async run(lease: Readonly<L>, options: NativeRunOptions) {
    this.journal.files.locked(() => {
      this.prepare(lease)
      const consumed = `${this.path(lease.assignment.identity.attempt)}.consumed`
      if (existsSync(this.journal.files.path(consumed)))
        throw new DeliveryJournalError('purpose-already-invoked')
      // Consumption precedes any launch. A crash here is conservatively unresolved,
      // rather than a license to launch the original private assignment twice.
      this.journal.files.atomic(consumed, `${lease.assignment.assignment}\n`)
    })
    return new NativeAssignmentHost({
      budgets: this.budgets,
      prepare: () => this.prepare(lease),
      provenance: () => lease.provenance,
      current: (assignment, runtime) => this.current(lease, assignment, runtime),
      start: (runtime) => this.start(lease, runtime),
      finish: (action, evidence) => this.finish(lease, action, evidence),
    }).run({}, { ...options, output: 'inline-proposal' })
  }

  /** A controller receipt is current only while its original private claim and bytes agree. */
  completed(lease: Readonly<L>, receipt: Readonly<NativeRunReceipt>): boolean {
    try {
      const record = this.record(lease),
        state = this.journal.get(record.assignment.identity.run)
      this.basis(state, record.grant, !this.historicalObservations)
      const attempt = deliveryAttempts(state).records.find(
        (item) => item.id === record.assignment.identity.attempt,
      )
      const execution = receipt.execution
      if (
        !this.matches(state, record) ||
        attempt?.state !== 'completed' ||
        attempt.evidence !== contractDigest(receipt) ||
        receipt.status !== 'succeeded' ||
        receipt.assignment !== record.assignment.assignment ||
        receipt.run !== state.run ||
        receipt.attempt !== attempt.id ||
        execution?.status !== 'succeeded' ||
        execution.code !== 0 ||
        execution.provenance !== record.provenance ||
        contractDigest(execution.runtime) !== contractDigest(attempt.runtime)
      )
        return false
      const persisted = JSON.parse(
        readSourceFile(
          this.journal.files.root,
          `${receipt.directory}/receipt-${contractDigest(receipt)}.json`,
          2 * 1024 * 1024,
        ),
      )
      if (contractDigest(persisted) !== contractDigest(receipt)) return false
      workerResumePack(record.assignment, (artifact) =>
        readSourceBytes(record.contextRoot, artifact.ref, 1024 * 1024),
      )
      for (const artifact of receipt.artifacts ?? []) {
        const bytes = readSourceBytes(this.journal.files.root, artifact.ref, 256 * 1024)
        if (
          bytes.length !== artifact.bytes ||
          createHash('sha256').update(bytes).digest('hex') !== artifact.digest
        )
          return false
      }
      return true
    } catch {
      return false
    }
  }

  private prepare(lease: Readonly<L>) {
    const record = this.record(lease),
      state = this.journal.get(record.assignment.identity.run)
    this.basis(state, record.grant)
    const attempt = deliveryAttempts(state).records.find(
      (item) => item.id === record.assignment.identity.attempt,
    )
    if (
      !this.active(record) ||
      attempt?.state !== 'claimed' ||
      Date.parse(this.journal.now()) >= Date.parse(record.assignment.deadline) ||
      !this.matches(state, record) ||
      !currentBudgetReservation(state, attempt.id, this.queue.budgetClock())
    )
      throw new DeliveryJournalError('purpose-not-ready')
    const resume = workerResumePack(record.assignment, (artifact) =>
      readSourceBytes(record.contextRoot, artifact.ref, 1024 * 1024),
    )
    return { assignment: structuredClone(record.assignment), resume }
  }

  private current(
    lease: Readonly<L>,
    assignment: WorkerAssignment,
    runtime: WorkerExecution['runtime'],
  ): boolean {
    try {
      const record = this.record(lease),
        state = this.journal.get(assignment.identity.run)
      this.basis(state, record.grant)
      const attempt = deliveryAttempts(state).records.find(
        (item) => item.id === assignment.identity.attempt,
      )
      return (
        this.active(record) &&
        this.matches(state, record) &&
        state.state === 'running' &&
        contractDigest(assignment) === contractDigest(record.assignment) &&
        attempt?.state === 'started' &&
        contractDigest(attempt.runtime) === contractDigest(runtime) &&
        currentBudgetReservation(state, attempt.id, this.queue.budgetClock()) &&
        Date.parse(this.journal.now()) < Date.parse(assignment.deadline)
      )
    } catch {
      return false
    }
  }

  private start(lease: Readonly<L>, runtime: WorkerExecution['runtime']) {
    this.journal.transaction(ACTOR, (view, append) => {
      const record = this.record(lease),
        state = view().get(record.assignment.identity.run)
      if (!state || !this.matches(state, record)) throw new DeliveryJournalError('purpose-stale')
      this.basis(state, record.grant)
      const attempt = deliveryAttempts(state).records.find(
        (item) => item.id === record.assignment.identity.attempt,
      )
      if (
        !this.active(record) ||
        attempt?.state !== 'claimed' ||
        !currentBudgetReservation(state, attempt.id, this.queue.budgetClock()) ||
        Date.parse(this.journal.now()) >= Date.parse(record.assignment.deadline)
      )
        throw new DeliveryJournalError('purpose-not-ready')
      if (
        [...view().values()].some((run) =>
          deliveryAttempts(run).records.some(
            (item) =>
              item.runtime &&
              ACTIVE.has(item.state) &&
              contractDigest(item.runtime) === contractDigest(runtime),
          ),
        )
      )
        throw new DeliveryJournalError('runtime-already-assigned')
      append(state.run, { ...this.event(record.assignment), action: 'started', runtime })
      if (state.state === 'queued')
        append(state.run, {
          schema: 'wholeloop/delivery-control-event@1',
          from: 'queued',
          to: 'running',
          basis: state.basis.digest,
          reason: `The trusted host observed the exact ${this.purposeDescription}.`,
        })
    })
  }

  private finish(lease: Readonly<L>, action: 'completed' | 'stopped' | 'failed', evidence: string) {
    this.journal.transaction(ACTOR, (view, append) => {
      const record = this.record(lease),
        state = view().get(record.assignment.identity.run)
      if (!state) throw new DeliveryJournalError('unknown-run')
      if (action === 'completed') {
        this.basis(state, record.grant)
        if (
          !this.active(record) ||
          !this.matches(state, record) ||
          !currentBudgetReservation(
            state,
            record.assignment.identity.attempt,
            this.queue.budgetClock(),
          ) ||
          Date.parse(this.journal.now()) >= Date.parse(record.assignment.deadline)
        )
          throw new DeliveryJournalError('purpose-stale')
      }
      append(state.run, { ...this.event(record.assignment), action, evidence })
    })
  }

  private basis(state: DeliveryProjection, grantId: string, active = true) {
    const authority = this.queue.lifecycle.authority,
      grant = authority.inspect(grantId)
    if (
      (active && !['queued', 'running'].includes(state.state)) ||
      grant.status !== 'active' ||
      state.grant?.id !== grantId ||
      state.grant.digest !== grant.digest
    )
      throw new DeliveryJournalError('purpose-inactive-authority')
    const basis =
      state.basis.kind === 'plan'
        ? authority.planning.getPlan(state.run, state.basis.revision ?? 0).plan
        : authority.planning.getEnvelope(state.basis.digest).envelope
    if (contractDigest(basis) !== state.basis.digest)
      throw new DeliveryJournalError('purpose-basis')
    if (grant.grant.basis.kind === 'envelope') {
      if (state.basis.kind === 'plan')
        checkPlanEnvelope(
          basis as import('./plan.js').DeliveryPlan,
          authority.planning.getEnvelope(grant.grant.basis.digest).envelope,
        )
      else if (grant.grant.basis.digest !== state.basis.digest)
        throw new DeliveryJournalError('purpose-grant-basis')
    } else if (grant.grant.basis.digest !== state.basis.digest)
      throw new DeliveryJournalError('purpose-grant-basis')
    observePlanBases(basis.repositories)
    return { grant, basis }
  }
  private matches(state: DeliveryProjection, lease: Readonly<L>) {
    const identity = lease.assignment.identity,
      attempt = deliveryAttempts(state).records.find((item) => item.id === identity.attempt)
    return (
      state.basis.digest === identity.plan &&
      (state.basis.revision ?? 0) === identity.revision &&
      state.grant?.digest === lease.assignment.grantDigest &&
      attempt?.basis === identity.plan &&
      attempt.role === identity.role &&
      attempt.cell === identity.cell &&
      attempt.generation === identity.generation
    )
  }
  private event(assignment: WorkerAssignment): Omit<AttemptPayload, 'action'> {
    return {
      schema: 'wholeloop/delivery-attempt-event@1',
      id: assignment.identity.attempt,
      basis: assignment.identity.plan,
      role: assignment.identity.role,
      generation: assignment.identity.generation,
      ...(assignment.identity.cell !== undefined ? { cell: assignment.identity.cell } : {}),
    }
  }
  protected abstract path(attempt: string): string
  protected abstract validate(value: unknown): void
  private record(lease: Readonly<L>): L {
    this.validate(lease)
    validateWorkerAssignment(lease.assignment)
    const stored = JSON.parse(
      readSourceFile(
        this.journal.files.root,
        this.path(lease.assignment.identity.attempt),
        2 * 1024 * 1024,
      ),
    ) as L
    if (contractDigest(stored) !== contractDigest(lease))
      throw new DeliveryJournalError('purpose-binding')
    return structuredClone(stored)
  }
}
