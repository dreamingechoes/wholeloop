// Runner stages that execute pinned acceptance cases against the assembled product.
import { existsSync } from 'node:fs'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../decisions/native-host.js'
import type { DecisionRequest } from '../decisions/store.js'
import { readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import { RunnerDecisionStages } from './decision-stages.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerFeatureReadiness, type RunnerFeatureReadinessResult } from './feature-readiness.js'
import { RunnerHumanDecisions } from './human-decisions.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface RunnerAcceptanceOptions {
  identity: RunnerRequest['host']
  requests(
    context: RunnerStageContext,
    artifact: Readonly<{ ref: string; sha256: string }>,
  ): DecisionRequest[]
  host(process: NativeProcessRunner): NativeDelegatedDecisionHost
  /** Opt-in: permitted intervention waits for recorded human decisions. */
  humans?: RunnerHumanDecisions
}
/** The exact product a person is asked to accept; no artifact or judgment is captured. */
interface AcceptanceHumanBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  deadline: string
  product: RunnerFeatureReadinessResult
}
interface AcceptanceOrigin {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  deadline: string
  product: RunnerFeatureReadinessResult
}
interface AcceptanceBinding extends AcceptanceOrigin {
  artifact: { ref: string; sha256: string }
}

function productIdentity(value: RunnerFeatureReadinessResult) {
  // An evidence field must not conceal substituted product identifiers.
  // Presentation prose can change without changing the original judgment input.
  return contractDigest({
    status: value.status,
    milestone: value.milestone,
    candidate: value.candidate,
    assembly: value.assembly,
    acceptancePlan: value.acceptancePlan,
    report: value.report,
    evidence: value.evidence,
    provenance: value.provenance,
    acceptance: value.acceptance,
  })
}

