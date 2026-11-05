import { contractDigest } from '../contracts/compatibility.js'
import { readCandidateCommit, retainedWorkspaceCommit } from '../delivery/commit-state.js'
import { readSourceFile } from '../delivery/input.js'
import { NativeDeliveryHost } from '../delivery/native-host.js'
import { DeliveryQueue, type QueueAssignment } from '../delivery/queue.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import { DeliveryWorkspaces } from '../delivery/workspaces.js'
import { ciCorrectionFeedback } from './ci-correction-feedback.js'
import { CORRECTION_MESSAGE, correctionTask } from './correction-input.js'
import type { RunnerCorrectionFeedback } from './correction-stages.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface CorrectionBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  unit: string
  deadline: string
  controller: string
  workspace: string
  prior: QueueAssignment
  feedback: RunnerCorrectionFeedback
}

/** Audit completed production as history; a current lease is checked separately before dispatch. */
export function correctionProduction(
  store: RunnerStore,
  request: Readonly<RunnerRequest>,
  record: Readonly<RunnerStageRecord>,
  workspace: string,
) {
  try {
    const digest = contractDigest(request),
      basis = store.basis(request),
      allocation = new DeliveryWorkspaces(store.files.root).get(workspace),
      unit = allocation.request.unit,
      index = Number(new RegExp(`^correction-([1-9][0-9]*):${unit}$`).exec(record.id)?.[1] ?? 0),
      entry = basis.plan.corrections?.filter((entry) => entry.unit === unit)[index - 1],
      actual = store.stage(digest, record.id, basis.digest),
      base = `delivery/runner-corrections/${record.invocation}`,
      binding = JSON.parse(
        readSourceFile(store.files.root, `${base}/binding.json`, 1024 * 1024),
      ) as CorrectionBinding,
      lease = JSON.parse(
        readSourceFile(store.files.root, `${base}/lease.json`, 65536),
      ) as QueueAssignment
    if (
      !entry ||
      !/^[a-f0-9]{64}$/.test(record.invocation) ||
      actual?.invocation !== record.invocation ||
      contractDigest(actual) !== contractDigest(record) ||
      record.basis !== basis.digest ||
      allocation.request.run !== request.run ||
      allocation.request.plan !== basis.digest ||
      allocation.grant !== request.grant ||
      Object.keys(binding).sort().join(',') !==
        'controller,deadline,feedback,invocation,plan,prior,request,stage,unit,version,workspace' ||
      binding.version !== 1 ||
      binding.request !== digest ||
      binding.plan !== basis.digest ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      binding.unit !== unit ||
      binding.workspace !== allocation.repository.path ||
      binding.controller !==
        `controller-${contractDigest({ invocation: record.invocation, unit }).slice(0, 32)}` ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      binding.feedback.origin !== entry.origin ||
      binding.feedback.stage !== entry.stage ||
      binding.feedback.failure !== entry.failure ||
      (entry.origin === 'ci' &&
        contractDigest(binding.feedback) !== contractDigest(ciCorrectionFeedback(store, entry)))
    )
      throw new DeliveryRunnerError('correction-production-binding')
    const failure = store.stage(entry.request, entry.stage),
      prior = binding.prior,
      parent = deliveryAttempts(store.lifecycle.journal.get(request.run)).records.find(
        (attempt) => attempt.id === prior.attempt,
      ),
      queue = new DeliveryQueue(store.files.root, store.now, undefined, store.budgets.clock),
      native = new NativeDeliveryHost(queue),
      completion = native.historical(lease),
      before = native.historical(prior),
      calls = new RunnerNativeScope(store.files, record.invocation).inspect()
    if (
      !failure ||
      !['failed', 'blocked'].includes(failure.status) ||
      failure.evidence !== entry.failure ||
      // CI has its fixed, recomputed historical projection above; only legacy
      // origins carry the stage's original explanation verbatim.
      (entry.origin !== 'ci' && binding.feedback.reason !== (failure.reason ?? '')) ||
      prior.run !== request.run ||
      prior.plan !== basis.digest ||
      prior.grant !== request.grant ||
      prior.revision !== basis.plan.revision ||
      prior.unit !== unit ||
      prior.role !== 'builder' ||
      parent?.state !== 'fenced' ||
      !before ||
      before.binding.provenance !== 'host-observed' ||
      before.binding.workspace !== allocation.repository.path ||
      lease.run !== prior.run ||
      lease.plan !== prior.plan ||
      lease.grant !== prior.grant ||
      lease.revision !== prior.revision ||
      lease.queue !== prior.queue ||
      lease.unit !== unit ||
      lease.cell !== prior.cell ||
      lease.role !== 'builder' ||
      lease.generation !== prior.generation + 1 ||
      lease.controller !== binding.controller ||
      !completion ||
      completion.binding.provenance !== 'host-observed' ||
      completion.binding.workspace !== allocation.repository.path ||
      !completion.receipt.candidate ||
      !Number.isFinite(Date.parse(completion.receipt.execution?.finishedAt ?? '')) ||
      Date.parse(completion.receipt.execution?.finishedAt ?? '') > Date.parse(binding.deadline) ||
      !Number.isFinite(Date.parse(completion.binding.assignment.deadline)) ||
      Date.parse(completion.binding.assignment.deadline) > Date.parse(binding.deadline) ||
      contractDigest(JSON.parse(completion.binding.assignment.brief).task) !==
        contractDigest(correctionTask(binding.feedback)) ||
      !calls.length ||
      calls.some((call) => call.observed.invocationState !== 'stopped')
    )
      throw new DeliveryRunnerError('correction-production-original-completion')
    const commit = readSourceFile(store.files.root, `${base}/commit.txt`, 128).trim(),
      receipt = retainedWorkspaceCommit(store.lifecycle, allocation, commit),
      // Receipt validation binds the exact closed staging and commit effects.
      recordCommit = readCandidateCommit(store.lifecycle, commit)
    if (
      recordCommit.request.key !== `correction-${record.invocation.slice(0, 25)}` ||
      recordCommit.request.message !== CORRECTION_MESSAGE ||
      recordCommit.request.head !== completion.receipt.candidate.head ||
      recordCommit.request.snapshot !== completion.receipt.candidate.snapshot
    )
      throw new DeliveryRunnerError('correction-production-original-commit')
    const evidence = contractDigest({
      record: record.invocation,
      status: 'passed',
      evidence: { feedback: contractDigest(binding.feedback), receipt: receipt.digest },
    })
    if (
      record.status === 'passed' &&
      (record.provenance !== 'host-observed' || record.evidence !== evidence)
    )
      throw new DeliveryRunnerError('correction-production-original-stage')
    return { binding, lease, completion, allocation, receipt, evidence }
  } catch {
    throw new DeliveryRunnerError('correction-original-production-unavailable')
  }
}

export function latestCorrectionProduction(
  store: RunnerStore,
  request: Readonly<RunnerRequest>,
  unit: string,
  workspace: string,
) {
  const record = store
    .record(contractDigest(request))
    .stages.filter(
      (stage) =>
        stage.status === 'passed' &&
        !stage.origin &&
        new RegExp(`^correction-[1-9][0-9]*:${unit}$`).test(stage.id),
    )
    .at(-1)
  return record ? correctionProduction(store, request, record, workspace) : undefined
}
