import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { ciCorrectionOrigin } from './ci-correction-origin.js'
import {
  readCiCorrectionTarget,
  type CiCorrectionSnapshot as Snapshot,
  ciCorrectionSnapshotDigest as semantic,
} from './ci-correction-remote.js'
import { validateCiFeedback } from './ci-feedback.js'
import { ciRepairAdmission } from './ci-repair.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import type { RunnerCodeHost } from './publication-stages.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export const CI_CORRECTION_ADMISSION = 'ci-correction-admission'
const LIMIT = 8 * 1024 * 1024
const base = (invocation: string) => {
  if (!/^[a-f0-9]{64}$/.test(invocation)) throw new DeliveryRunnerError('ci-admission-invocation')
  return `delivery/runner-ci-correction-admissions/${invocation}`
}
const iso = (at: string) => Number.isFinite(Date.parse(at)) && new Date(at).toISOString() === at
interface Binding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  deadline: string
  origin: string
}
interface Result {
  binding: string
  status: 'passed' | 'blocked'
  reason: string
  snapshots: Snapshot[][]
  finishedAt: string
  closed: true
}
/** A retained pre-builder check is history; publication must recheck the live host. */
function originalAdmission(
  store: RunnerStore,
  request: Readonly<RunnerRequest>,
  record: Readonly<RunnerStageRecord>,
) {
  const basis = store.basis(request),
    origin = ciCorrectionOrigin(store, basis.plan),
    path = base(record.invocation),
    binding = JSON.parse(
      readSourceFile(store.files.root, `${path}/binding.json`, LIMIT),
    ) as Binding,
    result = JSON.parse(readSourceFile(store.files.root, `${path}/result.json`, LIMIT)) as Result
  if (
    !origin ||
    Object.keys(binding).sort().join(',') !==
      'at,deadline,invocation,origin,plan,request,stage,version' ||
    Object.keys(result).sort().join(',') !== 'binding,closed,finishedAt,reason,snapshots,status' ||
    record.runtime?.backend !== 'owned-core' ||
    record.runtime.instance !== record.invocation ||
    record.id !== CI_CORRECTION_ADMISSION ||
    record.origin ||
    binding.version !== 1 ||
    binding.request !== contractDigest(request) ||
    binding.plan !== basis.digest ||
    binding.stage !== record.id ||
    binding.invocation !== record.invocation ||
    binding.origin !== contractDigest(origin.proof) ||
    !iso(binding.at) ||
    !iso(binding.deadline) ||
    binding.deadline <= binding.at ||
    Date.parse(binding.deadline) - Date.parse(binding.at) > basis.plan.budgets.attemptMs ||
    readSourceFile(store.files.root, `${path}/consumed`, 128).trim() !== contractDigest(binding) ||
    result.binding !== contractDigest(binding) ||
    result.closed !== true ||
    !iso(result.finishedAt) ||
    result.finishedAt < binding.at ||
    result.finishedAt > store.now() ||
    (result.status === 'passed' && result.finishedAt > binding.deadline) ||
    !['passed', 'blocked'].includes(result.status)
  )
    throw new DeliveryRunnerError('ci-admission-original-binding')
  if (!Array.isArray(result.snapshots) || result.snapshots.length > 3)
    throw new DeliveryRunnerError('ci-admission-original-observations')
  for (const snapshot of result.snapshots) {
    if (!Array.isArray(snapshot) || snapshot.length !== origin.proof.targets.length)
      throw new DeliveryRunnerError('ci-admission-original-observations')
    snapshot.forEach((value, index) => {
      validateCiFeedback(value.feedback)
      const target = origin.proof.targets[index],
        repository = basis.plan.repositories.find((entry) => entry.id === target?.repository)
      if (
        !target ||
        !repository ||
        Object.keys(value).sort().join(',') !== 'feedback,head,pr,repository' ||
        Object.keys(value.pr).sort().join(',') !== 'base,branch,draft,sha,state,url' ||
        value.repository !== target.repository ||
        value.head !== target.head ||
        value.pr.url !== target.pr ||
        value.pr.branch !== target.branch ||
        value.pr.base !== target.base ||
        value.pr.sha !== target.head ||
        value.pr.state !== 'open' ||
        value.pr.draft !== false ||
        value.feedback.repository !== repository.remote?.url ||
        value.feedback.head !== target.head ||
        value.feedback.pr !== target.pr ||
        value.feedback.base !== target.base ||
        value.feedback.provenance !== 'host-observed' ||
        value.feedback.observedAt < binding.at ||
        value.feedback.observedAt > result.finishedAt ||
        (result.status === 'passed' && value.feedback.items.some((item) => item.current))
      )
        throw new DeliveryRunnerError('ci-admission-original-observations')
    })
  }
  if (result.status === 'passed') {
    const first = result.snapshots.at(-2),
      second = result.snapshots.at(-1)
    if (
      !first ||
      !second ||
      semantic(first) !== semantic(second) ||
      result.reason !== 'ci-admission-current-original-heads'
    )
      throw new DeliveryRunnerError('ci-admission-original-observations')
  }
  const evidence = contractDigest({ binding, result })
  if (
    ['passed', 'blocked'].includes(record.status) &&
    (record.status !== result.status ||
      record.provenance !== 'host-observed' ||
      record.evidence !== evidence)
  )
    throw new DeliveryRunnerError('ci-admission-original-stage')
  return { binding, result, evidence }
}
export function ciCorrectionAdmitted(store: RunnerStore, request: Readonly<RunnerRequest>) {
  const basis = store.basis(request)
  if (basis.plan.schema !== 'wholeloop/delivery-plan@2') return
  const record = store.stage(contractDigest(request), CI_CORRECTION_ADMISSION)
  if (
    record?.status !== 'passed' ||
    originalAdmission(store, request, record).result.status !== 'passed'
  )
    throw new DeliveryRunnerError('ci-correction-admission-required')
}

