import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { IntegrationCandidates } from '../integration/store.js'
import { RunnerAcceptanceStages } from './acceptance-stages.js'
import type {
  RunnerEndpointObservation,
  RunnerStageContext,
  RunnerStageObservation,
} from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface AcceptedProduct {
  invocation: string
  record: string
  evidence: string
  decisions: string[]
  /** A recorded human acceptance replaces delegated decisions only where intervention is permitted. */
  human?: string
  input: NonNullable<ReturnType<RunnerAcceptanceStages['originalInput']>>
}
interface HandoffOrigin {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  deadline: string
  runtime: NonNullable<RunnerStageRecord['runtime']>
  acceptance: AcceptedProduct
}
interface HandoffBinding extends HandoffOrigin {
  completedAt: string
  artifact: { ref: string; sha256: string }
}

/** A local endpoint is an observed accepted topic, never a substitute for publication. */
export class RunnerHandoffStages {
  constructor(
    readonly store: RunnerStore,
    readonly acceptance: RunnerAcceptanceStages,
  ) {
    if (
      !(acceptance instanceof RunnerAcceptanceStages) ||
      acceptance.store.files.root !== store.files.root
    )
      throw new DeliveryRunnerError('handoff-stage-fixed-acceptance-required')
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('handoff-stage-invocation')
    return `delivery/runner-handoffs/${invocation}`
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      basis = this.store.basis(request),
      stage = runnerRoute(basis.plan).find((stage) => stage.id === record.id),
      original = this.store
        .record(digest)
        .stages.find((stage) => stage.id === record.id && stage.invocation === record.invocation)
    if (
      !original ||
      original.basis !== record.basis ||
      record.basis !== basis.digest ||
      stage?.kind !== 'handoff'
    )
      throw new DeliveryRunnerError('handoff-stage-original-binding')
    return { digest, basis, stage, original, local: basis.plan.policy.endpoint === 'local-handoff' }
  }
  /** The current accepted product, for any later stage that must not re-judge it. */
  accepted(request: Readonly<RunnerRequest>): Promise<AcceptedProduct> {
    return this.proof(request)
  }
  private async proof(request: Readonly<RunnerRequest>): Promise<AcceptedProduct> {
    const digest = contractDigest(request),
      record = this.store.stage(digest, 'acceptance')
    if (!record || record.basis !== this.store.basis(request).digest || record.status !== 'passed')
      throw new DeliveryRunnerError('handoff-current-acceptance-required')
    const input = this.acceptance.originalInput(request, record)
    if (!input?.product.candidate)
      throw new DeliveryRunnerError('handoff-original-product-required')
    const observed = await this.acceptance.inspect(request, record),
      after = this.acceptance.originalInput(request, record),
      human =
        this.store.basis(request).plan.policy.intervention !== 'none'
          ? this.acceptance.options.humans?.decided(request, record)
          : undefined,
      humanAccepted = human?.outcome === 'accept' && human.subject === input.artifact.sha256
    if (
      observed.status !== 'passed' ||
      observed.invocationState !== 'stopped' ||
      observed.provenance !== 'host-observed' ||
      observed.evidence !== record.evidence ||
      (!observed.decisions?.length && !humanAccepted) ||
      contractDigest(input) !== contractDigest(after) ||
      contractDigest(record) !== contractDigest(this.store.stage(digest, 'acceptance'))
    )
      throw new DeliveryRunnerError('handoff-current-product-proof-unavailable')
    return {
      invocation: record.invocation,
      record: contractDigest(record),
      evidence: observed.evidence,
      decisions: [...(observed.decisions ?? [])],
      ...(humanAccepted ? { human: contractDigest(human) } : {}),
      input,
    }
  }
  private body(origin: HandoffOrigin, plan: DeliveryPlan) {
    const candidate = origin.acceptance.input.product.candidate
    if (!candidate) throw new DeliveryRunnerError('handoff-complete-candidate-required')
    return {
      schema: 'wholeloop/local-handoff-report@1',
      origin,
      source: plan.source,
      outcome: 'code-ready',
      repositories: new IntegrationCandidates(this.store.files.root)
        .get(candidate)
        .candidate.assemblies.map(({ repository, path, ref, head }) => ({
          repository,
          path,
          ref,
          head,
        })),
      humanApproval: 'not-recorded',
      publication: 'not-performed',
    }
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.path(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/binding.json`))) return undefined
    const binding = JSON.parse(
        readSourceFile(this.store.files.root, `${base}/binding.json`, 32768),
      ) as HandoffBinding,
      { artifact, completedAt, ...origin } = binding,
      pinned = this.context(request, record)
    if (
      Object.keys(binding).sort().join(',') !==
        'acceptance,artifact,at,completedAt,deadline,invocation,plan,request,runtime,stage,version' ||
      binding.version !== 1 ||
      binding.request !== pinned.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !pinned.local ||
      [binding.at, binding.deadline, completedAt].some(
        (at) => !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at,
      ) ||
      binding.at > completedAt ||
      completedAt > binding.deadline ||
      binding.at >= binding.deadline ||
      binding.runtime.backend !== 'owned-core' ||
      binding.runtime.instance !== record.invocation ||
      !/^pid-[1-9][0-9]*$/.test(binding.runtime.worker) ||
      contractDigest(binding.runtime) !== contractDigest(pinned.original.runtime) ||
      new RunnerNativeScope(this.store.files, record.invocation).calls().length ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(origin) ||
      artifact.ref !== `delivery/artifacts/${request.run}/${artifact.sha256}`
    )
      throw new DeliveryRunnerError('handoff-stage-original-input-binding')
    const text = readSourceFile(this.store.files.root, artifact.ref, 256 * 1024)
    if (
      sourceHash(text) !== artifact.sha256 ||
      contractDigest(JSON.parse(text)) !== contractDigest(this.body(origin, pinned.basis.plan)) ||
      !this.store.budgets
        .inspect(request.run)
        .artifacts.some(
          (entry) =>
            entry.digest === artifact.sha256 &&
            entry.ref === artifact.ref &&
            entry.status === 'observed',
        )
    )
      throw new DeliveryRunnerError('handoff-stage-original-report-unavailable')
    return binding
  }
  async execute(input: RunnerStageContext): Promise<RunnerStageObservation> {
    const context = Object.freeze({
        ...input,
        request: structuredClone(input.request),
        plan: structuredClone(input.plan),
        stage: structuredClone(input.stage),
      }),
      digest = contractDigest(context.request),
      record = this.store.stage(digest, context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('handoff-stage-not-dispatched')
    const pinned = this.context(context.request, record),
      current = () => {
        if (
          context.signal.aborted ||
          !context.current() ||
          !Number.isFinite(Date.parse(context.deadline)) ||
          new Date(context.deadline).toISOString() !== context.deadline ||
          Date.now() >= Date.parse(context.deadline) ||
          this.store.basis(context.request).digest !== record.basis
        )
          throw new DeliveryRunnerError('handoff-stage-not-current')
      }
    current()
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('handoff-stage-context-binding')
    if (!pinned.local) return this.inspect(context.request, record)
    const base = this.path(record.invocation),
      original = this.read(context.request, record)
    if (original && original.deadline !== context.deadline)
      throw new DeliveryRunnerError('handoff-stage-original-deadline')
    if (
      original ||
      existsSync(this.store.files.path(`${base}/consumed`)) ||
      pinned.original.runtime ||
      new RunnerNativeScope(this.store.files, record.invocation).calls().length
    )
      return this.inspect(context.request, record)
    let acceptance: AcceptedProduct
    try {
      acceptance = await this.proof(context.request)
    } catch {
      current()
      return this.inspect(context.request, record)
    }
    current()
    const runtime = {
        backend: 'owned-core',
        instance: record.invocation,
        worker: `pid-${process.pid}`,
      },
      origin: HandoffOrigin = {
        version: 1,
        request: digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        at: new Date().toISOString(),
        deadline: context.deadline,
        runtime,
        acceptance,
      },
      body = JSON.stringify(this.body(origin, pinned.basis.plan))
    safeSourceText(body, 256 * 1024)
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${base}/consumed`)))
        throw new DeliveryRunnerError('handoff-stage-original-unresolved')
      this.store.files.atomic(`${base}/consumed`, `${contractDigest(origin)}\n`)
    })
    current()
    // This PID describes core metadata work; it is never a cancellation target.
    context.started(runtime)
    current()
    const captured = this.store.budgets.captureArtifact(context.request.run, Buffer.from(body))
    if (!captured.stored)
      return this.inspect(context.request, this.store.stage(digest, record.id) ?? record)
    current()
    this.store.files.atomic(
      `${base}/binding.json`,
      JSON.stringify({
        ...origin,
        completedAt: new Date().toISOString(),
        artifact: { ref: captured.artifact.ref, sha256: captured.artifact.digest },
      }),
    )
    return this.inspect(context.request, this.store.stage(digest, record.id) ?? record)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    let status: RunnerStageObservation['status'] = 'unknown',
      invocationState: RunnerStageObservation['invocationState'] = 'unknown',
      provenance: RunnerStageObservation['provenance'] = 'fixture'
    const proofs: unknown[] = []
    try {
      const pinned = this.context(request, record),
        binding = this.read(request, record)
      if (!pinned.local) status = 'blocked'
      else if (binding) {
        const accepted = await this.proof(request),
          after = this.read(request, record)
        proofs.push({ binding, accepted })
        if (
          contractDigest(binding.acceptance) === contractDigest(accepted) &&
          contractDigest(binding) === contractDigest(after) &&
          this.store.basis(request).digest === record.basis
        ) {
          status = 'passed'
          invocationState = 'stopped'
          provenance = 'host-observed'
        }
      } else if (
        !pinned.original.runtime &&
        !existsSync(this.store.files.path(`${this.path(record.invocation)}/consumed`)) &&
        !new RunnerNativeScope(this.store.files, record.invocation).calls().length
      ) {
        status = 'blocked'
        invocationState = 'not-started'
      }
    } catch {
      status = 'unknown'
    }
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState,
      provenance,
      evidence: contractDigest({
        request: contractDigest(request),
        stage: record.id,
        invocation: record.invocation,
        proofs,
        status,
      }),
      reason:
        status === 'passed'
          ? 'The exact accepted current topics and budgeted local report are ready for handoff; no human approval or publication is inferred.'
          : 'Retain original report, core ownership and current accepted product proof; missing or changed evidence cannot establish a local endpoint.',
    }
  }
  async endpoint(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    signal: AbortSignal,
  ): Promise<RunnerEndpointObservation> {
    const digest = contractDigest(request),
      record = this.store.stage(digest, 'handoff'),
      basis = this.store.basis(request)
    let current = false,
      observed: RunnerStageObservation | undefined
    if (
      !signal.aborted &&
      basis.digest === contractDigest(plan) &&
      basis.plan.policy.endpoint === 'local-handoff' &&
      record?.status === 'passed'
    ) {
      observed = await this.inspect(request, record)
      current =
        !signal.aborted &&
        observed.status === 'passed' &&
        observed.invocationState === 'stopped' &&
        observed.provenance === 'host-observed' &&
        observed.evidence === record.evidence &&
        contractDigest(record) === contractDigest(this.store.stage(digest, 'handoff')) &&
        this.store.basis(request).digest === basis.digest
    }
    return {
      request: digest,
      plan: basis.digest,
      source: basis.plan.source,
      outcome: 'code-ready',
      current,
      evidence: contractDigest({
        request: digest,
        record: record ?? null,
        observed: observed ?? null,
        current,
      }),
      provenance: current ? 'host-observed' : 'fixture',
    }
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    if (
      !this.store
        .record(contractDigest(request))
        .stages.some(
          (stage) =>
            stage.id === record.id &&
            stage.invocation === record.invocation &&
            stage.basis === record.basis,
        ) ||
      record.id !== 'handoff'
    )
      throw new DeliveryRunnerError('handoff-stage-original-cancellation')
    if (!signal.aborted)
      new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
  }
}
