import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { candidateFiles, candidateIndex } from '../delivery/candidate-files.js'
import { DeliveryCommits } from '../delivery/commits.js'
import type { EffectRecord } from '../delivery/effect-events.js'
import { readSourceFile } from '../delivery/input.js'
import { type DeliveryPlan, validateDeliveryShape } from '../delivery/plan.js'
import { DeliveryWorkspaces } from '../delivery/workspaces.js'
import type { IntegrationPart } from '../integration/contracts.js'
import type { AssemblyGitControl } from '../integration/git-process.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import { deliveryRunner, type RunnerStageRecord } from './events.js'
import { RunnerRepairCommits } from './repair-commits.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import bindingSchema from './schemas/git-binding-v1.json' with { type: 'json' }
import type { RunnerRequest, RunnerStore } from './store.js'
import { RunnerUnitReadiness } from './unit-readiness.js'

export interface RunnerGitBinding {
  schema: 'wholeloop/delivery-runner-git-binding@1'
  request: string
  plan: string
  stage: string
  invocation: string
  unit: string
  kind: 'workspace' | 'commit'
  resource: string
}
const MESSAGE =
  'feat(delivery): pin the owned candidate\n\nPreserve the exact authorized topic before independent QA.\nVerification and acceptance remain pending against this commit.'

