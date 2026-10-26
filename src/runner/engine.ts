import { randomBytes } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import type { CheckpointStage } from '../delivery/checkpoint-events.js'
import type { DeliveryOutcome } from '../delivery/events.js'
import { safeSourceText } from '../delivery/input.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { boundedRecoveryCall } from '../delivery/read-retry.js'
import type { RunnerRuntime, RunnerStageRecord } from './events.js'
import { ForegroundOwner } from './foreground-owner.js'
import { ManagedRunnerProcess } from './native-process.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError, type RunnerStage, runnerDecisionRequirements } from './route.js'
import observationSchema from './schemas/stage-observation-v1.json' with { type: 'json' }
import type { RunnerLease, RunnerRequest, RunnerStore } from './store.js'

export interface RunnerStageContext {
  request: Readonly<RunnerRequest>
  plan: Readonly<DeliveryPlan>
  stage: Readonly<RunnerStage>
  invocation: string
  deadline: string
  signal: AbortSignal
  current(): boolean
  started(runtime: RunnerRuntime): void
}
export interface RunnerStageObservation {
  schema: 'wholeloop/delivery-runner-stage-observation@1'
  decisions?: string[]
  plan: string
  derivedPlan?: { revision: number; digest: string }
  request: string
  stage: string
  invocation: string
  status: 'passed' | 'failed' | 'blocked' | 'pending' | 'unknown' | 'stopped' | 'not-started'
  invocationState: 'stopped' | 'not-started' | 'unknown'
  evidence: string
  provenance: 'fixture' | 'host-observed'
  reason: string
}
export interface RunnerEndpointObservation {
  request: string
  plan: string
  source: string
  outcome: DeliveryOutcome
  current: boolean
  evidence: string
  provenance: 'fixture' | 'host-observed'
}
/** Hosts are fixed controller implementations. Neither workers nor a result-file option supply this interface. */
export interface DeliveryRunnerHost {
  identity: RunnerRequest['host']
  preflight(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    stages: readonly RunnerStage[],
    signal: AbortSignal,
  ): Promise<{
    available: boolean
    interactive: 'disabled' | 'permitted' | 'unverified'
    humanRequired: boolean
    reason: string
  }>
  execute(context: RunnerStageContext): Promise<RunnerStageObservation>
  inspect(
    request: Readonly<RunnerRequest>,
    stage: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ): Promise<RunnerStageObservation>
  stop?(
    request: Readonly<RunnerRequest>,
    stage: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ): Promise<void>
  endpoint(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    signal: AbortSignal,
  ): Promise<RunnerEndpointObservation>
}
const TERMINAL = new Set(['completed', 'failed', 'blocked', 'exhausted', 'stopped'])
/** A foreground controller issues one durable stage intent at a time; all actual effects remain in their domain hosts. */
export class DeliveryRunner {
  constructor(readonly store: RunnerStore) {}
  async run(
    digest: string,
    host: DeliveryRunnerHost,
    options: { controller?: string; signal?: AbortSignal; lease?: RunnerLease } = {},
  ) {
    const request = this.store.get(digest),
      initial = this.store.inspect(digest)
    if (
      options.lease &&
      (options.lease.request !== digest ||
        (options.controller !== undefined && options.controller !== options.lease.controller))
    )
      throw new DeliveryRunnerError('runner-lease-binding')
    if (contractDigest(host.identity) !== contractDigest(request.host))
      throw new DeliveryRunnerError('runner-host-binding')
    if (TERMINAL.has(initial.state)) return initial
    if (['paused', 'stopping', 'waiting-input', 'waiting-external'].includes(initial.state))
      return initial
    let context = this.store.basis(request)
    const controller = options.controller ?? `controller-${randomBytes(16).toString('hex')}`,
      lease = options.lease ?? this.store.claim(digest, controller),
      abort = new AbortController(),
      relay = () => abort.abort()
    if (!this.store.current(lease)) throw new DeliveryRunnerError('inactive-runner-lease')
    options.signal?.addEventListener('abort', relay, { once: true })
    if (options.signal?.aborted) relay()
    const watch = setInterval(() => {
      if (!this.store.current(lease, true, false)) abort.abort()
    }, request.pollMs)
    const drive = async () => {
      try {
        if (abort.signal.aborted)
          return this.limit(
            lease,
            context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
            'The original foreground request was already cancelled; no host was invoked.',
          )
        this.store.decisions.pin(request.grant)
        if (
          this.store.decisions.preflight({ ...request, revision: context.plan.revision }).status !==
          'ready'
        )
          return this.limit(
            lease,
            context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
            'The original decision policy cannot satisfy the selected route.',
          )
        const preflight = await boundedRecoveryCall(
          (signal) =>
            host.preflight(
              structuredClone(request),
              structuredClone(context.plan),
              this.store.inspect(digest).route,
              signal,
            ),
          Math.min(5000, this.remaining(request)),
        )
        if (
          !preflight.available ||
          !preflight.value.available ||
          preflight.value.humanRequired ||
          (context.plan.policy.intervention === 'none' &&
            preflight.value.interactive !== 'disabled')
        )
          return this.limit(
            lease,
            context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
            'Required runtime, noninteractive capability or non-delegable prerequisite is unavailable.',
          )
        const uncertain = this.store
          .record(digest)
          .stages.some((s) => ['prepared', 'running', 'pending', 'unknown'].includes(s.status))
        if (uncertain)
          return this.limit(
            lease,
            context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
            'Reconcile the original issued stage before any further dispatch.',
          )
        // A crash after the immutable result event can precede checkpoint publication
        // or plan adoption. Recover only those locators, never repeat the host call.
        try {
          for (const stage of this.store.inspect(digest).route) {
            const record = this.store.stage(digest, stage.id)
            if (record?.status !== 'passed') continue
            const value = this.store.observation(digest, record) as RunnerStageObservation
            validateDeliveryShape(value, observationSchema)
            if (
              value.request !== digest ||
              value.plan !== context.digest ||
              value.stage !== stage.id ||
              value.invocation !== record.invocation ||
              value.status !== 'passed' ||
              value.invocationState !== 'stopped' ||
              !this.decisions(lease, stage, value)
            )
              throw new DeliveryRunnerError('retained-stage-observation-binding')
            this.checkpoint(lease, stage, record.invocation, record.observation ?? '')
            if (stage.kind === 'definition') {
              if (!value.derivedPlan) throw new DeliveryRunnerError('missing-derived-plan')
              this.store.adopt(lease, value.derivedPlan)
              context = this.store.basis(request)
            }
          }
        } catch {
          return this.limit(
            lease,
            context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
            'A retained result cannot recover its current checkpoint or authorized derived plan.',
          )
        }
        while (this.store.current(lease) && !abort.signal.aborted) {
          const stage = this.store.permittedStages(digest)[0]
          if (!stage) break
          const timeoutMs = Math.min(context.plan.budgets.attemptMs, this.remaining(request))
          if (timeoutMs <= 0)
            return this.limit(lease, 'exhausted', 'The original run deadline has elapsed.')
          const basis = context.digest
          const invocation = contractDigest({
              request: digest,
              basis,
              stage: stage.id,
              generation: lease.generation,
            }),
            deadline = new Date(Date.parse(this.store.now()) + timeoutMs).toISOString()
          this.store.append(lease, { action: 'dispatched', stage: stage.id, invocation })
          const observed = await this.invoke(
            host,
            {
              request: structuredClone(request),
              plan: structuredClone(context.plan),
              stage: structuredClone(stage),
              invocation,
              deadline,
              signal: abort.signal,
              current: () => this.store.current(lease) && this.store.record(digest).basis === basis,
              started: (runtime) =>
                this.store.append(
                  lease,
                  {
                    action: 'started',
                    stage: stage.id,
                    invocation,
                    runtime,
                  },
                  basis,
                ),
            },
            timeoutMs,
          )
          const status = this.observe(lease, stage, invocation, basis, observed)
          if (status !== 'passed') {
            const state = this.store.lifecycle.journal.get(request.run)
            if (state.state === 'stopping' || state.state === 'paused')
              return this.store.inspect(digest)
            return this.limit(
              lease,
              status === 'failed'
                ? 'failed'
                : context.plan.policy.intervention === 'none'
                  ? 'blocked'
                  : 'paused',
              `The ${stage.kind} stage is ${status}; retain its original invocation and evidence.`,
            )
          }
          if (stage.kind === 'definition') {
            if (!observed?.derivedPlan)
              return this.limit(
                lease,
                context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
                'Definition supplied no authorized immutable derived plan.',
              )
            this.store.adopt(lease, observed.derivedPlan)
            context = this.store.basis(request)
          }
        }
        const state = this.store.lifecycle.journal.get(request.run)
        if (abort.signal.aborted || !this.store.current(lease)) {
          if (['queued', 'running'].includes(state.state))
            return this.limit(
              lease,
              context.plan.policy.intervention === 'none' ? 'stopped' : 'paused',
              'The foreground controller was interrupted; actual owned shutdown remains observable separately.',
            )
          return this.store.inspect(digest)
        }
        const stages = this.store.inspect(digest).route,
          record = this.store.record(digest),
          completed = new Map(
            record.stages
              .filter((stage) => stage.basis === context.digest)
              .map((stage) => [stage.id, stage]),
          )
        if (
          stages.some(
            (stage) =>
              completed.get(stage.id)?.status !== 'passed' ||
              completed.get(stage.id)?.provenance !== 'host-observed',
          )
        )
          return this.limit(
            lease,
            context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
            'The required route is incomplete; no endpoint is inferred.',
          )
        const endpoint = await boundedRecoveryCall(
          (signal) =>
            host.endpoint(structuredClone(request), structuredClone(context.plan), signal),
          Math.min(5000, this.remaining(request)),
        )
        if (!this.store.current(lease)) return this.store.inspect(digest)
        if (!endpoint.available || !this.endpoint(request, digest, endpoint.value))
          return this.limit(
            lease,
            context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
            'Current independently observed endpoint evidence is unavailable or fixture-only.',
          )
        if (
          !['running', 'waiting-external'].includes(
            this.store.lifecycle.journal.get(request.run).state,
          )
        )
          return this.limit(
            lease,
            context.plan.policy.intervention === 'none' ? 'blocked' : 'paused',
            'The endpoint lacks the required registered execution; metadata is not a completed feature.',
          )
        this.store.lifecycle.transition(request.run, {
          to: 'completed',
          reason: 'The fixed controller host observed the exact current requested endpoint.',
          outcome: endpoint.value.outcome,
          evidence: endpoint.value.evidence,
        })
        return this.store.inspect(digest)
      } finally {
        clearInterval(watch)
        options.signal?.removeEventListener('abort', relay)
        abort.abort()
        const record = this.store.record(digest)
        if (
          record.ownership === 'active' &&
          record.controller === lease.controller &&
          record.generation === lease.generation
        )
          this.store.release(
            lease,
            'The foreground controller stopped issuing work; native/effect observations remain independent.',
          )
      }
    }
    await drive()
    return this.store.inspect(digest)
  }

