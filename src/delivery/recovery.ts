// Recovers delivery state from a separate process without reconstructing authority.
import { contractDigest } from '../contracts/compatibility.js'
import type { BudgetClock } from './budget-events.js'
import { DeliveryBudgets } from './budgets.js'
import { DeliveryCheckpoints } from './checkpoints.js'
import { DeliveryEffects } from './effects.js'
import type { AttemptPayload } from './events.js'
import { observePlanBases, validateDeliveryShape } from './plan.js'
import { DeliveryQueue, type QueueAssignment } from './queue.js'
import { boundedRecoveryCall } from './read-retry.js'
import { deliveryRecovery, type RecoveryPayload } from './recovery-events.js'
import { deliveryAttempts } from './reducer.js'
import recoverySchema from './schemas/recovery-event-v1.json' with { type: 'json' }

export interface RecoveryWorkerObservation {
  assignment: string
  status: RecoveryPayload['status']
  runtime?: NonNullable<AttemptPayload['runtime']>
  owned: boolean
  evidence: string
  provenance: 'fixture' | 'host-observed'
}
export interface RecoveryWorkerHost {
  inspect(
    assignment: Readonly<QueueAssignment>,
    runtime: AttemptPayload['runtime'],
    signal: AbortSignal,
  ): Promise<RecoveryWorkerObservation>
  stop(
    assignment: Readonly<QueueAssignment>,
    runtime: NonNullable<AttemptPayload['runtime']>,
    signal: AbortSignal,
  ): Promise<void>
}
const ACTOR = { kind: 'controller', name: 'wholeloop' } as const
export class DeliveryRecovery {
  readonly queue: DeliveryQueue
  readonly checkpoints: DeliveryCheckpoints
  readonly effects: DeliveryEffects
  readonly budgets: DeliveryBudgets
  constructor(store?: string, now?: () => string, clock?: () => BudgetClock) {
    this.queue = new DeliveryQueue(store, now, undefined, clock)
    this.budgets = new DeliveryBudgets(this.queue.lifecycle.journal.files.root, now, clock)
    this.checkpoints = new DeliveryCheckpoints(this.queue.lifecycle.journal.files.root, now)
    this.effects = new DeliveryEffects(this.queue.lifecycle.journal.files.root, now, clock)
  }

