import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import type { DockerTransport } from '../environment/docker-command.js'
import type { IntegrationVerificationRequest } from '../integration/verification.js'
import { RunnerAcceptanceDefinitionStages } from './acceptance-definition-stages.js'
import { RunnerAcceptanceStages } from './acceptance-stages.js'
import { RunnerBuilderPlanningStages } from './builder-planning-stages.js'
import { RunnerDefinitionStages } from './definition-stages.js'
import type { DeliveryRunnerHost, RunnerStageContext } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerHandoffStages } from './handoff-stages.js'
import { RunnerIntegrationStages } from './integration-stages.js'
import { RunnerPlanStages } from './plan-stages.js'
import { RunnerProductEnvironments } from './product-environments.js'
import { RunnerReviewStages } from './review-stages.js'
import {
  DeliveryRunnerError,
  type RunnerStage,
  type RunnerStageKind,
  runnerRoute,
} from './route.js'
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
  verification: RunnerVerificationStages
  review: RunnerReviewStages
  integration: RunnerIntegrationStages
  acceptance: RunnerAcceptanceStages
  handoff: RunnerHandoffStages
}
const CLASSES = {
  definition: RunnerDefinitionStages,
  plan: RunnerPlanStages,
  'acceptance-definition': RunnerAcceptanceDefinitionStages,
  git: RunnerGitStages,
  'build-plan': RunnerBuilderPlanningStages,
  implementation: RunnerWorkerStages,
  verification: RunnerVerificationStages,
  review: RunnerReviewStages,
  integration: RunnerIntegrationStages,
  acceptance: RunnerAcceptanceStages,
  handoff: RunnerHandoffStages,
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
  private adapter(kind: RunnerStageKind) {
    if (kind === 'workspace' || kind === 'commit') return this.adapters.git
    if (kind === 'research' || kind === 'publication') return undefined
    return this.adapters[kind]
  }
  /** Registration coverage is not native/runtime availability or complete-route acceptance. */
  coverage(plan: DeliveryPlan) {
    const unsupported = runnerRoute(plan)
      .filter((stage) => !this.adapter(stage.kind))
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
      return route.some((stage) => stage.kind === 'definition')
        ? unavailable('dispatcher-supervised-definition-unavailable')
        : route.some(
              (stage) =>
                (stage.kind === 'plan' && !this.adapters.plan?.options.humans) ||
                (stage.kind === 'build-plan' && !this.adapters['build-plan']?.options.humans) ||
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
      adapter = stage && this.adapter(stage.kind)
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
  async endpoint(request: Readonly<RunnerRequest>, plan: DeliveryPlan, signal: AbortSignal) {
    if (contractDigest(request.host) !== contractDigest(this.identity) || !this.adapters.handoff)
      throw new DeliveryRunnerError('dispatcher-local-endpoint-unavailable')
    return this.adapters.handoff.endpoint(request, plan, signal)
  }
}