  async reconcile(digest: string, host: DeliveryRunnerHost, options: { cancel?: boolean } = {}) {
    const request = this.store.get(digest),
      record = this.store.record(digest),
      problems: string[] = []
    if (contractDigest(host.identity) !== contractDigest(request.host))
      throw new DeliveryRunnerError('runner-host-binding')
    if (!record.controller || !record.generation)
      return { ...this.store.inspect(digest), recoveryProblems: [] }
    const lease: RunnerLease = {
      request: digest,
      controller: record.controller,
      generation: record.generation,
    }
    const foreground = new ForegroundOwner(this.store, lease)
    let preparedForeground = false
    try {
      preparedForeground = foreground.read() !== undefined
    } catch {
      problems.push('foreground-registration-unavailable')
    }
    if ((record.owner || preparedForeground) && ['active', 'unknown'].includes(record.ownership)) {
      const owner = record.owner
        ? new ManagedRunnerProcess(this.store.files, record.owner.invocation)
        : foreground.manager
      if (options.cancel) {
        try {
          if (preparedForeground) foreground.requestCancellation()
          else owner.requestCancellation()
        } catch {
          problems.push('foreground-cancellation-unavailable')
        }
      }
      const observation = preparedForeground ? foreground.observe() : owner.observe()
      if (
        observation.invocationState === 'stopped' ||
        observation.invocationState === 'not-started'
      )
        this.store.append(lease, {
          action: 'recovered',
          status: 'stopped',
          evidence: observation.evidence,
          provenance: 'host-observed',
          reason: 'The exact registered foreground controller group is positively absent.',
        })
      else problems.push('original-controller-not-confirmed-stopped')
    } else if (['active', 'unknown'].includes(record.ownership))
      problems.push('controller-ownership-unobserved')
    for (const stage of record.stages.filter((s) =>
      ['prepared', 'running', 'pending', 'unknown'].includes(s.status),
    )) {
      const scope = new RunnerNativeScope(this.store.files, stage.invocation)
      if (options.cancel) {
        try {
          scope.requestCancellation()
        } catch {
          problems.push('native-cancellation-unavailable')
        }
        if (host.stop)
          await boundedRecoveryCall(
            (signal) =>
              host.stop?.(structuredClone(request), structuredClone(stage), signal) ??
              Promise.resolve(),
            5000,
          )
      }
      const observed = await boundedRecoveryCall(
        (signal) => host.inspect(structuredClone(request), structuredClone(stage), signal),
        5000,
      )
      if (!observed.available) {
        problems.push('stage-observation-unavailable')
        continue
      }
      const routeStage = this.store.inspect(digest).route.find((s) => s.id === stage.id)
      if (!routeStage || observed.value.plan !== stage.basis) {
        problems.push('stage-observation-basis')
        continue
      }
      try {
        this.observe(lease, routeStage, stage.invocation, stage.basis, observed.value)
      } catch {
        problems.push('stage-observation-conflict')
      }
    }
    const status = this.store.inspect(digest),
      state = this.store.lifecycle.journal.get(request.run)
    if (
      options.cancel &&
      state.state === 'stopping' &&
      !problems.length &&
      status.ownership === 'released' &&
      !status.problems.includes('unresolved-stage-invocation')
    ) {
      try {
        this.store.lifecycle.transition(request.run, {
          to: 'stopped',
          outcome: 'stopped',
          reason:
            'Exact owned controller/stage closure and existing domain reservations are confirmed.',
        })
      } catch {
        problems.push('owned-domain-work-or-effects-remain-unresolved')
      }
    }
    return { ...this.store.inspect(digest), recoveryProblems: [...new Set(problems)] }
  }