  async recover(
    run: string,
    options: {
      host?: RecoveryWorkerHost
      cancel?: boolean
      retry?: boolean
      resume?: boolean
      hostTimeoutMs?: number
    } = {},
  ) {
    const timeout = options.hostTimeoutMs ?? 5000
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60000)
      throw new Error('Invalid bounded recovery host timeout')
    const problems = new Set<string>()
    const initial = this.queue.lifecycle.journal.view(run)
    if (this.queue.lifecycle.journal.now() < initial.maxObservedAt) problems.add('clock-regression')
    try {
      if (
        this.checkpoints
          .inspect(run)
          .some(
            (checkpoint) =>
              checkpoint.manifest.basis === initial.basis.digest && checkpoint.status !== 'current',
          )
      )
        problems.add('stale-checkpoint-inputs')
    } catch {
      problems.add('invalid-checkpoint-manifest')
    }
    const entries = this.queue
      .inspect(run)
      .filter(
        (entry) =>
          entry.basis === initial.basis.digest &&
          entry.attempt &&
          ['claimed', 'cancelled'].includes(entry.status),
      )
    for (const entry of entries) {
      if (!entry.attempt) continue
      const assignment = this.queue.assigned(run, entry.attempt)
      let attempt = deliveryAttempts(this.queue.lifecycle.journal.view(run)).records.find(
        (record) => record.id === entry.attempt,
      )
      if (!attempt) {
        problems.add('missing-attempt')
        continue
      }
      if (['claimed', 'started', 'stopping'].includes(attempt.state)) {
        let observed = await this.inspect(assignment, attempt.runtime, options.host, timeout)
        this.record(run, assignment, attempt.runtime, observed)
        if (observed.status === 'running' && options.cancel && attempt.runtime && options.host) {
          try {
            const runtime = attempt.runtime
            await boundedRecoveryCall(
              (signal) =>
                options.host?.stop(structuredClone(assignment), structuredClone(runtime), signal) ??
                Promise.resolve(),
              timeout,
            )
          } catch {
            /* Only the subsequent exact observation can confirm termination. */
          }
          observed = await this.inspect(assignment, attempt.runtime, options.host, timeout)
          this.record(run, assignment, attempt.runtime, observed)
        }
        if (!['stopped', 'not-started'].includes(observed.status)) {
          problems.add(
            observed.status === 'running' ? 'owned-worker-running' : 'unknown-worker-identity',
          )
          continue
        }
        this.queue.finish(assignment, 'stopped', observed.evidence)
        attempt = deliveryAttempts(this.queue.lifecycle.journal.view(run)).records.find(
          (record) => record.id === entry.attempt,
        )
      }
      if (attempt && ['failed', 'stopped'].includes(attempt.state)) this.queue.fence(assignment)
      if (options.retry) {
        try {
          this.queue.requeue(
            assignment,
            contractDigest({ assignment, recovery: 'terminal-and-fenced' }),
          )
        } catch {
          problems.add('retry-ineligible')
        }
      }
    }
    try {
      const budget = this.budgets.enforce(run)
      if (budget.problem) problems.add(`budget-${budget.problem}`)
    } catch {
      problems.add('unavailable-budget-state')
    }
    const state = this.queue.lifecycle.journal.view(run)
    const known = new Set(
      this.queue.inspect(run).flatMap((record) => (record.attempt ? [record.attempt] : [])),
    )
    if (
      deliveryAttempts(state).records.some(
        (attempt) =>
          ['claimed', 'started', 'stopping'].includes(attempt.state) && !known.has(attempt.id),
      )
    )
      problems.add('unknown-reservation')
    if (this.effects.inspect(run).some((effect) => ['pending', 'unknown'].includes(effect.status)))
      problems.add('unreconciled-effects')
    try {
      const observed = state.grant
        ? this.queue.lifecycle.authority.inspect(state.grant.id)
        : undefined
      if (observed?.status !== 'active' || observed.digest !== state.grant?.digest)
        problems.add('inactive-authority')
      if (state.basis.kind === 'plan' && state.basis.revision) {
        const prepared = this.queue.lifecycle.authority.planning.getPlan(run, state.basis.revision)
        if (prepared.digest !== state.basis.digest) problems.add('changed-plan')
        observePlanBases(prepared.plan.repositories)
      }
    } catch {
      problems.add('unavailable-current-basis')
    }
    if (['completed', 'failed', 'blocked', 'exhausted', 'stopping'].includes(state.state))
      problems.add(`terminal-or-draining-${state.state}`)
    if (
      problems.size &&
      ['planned', 'queued', 'running', 'waiting-input', 'waiting-external', 'paused'].includes(
        state.state,
      )
    ) {
      const target = state.policy.intervention === 'none' ? 'blocked' : 'paused'
      if (state.state !== target)
        this.queue.lifecycle.transition(run, {
          to: target,
          reason:
            'Recovery retained unresolved ownership, inputs or effects; no replacement worker started.',
          ...(target === 'blocked' ? { outcome: 'blocked' as const } : {}),
        })
    } else if (
      !problems.size &&
      options.resume &&
      ['planned', 'paused', 'stopped', 'waiting-input', 'waiting-external'].includes(state.state)
    ) {
      this.queue.lifecycle.transition(run, {
        to: 'queued',
        reason: 'Recovery verified current inputs, authority and terminal attempt ownership.',
      })
    }
    return {
      run,
      ready: problems.size === 0,
      problems: [...problems].sort(),
      state: this.queue.lifecycle.journal.view(run),
      workers: 'not-started' as const,
      effects: 'not-invoked' as const,
    }
  }

  private async inspect(
    assignment: QueueAssignment,
    runtime: AttemptPayload['runtime'],
    host?: RecoveryWorkerHost,
    timeout = 5000,
  ): Promise<RecoveryWorkerObservation> {
    const unknown = (): RecoveryWorkerObservation => ({
      assignment: contractDigest(assignment),
      status: 'unknown',
      ...(runtime ? { runtime } : {}),
      owned: false,
      evidence: contractDigest({ assignment, observation: 'unavailable-or-mismatched' }),
      provenance: 'fixture',
    })
    if (!host) return unknown()
    try {
      const result = await boundedRecoveryCall(
        (signal) =>
          host.inspect(
            structuredClone(assignment),
            runtime ? structuredClone(runtime) : undefined,
            signal,
          ),
        timeout,
      )
      if (!result.available) return unknown()
      const observed = result.value
      if (
        observed.assignment !== contractDigest(assignment) ||
        !observed.owned ||
        contractDigest(observed.runtime ?? null) !== contractDigest(runtime ?? null) ||
        !['fixture', 'host-observed'].includes(observed.provenance) ||
        (observed.status === 'running' && runtime === undefined) ||
        (observed.status === 'not-started' && runtime !== undefined)
      )
        return unknown()
      const { provenance, ...rest } = observed
      validateDeliveryShape(
        {
          ...rest,
          provenance,
          schema: 'wholeloop/delivery-recovery-event@1',
          basis: assignment.plan,
          attempt: assignment.attempt,
          generation: assignment.generation,
          reason: 'observed',
        },
        recoverySchema,
      )
      return observed
    } catch {
      return unknown()
    }
  }
  private record(
    run: string,
    assignment: QueueAssignment,
    runtime: AttemptPayload['runtime'],
    observed: RecoveryWorkerObservation,
  ): void {
    this.queue.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = view().get(run)
      if (!state) return
      const payload: RecoveryPayload = {
        ...observed,
        schema: 'wholeloop/delivery-recovery-event@1',
        basis: assignment.plan,
        assignment: contractDigest(assignment),
        attempt: assignment.attempt,
        generation: assignment.generation,
        ...(runtime ? { runtime } : {}),
        provenance: observed.status === 'unknown' ? 'controller-observed' : observed.provenance,
        reason: observed.status === 'unknown' ? 'unavailable-host' : 'observed',
      }
      const prior = deliveryRecovery(state)
        .records.filter((record) => record.attempt === assignment.attempt)
        .at(-1)
      if (prior) {
        const { sequence: _sequence, ...binding } = prior
        const { schema: _schema, ...current } = payload
        if (contractDigest(binding) === contractDigest(current)) return
      }
      append(run, payload)
    })
  }
}