/** Fixed read-only admission before any builder, with original in-memory cancellation. */
export class RunnerCiCorrectionAdmission {
  private active = new Map<string, { request: string; abort: AbortController }>()
  constructor(
    readonly store: RunnerStore,
    readonly options: { identity: RunnerRequest['host']; host: RunnerCodeHost },
  ) {}
  configured(request: Readonly<RunnerRequest>, plan: Readonly<DeliveryPlan>) {
    try {
      const basis = this.store.basis(request),
        origin = ciCorrectionOrigin(this.store, plan),
        grant = basis.authority.grant
      return (
        basis.digest === contractDigest(plan) &&
        contractDigest(request.host) === contractDigest(this.options.identity) &&
        this.options.host.provenance === 'host-observed' &&
        typeof this.options.host.readFeedback === 'function' &&
        (['git.push', 'pr.create', 'pr.ready'] as const).every((effect) =>
          grant.effects.includes(effect),
        ) &&
        !!origin &&
        origin.proof.targets.every((target) =>
          grant.repositories.some(
            (scope) =>
              scope.repository === target.repository &&
              scope.remote === target.remote &&
              target.branch.startsWith(scope.topicPrefix),
          ),
        )
      )
    } catch {
      return false
    }
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const basis = this.store.basis(request),
      digest = contractDigest(request),
      actual = this.store
        .record(digest)
        .stages.find(
          (value) =>
            value.id === record.id &&
            value.invocation === record.invocation &&
            value.basis === record.basis,
        ),
      stage = runnerRoute(basis.plan).find((value) => value.id === CI_CORRECTION_ADMISSION),
      origin = ciCorrectionOrigin(this.store, basis.plan)
    if (
      !actual ||
      actual.origin ||
      record.id !== CI_CORRECTION_ADMISSION ||
      record.basis !== basis.digest ||
      !origin ||
      !stage ||
      stage.unit !== origin.entry.unit ||
      !this.configured(request, basis.plan)
    )
      throw new DeliveryRunnerError('ci-admission-stage-binding')
    return { basis, digest, actual, stage, origin }
  }
  private async snapshot(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    signal: AbortSignal,
    current: () => void,
    since: string,
  ) {
    const origin = ciCorrectionOrigin(this.store, plan),
      host = this.options.host
    if (!origin || !host.readFeedback) throw new DeliveryRunnerError('ci-admission-host-required')
    const values: Snapshot[] = []
    for (const target of origin.proof.targets) {
      const repository = plan.repositories.find((value) => value.id === target.repository)
      if (!repository) throw new DeliveryRunnerError('ci-admission-repository')
      values.push(
        await readCiCorrectionTarget({
          run: request.run,
          repository,
          target: { ...target, path: repository.root },
          pr: target.pr,
          host,
          signal,
          since,
          now: this.store.now,
          current,
        }),
      )
    }
    return values
  }
  private observation(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    status: RunnerStageObservation['status'],
    invocationState: RunnerStageObservation['invocationState'],
    evidence: string,
  ): RunnerStageObservation {
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState,
      evidence,
      provenance: 'host-observed',
      reason:
        status === 'passed'
          ? 'The original owned heads and complete current feedback were checked before builders; publication must independently recheck them.'
          : 'The original CI correction admission is unresolved or refused; no builder is admitted.',
    }
  }
  inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): RunnerStageObservation {
    try {
      const { actual } = this.context(request, record),
        path = base(actual.invocation)
      if (!existsSync(this.store.files.path(`${path}/result.json`))) {
        const live = this.active.get(actual.invocation)?.request === contractDigest(request),
          untouched = !actual.runtime && !existsSync(this.store.files.path(`${path}/consumed`))
        return this.observation(
          request,
          actual,
          untouched ? 'blocked' : live ? 'pending' : 'unknown',
          untouched ? 'not-started' : 'unknown',
          contractDigest({ invocation: actual.invocation, result: null }),
        )
      }
      const original = originalAdmission(this.store, request, actual)
      return this.observation(request, actual, original.result.status, 'stopped', original.evidence)
    } catch {
      return this.observation(
        request,
        record,
        'unknown',
        'unknown',
        contractDigest({ invocation: record.invocation, result: null }),
      )
    }
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('ci-admission-not-dispatched')
    const selected = this.context(context.request, record),
      path = base(record.invocation),
      at = this.store.now()
    if (
      context.signal.aborted ||
      !context.current() ||
      !iso(context.deadline) ||
      context.deadline <= at ||
      Date.parse(context.deadline) - Date.parse(at) > selected.basis.plan.budgets.attemptMs ||
      contractDigest(context.plan) !== selected.basis.digest ||
      contractDigest(context.stage) !== contractDigest(selected.stage)
    )
      throw new DeliveryRunnerError('ci-admission-not-current')
    if (record.runtime || existsSync(this.store.files.path(`${path}/consumed`)))
      return this.inspect(context.request, record)
    // History remains inspectable after the eventual push consumes the last
    // slot; only a fresh pre-builder admission needs an unused allowance.
    if (!ciRepairAdmission(this.store, context.request.run).allowed)
      throw new DeliveryRunnerError('ci-admission-push-budget')
    const binding: Binding = {
      version: 1,
      request: selected.digest,
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      at,
      deadline: context.deadline,
      origin: contractDigest(selected.origin.proof),
    }
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${path}/consumed`)))
        throw new DeliveryRunnerError('ci-admission-original-unresolved')
      this.store.files.atomic(`${path}/consumed`, `${contractDigest(binding)}\n`)
      this.store.files.atomic(`${path}/binding.json`, `${JSON.stringify(binding)}\n`)
    })
    context.started({
      backend: 'owned-core',
      instance: record.invocation,
      worker: `pid-${process.pid}`,
    })
    const abort = new AbortController(),
      relay = () => abort.abort(),
      current = () => {
        if (abort.signal.aborted || !context.current() || this.store.now() >= binding.deadline)
          throw new DeliveryRunnerError('ci-admission-not-current')
      },
      result: Result = {
        binding: contractDigest(binding),
        status: 'blocked',
        reason: 'ci-admission-host-unavailable',
        snapshots: [],
        finishedAt: at,
        closed: true,
      }
    this.active.set(record.invocation, { request: selected.digest, abort })
    context.signal.addEventListener('abort', relay, { once: true })
    if (context.signal.aborted) relay()
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        current()
        const snapshot = await this.snapshot(
          context.request,
          selected.basis.plan,
          abort.signal,
          current,
          binding.at,
        )
        result.snapshots.push(snapshot)
        if (snapshot.some((value) => value.feedback.items.some((item) => item.current))) {
          result.reason = 'ci-admission-unadopted-feedback'
          break
        }
        const previous = result.snapshots.at(-2)
        if (previous && semantic(previous) === semantic(snapshot)) {
          current()
          result.status = 'passed'
          result.reason = 'ci-admission-current-original-heads'
          break
        }
        result.reason = 'ci-admission-observation-changed'
      }
    } catch (error) {
      const allowed = [
        'ci-admission-not-current',
        'ci-admission-remote-head-changed',
        'ci-admission-owned-pr-required',
        'ci-admission-feedback-binding',
        'ci-admission-repository',
      ]
      result.reason =
        error instanceof DeliveryRunnerError && allowed.includes(error.problem)
          ? error.problem
          : 'ci-admission-host-unavailable'
    } finally {
      abort.abort()
      context.signal.removeEventListener('abort', relay)
      this.active.delete(record.invocation)
    }
    result.finishedAt = this.store.now()
    safeSourceText(JSON.stringify(result), LIMIT)
    this.store.files.atomic(`${path}/result.json`, `${JSON.stringify(result)}\n`)
    return this.inspect(context.request, this.store.stage(selected.digest, record.id) ?? record)
  }
  stop(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>, signal: AbortSignal) {
    const digest = contractDigest(request),
      actual = this.store
        .record(digest)
        .stages.find(
          (value) =>
            value.id === record.id &&
            value.invocation === record.invocation &&
            value.basis === record.basis,
        )
    if (
      !actual ||
      actual.origin ||
      actual.id !== CI_CORRECTION_ADMISSION ||
      contractDigest(request.host) !== contractDigest(this.options.identity)
    )
      throw new DeliveryRunnerError('ci-admission-original-cancellation-owner')
    // The retained PID is descriptive. Only this instance's original live
    // controller is cancelled; a new process never signals a stored PID.
    const owner = this.active.get(actual.invocation)
    if (!signal.aborted && owner?.request === digest) owner.abort.abort()
  }
}
