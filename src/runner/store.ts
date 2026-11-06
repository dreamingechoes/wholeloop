import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { DelegatedDecisions } from '../decisions/store.js'
import { type BudgetClock, findBudget } from '../delivery/budget-events.js'
import { DeliveryBudgets } from '../delivery/budgets.js'
import { readSourceBytes, readSourceFile } from '../delivery/input.js'
import { checkPlanEnvelope, observePlanBases, validateDeliveryShape } from '../delivery/plan.js'
import { DeliveryRecovery } from '../delivery/recovery.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import {
  deliveryRunner,
  type RunnerPayload,
  type RunnerRecord,
  type RunnerStageRecord,
} from './events.js'
import { DeliveryRunnerError, type RunnerStage, runnerRoute } from './route.js'
import requestSchema from './schemas/request-v1.json' with { type: 'json' }

export const RUNNER_REQUEST_SCHEMA = requestSchema
export interface RunnerRequest {
  schema: 'wholeloop/delivery-runner-request@1'
  key: string
  run: string
  revision: number
  plan: string
  grant: string
  host: { id: string; version: string; configuration: string }
  pollMs: number
}
export interface RunnerLease {
  request: string
  controller: string
  generation: number
}
const ACTOR = { kind: 'controller', name: 'wholeloop' } as const
/** The authoritative journal owns claims; immutable sidecars hold only bounded exact request bytes. */
export class RunnerStore {
  readonly budgets: DeliveryBudgets
  readonly decisions: DelegatedDecisions
  readonly recovery: DeliveryRecovery
  constructor(store?: string, now?: () => string, clock?: () => BudgetClock) {
    this.budgets = new DeliveryBudgets(store, now, clock)
    this.decisions = new DelegatedDecisions(this.files.root, now)
    this.recovery = new DeliveryRecovery(this.files.root, now, clock)
  }
  get lifecycle() {
    return this.budgets.lifecycle
  }
  get files() {
    return this.lifecycle.journal.files
  }
  get planning() {
    return this.lifecycle.authority.planning
  }
  get now() {
    return this.lifecycle.journal.now
  }