  private remaining(request: RunnerRequest): number {
    const budget = this.store.budgets.inspect(request.run),
      grant = this.store.lifecycle.authority.inspect(request.grant)
    if (budget.problem || grant.status !== 'active') return 0
    return Math.max(
      0,
      Math.min(
        budget.remainingMs ?? 0,
        Date.parse(grant.grant.expiresAt) - Date.parse(this.store.now()),
      ),
    )
  }
  private async invoke(
    host: DeliveryRunnerHost,
    context: RunnerStageContext,
    timeoutMs: number,
  ): Promise<RunnerStageObservation | undefined> {
    const abort = new AbortController(),
      relay = () => abort.abort()
    context.signal.addEventListener('abort', relay, { once: true })
    if (context.signal.aborted) relay()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      if (abort.signal.aborted || !context.current()) return undefined
      const stopped = new Promise<undefined>((resolve) => {
        const finish = () => resolve(undefined)
        abort.signal.addEventListener('abort', finish, { once: true })
        timer = setTimeout(() => {
          abort.abort()
          resolve(undefined)
        }, timeoutMs)
      })
      const scope = new RunnerNativeScope(this.store.files, context.invocation)
      const result = Promise.resolve()
        .then(() =>
          abort.signal.aborted || !context.current()
            ? undefined
            : scope.run(
                () => !abort.signal.aborted && context.current(),
                () => host.execute({ ...context, signal: abort.signal }),
              ),
        )
        .then(
          (value) => structuredClone(value),
          () => undefined,
        )
      return await Promise.race([result, stopped])
    } finally {
      if (timer) clearTimeout(timer)
      context.signal.removeEventListener('abort', relay)
      abort.abort()
    }
  }
  private observe(
    lease: RunnerLease,
    stage: RunnerStage,
    invocation: string,
    basis: string,
    value?: RunnerStageObservation,
  ) {
    let valid = false
    if (value) {
      try {
        validateDeliveryShape(value, observationSchema)
        valid =
          value.request === lease.request &&
          value.stage === stage.id &&
          value.invocation === invocation &&
          value.plan === basis
      } catch {
        /* An invalid host envelope never supplies process completion. */
      }
    }
    const started = this.store.stage(lease.request, stage.id, basis)?.runtime !== undefined
    let status =
      valid &&
      value &&
      (value.status !== 'passed' || started) &&
      (value.invocationState === 'stopped' ||
        (['blocked', 'failed', 'not-started'].includes(value.status) &&
          value.invocationState === 'not-started'))
        ? value.status
        : 'unknown'
    if (status === 'passed' && value) {
      try {
        if (!this.decisions(lease, stage, value)) status = 'blocked'
      } catch {
        status = 'stopped'
      }
    }
    let artifact: string | undefined
    let observation: string | undefined
    if (valid && value) {
      try {
        const captured = this.store.budgets.captureArtifact(
          this.store.get(lease.request).run,
          Buffer.from(JSON.stringify(value)),
        )
        if (captured.stored) {
          artifact = captured.artifact.ref
          observation = captured.artifact.digest
        } else if (status === 'passed') status = 'blocked'
      } catch {
        if (status === 'passed') status = 'blocked'
      }
    }
    this.store.append(
      lease,
      {
        action: 'observed',
        ...(observation ? { observation } : {}),
        stage: stage.id,
        invocation,
        status,
        evidence:
          valid && value
            ? value.evidence
            : contractDigest({ invocation, status: 'unavailable-original-observation' }),
        provenance: valid && value ? value.provenance : 'fixture',
        reason:
          valid && value
            ? value.reason
            : 'The original host did not establish a complete exact invocation observation.',
      },
      basis,
    )
    if (status === 'passed' && artifact && observation)
      this.checkpoint(lease, stage, invocation, observation)
    return status
  }
  private checkpoint(
    lease: RunnerLease,
    stage: RunnerStage,
    invocation: string,
    observation: string,
  ) {
    const request = this.store.get(lease.request)
    const checkpoints: Partial<Record<RunnerStage['kind'], CheckpointStage>> = {
      plan: 'plan-accepted',
      workspace: 'environment-ready',
      'build-plan': 'builder-plan',
      commit: 'implementation-committed',
      verification: 'gate-sealed',
      review: 'gate-sealed',
      integration: 'integrated-candidate',
      publication: 'publication-observed',
    }
    const checkpoint = checkpoints[stage.kind]
    if (checkpoint)
      this.store.recovery.checkpoints.capture(request.run, {
        schema: 'wholeloop/delivery-checkpoint-request@1',
        key: `runner-${invocation}`,
        stage: checkpoint,
        inputs: [
          `delivery/artifacts/${request.run}/${observation}`,
          `delivery/plans/${request.run}/${this.store.basis(request).plan.revision}.json`,
        ],
      })
  }
  private decisions(
    lease: RunnerLease,
    stage: RunnerStage,
    value: RunnerStageObservation,
  ): boolean {
    const request = this.store.get(lease.request),
      context = this.store.basis(request)
    const required = runnerDecisionRequirements(
      context.plan,
      stage,
      context.authority.grant.basis.kind,
    )
    return required.every((requiredDecision) =>
      (value.decisions ?? []).some((digest) => {
        try {
          const receipt = this.store.decisions.inspect(digest),
            decision = receipt.record
          return (
            receipt.status === 'current' &&
            decision.request.plan === context.digest &&
            decision.request.decision === requiredDecision.id &&
            decision.grantDigest === context.authority.digest &&
            decision.judgment.outcome === requiredDecision.outcome
          )
        } catch {
          return false
        }
      }),
    )
  }
  private endpoint(
    request: RunnerRequest,
    digest: string,
    value: RunnerEndpointObservation,
  ): boolean {
    const plan = this.store.basis(request).plan
    const outcomes: Record<DeliveryPlan['policy']['endpoint'], DeliveryOutcome[]> = {
      'research-report': ['research-report-complete', 'completed-with-unknowns'],
      'local-handoff': ['code-ready'],
      'to-pr': ['draft-pr', 'ready-pr'],
      'to-merge': ['merged'],
    }
    return (
      value.request === digest &&
      value.plan === contractDigest(plan) &&
      value.source === plan.source &&
      value.current &&
      value.provenance === 'host-observed' &&
      /^[a-f0-9]{64}$/.test(value.evidence) &&
      outcomes[plan.policy.endpoint].includes(value.outcome)
    )
  }
  private limit(
    lease: RunnerLease,
    to: 'blocked' | 'failed' | 'paused' | 'exhausted' | 'stopped',
    reason: string,
  ) {
    const request = this.store.get(lease.request),
      state = this.store.lifecycle.journal.get(request.run)
    safeSourceText(reason, 4096)
    if (state.state !== to && !TERMINAL.has(state.state)) {
      // Stopped is only observable after draining; an abort cannot assert it on its own.
      const target = to === 'stopped' ? 'blocked' : to
      this.store.lifecycle.transition(request.run, {
        to: target,
        reason,
        ...(target === 'paused' ? {} : { outcome: target }),
      })
    }
    return this.store.inspect(lease.request)
  }
}
