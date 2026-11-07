// Runner stages that dispatch a correction builder with only the retained failure.
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { DeliveryCommits } from '../delivery/commits.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { DeliveryCorrection, DeliveryPlan } from '../delivery/plan.js'
import type { DeliveryQueue, QueueAssignment } from '../delivery/queue.js'
import { DeliveryWorkspaces } from '../delivery/workspaces.js'
import type { AssemblyGitControl } from '../integration/git-process.js'
import {
  CI_CORRECTION_ADMISSION,
  ciCorrectionAdmitted,
  RunnerCiCorrectionAdmission,
} from './ci-correction-admission.js'
import { ciCorrectionFeedback } from './ci-correction-feedback.js'
import type { originalCiFailure } from './ci-failure.js'
import { correctionTask, CORRECTION_MESSAGE as MESSAGE } from './correction-input.js'
import { type CorrectionBinding, correctionProduction } from './correction-production.js'
import { RunnerDecisionStages } from './decision-stages.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerHumanDecisions } from './human-decisions.js'
import { RunnerIntegrationStages } from './integration-stages.js'
import { RunnerNativeScope } from './native-scope.js'
import { RunnerNativeStage } from './native-stage.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'
import { type RunnerWorkerOptions, RunnerWorkerStages } from './worker-stages.js'

/** What the correction builder is told: the retained failure, nothing more. */
export interface RunnerCorrectionFeedback {
  origin: DeliveryCorrection['origin']
  stage: string
  failure: string
  reason: string
  cases: ReturnType<RunnerIntegrationStages['failedCases']>
  ci?: {
    historical: true
    observation: string
    repair: string
    publication: string
    head: string
    failures: ReturnType<typeof originalCiFailure>['failures']
  }
  acceptance?: {
    delegated: ReturnType<RunnerDecisionStages['originalFeedback']>
    person: ReturnType<RunnerHumanDecisions['originalFeedback']> | null
  }
}
/**
 * The `correction-N:<unit>` stage of a continuation (ADR-0208). The unit's
 * builder attempt from this revision is fenced and requeued with a
 * correction task built from the predecessor's retained failure; its result
 * is committed through owned effects in the same seeded workspace, and the
 * unit's candidate then resolves to that commit. It records no QA verdict.
 */