/** Fixed domain stages retain their own actual native evidence; they grant no QA or endpoint authority. */
export class RunnerGitStages {
  readonly workspaces: DeliveryWorkspaces
  readonly commits: DeliveryCommits
  private readonly readiness?: ReadonlyMap<string, RunnerUnitReadiness>
  constructor(
    readonly store: RunnerStore,
    readiness?: ReadonlyMap<string, RunnerUnitReadiness>,
  ) {
    if (readiness) {
      this.readiness = new Map(readiness)
      for (const reader of this.readiness.values())
        if (
          !(reader instanceof RunnerUnitReadiness) ||
          reader.store.files.root !== store.files.root
        )
          throw new DeliveryRunnerError('git-stage-fixed-readiness-required')
    }
    this.workspaces = new DeliveryWorkspaces(store.files.root)
    this.commits = new DeliveryCommits(store.files.root)
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation)) throw new DeliveryRunnerError('git-stage-invocation')
    return `delivery/runner-git/${invocation}.json`
  }
  private context(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    active = true,
  ) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      revision = this.store.lifecycle.journal
        .get(actual.run)
        .plans.find((plan) => plan.digest === record.basis)?.revision,
      basis = active
        ? this.store.basis(actual)
        : this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(basis.plan).find((item) => item.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find((item) => item.invocation === record.invocation && item.id === record.id)
    if (
      !retained ||
      retained.basis !== record.basis ||
      record.basis !== basis.digest ||
      !stage?.unit ||
      !['workspace', 'commit'].includes(stage.kind)
    )
      throw new DeliveryRunnerError('git-stage-binding')
    return { digest, plan: basis.plan, stage, retained }
  }
  private read(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    active = true,
  ) {
    const context = this.context(request, record, active),
      path = this.path(record.invocation)
    if (!existsSync(this.store.files.path(path))) return undefined
    const value = JSON.parse(readSourceFile(this.store.files.root, path, 65536)) as RunnerGitBinding
    validateDeliveryShape(value, bindingSchema)
    if (
      value.request !== context.digest ||
      value.plan !== record.basis ||
      value.stage !== record.id ||
      value.invocation !== record.invocation ||
      value.unit !== context.stage.unit ||
      value.kind !== context.stage.kind
    )
      throw new DeliveryRunnerError('git-stage-resource-binding')
    const commit = value.kind === 'commit' ? this.commits.get(value.resource) : undefined,
      allocation = this.workspaces.get(commit?.request.workspace ?? value.resource)
    if (
      allocation.request.run !== request.run ||
      allocation.request.plan !== value.plan ||
      allocation.request.unit !== value.unit ||
      allocation.grant !== request.grant ||
      (commit &&
        (commit.run !== request.run ||
          commit.plan !== value.plan ||
          commit.grant !== request.grant))
    )
      throw new DeliveryRunnerError('git-stage-domain-binding')
    return value
  }
  private write(binding: RunnerGitBinding) {
    validateDeliveryShape(binding, bindingSchema)
    this.store.files.locked(() => {
      const path = this.path(binding.invocation),
        body = `${JSON.stringify(binding)}\n`
      if (existsSync(this.store.files.path(path))) {
        if (readSourceFile(this.store.files.root, path, 65536) !== body)
          throw new DeliveryRunnerError('git-stage-resource-conflict')
      } else this.store.files.atomic(path, body)
    })
  }
  private unitBinding(
    request: Readonly<RunnerRequest>,
    kind: 'workspace' | 'commit',
    unit: string,
  ) {
    const stage = this.store.stage(contractDigest(request), `${kind}:${unit}`)
    if (!stage) throw new DeliveryRunnerError('git-stage-missing-predecessor')
    const binding = this.read(request, stage)
    if (!binding) throw new DeliveryRunnerError('git-stage-missing-resource')
    return binding
  }
  /**
   * In a correction continuation the unit's new workspace starts at the head
   * its predecessor request committed (ADR-0208). The workspace store checks
   * the seed; here it is only located, from the predecessor's own commit stage.
   */
  private seed(request: Readonly<RunnerRequest>, plan: DeliveryPlan, unit: string) {
    const continuation = deliveryRunner(
      this.store.lifecycle.journal.get(request.run),
    ).continuations?.find((entry) => entry.revision === plan.revision)
    if (!continuation) return {}
    const predecessor = this.store.get(continuation.request),
      record = this.store.stage(continuation.request, `commit:${unit}`)
    // Commit stages are never reused, so the predecessor's own stage issued it.
    if (record?.status !== 'passed' || record.origin)
      throw new DeliveryRunnerError('git-stage-seed-unavailable')
    const binding = this.read(predecessor, record, false)
    if (binding?.kind !== 'commit') throw new DeliveryRunnerError('git-stage-seed-unavailable')
    return { seed: { commit: binding.resource } }
  }
  workspace(request: Readonly<RunnerRequest>, unit: string) {
    const binding = this.unitBinding(request, 'workspace', unit),
      record = this.workspaces.allocation(binding.resource)
    if (
      record.request.run !== request.run ||
      record.request.plan !== binding.plan ||
      record.request.unit !== unit ||
      record.grant !== request.grant
    )
      throw new DeliveryRunnerError('git-stage-workspace-binding')
    return record
  }
  candidate(request: Readonly<RunnerRequest>, unit: string, correction?: RunnerRepairCommits) {
    const allocation = this.workspace(request, unit),
      binding = this.unitBinding(request, 'commit', unit),
      committed = this.commits.inspect(binding.resource)
    if (
      committed.status !== 'committed' ||
      !committed.current ||
      !committed.receipt ||
      committed.record.request.workspace !== allocation.digest
    ) {
      // ADR-0208: a passed correction committed on top of the unit's commit.
      const corrected = this.corrected(request, unit, allocation.digest)
      if (corrected) return { allocation, receipt: corrected }
      if (
        !(correction instanceof RunnerRepairCommits) ||
        correction.store.files.root !== this.store.files.root
      )
        throw new DeliveryRunnerError('git-stage-candidate-not-current')
      return correction.candidate(request, unit, binding.resource)
    }
    const files = candidateFiles(allocation.repository.path)
    if (
      files.digest !== committed.receipt.files ||
      candidateIndex(allocation.repository.path) !== committed.receipt.index
    )
      throw new DeliveryRunnerError('git-stage-candidate-not-current')
    return { allocation, receipt: committed.receipt }
  }
  /**
   * The latest passed `correction-N:<unit>` commit of this request, when it is
   * still the workspace's current head. A verification repair on top of a
   * correction is not supported yet, so a moved head finds nothing here.
   */
  private corrected(request: Readonly<RunnerRequest>, unit: string, workspace: string) {
    const record = this.store
      .record(contractDigest(request))
      .stages.filter(
        (stage) =>
          stage.status === 'passed' &&
          !stage.origin &&
          new RegExp(`^correction-[1-9][0-9]*:${unit}$`).test(stage.id),
      )
      .at(-1)
    const path = record && `delivery/runner-corrections/${record.invocation}/commit.txt`
    if (!path || !existsSync(this.store.files.path(path))) return undefined
    const observed = this.commits.inspect(readSourceFile(this.store.files.root, path, 128).trim())
    if (
      observed.status !== 'committed' ||
      !observed.current ||
      !observed.receipt ||
      observed.record.request.workspace !== workspace
    )
      return undefined
    const tree = this.workspaces.get(workspace).repository.path
    if (
      candidateFiles(tree).digest !== observed.receipt.files ||
      candidateIndex(tree) !== observed.receipt.index
    )
      return undefined
    return observed.receipt
  }
  private async parts(
    request: Readonly<RunnerRequest>,
    plan: DeliveryPlan,
    unit: string,
  ): Promise<IntegrationPart[]> {
    const needed = new Set<string>(),
      visit = (id: string) => {
        for (const before of plan.work.find((work) => work.id === id)?.after ?? []) {
          if (needed.has(before)) continue
          needed.add(before)
          visit(before)
        }
      }
    visit(unit)
    const parts: IntegrationPart[] = [],
      recheck: (() => void)[] = []
    for (const work of plan.work.filter(
      (work) => needed.has(work.id) && work.role !== 'research',
    )) {
      if (this.readiness) {
        const reader = this.readiness.get(work.id)
        if (!reader) throw new DeliveryRunnerError('git-stage-predecessor-readiness-required')
        const ready = await reader.inspect(request, work.id),
          correction = reader.review.options.correction ?? reader.verification.options.correction,
          current = () => {
            const candidate = this.candidate(request, work.id, correction)
            return {
              commit: candidate.receipt.digest,
              head: candidate.receipt.head,
              workspace: candidate.allocation.digest,
            }
          }
        if (
          ready.status !== 'ready' ||
          ready.provenance !== 'host-observed' ||
          contractDigest(ready.candidate) !== contractDigest(current())
        )
          throw new DeliveryRunnerError('git-stage-predecessor-qa-not-current')
        const records = () =>
            ['verification', 'review'].map((kind) =>
              this.store.stage(contractDigest(request), `${kind}:${work.id}`),
            ),
          original = contractDigest(records()),
          candidate = this.candidate(request, work.id, correction)
        recheck.push(() => {
          if (
            contractDigest(current()) !== contractDigest(ready.candidate) ||
            contractDigest(records()) !== original
          )
            throw new DeliveryRunnerError('git-stage-predecessor-qa-changed')
        })
        parts.push({
          work: work.id,
          repository: candidate.allocation.repository.repository,
          path: candidate.allocation.repository.path,
          ref: `refs/heads/${candidate.allocation.repository.branch}`,
          head: candidate.receipt.head,
        })
      } else {
        const reviewed = this.store.stage(contractDigest(request), `review:${work.id}`),
          allocation = this.workspace(request, work.id),
          binding = this.unitBinding(request, 'commit', work.id),
          committed = this.commits.inspect(binding.resource)
        if (
          reviewed?.status !== 'passed' ||
          committed.status !== 'committed' ||
          !committed.current ||
          !committed.receipt ||
          committed.record.request.workspace !== allocation.digest
        )
          throw new DeliveryRunnerError('git-stage-unreviewed-predecessor')
        parts.push({
          work: work.id,
          repository: allocation.repository.repository,
          path: allocation.repository.path,
          ref: `refs/heads/${allocation.repository.branch}`,
          head: committed.receipt.head,
        })
      }
    }
    // Later readers await original metadata. Recheck every earlier selected
    // predecessor after those awaits before preparing any downstream resource.
    for (const check of recheck) check()
    return parts
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const request = contractDigest(context.request),
      record = this.store.stage(request, context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('git-stage-not-dispatched')
    const pinned = this.context(context.request, record)
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      context.signal.aborted ||
      !Number.isFinite(Date.parse(context.deadline)) ||
      Date.parse(context.deadline) <= Date.now() ||
      !context.current() ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('git-stage-not-current')
    // A retained binding belongs to an already issued stage. Observe it; never
    // interpret a missing reply as permission for another domain invocation.
    if (this.read(context.request, record)) return this.inspect(context.request, record)
    let registered = record.runtime !== undefined
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
    const workspaces = new DeliveryWorkspaces(this.store.files.root, undefined, control),
      commits = new DeliveryCommits(this.store.files.root, control),
      unit = pinned.stage.unit as string,
      binding: RunnerGitBinding = {
        schema: 'wholeloop/delivery-runner-git-binding@1',
        request,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        unit,
        kind: pinned.stage.kind as RunnerGitBinding['kind'],
        resource: '',
      }
    if (binding.kind === 'workspace') {
      const parts = await this.parts(context.request, pinned.plan, unit)
      if (
        context.signal.aborted ||
        Date.parse(context.deadline) <= Date.now() ||
        !context.current() ||
        this.store.stage(request, record.id)?.invocation !== context.invocation ||
        !['prepared', 'running'].includes(this.store.stage(request, record.id)?.status ?? '')
      )
        throw new DeliveryRunnerError('git-stage-not-current')
      const allocation = workspaces.prepare({
        schema: 'wholeloop/delivery-workspace-request@1',
        run: context.request.run,
        revision: pinned.plan.revision,
        plan: record.basis,
        unit,
        key: `runner-${contractDigest({ request, plan: record.basis, unit }).slice(0, 25)}`,
        parts,
        ...this.seed(context.request, pinned.plan, unit),
      })
      binding.resource = allocation.digest
      this.write(binding)
      await workspaces.execute(binding.resource)
    } else {
      const allocation = this.workspace(context.request, unit),
        current = workspaces.inspect(allocation.digest),
        commit = commits.prepare({
          schema: 'wholeloop/delivery-commit-request@1',
          workspace: allocation.digest,
          key: `runner-${record.invocation.slice(0, 25)}`,
          head: current.head,
          snapshot: current.snapshot,
          message: MESSAGE,
        })
      binding.resource = commit.digest
      this.write(binding)
      await commits.execute(binding.resource)
    }
    return this.inspect(context.request, this.store.stage(request, record.id) ?? record)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    this.context(request, record)
    const binding = this.read(request, record)
    let effects: EffectRecord[] = [],
      ready = false,
      failed = false,
      observed: unknown = { binding: 'not-published' }
    if (binding?.kind === 'workspace') {
      const status = await this.workspaces.reconcile(binding.resource),
        allocation = this.workspaces.allocation(binding.resource)
      if (
        allocation.request.run !== request.run ||
        allocation.request.plan !== record.basis ||
        allocation.request.unit !== binding.unit ||
        allocation.grant !== request.grant
      )
        throw new DeliveryRunnerError('git-stage-workspace-binding')
      effects = this.workspaces.effects
        .inspect(request.run)
        .filter((effect) => status.effects.includes(effect.intent.id))
      ready = !!status.head && !!status.snapshot
      failed = status.status === 'failed'
      observed = status
    } else if (binding) {
      const status = await this.commits.reconcile(binding.resource),
        allocation = this.workspace(request, binding.unit)
      if (status.record.request.workspace !== allocation.digest)
        throw new DeliveryRunnerError('git-stage-commit-binding')
      effects = this.commits.effects
        .inspect(request.run)
        .filter((effect) =>
          ['stage', 'commit'].some(
            (step) => effect.intent.key === `candidate-${binding.resource}-${step}`,
          ),
        )
      ready = status.status === 'committed' && status.current
      failed = status.status === 'failed'
      observed = status
    }
    const issued = effects.filter((effect) => effect.invocation),
      closed = issued.every((effect) => effect.observations.at(-1)?.invocationState === 'stopped'),
      proven =
        effects.length > 0 &&
        effects.every(
          (effect) =>
            effect.status === 'applied' &&
            effect.admission?.provenance === 'host-observed' &&
            effect.observations.at(-1)?.provenance === 'host-observed',
        ),
      passed = ready && closed && proven,
      status = !binding
        ? 'unknown'
        : passed
          ? 'passed'
          : !issued.length
            ? 'not-started'
            : failed && closed
              ? 'failed'
              : 'unknown'
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState: !binding
        ? 'unknown'
        : !issued.length
          ? 'not-started'
          : closed
            ? 'stopped'
            : 'unknown',
      evidence: contractDigest({ binding: binding ?? null, observed, effects }),
      provenance: 'host-observed',
      reason: passed
        ? 'The exact original owned Git stage is applied and positively closed; QA and endpoint authority remain separate.'
        : 'Retain the original stage and domain effects; no replay, QA or endpoint completion is inferred.',
    }
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    if (signal.aborted) return
    const binding = this.read(request, record, false)
    if (binding?.kind === 'workspace') this.workspaces.requestCancellation(binding.resource)
    else if (binding?.kind === 'commit') this.commits.requestCancellation(binding.resource)
  }
}
