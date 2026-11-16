// Dispatches each stage to the domain adapter the installed controller registered.
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import type { IntegrationVerificationRequest } from '../integration/verification.js'
import { RunnerAcceptanceDefinitionStages } from './acceptance-definition-stages.js'
import { RunnerAcceptanceStages } from './acceptance-stages.js'
import { RunnerBuilderPlanningStages } from './builder-planning-stages.js'
import { RunnerCorrectionStages } from './correction-stages.js'
import { RunnerDefinitionStages } from './definition-stages.js'
import type { DeliveryRunnerHost, RunnerStageContext } from './engine.js'
import { stopRunEnvironments } from './environment-release.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerHandoffStages } from './handoff-stages.js'
import { RunnerIntegrationStages } from './integration-stages.js'
import { RunnerCiStages, RunnerMergeStages } from './merge-stages.js'
import { RunnerObservationStages } from './observation-stages.js'
import { RunnerPlanStages } from './plan-stages.js'
import { RunnerProductEnvironments } from './product-environments.js'
import { RunnerPublicationStages } from './publication-stages.js'
import { RunnerResearchStages } from './research-stages.js'
import { RunnerReviewStages } from './review-stages.js'
import { DeliveryRunnerError, type RunnerStage, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'
import { RunnerVerificationStages } from './verification-stages.js'
import { RunnerWorkerStages } from './worker-stages.js'

export interface RunnerStageAdapters {
  definition: RunnerDefinitionStages
  plan: RunnerPlanStages
  'acceptance-definition': RunnerAcceptanceDefinitionStages
  git: RunnerGitStages
  'build-plan': RunnerBuilderPlanningStages
  implementation: RunnerWorkerStages
  correction: RunnerCorrectionStages
  verification: RunnerVerificationStages
  review: RunnerReviewStages
  integration: RunnerIntegrationStages
  acceptance: RunnerAcceptanceStages
  handoff: RunnerHandoffStages
  research: RunnerResearchStages
  observation: RunnerObservationStages
  publication: RunnerPublicationStages
  ci: RunnerCiStages
  merge: RunnerMergeStages
}
const CLASSES = {
  definition: RunnerDefinitionStages,
  plan: RunnerPlanStages,
  'acceptance-definition': RunnerAcceptanceDefinitionStages,
  git: RunnerGitStages,
  'build-plan': RunnerBuilderPlanningStages,
  implementation: RunnerWorkerStages,
  correction: RunnerCorrectionStages,
  verification: RunnerVerificationStages,
  review: RunnerReviewStages,
  integration: RunnerIntegrationStages,
  acceptance: RunnerAcceptanceStages,
  handoff: RunnerHandoffStages,
  research: RunnerResearchStages,
  observation: RunnerObservationStages,
  publication: RunnerPublicationStages,
  ci: RunnerCiStages,
  merge: RunnerMergeStages,
} as const

/** Installed controller code registers domain adapters; source text never supplies a host. */
export class RunnerStageDispatcher implements DeliveryRunnerHost {
  private readonly adapters: Readonly<Partial<RunnerStageAdapters>>
  readonly identity: RunnerRequest['host']
  constructor(
    readonly store: RunnerStore,
    identity: RunnerRequest['host'],
    adapters: Partial<RunnerStageAdapters>,
    private readonly products?: RunnerProductEnvironments,
  ) {
    this.identity = Object.freeze(structuredClone(identity))
    for (const [key, adapter] of Object.entries(adapters)) {
      const Type = CLASSES[key as keyof typeof CLASSES]
      if (
        !Object.hasOwn(CLASSES, key) ||
        !Type ||
        !(adapter instanceof Type) ||
        adapter.store.files.root !== store.files.root
      )
        throw new DeliveryRunnerError('dispatcher-fixed-domain-adapter-required')
    }
    this.adapters = Object.freeze({ ...adapters })
    if (
      products &&
      (!(products instanceof RunnerProductEnvironments) ||
        products.store.files.root !== store.files.root ||
        !(this.adapters.integration instanceof RunnerIntegrationStages) ||
        products.readiness !== this.adapters.integration.readiness)
    )
      throw new DeliveryRunnerError('dispatcher-fixed-product-environments-required')
  }
  private adapter(stage: Pick<RunnerStage, 'kind' | 'unit'>, plan: Readonly<DeliveryPlan>) {
    if (stage.kind === 'workspace' || stage.kind === 'commit') return this.adapters.git
    // A unit's research claim is worker production like implementation. The
    // report-level research route, including its local report handoff, belongs
    // to the research host.
    if (stage.kind === 'research')
      return stage.unit ? this.adapters.implementation : this.adapters.research
    if (stage.kind === 'handoff' && plan.policy.endpoint === 'research-report')
      return this.adapters.research
    // A to-pr handoff closes the publication; a to-merge handoff closes the merge (ADR-0199).
    if (stage.kind === 'handoff' && plan.policy.endpoint === 'to-pr')
      return this.adapters.publication
    if (stage.kind === 'handoff' && plan.policy.endpoint === 'to-merge') return this.adapters.merge
    if (stage.kind === 'publication') return this.adapters.publication
    // ADR-0208: a continuation route needs the fixed correction producer; without
    // one registered, static preflight reports the route unsupported.
    if (stage.kind === 'correction') return this.adapters.correction
    // ADR-0201: the observation host owns the observation and its recommendation handoff.
    if (
      stage.kind === 'observation' ||
      (stage.kind === 'handoff' && plan.policy.endpoint === 'learning-observation')
    )
      return this.adapters.observation
    return this.adapters[stage.kind]
  }
  /** Registration coverage is not native/runtime availability or complete-route acceptance. */
  coverage(plan: DeliveryPlan) {
    const unsupported = runnerRoute(plan)
      .filter((stage) => !this.adapter(stage, plan))
      .map((stage) => stage.id)
    return { complete: unsupported.length === 0, unsupported }
  }
  /** Static route support only; runtime failures remain observed per stage, never assumed. */
  async preflight(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    stages: readonly RunnerStage[],
    signal: AbortSignal,
  ) {
    if (signal.aborted) throw new DeliveryRunnerError('dispatcher-preflight-cancelled')
    const unavailable = (reason: string) => ({
      available: false,
      interactive: 'unverified' as const,
      humanRequired: false,
      reason,
    })
    let route: RunnerStage[]
    try {
      route = runnerRoute(plan as DeliveryPlan)
      if (
        contractDigest(request.host) !== contractDigest(this.identity) ||
        this.store.basis(request).digest !== contractDigest(plan) ||
        contractDigest(stages) !== contractDigest(route)
      )
        throw new DeliveryRunnerError('dispatcher-preflight-original-route')
    } catch {
      return unavailable('dispatcher-preflight-original-route')
    }
    if (route.some((stage) => stage.kind === 'research' && !stage.unit) && !this.adapters.research)
      return unavailable('dispatcher-research-host-required')
    if (route.some((stage) => stage.kind === 'observation') && !this.adapters.observation)
      return unavailable('dispatcher-observation-host-required')
    // Integration assembles only code-bearing work; research claims are not
    // milestone evidence until integration can carry non-code results.
    if (
      route.some(
        (stage) =>
          stage.kind === 'integration' &&
          plan.milestones
            .find((milestone) => milestone.id === stage.milestone)
            ?.work.some((id) => plan.work.find((work) => work.id === id)?.role === 'research'),
      )
    )
      return unavailable('dispatcher-research-milestone-unsupported')
    // A merge also needs the installed runtime allowance, separate from plan and grant.
    if (plan.policy.endpoint === 'to-merge' && !this.adapters.merge?.options.runtime.allowsMerge)
      return unavailable('dispatcher-merge-runtime-denied')
    if (
      plan.schema === 'wholeloop/delivery-plan@2' &&
      !this.adapters.correction?.configured(request, plan)
    )
      return unavailable('dispatcher-ci-correction-host-required')
    // The engine cannot supply a caller selection, so each milestone needs its fixed input.
    if (
      route.some(
        (stage) =>
          stage.kind === 'integration' &&
          !(stage.milestone && this.products?.configured(stage.milestone)),
      )
    )
      return unavailable('dispatcher-product-configuration-required')
    if (!this.coverage(plan as DeliveryPlan).complete)
      return unavailable('dispatcher-unsupported-stage')
    if (signal.aborted) throw new DeliveryRunnerError('dispatcher-preflight-cancelled')
    // People decide through recorded human decisions, never an interactive prompt.
    // Supervised definition approvals have no recorded-decision composition yet.
    if (plan.policy.intervention !== 'none')
      return route.some((stage) => stage.kind === 'observation')
        ? // A learning outcome has no recorded-human composition here; people use decide-next.
          unavailable('dispatcher-supervised-observation-unavailable')
        : route.some((stage) => stage.kind === 'research' && !stage.unit)
          ? // Report research has no recorded-human source decision; it stays unattended-only.
            unavailable('dispatcher-supervised-research-unavailable')
          : route.some((stage) => stage.kind === 'definition')
            ? unavailable('dispatcher-supervised-definition-unavailable')
            : // Envelope effects accept derived plans only through machine decisions.
              this.store.lifecycle.authority.inspect(request.grant).grant.basis.kind !== 'plan'
              ? unavailable('dispatcher-supervised-envelope-unavailable')
              : route.some(
                    (stage) =>
                      (stage.kind === 'plan' && !this.adapters.plan?.options.humans) ||
                      (stage.kind === 'build-plan' &&
                        !this.adapters['build-plan']?.options.humans) ||
                      (stage.kind === 'acceptance' && !this.adapters.acceptance?.options.humans),
                  )
                ? unavailable('dispatcher-human-decisions-required')
                : {
                    available: true,
                    interactive: 'disabled' as const,
                    humanRequired: true,
                    reason: 'dispatcher-recorded-human-decisions',
                  }
    return {
      available: true,
      interactive: 'disabled' as const,
      humanRequired: false,
      reason: 'dispatcher-static-route-supported',
    }
  }
  private original(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      retained = this.store
        .record(digest)
        .stages.find((stage) => stage.id === record.id && stage.invocation === record.invocation),
      revision = this.store.lifecycle.journal
        .get(request.run)
        .plans.find((plan) => plan.digest === record.basis)?.revision
    if (
      !retained ||
      retained.basis !== record.basis ||
      !revision ||
      contractDigest(actual) !== digest ||
      contractDigest(request.host) !== contractDigest(this.identity)
    )
      throw new DeliveryRunnerError('dispatcher-original-stage-required')
    const basis = this.store.planning.getPlan(request.run, revision),
      stage = runnerRoute(basis.plan).find((stage) => stage.id === record.id),
      adapter = stage && this.adapter(stage, basis.plan)
    if (basis.digest !== record.basis || !stage || !adapter)
      throw new DeliveryRunnerError('dispatcher-unsupported-stage')
    return { stage, adapter }
  }
  async execute(
    input: RunnerStageContext,
    product?: { selection: IntegrationVerificationRequest; driver?: DockerTransport },
  ) {
    const context = Object.freeze({
        ...input,
        request: structuredClone(input.request),
        plan: structuredClone(input.plan),
        stage: structuredClone(input.stage),
        current: input.current.bind(input),
        started: input.started.bind(input),
      }),
      record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('dispatcher-stage-not-dispatched')
    const { stage, adapter } = this.original(context.request, record)
    if (
      context.signal.aborted ||
      !context.current() ||
      !Number.isFinite(Date.parse(context.deadline)) ||
      new Date(context.deadline).toISOString() !== context.deadline ||
      Date.now() >= Date.parse(context.deadline) ||
      contractDigest(context.plan) !== record.basis ||
      this.store.basis(context.request).digest !== record.basis ||
      contractDigest(context.stage) !== contractDigest(stage) ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('dispatcher-stage-not-current')
    if (adapter instanceof RunnerIntegrationStages) {
      if (this.products) {
        if (product) throw new DeliveryRunnerError('dispatcher-product-selection-conflict')
        const selection = await this.products.prepare(context)
        return adapter.execute(context, selection, this.products.driver)
      }
      if (!product) throw new DeliveryRunnerError('dispatcher-product-selection-required')
      return adapter.execute(context, structuredClone(product.selection), product.driver)
    }
    if (product) throw new DeliveryRunnerError('dispatcher-unexpected-product-selection')
    return adapter.execute(context)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    if (signal.aborted) throw new DeliveryRunnerError('dispatcher-observation-cancelled')
    const { adapter } = this.original(request, record),
      observed = await adapter.inspect(request, record)
    if (signal.aborted) throw new DeliveryRunnerError('dispatcher-observation-cancelled')
    return observed
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    // Resolve the original revision without requiring current dispatch authority.
    // Each fixed adapter retains its own nonce-bound cancellation semantics.
    const { adapter } = this.original(request, record)
    if (adapter instanceof RunnerIntegrationStages && !signal.aborted)
      this.products?.stop(request, record)
    await adapter.stop(request, record, signal)
  }
  /**
   * ADR-0248: stop the environments a failed request left running before its
   * unattended continuation. The product environments' driver is the one that
   * created them; a host composed without product environments uses the local daemon.
   */
  async release(request: Readonly<RunnerRequest>, signal?: AbortSignal) {
    if (signal?.aborted) return false
    return stopRunEnvironments(this.store, request, this.products?.driver ?? new DockerCli())
  }
  async endpoint(request: Readonly<RunnerRequest>, plan: DeliveryPlan, signal: AbortSignal) {
    if (contractDigest(request.host) !== contractDigest(this.identity))
      throw new DeliveryRunnerError('dispatcher-local-endpoint-unavailable')
    if (plan.policy.endpoint === 'research-report') {
      if (!this.adapters.research)
        throw new DeliveryRunnerError('dispatcher-research-endpoint-unavailable')
      return this.adapters.research.endpoint(request, plan, signal)
    }
    if (plan.policy.endpoint === 'learning-observation') {
      if (!this.adapters.observation)
        throw new DeliveryRunnerError('dispatcher-observation-endpoint-unavailable')
      return this.adapters.observation.endpoint(request, plan, signal)
    }
    if (plan.policy.endpoint === 'to-pr') {
      if (!this.adapters.publication)
        throw new DeliveryRunnerError('dispatcher-publication-endpoint-unavailable')
      return this.adapters.publication.endpoint(request, plan, signal)
    }
    if (plan.policy.endpoint === 'to-merge') {
      if (!this.adapters.merge)
        throw new DeliveryRunnerError('dispatcher-merge-endpoint-unavailable')
      return this.adapters.merge.endpoint(request, plan, signal)
    }
    if (!this.adapters.handoff)
      throw new DeliveryRunnerError('dispatcher-local-endpoint-unavailable')
    return this.adapters.handoff.endpoint(request, plan, signal)
  }
}