  prepare(value: unknown) {
    validateDeliveryShape(value, requestSchema)
    const request = structuredClone(value) as RunnerRequest,
      digest = contractDigest(request)
    const context = this.basis(request)
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = view().get(request.run)
      if (
        !state ||
        state.basis.digest !== request.plan ||
        state.grant?.digest !== context.authority.digest
      )
        throw new DeliveryRunnerError('untracked-or-changed-basis')
      const old = deliveryRunner(state).records.find((r) => r.request === digest)
      if (old) {
        this.get(digest)
        return
      }
      if (!['planned', 'queued'].includes(state.state))
        throw new DeliveryRunnerError('prepare-state')
      const key = `delivery/runner-keys/${request.run}/${request.key}.json`,
        prior = this.files.read(key)
      if (prior && prior !== `${digest}\n`) throw new DeliveryRunnerError('runner-key-conflict')
      const body = `${JSON.stringify(request)}\n`,
        path = this.path(digest)
      // The shared reducer already binds grants to runs. A second sidecar would create
      // a competing authority and an unnecessary crash window during preparation.
      if (existsSync(this.files.path(path))) this.get(digest)
      else this.files.atomic(path, body)
      this.files.atomic(key, `${digest}\n`)
      append(request.run, {
        schema: 'wholeloop/delivery-runner-event@1',
        action: 'prepared',
        basis: request.plan,
        request: digest,
      })
    })
    return this.inspect(digest)
  }

  get(digest: string): RunnerRequest {
    const value = JSON.parse(readSourceFile(this.files.root, this.path(digest)))
    validateDeliveryShape(value, requestSchema)
    if (contractDigest(value) !== digest) throw new DeliveryRunnerError('damaged-runner-request')
    return value as RunnerRequest
  }
  basis(request: RunnerRequest) {
    const original = this.planning.getPlan(request.run, request.revision),
      authority = this.lifecycle.authority.inspect(request.grant)
    if (original.digest !== request.plan || authority.status !== 'active')
      throw new DeliveryRunnerError('inactive-runner-basis')
    const state = this.lifecycle.journal.views().find((s) => s.run === request.run),
      record = state
        ? deliveryRunner(state).records.find((r) => r.request === contractDigest(request))
        : undefined
    if (record && state?.basis.digest !== record.basis)
      throw new DeliveryRunnerError('changed-current-plan')
    const prepared =
      record && record.basis !== original.digest && state?.basis.revision
        ? this.planning.getPlan(request.run, state.basis.revision)
        : original
    const plan = prepared.plan,
      grant = authority.grant
    if (
      grant.basis.kind === 'plan'
        ? grant.basis.digest !== prepared.digest
        : plan.envelope !== grant.basis.digest
    )
      throw new DeliveryRunnerError('runner-grant-plan')
    if (contractDigest(plan.policy) !== contractDigest(grant.policy))
      throw new DeliveryRunnerError('runner-policy-binding')
    if (grant.basis.kind === 'envelope')
      checkPlanEnvelope(plan, this.planning.getEnvelope(grant.basis.digest).envelope)
    observePlanBases(plan.repositories)
    return { plan, authority, digest: prepared.digest }
  }
  adopt(lease: RunnerLease, proposal: { revision: number; digest: string }) {
    const request = this.get(lease.request),
      current = this.basis(request)
    if (!this.current(lease) || current.authority.grant.basis.kind !== 'envelope')
      throw new DeliveryRunnerError('derived-plan-not-authorized')
    if (
      this.record(lease.request).stages.some((stage) =>
        ['prepared', 'running', 'pending', 'unknown'].includes(stage.status),
      )
    )
      throw new DeliveryRunnerError('derived-plan-unresolved-stage')
    const next = this.planning.getPlan(request.run, proposal.revision)
    if (
      next.digest !== proposal.digest ||
      next.plan.previous !== current.digest ||
      proposal.revision !== current.plan.revision + 1
    )
      throw new DeliveryRunnerError('derived-plan-predecessor')
    checkPlanEnvelope(
      next.plan,
      this.planning.getEnvelope(current.authority.grant.basis.digest).envelope,
    )
    this.lifecycle.track(
      { run: request.run, revision: proposal.revision, grant: request.grant },
      (state, append) => {
        append({
          schema: 'wholeloop/delivery-runner-event@1',
          action: 'continued',
          basis: next.digest,
          previous: current.digest,
          ...lease,
        })
        append({
          schema: 'wholeloop/delivery-control-event@1',
          from: state.state,
          to: 'queued',
          basis: next.digest,
          reason:
            'Continue within the original envelope; derived plan acceptance remains independently required.',
        })
      },
    )
    return this.inspect(lease.request)
  }

  claim(
    digest: string,
    controller: string,
    beforeCommit?: (lease: RunnerLease) => void,
  ): RunnerLease {
    const request = this.get(digest)
    const context = this.basis(request)
    this.budgets.start(request.run)
    if (this.budgets.tick(request.run).problem)
      throw new DeliveryRunnerError('runner-budget-unavailable')
    let generation = 0
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = view().get(request.run)
      if (!state || state.basis.digest !== context.digest)
        throw new DeliveryRunnerError('changed-runner-basis')
      const record = deliveryRunner(state).records.find((r) => r.request === digest)
      if (!record) throw new DeliveryRunnerError('unprepared-runner')
      this.basis(request)
      generation = record.generation + 1
      append(request.run, {
        schema: 'wholeloop/delivery-runner-event@1',
        action: 'claimed',
        basis: context.digest,
        request: digest,
        controller,
        generation,
      })
      if (state.state === 'planned')
        append(request.run, {
          schema: 'wholeloop/delivery-control-event@1',
          from: 'planned',
          to: 'queued',
          basis: context.digest,
          reason: 'A foreground controller claimed the original authorized route.',
        })
      // Trusted owner metadata commits before the claim becomes visible. An orphan
      // sidecar grants nothing; a published owned claim must have its original parent.
      beforeCommit?.({ request: digest, controller, generation })
    })
    return { request: digest, controller, generation }
  }

  record(digest: string): RunnerRecord {
    const request = this.get(digest),
      state = this.lifecycle.journal.view(request.run)
    const record = deliveryRunner(state).records.find((r) => r.request === digest)
    if (!record) throw new DeliveryRunnerError('unprepared-runner')
    return record
  }
  private currentState(
    lease: RunnerLease,
    dispatch: boolean,
    observeBases: boolean,
    drainingInvocation?: string,
  ) {
    const request = this.get(lease.request),
      context = observeBases ? this.basis(request) : undefined,
      { state, authority, report } = this.budgets.observation(request.run),
      record = deliveryRunner(state).records.find((r) => r.request === lease.request)
    if (
      !authority ||
      !record ||
      authority.grant.id !== request.grant ||
      authority.status !== 'active' ||
      state.basis.digest !== (context?.digest ?? record.basis) ||
      state.grant?.digest !== authority.digest ||
      record.controller !== lease.controller ||
      record.generation !== lease.generation ||
      (record.ownership !== 'active' &&
        (dispatch ||
          drainingInvocation === undefined ||
          record.ownership !== 'released' ||
          record.owner?.invocation !== drainingInvocation)) ||
      (dispatch && !['queued', 'running'].includes(state.state)) ||
      report.problem
    )
      return undefined
    return state
  }
  current(lease: RunnerLease, dispatch = true, observeBases = true): boolean {
    try {
      return !!this.currentState(lease, dispatch, observeBases)
    } catch {
      return false
    }
  }
  /** Liveness only for the original controller's final pipe drain, never stage admission.
   * Active and exact released ownership share one fresh policy read across the handoff. */
  currentForDrain(lease: RunnerLease, invocation: string): boolean {
    try {
      return !!this.currentState(lease, false, false, invocation)
    } catch {
      return false
    }
  }
  /** An already issued domain effect waits for observation; it does not admit another stage. */
  live(lease: RunnerLease, observeBases = true, expectedBasis?: string): boolean {
    try {
      const state = this.currentState(lease, false, observeBases)
      return (
        !!state &&
        (expectedBasis === undefined || state.basis.digest === expectedBasis) &&
        ['queued', 'running', 'waiting-external'].includes(state.state)
      )
    } catch {
      return false
    }
  }

  append(
    lease: RunnerLease,
    value: Omit<RunnerPayload, 'schema' | 'basis' | 'request' | 'controller' | 'generation'>,
    basis = this.record(lease.request).basis,
    metadata: { rationale?: string } = {},
  ) {
    const request = this.get(lease.request)
    this.lifecycle.journal.transaction(ACTOR, (view, append) => {
      const state = view().get(request.run)
      if (!state) throw new DeliveryRunnerError('unknown-runner')
      if (
        (value.action === 'dispatched' && !this.current(lease)) ||
        (value.action === 'started' && !this.live(lease))
      )
        throw new DeliveryRunnerError('inactive-runner-lease')
      append(
        request.run,
        {
          ...value,
          schema: 'wholeloop/delivery-runner-event@1',
          basis,
          ...lease,
        },
        metadata,
      )
    })
  }
  release(lease: RunnerLease, reason: string) {
    this.append(lease, { action: 'released', reason })
  }

  inspect(digest: string) {
    const request = this.get(digest),
      state = this.lifecycle.journal.view(request.run),
      record = this.record(digest),
      problems: string[] = []
    if (state.basis.digest !== record.basis) problems.push('changed-current-plan')
    let route: RunnerStage[] = []
    try {
      const context = this.basis(request)
      route = runnerRoute(context.plan)
    } catch {
      problems.push('unavailable-or-changed-basis')
    }
    for (const stage of record.stages)
      if (['prepared', 'running', 'pending', 'unknown'].includes(stage.status))
        problems.push('unresolved-stage-invocation')
    if (record.ownership === 'unknown') problems.push('unknown-controller-ownership')
    return {
      schema: 'wholeloop/delivery-runner-status@1',
      digest,
      request,
      state: state.state,
      outcome: state.outcome ?? null,
      ownership: record.ownership,
      controller: record.controller ?? null,
      generation: record.generation,
      stages: record.stages,
      route,
      problems: [...new Set(problems)],
      authority: 'original-private-grant-only',
      publication: 'not-implied',
      nativeAcceptance: 'not-established-by-inspection',
    }
  }

  stage(digest: string, id: string, basis?: string): RunnerStageRecord | undefined {
    const record = this.record(digest)
    return record.stages.findLast((s) => s.id === id && s.basis === (basis ?? record.basis))
  }
  observation(digest: string, stage: RunnerStageRecord): unknown {
    const request = this.get(digest),
      state = this.lifecycle.journal.view(request.run),
      artifact = findBudget(state)?.artifacts.find(
        (entry) => entry.digest === stage.observation && entry.status === 'observed',
      )
    if (!artifact) throw new DeliveryRunnerError('missing-runner-observation')
    const bytes = readSourceBytes(this.files.root, artifact.ref, 8 * 1024 * 1024)
    if (
      bytes.length !== artifact.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== artifact.digest
    )
      throw new DeliveryRunnerError('changed-runner-observation')
    return JSON.parse(bytes.toString('utf8'))
  }
  permittedStages(digest: string): RunnerStage[] {
    const request = this.get(digest),
      plan = this.basis(request).plan,
      record = this.record(digest)
    const stages = new Map(
      record.stages
        .filter((stage) => stage.basis === record.basis)
        .map((stage) => [stage.id, stage]),
    )
    return runnerRoute(plan).filter((stage) => {
      const prior = stages.get(stage.id)
      // Positive closure permits a fresh attempt only after a new owner generation.
      // Passed stages remain immutable and unknown invocations are never replayed.
      return (
        (!prior ||
          (['stopped', 'not-started', 'failed'].includes(prior.status) &&
            prior.generation < record.generation)) &&
        stage.after.every((id) => stages.get(id)?.status === 'passed')
      )
    })
  }
  control(digest: string, operation: 'pause' | 'stop' | 'resume', operator: string) {
    const request = this.get(digest),
      state = this.lifecycle.journal.view(request.run)
    if (!operator.trim()) throw new DeliveryRunnerError('missing-control-operator')
    if (operation === 'resume') {
      this.basis(request)
      if (!['paused', 'stopped', 'waiting-input'].includes(state.state))
        throw new DeliveryRunnerError('resume-state')
      const record = this.record(digest)
      if (
        ['active', 'unknown'].includes(record.ownership) ||
        record.stages.some((s) =>
          ['prepared', 'running', 'pending', 'unknown'].includes(s.status),
        ) ||
        deliveryAttempts(state).records.some((a) =>
          ['claimed', 'started', 'stopping'].includes(a.state),
        )
      )
        throw new DeliveryRunnerError('unresolved-runner-ownership')
      if (
        this.recovery.checkpoints
          .inspect(request.run)
          .some((c) => c.manifest.basis === this.record(digest).basis && c.status !== 'current')
      )
        throw new DeliveryRunnerError('stale-runner-checkpoint')
      this.lifecycle.transition(
        request.run,
        {
          to: 'queued',
          reason: 'The operator resumed the same verified run without renewing its budget.',
        },
        { kind: 'operator', name: operator },
      )
    } else if (operation === 'pause') {
      if (state.state !== 'paused')
        this.lifecycle.transition(
          request.run,
          {
            to: 'paused',
            reason:
              'The operator paused new dispatch; current owned work remains subject to its original deadline.',
          },
          { kind: 'operator', name: operator },
        )
    } else if (!['stopping', 'stopped'].includes(state.state)) {
      this.lifecycle.transition(
        request.run,
        {
          to: 'stopping',
          reason:
            'The operator requested cancellation of owned work; preserve uncertain invocations and files.',
        },
        { kind: 'operator', name: operator },
      )
    }
    return this.inspect(digest)
  }
  private path(digest: string) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new DeliveryRunnerError('invalid-runner-id')
    return `delivery/runner-requests/${digest}.json`
  }
}
