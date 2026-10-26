import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { findBudget } from '../delivery/budget-events.js'
import { readSourceFile } from '../delivery/input.js'
import type { NativeDeliveryHost } from '../delivery/native-host.js'
import type { DeliveryQueue, QueueAssignment } from '../delivery/queue.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerNativeScope } from './native-scope.js'
import { RunnerNativeStage } from './native-stage.js'
import { admitRunnerRepair } from './repair-admission.js'
import { repairFailureFingerprint } from './repair-feedback.js'
import type { RunnerReviewStages } from './review-stages.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'
import type { RunnerVerificationStages } from './verification-stages.js'
import { type RunnerWorkerOptions, RunnerWorkerStages } from './worker-stages.js'

type Admission = Extract<Awaited<ReturnType<typeof admitRunnerRepair>>, { status: 'admitted' }>
interface RepairBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  deadline: string
  workspace: string
  controller: string
  prior: QueueAssignment
  admission: Admission
  prefix: string[]
}
const repairTask = (feedback: Admission['feedback']) => ({
  kind: 'repair' as const,
  prompt: JSON.stringify({
    instruction:
      'Correct only the original observed failure within the pinned unit. Preserve acceptance definitions and criteria. Report production honestly; commit and independent QA are separate.',
    feedback,
  }),
})

const result = (status: 'produced' | 'blocked' | 'failed' | 'unknown', reason: string) => ({
  status,
  reason,
  commit: 'pending' as const,
  qa: 'pending' as const,
})