export class RunnerCorrectionStages {
  readonly workers: RunnerWorkerStages
  readonly git: RunnerGitStages
  constructor(
    readonly store: RunnerStore,
    readonly queue: DeliveryQueue,
    readonly options: RunnerWorkerOptions,
    readonly integration?: RunnerIntegrationStages,
    readonly ci?: RunnerCiCorrectionAdmission,
  ) {
    if (
      integration !== undefined &&
      (!(integration instanceof RunnerIntegrationStages) ||
        integration.store.files.root !== store.files.root)
    )
      throw new DeliveryRunnerError('correction-stage-fixed-integration-required')
    if (
      ci !== undefined &&
      (!(ci instanceof RunnerCiCorrectionAdmission) ||
        ci.store.files.root !== store.files.root ||
        contractDigest(ci.options.identity) !== contractDigest(options.identity))
    )
      throw new DeliveryRunnerError('correction-stage-fixed-ci-required')
    this.workers = new RunnerWorkerStages(store, queue, options)
    this.git = new RunnerGitStages(store)
  }
  configured(request: Readonly<RunnerRequest>, plan: Readonly<DeliveryPlan>) {
    return (
      plan.schema === 'wholeloop/delivery-plan@1' || this.ci?.configured(request, plan) === true
    )
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('correction-stage-invocation')
    return `delivery/runner-corrections/${invocation}`
  }
  private context(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    active = true,
  ) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      basis = active
        ? this.store.basis(actual)
        : this.store.planning.getPlan(
            actual.run,
            this.store.lifecycle.journal
              .get(actual.run)
              .plans.find((entry) => entry.digest === record.basis)?.revision ?? 0,
          ),
      retained = this.store
        .record(digest)
        .stages.find(
          (entry) =>
            entry.id === record.id &&
            entry.invocation === record.invocation &&
            entry.basis === record.basis,
        ),
      stage = runnerRoute(basis.plan).find((entry) => entry.id === record.id)
    if (
      !retained ||
      retained.origin ||
      contractDigest(request.host) !== contractDigest(this.options.identity) ||
      record.basis !== basis.digest ||
      stage?.kind !== 'correction' ||
      !stage.unit
    )
      throw new DeliveryRunnerError('correction-stage-binding')
    return { digest, plan: basis.plan, stage, entry: this.entry(basis.plan, record.id, stage.unit) }
  }
  /** `correction-N:<unit>` is the unit's N-th recorded correction, oldest first. */
  private entry(plan: Readonly<DeliveryPlan>, id: string, unit: string) {
    const index = Number(/^correction-([1-9][0-9]*):/.exec(id)?.[1] ?? 0),
      entry = (plan.corrections ?? []).filter((item) => item.unit === unit)[index - 1]
    if (!entry) throw new DeliveryRunnerError('correction-stage-entry')
    return entry
  }
  private feedback(entry: DeliveryCorrection): RunnerCorrectionFeedback {
    if (entry.origin === 'ci') return ciCorrectionFeedback(this.store, entry)
    const record = this.store.stage(entry.request, entry.stage)
    if (
      !record ||
      !['failed', 'blocked'].includes(record.status) ||
      record.evidence !== entry.failure
    )
      throw new DeliveryRunnerError('correction-stage-failure-unavailable')
    // Read original decisions as history: a later grant makes them ineligible
    // for approval, but cannot erase the rejection the builder must address.
    const cases =
        entry.origin === 'integration' && this.integration
          ? this.integration.failedCases(this.store.get(entry.request), record)
          : [],
      request = this.store.get(entry.request),
      acceptance =
        entry.origin === 'acceptance'
          ? {
              delegated: new RunnerDecisionStages(this.store, request.host).originalFeedback(
                request,
                record,
              ),
              person:
                new RunnerHumanDecisions(this.store).originalFeedback(request, record) ?? null,
            }
          : undefined
    return {
      origin: entry.origin,
      stage: entry.stage,
      failure: entry.failure,
      reason: record.reason ?? '',
      cases,
      ...(acceptance && (acceptance.delegated.length || acceptance.person) ? { acceptance } : {}),
    }
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const path = `${this.path(record.invocation)}/binding.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, path, 1024 * 1024),
    ) as CorrectionBinding
    if (
      binding.version !== 1 ||
      binding.request !== contractDigest(request) ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation
    )
      throw new DeliveryRunnerError('correction-stage-original-binding')
    return binding
  }
  private lease(binding: CorrectionBinding) {
    const path = `${this.path(binding.invocation)}/lease.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const lease = JSON.parse(readSourceFile(this.store.files.root, path, 65536)) as QueueAssignment
    if (
      lease.run !== binding.prior.run ||
      lease.queue !== binding.prior.queue ||
      lease.unit !== binding.unit ||
      lease.role !== 'builder' ||
      lease.controller !== binding.controller ||
      contractDigest(this.queue.assigned(lease.run, lease.attempt)) !== contractDigest(lease)
    )
      throw new DeliveryRunnerError('correction-stage-lease-binding')
    return lease
  }
  private commitDigest(invocation: string) {
    const path = `${this.path(invocation)}/commit.txt`
    return existsSync(this.store.files.path(path))
      ? readSourceFile(this.store.files.root, path, 128).trim()
      : undefined
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    if (context.stage.id === CI_CORRECTION_ADMISSION) {
      if (!this.ci) throw new DeliveryRunnerError('correction-stage-fixed-ci-required')
      return this.ci.execute(context)
    }
    ciCorrectionAdmitted(this.store, context.request)
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('correction-stage-not-dispatched')
    const pinned = this.context(context.request, record),
      current = () =>
        !context.signal.aborted &&
        context.current() &&
        Number.isFinite(Date.parse(context.deadline)) &&
        Date.parse(context.deadline) > Date.now()
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      !current() ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('correction-stage-not-current')
    const unit = pinned.stage.unit as string
    let binding = this.read(context.request, record)
    if (!binding) {
      // The unit's own build from this revision is the attempt being corrected.
      const prior = this.workers.productionLease(context.request, unit),
        workspace = this.git.candidate(context.request, unit).allocation.repository.path,
        feedback = this.feedback(pinned.entry)
      binding = {
        version: 1,
        request: pinned.digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        unit,
        deadline: context.deadline,
        controller: `controller-${contractDigest({ invocation: record.invocation, unit }).slice(0, 32)}`,
        workspace,
        prior,
        feedback,
      }
      safeSourceText(JSON.stringify(binding), 1024 * 1024)
      let owned = false
      const intent = binding
      this.store.files.locked(() => {
        const path = `${this.path(record.invocation)}/binding.json`
        if (existsSync(this.store.files.path(path))) return
        this.store.files.atomic(path, `${JSON.stringify(intent)}\n`)
        owned = true
      })
      if (!owned) return this.inspect(context.request, record)
      // Never nest queue transactions in the root lock; intent already fences replay.
      if (!current()) return this.inspect(context.request, record)
      this.queue.fence(prior)
      this.queue.requeue(prior, contractDigest(binding))
      const claim = this.queue.claim(binding.controller, this.options.admit, {
        run: prior.run,
        queue: prior.queue,
        deadline: binding.deadline,
      })
      if (!claim.assignment) return this.inspect(context.request, record)
      const lease = claim.assignment
      this.store.files.atomic(
        `${this.path(record.invocation)}/lease.json`,
        `${JSON.stringify(lease)}\n`,
      )
      const selected = this.options.context(context, workspace)
      if (selected.workspace !== workspace)
        throw new DeliveryRunnerError('correction-stage-workspace')
      await new RunnerNativeStage(this.store, context).run((process) =>
        this.workers.native.run(
          lease,
          { ...selected, task: correctionTask(intent.feedback) },
          {
            ...this.options.native,
            host: this.options.boundary(process, workspace),
            process,
            signal: context.signal,
          },
        ),
      )
    }
    const lease = this.lease(binding),
      retained = lease ? this.workers.native.retained(lease) : undefined
    if (
      !lease ||
      !this.workers.native.completed(lease) ||
      retained?.receipt?.status !== 'succeeded' ||
      !current() ||
      this.commitDigest(record.invocation)
    )
      return this.inspect(context.request, record)
    // The controller, not the builder, commits the correction through owned
    // effects. The stage's native runtime is already registered, so the owned
    // Git process is recovered through its own commit-operation records.
    const control: AssemblyGitControl = {
        deadline: context.deadline,
        signal: context.signal,
        current: context.current,
        started: () => undefined,
      },
      allocation = this.git.workspace(context.request, unit),
      status = new DeliveryWorkspaces(this.store.files.root, undefined, control).inspect(
        allocation.digest,
      ),
      commits = new DeliveryCommits(this.store.files.root, control),
      commit = commits.prepare({
        schema: 'wholeloop/delivery-commit-request@1',
        workspace: allocation.digest,
        key: `correction-${record.invocation.slice(0, 25)}`,
        head: status.head,
        snapshot: status.snapshot,
        message: MESSAGE,
      })
    this.store.files.atomic(`${this.path(record.invocation)}/commit.txt`, `${commit.digest}\n`)
    await commits.execute(commit.digest)
    return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    if (record.id === CI_CORRECTION_ADMISSION) {
      if (!this.ci) throw new DeliveryRunnerError('correction-stage-fixed-ci-required')
      return this.ci.inspect(request, record)
    }
    const digest = contractDigest(request)
    let status: RunnerStageObservation['status'] = 'unknown',
      provenance: RunnerStageObservation['provenance'] = 'fixture',
      evidence: unknown = null
    try {
      this.context(request, record)
      const commit = this.commitDigest(record.invocation)
      if (commit) {
        const proof = correctionProduction(
          this.store,
          request,
          record,
          this.git.workspace(request, this.context(request, record).stage.unit as string).digest,
        )
        status = 'passed'
        provenance = 'host-observed'
        evidence = {
          feedback: contractDigest(proof.binding.feedback),
          receipt: proof.receipt.digest,
        }
      } else {
        const binding = this.read(request, record),
          lease = binding ? this.lease(binding) : undefined,
          retained = lease ? this.workers.native.retained(lease) : undefined
        if (retained?.receipt?.status && retained.receipt.status !== 'succeeded') status = 'blocked'
      }
    } catch {
      status = 'unknown'
    }
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: digest,
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState: status === 'unknown' ? 'unknown' : 'stopped',
      evidence: contractDigest({ record: record.invocation, status, evidence }),
      provenance,
      reason:
        status === 'passed'
          ? 'The owned correction is produced from the retained failure and committed; independent QA remains pending.'
          : 'Retain the original correction intent, lease and commit; no replay or QA verdict is inferred.',
    }
  }
  stop(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>, signal: AbortSignal) {
    if (record.id === CI_CORRECTION_ADMISSION) {
      if (!this.ci) throw new DeliveryRunnerError('correction-stage-fixed-ci-required')
      return this.ci.stop(request, record, signal)
    }
    // Cleanup observes the original private owner, even after execution authority ends.
    this.context(request, record, false)
    if (!signal.aborted)
      new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
  }
}
