import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { candidateFiles, candidateIndex } from '../delivery/candidate-files.js'
import {
  currentWorkspaceCommit,
  readCommitReceipt,
  validateHistoricalWorkspaceCommit,
} from '../delivery/commit-state.js'
import { DeliveryCommits } from '../delivery/commits.js'
import { readSourceFile } from '../delivery/input.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import type { AssemblyGitControl } from '../integration/git-process.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerRepairWorkers } from './repair-workers.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

interface RepairCommitBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  deadline: string
  production: string
  resource: string
}
const MESSAGE =
  'fix(delivery): pin the original correction\n\nRetain exact owned correction bytes after original failure feedback.\nIndependent verification, review and acceptance remain pending.'
const result = <Status extends 'committed' | 'blocked' | 'unknown'>(
  status: Status,
  reason: string,
) => ({
  status,
  reason,
  qa: 'pending' as const,
  candidateChain: 'pending' as const,
})

/** Commit the original correction; a commit alone never replaces independent QA. */
export class RunnerRepairCommits {
  readonly store: RunnerStore
  readonly commits: DeliveryCommits
  constructor(readonly workers: RunnerRepairWorkers) {
    if (!(workers instanceof RunnerRepairWorkers))
      throw new DeliveryRunnerError('fixed-repair-workers-required')
    this.store = workers.store
    this.commits = new DeliveryCommits(this.store.files.root)
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('repair-commit-invocation')
    const scope = this.workers.checkpointScope(invocation)
    return scope
      ? `delivery/runner-repair-commits/${invocation}/after/${scope}.json`
      : `delivery/runner-repair-commits/${invocation}.json`
  }
  private read(request: Readonly<RunnerRequest>, invocation: string) {
    const path = this.path(invocation)
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
        readSourceFile(this.store.files.root, path, 65536),
      ) as RepairCommitBinding,
      production = this.workers.production(request, invocation),
      record = this.commits.get(binding.resource),
      stage = this.store.stage(contractDigest(request), binding.stage)
    if (
      Object.keys(binding).sort().join(',') !==
        'deadline,invocation,plan,production,request,resource,stage,version' ||
      binding.version !== 1 ||
      binding.request !== contractDigest(request) ||
      binding.invocation !== invocation ||
      stage?.invocation !== invocation ||
      stage.basis !== binding.plan ||
      binding.plan !== production.binding.plan ||
      binding.stage !== production.binding.stage ||
      binding.production !== contractDigest(production) ||
      production.provenance !== 'host-observed' ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      Date.parse(binding.deadline) > Date.parse(production.binding.deadline) ||
      record.request.workspace !==
        this.workers.workers.git.workspace(request, production.binding.prior.unit).digest ||
      record.request.head !== production.receipt.candidate?.head ||
      record.request.head !== production.binding.admission.feedback.origin.candidate ||
      record.request.snapshot !== production.receipt.candidate.snapshot ||
      record.request.message !== MESSAGE ||
      record.run !== request.run ||
      record.plan !== binding.plan ||
      record.grant !== request.grant ||
      record.request.key !==
        `repair-${contractDigest({ invocation, failure: production.binding.admission.failure }).slice(0, 25)}`
    )
      throw new DeliveryRunnerError('repair-commit-binding')
    return { binding, production, record }
  }
  async execute(context: RunnerStageContext) {
    try {
      if (this.read(context.request, context.invocation))
        return this.inspect(context.request, context.invocation)
      const stage = this.store.stage(contractDigest(context.request), context.stage.id),
        basis = this.store.basis(context.request),
        grant = this.store.lifecycle.authority.inspect(context.request.grant)
      if (
        stage?.invocation !== context.invocation ||
        stage.basis !== basis.digest ||
        !['running', 'prepared'].includes(stage.status) ||
        !['review', 'verification'].includes(context.stage.kind) ||
        contractDigest(context.plan) !== basis.digest ||
        basis.plan.policy.intervention !== 'none' ||
        grant.status !== 'active' ||
        !grant.grant.effects.includes('git.commit') ||
        context.signal.aborted ||
        !context.current() ||
        !Number.isFinite(Date.parse(context.deadline)) ||
        Date.parse(context.deadline) <= Date.now()
      )
        return result('blocked', 'current-original-unattended-correction-required')
      const produced = await this.workers.inspect(context.request, context.invocation)
      if (produced.status !== 'produced')
        return result('blocked', 'current-original-correction-production-required')
      const production = this.workers.production(context.request, context.invocation),
        workspace = production.binding.workspace,
        snapshot = workspaceSnapshot(workspace)
      if (
        Date.parse(context.deadline) > Date.parse(production.binding.deadline) ||
        snapshot.head !== production.receipt.candidate?.head ||
        snapshot.digest !== production.receipt.candidate.snapshot ||
        snapshot.head !== production.binding.admission.feedback.origin.candidate
      )
        return result('blocked', 'original-correction-snapshot-or-window-changed')
      const commits = this.controlled(context),
        record = commits.prepare({
          schema: 'wholeloop/delivery-commit-request@1',
          workspace: this.workers.workers.git.workspace(
            context.request,
            production.binding.prior.unit,
          ).digest,
          key: `repair-${contractDigest({ invocation: context.invocation, failure: production.binding.admission.failure }).slice(0, 25)}`,
          head: snapshot.head,
          snapshot: snapshot.digest,
          message: MESSAGE,
        }),
        binding: RepairCommitBinding = {
          version: 1,
          request: contractDigest(context.request),
          plan: basis.digest,
          stage: context.stage.id,
          invocation: context.invocation,
          deadline: context.deadline,
          production: contractDigest(production),
          resource: record.digest,
        }
      let owned = false
      this.store.files.locked(() => {
        const path = this.path(context.invocation)
        if (existsSync(this.store.files.path(path))) return
        this.store.files.atomic(path, `${JSON.stringify(binding)}\n`)
        owned = true
      })
      if (owned) await commits.execute(record.digest)
      return this.inspect(context.request, context.invocation)
    } catch {
      return result('unknown', 'retain-original-correction-commit-without-replay')
    }
  }
  private controlled(context: RunnerStageContext) {
    let registered =
      this.store.stage(contractDigest(context.request), context.stage.id)?.runtime !== undefined
    const control: AssemblyGitControl = {
      deadline: context.deadline,
      signal: context.signal,
      current: context.current,
      started: ({ operation, pid }) => {
        if (registered) return
        context.started({ backend: 'owned-git', instance: operation, worker: String(pid) })
        registered = true
      },
    }
    return new DeliveryCommits(this.store.files.root, control)
  }
  async inspect(request: Readonly<RunnerRequest>, invocation: string) {
    try {
      const retained = this.read(request, invocation)
      if (!retained) return result('unknown', 'original-correction-commit-intent-missing')
      const observed = await this.commits.reconcile(retained.binding.resource),
        files = candidateFiles(retained.production.binding.workspace)
      if (
        observed.status !== 'committed' ||
        !observed.current ||
        !observed.receipt ||
        files.digest !== observed.record.files.digest ||
        candidateIndex(retained.production.binding.workspace) !== observed.receipt.index
      )
        return result('blocked', 'original-correction-commit-not-current')
      return {
        ...result('committed', 'exact-original-correction-committed-independent-qa-pending'),
        receipt: observed.receipt,
        evidence: contractDigest({ retained, observed, files }),
        provenance: 'host-observed' as const,
      }
    } catch {
      return result('unknown', 'original-correction-commit-observation-unavailable')
    }
  }
  /** Reopen a known checkpoint without making an earlier commit current again. */
  historical(request: Readonly<RunnerRequest>, invocation: string, digest: string) {
    const retained = this.read(request, invocation)
    if (!retained) throw new DeliveryRunnerError('original-correction-checkpoint-required')
    const allocation = this.workers.workers.git.workspace(
        request,
        retained.production.binding.prior.unit,
      ),
      receipt = readCommitReceipt(this.commits.effects.lifecycle, digest)
    validateHistoricalWorkspaceCommit(this.commits.effects.lifecycle, allocation, receipt)
    if (
      receipt.record !== retained.record.digest ||
      receipt.workspace !== allocation.digest ||
      receipt.parent !== retained.production.binding.admission.feedback.origin.candidate
    )
      throw new DeliveryRunnerError('original-correction-historical-binding')
    return { ...retained, allocation, receipt }
  }
  private rootRecord(
    request: Readonly<RunnerRequest>,
    invocation: string,
    digest: string,
    seen = new Set<string>(),
  ): string {
    if (seen.has(digest)) throw new DeliveryRunnerError('original-correction-chain-cycle')
    seen.add(digest)
    const own = this.historical(request, invocation, digest),
      parent = readCommitReceipt(
        this.commits.effects.lifecycle,
        own.production.binding.admission.feedback.origin.commit,
      ),
      previous = this.workers.predecessor(request, invocation)
    validateHistoricalWorkspaceCommit(this.commits.effects.lifecycle, own.allocation, parent)
    if (
      own.receipt.parent !== parent.head ||
      own.receipt.workspace !== parent.workspace ||
      (previous && previous.receipt !== parent.digest)
    )
      throw new DeliveryRunnerError('original-correction-parent-binding')
    return previous
      ? previous.checkpoint.rootRecord(request, invocation, parent.digest, seen)
      : parent.record
  }
  /** Select only an audited correction chain anchored to the original root commit. */
  candidate(request: Readonly<RunnerRequest>, unit: string, original: string) {
    const allocation = this.workers.workers.git.workspace(request, unit),
      lifecycle = this.commits.effects.lifecycle,
      current = currentWorkspaceCommit(lifecycle, allocation)
    if (!current) throw new DeliveryRunnerError('original-correction-head-required')
    const stages = this.store
      .record(contractDigest(request))
      .stages.filter(
        (stage) =>
          stage.basis === allocation.request.plan &&
          ['review', 'verification'].some((kind) => stage.id === `${kind}:${unit}`),
      )
    let selected: ReturnType<RunnerRepairCommits['read']>
    for (const stage of stages) {
      if (!this.workers.owns(stage.invocation)) continue
      const path = this.path(stage.invocation)
      if (!existsSync(this.store.files.path(path))) continue
      // The effect journal chooses the actual head. File order and timestamps choose nothing.
      const hint = JSON.parse(
        readSourceFile(this.store.files.root, path, 65536),
      ) as RepairCommitBinding
      if (hint.resource !== current.record) continue
      const retained = this.read(request, stage.invocation)
      if (!retained || selected) throw new DeliveryRunnerError('ambiguous-original-correction-head')
      selected = retained
    }
    if (!selected) throw new DeliveryRunnerError('original-correction-head-binding-required')
    const parent = readCommitReceipt(
      lifecycle,
      selected.production.binding.admission.feedback.origin.commit,
    )
    validateHistoricalWorkspaceCommit(lifecycle, allocation, parent)
    if (
      this.rootRecord(request, selected.binding.invocation, current.digest) !== original ||
      parent.head !== current.parent ||
      parent.workspace !== allocation.digest ||
      selected.record.digest !== current.record ||
      selected.production.binding.prior.unit !== unit
    )
      throw new DeliveryRunnerError('original-correction-parent-binding')
    const observed = this.commits.inspect(current.record)
    if (
      observed.status !== 'committed' ||
      !observed.current ||
      observed.receipt?.digest !== current.digest
    )
      throw new DeliveryRunnerError('original-correction-head-not-current')
    const snapshot = workspaceSnapshot(allocation.repository.path),
      files = candidateFiles(allocation.repository.path)
    if (
      snapshot.head !== current.head ||
      snapshot.branch !== allocation.repository.branch ||
      files.digest !== current.files ||
      candidateIndex(allocation.repository.path) !== current.index ||
      workspaceSnapshot(allocation.repository.path).digest !== snapshot.digest ||
      currentWorkspaceCommit(lifecycle, allocation)?.digest !== current.digest
    )
      throw new DeliveryRunnerError('original-correction-head-not-current')
    return { allocation, receipt: current }
  }
  stop(request: Readonly<RunnerRequest>, invocation: string) {
    // Original private Git cancellation survives revoked workspace admission.
    const path = this.path(invocation)
    if (contractDigest(request.host) !== contractDigest(this.workers.options.identity))
      throw new DeliveryRunnerError('original-repair-commit-owner-required')
    if (!existsSync(this.store.files.path(path))) return
    const binding = JSON.parse(
        readSourceFile(this.store.files.root, path, 65536),
      ) as RepairCommitBinding,
      stage = this.store
        .record(contractDigest(request))
        .stages.find((item) => item.invocation === invocation),
      record = this.commits.get(binding.resource),
      workspace = this.commits.workspaces.get(record.request.workspace)
    if (
      binding.version !== 1 ||
      binding.request !== contractDigest(request) ||
      binding.invocation !== invocation ||
      binding.stage !== stage?.id ||
      binding.plan !== stage.basis ||
      !/^(review|verification):/.test(stage.id) ||
      workspace.request.unit !== stage.id.slice(stage.id.indexOf(':') + 1) ||
      workspace.request.run !== request.run ||
      workspace.request.plan !== stage.basis ||
      workspace.grant !== request.grant ||
      record.run !== request.run ||
      record.plan !== stage.basis ||
      record.grant !== request.grant
    )
      throw new DeliveryRunnerError('original-repair-commit-owner-required')
    this.commits.requestCancellation(binding.resource)
  }
}