/** One correction attempt retains its original failure; production never passes the QA stage. */
export class RunnerRepairWorkers {
  readonly native: NativeDeliveryHost
  readonly workers: RunnerWorkerStages
  constructor(
    readonly store: RunnerStore,
    readonly queue: DeliveryQueue,
    readonly options: RunnerWorkerOptions,
  ) {
    this.workers = new RunnerWorkerStages(store, queue, options)
    this.native = this.workers.native
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation)) throw new DeliveryRunnerError('repair-invocation')
    return `delivery/runner-repairs/${invocation}`
  }
  private read(request: Readonly<RunnerRequest>, invocation: string) {
    const path = `${this.path(invocation)}/binding.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
        readSourceFile(this.store.files.root, path, 1024 * 1024),
      ) as RepairBinding,
      record = this.store.stage(contractDigest(request), binding.stage),
      feedback = binding.admission?.feedback,
      failure = findBudget(this.store.lifecycle.journal.get(request.run))?.failures.find(
        (item) => item.key === binding.admission?.failure,
      )
    if (
      Object.keys(binding).sort().join(',') !==
        'admission,controller,deadline,invocation,plan,prefix,prior,request,stage,version,workspace' ||
      binding.version !== 1 ||
      binding.request !== contractDigest(request) ||
      binding.invocation !== invocation ||
      record?.invocation !== invocation ||
      record.basis !== binding.plan ||
      this.store.record(binding.request).basis !== binding.plan ||
      contractDigest(request.host) !== contractDigest(this.options.identity) ||
      binding.controller !==
        `controller-${contractDigest({ invocation, failure: binding.admission.failure }).slice(0, 32)}` ||
      binding.admission.status !== 'admitted' ||
      binding.admission.failure !==
        `repair-${contractDigest({ invocation, gate: feedback?.origin.gate, candidate: feedback?.origin.candidate })}` ||
      (feedback &&
        repairFailureFingerprint({ ...feedback, unit: feedback.origin.unit }) !==
          feedback.fingerprint) ||
      binding.admission.deadline !== binding.deadline ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      !feedback ||
      feedback.origin.invocation !== invocation ||
      feedback.origin.stage !== binding.stage ||
      feedback.origin.request !== binding.request ||
      feedback.origin.plan !== binding.plan ||
      Date.parse(binding.deadline) > Date.parse(feedback.origin.deadline) ||
      binding.prior.run !== request.run ||
      binding.prior.plan !== binding.plan ||
      binding.prior.grant !== request.grant ||
      binding.prior.unit !== feedback.origin.unit ||
      binding.prior.role !== 'builder' ||
      binding.workspace !==
        new RunnerGitStages(this.store).workspace(request, binding.prior.unit).repository.path ||
      failure?.candidate !== feedback.origin.commit ||
      failure.evidence !== feedback.origin.observation ||
      failure.provenance !== 'host-observed' ||
      failure.category !== 'failed-behavior' ||
      contractDigest(failure.findings) !== contractDigest([feedback.fingerprint]) ||
      !Array.isArray(binding.prefix) ||
      !binding.prefix.length ||
      binding.prefix.some((id) => !/^[a-f0-9]{64}$/.test(id))
    )
      throw new DeliveryRunnerError('repair-binding')
    return binding
  }
  private lease(binding: RepairBinding): QueueAssignment | undefined {
    const path = `${this.path(binding.invocation)}/lease.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const lease = JSON.parse(readSourceFile(this.store.files.root, path, 65536)) as QueueAssignment
    if (
      lease.queue !== binding.prior.queue ||
      lease.unit !== binding.prior.unit ||
      lease.role !== 'builder' ||
      lease.cell !== binding.prior.cell ||
      lease.generation !== binding.prior.generation + 1 ||
      lease.controller !== binding.controller ||
      lease.revision !== binding.prior.revision ||
      lease.plan !== binding.plan ||
      lease.run !== binding.prior.run ||
      lease.grant !== binding.prior.grant ||
      contractDigest(this.queue.assigned(lease.run, lease.attempt)) !== contractDigest(lease)
    )
      throw new DeliveryRunnerError('repair-lease')
    return lease
  }
  async execute(
    reader: RunnerReviewStages | RunnerVerificationStages,
    context: RunnerStageContext,
  ) {
    if (reader.store !== this.store)
      return result('blocked', 'fixed-original-repair-store-required')
    try {
      if (this.read(context.request, context.invocation))
        return this.inspect(context.request, context.invocation)
      const admission = await admitRunnerRepair(reader, context)
      if (admission.status !== 'admitted') return result('blocked', admission.reason)
      const prior = this.workers.productionLease(context.request, admission.feedback.origin.unit),
        workspace = new RunnerGitStages(this.store).candidate(context.request, prior.unit)
          .allocation.repository.path,
        selected = this.options.context(context, workspace),
        scope = new RunnerNativeScope(this.store.files, context.invocation),
        prefix = scope.calls().map((call) => call.invocation),
        binding: RepairBinding = {
          version: 1,
          request: contractDigest(context.request),
          plan: contractDigest(context.plan),
          stage: context.stage.id,
          invocation: context.invocation,
          deadline: context.deadline,
          controller: `controller-${contractDigest({ invocation: context.invocation, failure: admission.failure }).slice(0, 32)}`,
          workspace,
          prior,
          admission,
          prefix,
        }
      if (
        selected.workspace !== workspace ||
        !prefix.length ||
        context.signal.aborted ||
        !context.current() ||
        Date.parse(context.deadline) <= Date.now()
      )
        return result('blocked', 'original-repair-window-unavailable')
      // Selecting context is outside the lock. Audit again before consuming the one-shot intent.
      const repeated = await admitRunnerRepair(reader, context)
      if (repeated.status !== 'admitted' || contractDigest(repeated) !== contractDigest(admission))
        return result('blocked', 'original-repair-admission-changed')
      let owned = false
      this.store.files.locked(() => {
        const path = `${this.path(context.invocation)}/binding.json`
        if (existsSync(this.store.files.path(path))) return
        this.store.files.atomic(path, `${JSON.stringify(binding)}\n`)
        owned = true
      })
      if (!owned) return this.inspect(context.request, context.invocation)
      // Never nest queue transactions in the root lock. Losing any response retains intent;
      // a later execute inspects it and cannot buy another claim or native invocation.
      const current = () =>
        !context.signal.aborted && context.current() && Date.parse(binding.deadline) > Date.now()
      if (!current()) return result('blocked', 'original-repair-window-unavailable')
      this.queue.fence(prior)
      if (!current()) return result('blocked', 'original-repair-window-unavailable')
      this.queue.requeue(prior, contractDigest(binding))
      if (!current()) return result('blocked', 'original-repair-window-unavailable')
      const claim = this.queue.claim(binding.controller, this.options.admit, {
        run: prior.run,
        queue: prior.queue,
        deadline: binding.deadline,
      })
      if (!claim.assignment) return result('blocked', 'original-repair-claim-refused')
      this.store.files.atomic(
        `${this.path(context.invocation)}/lease.json`,
        `${JSON.stringify(claim.assignment)}\n`,
      )
      const calls: string[] = []
      await new RunnerNativeStage(this.store, context, (invocation) => {
        calls.push(invocation)
        this.store.files.atomic(
          `${this.path(context.invocation)}/calls.json`,
          `${JSON.stringify(calls)}\n`,
        )
      }).run((process) =>
        this.native.run(
          claim.assignment as QueueAssignment,
          {
            ...selected,
            task: repairTask(admission.feedback),
          },
          {
            ...this.options.native,
            host: this.options.boundary(process, workspace),
            process,
            signal: context.signal,
          },
        ),
      )
      return this.inspect(context.request, context.invocation)
    } catch {
      return result('unknown', 'retain-original-repair-intent-without-replay')
    }
  }
  async inspect(request: Readonly<RunnerRequest>, invocation: string) {
    try {
      const binding = this.read(request, invocation)
      if (!binding) return result('unknown', 'original-repair-intent-missing')
      const lease = this.lease(binding)
      if (!lease) return result('unknown', 'original-repair-lease-missing-no-reclaim')
      const callsPath = `${this.path(invocation)}/calls.json`,
        owned = existsSync(this.store.files.path(callsPath))
          ? (JSON.parse(readSourceFile(this.store.files.root, callsPath, 65536)) as string[])
          : [],
        calls = new RunnerNativeScope(this.store.files, invocation).inspect(),
        retained = this.native.retained(lease),
        prior = deliveryAttempts(this.queue.lifecycle.journal.get(request.run)).records.find(
          (item) => item.id === binding.prior.attempt,
        )
      if (
        !Array.isArray(owned) ||
        !owned.length ||
        contractDigest(calls.map((call) => call.invocation)) !==
          contractDigest([...binding.prefix, ...owned]) ||
        calls.some((call) => call.observed.invocationState !== 'stopped') ||
        contractDigest(JSON.parse(retained?.binding.assignment.brief ?? '{}').task ?? null) !==
          contractDigest(repairTask(binding.admission.feedback)) ||
        prior?.state !== 'fenced' ||
        !retained?.receipt ||
        Date.parse(retained.binding.assignment.deadline) > Date.parse(binding.deadline)
      )
        return result('unknown', 'original-repair-observation-incomplete')
      if (retained.receipt.status !== 'succeeded')
        return result('failed', 'original-repair-did-not-complete')
      const snapshot = workspaceSnapshot(binding.workspace),
        receipt = retained.receipt
      if (
        !this.native.completed(lease) ||
        !receipt.candidate ||
        snapshot.head !== receipt.candidate.head ||
        snapshot.digest !== receipt.candidate.snapshot ||
        !Number.isFinite(Date.parse(receipt.execution?.finishedAt ?? '')) ||
        Date.parse(receipt.execution?.finishedAt ?? '') > Date.parse(binding.deadline)
      )
        return result('blocked', 'original-repair-production-not-current')
      return {
        ...result('produced', 'original-correction-produced-commit-and-independent-qa-pending'),
        evidence: contractDigest({ binding, lease, receipt, calls, snapshot }),
        provenance: retained.binding.provenance,
      }
    } catch {
      return result('unknown', 'original-repair-observation-unavailable')
    }
  }
  stop(request: Readonly<RunnerRequest>, invocation: string) {
    // Cancellation must remain available after revocation; active workspace
    // admission belongs to dispatch, not to original private ownership.
    this.path(invocation)
    const stage = this.store
      .record(contractDigest(request))
      .stages.find((item) => item.invocation === invocation)
    if (
      !stage ||
      !/^(review|verification):/.test(stage.id) ||
      contractDigest(request.host) !== contractDigest(this.options.identity)
    )
      throw new DeliveryRunnerError('original-repair-owner-required')
    new RunnerNativeScope(this.store.files, invocation).requestCancellation()
  }
}
