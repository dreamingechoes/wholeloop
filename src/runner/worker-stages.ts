import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import {
  type NativeBoundaryHost,
  NativeDeliveryHost,
  type NativeProcessRunner,
  type NativeRunOptions,
} from '../delivery/native-host.js'
import type {
  DeliveryQueue,
  QueueAssignment,
  QueueCandidate,
  QueueReadiness,
} from '../delivery/queue.js'
import type { workerContextForClaim } from '../delivery/worker-context.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerNativeScope } from './native-scope.js'
import { RunnerNativeStage } from './native-stage.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

interface WorkerStageBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  unit: string
  queue: string
  controller: string
  deadline: string
}
export interface RunnerWorkerOptions {
  identity: RunnerRequest['host']
  native: Omit<NativeRunOptions, 'process' | 'prepared' | 'signal' | 'host'>
  boundary(process: NativeProcessRunner, workspace?: string): NativeBoundaryHost
  context(
    context: RunnerStageContext,
    workspace?: string,
  ): Parameters<typeof workerContextForClaim>[2]
  admit(candidate: Readonly<QueueCandidate>): QueueReadiness
}

/** Producing code or a research claim is distinct from reviewing or accepting it. */
export class RunnerWorkerStages {
  readonly native: NativeDeliveryHost
  readonly git: RunnerGitStages
  constructor(
    readonly store: RunnerStore,
    readonly queue: DeliveryQueue,
    readonly options: RunnerWorkerOptions,
  ) {
    if (queue.lifecycle.journal.files.root !== store.files.root)
      throw new DeliveryRunnerError('worker-stage-store')
    this.native = new NativeDeliveryHost(queue)
    this.git = new RunnerGitStages(store)
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation)) throw new DeliveryRunnerError('worker-stage-invocation')
    return `delivery/runner-workers/${invocation}`
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      revision = this.store.lifecycle.journal
        .get(actual.run)
        .plans.find((plan) => plan.digest === record.basis)?.revision,
      basis = this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(basis.plan).find((item) => item.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find((item) => item.id === record.id && item.invocation === record.invocation)
    if (
      contractDigest(request.host) !== contractDigest(this.options.identity) ||
      basis.digest !== record.basis ||
      !retained ||
      retained.basis !== record.basis ||
      !stage?.unit ||
      !['implementation', 'research'].includes(stage.kind)
    )
      throw new DeliveryRunnerError('worker-stage-binding')
    return { digest, basis, stage, retained }
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const context = this.context(request, record),
      path = `${this.path(record.invocation)}/binding.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, path, 65536),
    ) as WorkerStageBinding
    if (
      Object.keys(binding).sort().join(',') !==
        'controller,deadline,invocation,plan,queue,request,stage,unit,version' ||
      binding.version !== 1 ||
      binding.request !== context.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      binding.unit !== context.stage.unit ||
      binding.controller !== `controller-${record.invocation.slice(0, 32)}` ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      !/^queue-[a-f0-9]{32}$/.test(binding.queue)
    )
      throw new DeliveryRunnerError('worker-stage-resource-binding')
    return binding
  }
  private lease(binding: WorkerStageBinding): QueueAssignment | undefined {
    const path = `${this.path(binding.invocation)}/lease.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const lease = JSON.parse(readSourceFile(this.store.files.root, path, 65536)) as QueueAssignment,
      entry = this.queue.inspect(lease.run).find((item) => item.id === binding.queue)
    if (
      lease.run !== this.store.get(binding.request).run ||
      lease.grant !== this.store.get(binding.request).grant ||
      lease.plan !== binding.plan ||
      lease.unit !== binding.unit ||
      lease.queue !== binding.queue ||
      lease.controller !== binding.controller ||
      entry?.attempt !== lease.attempt ||
      entry.controller !== binding.controller ||
      contractDigest(this.queue.assigned(lease.run, lease.attempt)) !== contractDigest(lease)
    )
      throw new DeliveryRunnerError('worker-stage-lease-binding')
    return lease
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('worker-stage-not-dispatched')
    const pinned = this.context(context.request, record)
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      context.signal.aborted ||
      !context.current() ||
      !Number.isFinite(Date.parse(context.deadline)) ||
      Date.parse(context.deadline) <= Date.now() ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('worker-stage-not-current')
    if (this.read(context.request, record)) return this.inspect(context.request, record)
    // Validate the actual original basis and selected context before consuming a queue slot.
    this.store.basis(context.request)
    const unit = pinned.basis.plan.work.find((work) => work.id === pinned.stage.unit)
    if (!unit) throw new DeliveryRunnerError('worker-stage-unit')
    const workspace = unit.repository
        ? this.git.workspace(context.request, unit.id).repository.path
        : undefined,
      selected = this.options.context(context, workspace)
    if (selected.workspace !== workspace) throw new DeliveryRunnerError('worker-stage-workspace')
    const entry = this.queue.enqueue(context.request.run, {
      unit: unit.id,
      role: unit.role === 'research' ? 'researcher' : 'builder',
    })
    let binding: WorkerStageBinding | undefined
    this.store.files.locked(() => {
      if (this.read(context.request, record))
        throw new DeliveryRunnerError('worker-stage-already-issued')
      binding = {
        version: 1,
        request: pinned.digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        unit: unit.id,
        queue: entry.id,
        controller: `controller-${record.invocation.slice(0, 32)}`,
        deadline: context.deadline,
      }
      // Publish intent before claim. A lost claim reply never licenses another claim or model call.
      this.store.files.atomic(
        `${this.path(record.invocation)}/binding.json`,
        `${JSON.stringify(binding)}\n`,
      )
    })
    if (!binding) throw new DeliveryRunnerError('worker-stage-missing-intent')
    // Different domain stores have distinct lock owners. Do not nest queue
    // transactions inside the root lock: intent already fences duplicate calls.
    const claimed = this.queue.claim(binding.controller, this.options.admit, {
        run: context.request.run,
        queue: entry.id,
        deadline: context.deadline,
      }),
      lease = claimed.assignment
    if (!lease) {
      this.store.files.atomic(
        `${this.path(record.invocation)}/not-started.json`,
        `${JSON.stringify({ binding: contractDigest(binding), deferred: claimed.deferred })}\n`,
      )
      return this.inspect(context.request, record)
    }
    this.store.files.atomic(
      `${this.path(record.invocation)}/lease.json`,
      `${JSON.stringify(lease)}\n`,
    )
    await new RunnerNativeStage(this.store, context).run((process) =>
      this.native.run(lease, selected, {
        ...this.options.native,
        host: this.options.boundary(process, workspace),
        process,
        signal: context.signal,
      }),
    )
    return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
  }

  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    const context = this.context(request, record),
      binding = this.read(request, record),
      lease = binding ? this.lease(binding) : undefined,
      retained = lease ? this.native.retained(lease) : undefined,
      calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = calls.every(
        (call) =>
          call.observed.invocationState === 'stopped' ||
          call.observed.invocationState === 'not-started',
      ),
      receipt = retained?.receipt
    let status: RunnerStageObservation['status'] = 'unknown'
    if (binding && !lease && !calls.length) {
      const path = `${this.path(record.invocation)}/not-started.json`,
        entry = this.queue.inspect(request.run).find((item) => item.id === binding.queue)
      if (
        existsSync(this.store.files.path(path)) &&
        entry?.status === 'pending' &&
        !entry.attempt &&
        JSON.parse(readSourceFile(this.store.files.root, path, 65536)).binding ===
          contractDigest(binding)
      )
        status = 'blocked'
    }
    if (lease && receipt && closed) {
      if (receipt.status === 'unavailable') status = 'blocked'
      else if (receipt.status === 'failed') status = 'failed'
      else if (receipt.status === 'blocked') status = 'blocked'
      else if (calls.length && this.native.completed(lease)) {
        const basis = this.store.basis(request),
          grant = this.store.lifecycle.authority.inspect(request.grant)
        let current =
          basis.digest === record.basis &&
          grant.digest === retained.binding.assignment.grantDigest &&
          !!binding &&
          Date.parse(receipt.execution?.finishedAt ?? '') <= Date.parse(binding.deadline)
        if (retained.binding.workspace) {
          const candidate = workspaceSnapshot(retained.binding.workspace)
          current &&=
            candidate.head === receipt.candidate?.head &&
            candidate.digest === receipt.candidate.snapshot
        }
        status = current ? 'passed' : 'blocked'
      }
    }
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: context.digest,
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState: status === 'unknown' ? 'unknown' : calls.length ? 'stopped' : 'not-started',
      evidence: receipt
        ? contractDigest(receipt)
        : contractDigest({ binding: binding ?? null, lease: lease ?? null, calls }),
      provenance: retained?.binding.provenance ?? 'fixture',
      reason:
        status === 'passed'
          ? 'The original native worker produced its current candidate or research claim; QA and acceptance remain separate.'
          : 'Original worker ownership or current output is unavailable; no work is replayed and no semantic acceptance is inferred.',
    }
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    this.context(request, record)
    if (signal.aborted) return
    // Even a lost private result may own native calls. Cancel only their original nonces.
    new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
  }
}