/** Join actual complete product QA to independent authorized acceptance, never to a human approval. */
export class RunnerAcceptanceStages {
  constructor(
    readonly store: RunnerStore,
    readonly readiness: RunnerFeatureReadiness,
    readonly options: RunnerAcceptanceOptions,
  ) {
    if (
      !(readiness instanceof RunnerFeatureReadiness) ||
      readiness.store.files.root !== store.files.root
    )
      throw new DeliveryRunnerError('acceptance-stage-fixed-product-reader-required')
    if (
      options.humans &&
      (!(options.humans instanceof RunnerHumanDecisions) ||
        options.humans.store.files.root !== store.files.root)
    )
      throw new DeliveryRunnerError('acceptance-stage-human-decisions-store')
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('acceptance-stage-invocation')
    return `delivery/runner-acceptance/${invocation}`
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      basis = this.store.basis(request),
      stage = runnerRoute(basis.plan).find((stage) => stage.id === record.id),
      original = this.store
        .record(digest)
        .stages.find((stage) => stage.id === record.id && stage.invocation === record.invocation),
      grant = this.store.lifecycle.authority.inspect(request.grant)
    if (
      !original ||
      original.basis !== record.basis ||
      record.basis !== basis.digest ||
      stage?.kind !== 'acceptance' ||
      contractDigest(request.host) !== contractDigest(this.options.identity)
    )
      throw new DeliveryRunnerError('acceptance-stage-original-binding')
    const supervised = !!this.options.humans && basis.plan.policy.intervention !== 'none',
      allowed =
        basis.plan.policy.intervention === 'none' &&
        grant.status === 'active' &&
        grant.grant.decisions.includes('acceptance') &&
        grant.grant.policy.delegations.some((entry) => entry.id === 'acceptance')
    return { digest, basis, stage, allowed, supervised }
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.path(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/binding.json`))) return undefined
    const binding = JSON.parse(
        readSourceFile(this.store.files.root, `${base}/binding.json`, 16384),
      ) as AcceptanceBinding,
      { artifact, ...origin } = binding,
      context = this.context(request, record)
    if (
      Object.keys(binding).sort().join(',') !==
        'artifact,at,deadline,invocation,plan,product,request,stage,version' ||
      binding.version !== 1 ||
      binding.request !== context.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !Number.isFinite(Date.parse(binding.at)) ||
      new Date(binding.at).toISOString() !== binding.at ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      binding.at >= binding.deadline ||
      binding.product.status !== 'ready' ||
      binding.product.provenance !== 'host-observed' ||
      !binding.product.report ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(origin) ||
      artifact.ref !== `delivery/artifacts/${request.run}/${artifact.sha256}`
    )
      throw new DeliveryRunnerError('acceptance-stage-input-binding')
    const text = readSourceFile(this.store.files.root, artifact.ref, 256 * 1024),
      input = JSON.parse(text)
    if (
      sourceHash(text) !== artifact.sha256 ||
      input.schema !== 'wholeloop/runner-acceptance-input@1' ||
      Object.keys(input).sort().join(',') !== 'criteria,origin,report,schema' ||
      contractDigest(input.origin) !== contractDigest(origin) ||
      contractDigest(input.criteria) !== contractDigest(context.basis.plan.criteria) ||
      contractDigest(input.report) !==
        contractDigest(
          JSON.parse(
            new DeliveryAcceptance(this.store.files.root).artifacts
              .bytes(request.run, binding.product.report)
              .toString('utf8'),
          ),
        ) ||
      !this.store.budgets
        .inspect(request.run)
        .artifacts.some(
          (entry) =>
            entry.digest === artifact.sha256 &&
            entry.ref === artifact.ref &&
            entry.status === 'observed',
        )
    )
      throw new DeliveryRunnerError('acceptance-stage-original-input-unavailable')
    return binding
  }
  private readHuman(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const path = `${this.path(record.invocation)}/human.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, path, 16384),
    ) as AcceptanceHumanBinding
    if (
      Object.keys(binding).sort().join(',') !==
        'at,deadline,invocation,plan,product,request,stage,version' ||
      binding.version !== 1 ||
      binding.request !== contractDigest(request) ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      binding.product.status !== 'ready' ||
      binding.product.provenance !== 'host-observed' ||
      this.options.humans?.pending(request, record)?.subject !== productIdentity(binding.product)
    )
      throw new DeliveryRunnerError('acceptance-stage-human-binding')
    return binding
  }
  /** Original input identity is separate from the current acceptance verdict. */
  originalInput(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    if (this.context(request, record).supervised) {
      const human = this.readHuman(request, record)
      return human
        ? {
            product: structuredClone(human.product),
            artifact: {
              ref: `delivery/runner-human-decisions/${record.invocation}/request.json`,
              sha256: productIdentity(human.product),
            },
            deadline: human.deadline,
            evidence: contractDigest(human),
          }
        : undefined
    }
    const binding = this.read(request, record)
    if (!binding) return undefined
    return {
      product: structuredClone(binding.product),
      artifact: { ...binding.artifact },
      deadline: binding.deadline,
      evidence: contractDigest(binding),
    }
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
      throw new DeliveryRunnerError('acceptance-stage-not-dispatched')
    const pinned = this.context(context.request, record),
      current = () => {
        if (
          context.signal.aborted ||
          !context.current() ||
          !Number.isFinite(Date.parse(context.deadline)) ||
          new Date(context.deadline).toISOString() !== context.deadline ||
          Date.parse(context.deadline) <= Date.now() ||
          this.store.basis(context.request).digest !== record.basis ||
          (pinned.allowed && !this.context(context.request, record).allowed)
        )
          throw new DeliveryRunnerError('acceptance-stage-not-current')
      }
    current()
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('acceptance-stage-context-binding')
    if (pinned.supervised) {
      const ready = await this.readiness.inspect(context.request)
      current()
      if (ready.status !== 'ready' || ready.provenance !== 'host-observed')
        return this.inspect(context.request, record)
      // Publishing what a person must accept is core metadata work, not a judgment.
      if (!record.runtime)
        context.started({
          backend: 'owned-core',
          instance: record.invocation,
          worker: `pid-${process.pid}`,
        })
      current()
      const started = this.store.stage(digest, record.id) ?? record,
        human: AcceptanceHumanBinding = {
          version: 1,
          request: digest,
          plan: record.basis,
          stage: record.id,
          invocation: record.invocation,
          at: new Date().toISOString(),
          deadline: context.deadline,
          product: ready,
        }
      safeSourceText(JSON.stringify(human), 16384)
      this.store.files.locked(() => {
        const path = `${this.path(record.invocation)}/human.json`
        if (!existsSync(this.store.files.path(path)))
          this.store.files.atomic(path, `${JSON.stringify(human)}\n`)
      })
      const bound = JSON.parse(
        readSourceFile(this.store.files.root, `${this.path(record.invocation)}/human.json`, 16384),
      ) as AcceptanceHumanBinding
      if (productIdentity(bound.product) === productIdentity(ready))
        this.options.humans?.open(context.request, started, productIdentity(ready))
      return this.inspect(context.request, this.store.stage(digest, record.id) ?? record)
    }
    if (!pinned.allowed) return this.inspect(context.request, record)
    const base = this.path(record.invocation),
      original = this.read(context.request, record)
    if (!original && existsSync(this.store.files.path(`${base}/consumed`)))
      return this.inspect(context.request, record)
    if (original && original.deadline !== context.deadline)
      throw new DeliveryRunnerError('acceptance-stage-original-deadline')
    const ready = await this.readiness.inspect(context.request)
    current()
    if (ready.status !== 'ready' || ready.provenance !== 'host-observed')
      return this.inspect(context.request, record)
    if (!original) {
      if (
        new RunnerNativeScope(this.store.files, record.invocation).calls().length ||
        existsSync(
          this.store.files.path(`delivery/runner-decision-claims/${record.invocation}.txt`),
        )
      )
        throw new DeliveryRunnerError('acceptance-stage-foreign-prefix')
      const origin: AcceptanceOrigin = {
          version: 1,
          request: digest,
          plan: record.basis,
          stage: record.id,
          invocation: record.invocation,
          at: new Date().toISOString(),
          deadline: context.deadline,
          product: ready,
        },
        report = JSON.parse(
          new DeliveryAcceptance(this.store.files.root).artifacts
            .bytes(context.request.run, ready.report ?? '')
            .toString('utf8'),
        ),
        body = JSON.stringify({
          schema: 'wholeloop/runner-acceptance-input@1',
          origin,
          criteria: context.plan.criteria,
          report,
        })
      safeSourceText(body, 256 * 1024)
      // Losing the budgeted input must not buy another capture or judgment.
      this.store.files.locked(() => {
        if (existsSync(this.store.files.path(`${base}/consumed`)))
          throw new DeliveryRunnerError('acceptance-stage-input-already-consumed')
        this.store.files.atomic(`${base}/consumed`, `${contractDigest(origin)}\n`)
      })
      current()
      const captured = this.store.budgets.captureArtifact(context.request.run, Buffer.from(body))
      if (!captured.stored) return this.inspect(context.request, record)
      current()
      this.store.files.atomic(
        `${base}/binding.json`,
        JSON.stringify({
          ...origin,
          artifact: { ref: captured.artifact.ref, sha256: captured.artifact.digest },
        }),
      )
    }
    const bound = this.read(context.request, record)
    if (!bound || productIdentity(bound.product) !== productIdentity(ready))
      return this.inspect(context.request, record)
    current()
    if (
      !existsSync(this.store.files.path(`delivery/runner-decision-claims/${record.invocation}.txt`))
    )
      await new RunnerDecisionStages(this.store, this.options.identity, bound.artifact).execute(
        context,
        this.options.requests(context, Object.freeze({ ...bound.artifact })),
        (process) => {
          const host = this.options.host(process)
          if (
            !(host instanceof NativeDelegatedDecisionHost) ||
            host.options.native.process !== process ||
            host.purposes.queue.lifecycle.journal.files.root !== this.store.files.root
          )
            throw new DeliveryRunnerError('acceptance-stage-native-host')
          return host
        },
      )
    return this.inspect(context.request, this.store.stage(digest, record.id) ?? record)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    let status: RunnerStageObservation['status'] = 'unknown',
      provenance: RunnerStageObservation['provenance'] = 'fixture',
      invocationState: RunnerStageObservation['invocationState'] = 'unknown',
      decisions: string[] = []
    const proofs: unknown[] = []
    if (this.context(request, record).supervised) return this.inspectHuman(request, record)
    try {
      const pinned = this.context(request, record),
        binding = this.read(request, record),
        calls = new RunnerNativeScope(this.store.files, record.invocation).inspect()
      if (
        !pinned.allowed ||
        (!binding &&
          !calls.length &&
          !existsSync(this.store.files.path(`${this.path(record.invocation)}/consumed`)))
      )
        status = 'blocked'
      else if (binding) {
        const ready = await this.readiness.inspect(request),
          decision = await new RunnerDecisionStages(
            this.store,
            this.options.identity,
            binding.artifact,
          ).inspect(request, record),
          after = await this.readiness.inspect(request),
          closed = new RunnerNativeScope(this.store.files, record.invocation).inspect()
        proofs.push({ binding, ready, decision, after, closed })
        // A stopped reviewer can still have finished after its parent expired.
        // Only the original within-window outcome can support acceptance. A
        // trusted observer's owned cancellation control is stopped by design
        // (ADR-0207); a cancelled judge still leaves its decision unready.
        const bounded = closed.every((call) => {
          const outcome = JSON.parse(
            readSourceFile(
              this.store.files.root,
              `delivery/runner-native/${call.invocation}/outcome.json`,
              65536,
            ),
          ) as { at: string }
          return (
            call.observed.invocationState === 'stopped' &&
            (call.observed.reason === 'finished'
              ? call.observed.code === 0 && !call.observed.signal
              : call.observed.reason === 'cancelled') &&
            Number.isFinite(Date.parse(outcome.at)) &&
            new Date(outcome.at).toISOString() === outcome.at &&
            outcome.at >= binding.at &&
            outcome.at <= binding.deadline
          )
        })
        if (
          ready.status === 'ready' &&
          ready.provenance === 'host-observed' &&
          productIdentity(ready) === productIdentity(binding.product) &&
          contractDigest(ready) === contractDigest(after) &&
          contractDigest(binding) === contractDigest(this.read(request, record)) &&
          bounded &&
          closed.length >= 2 &&
          this.context(request, record).allowed &&
          contractDigest(calls) === contractDigest(closed)
        ) {
          status =
            decision.status === 'ready' && decision.provenance === 'host-observed'
              ? 'passed'
              : decision.status === 'blocked'
                ? 'blocked'
                : 'unknown'
          provenance = decision.provenance
          decisions = decision.decisions
          invocationState = 'stopped'
        }
      }
      if (status === 'blocked' && !calls.length) invocationState = 'not-started'
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
      provenance,
      invocationState,
      decisions,
      evidence: contractDigest({
        request: contractDigest(request),
        record: { id: record.id, invocation: record.invocation, basis: record.basis },
        status,
        proofs,
      }),
      reason:
        status === 'passed'
          ? 'Complete current whole-product QA and its independent authorized acceptance decision pass; no human approval or publication is inferred.'
          : 'Original product inputs, bounded native acceptance and current independent decisions remain required; no human approval or replay is inferred.',
    }
  }
  /** A person's recorded acceptance of the exact unchanged product, never an inferred one. */
  private async inspectHuman(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    let status: RunnerStageObservation['status'] = 'unknown',
      provenance: RunnerStageObservation['provenance'] = 'fixture',
      invocationState: RunnerStageObservation['invocationState'] = 'unknown'
    const proofs: unknown[] = []
    try {
      const humans = this.options.humans
      if (!humans) throw new DeliveryRunnerError('acceptance-stage-human-decisions-required')
      const opened = humans.pending(request, record)
      if (!opened) {
        status = record.runtime ? 'unknown' : 'blocked'
        invocationState = record.runtime ? 'unknown' : 'not-started'
      } else {
        const decision = humans.decided(request, record),
          ready = await this.readiness.inspect(request),
          after = humans.decided(request, record)
        proofs.push({ opened, decision, ready })
        invocationState = 'stopped'
        provenance = 'host-observed'
        const bound = this.readHuman(request, record),
          current =
            !!bound &&
            ready.status === 'ready' &&
            ready.provenance === 'host-observed' &&
            productIdentity(ready) === opened.subject &&
            contractDigest(decision ?? null) === contractDigest(after ?? null)
        status = !decision
          ? 'pending'
          : decision.outcome === 'reject'
            ? 'blocked'
            : current && record.runtime
              ? 'passed'
              : 'unknown'
        if (status === 'unknown') provenance = 'fixture'
      }
    } catch {
      status = 'unknown'
      provenance = 'fixture'
    }
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      provenance,
      invocationState,
      decisions: [],
      evidence: contractDigest({
        request: contractDigest(request),
        record: { id: record.id, invocation: record.invocation, basis: record.basis },
        status,
        proofs,
      }),
      reason:
        status === 'passed'
          ? 'A person accepted the exact current whole product; publication remains separate.'
          : status === 'pending'
            ? 'A person must accept or reject the exact current whole product.'
            : 'The recorded human decision, its exact product or current QA is unavailable; nothing is inferred.',
    }
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    const original = this.store
      .record(contractDigest(request))
      .stages.find(
        (stage) =>
          stage.id === record.id &&
          stage.invocation === record.invocation &&
          stage.basis === record.basis,
      )
    if (!original || record.id !== 'acceptance')
      throw new DeliveryRunnerError('acceptance-stage-original-cancellation')
    if (!signal.aborted)
      new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
  }
}
