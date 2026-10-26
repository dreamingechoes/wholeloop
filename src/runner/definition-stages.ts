import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../decisions/native-host.js'
import type { DecisionRequest } from '../decisions/store.js'
import { readSourceFile, sourceHash } from '../delivery/input.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import {
  type RunnerArtifactOptions,
  type RunnerArtifactResult,
  RunnerArtifactStages,
} from './artifact-stages.js'
import { RunnerDecisionStages } from './decision-stages.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError, runnerDecisionRequirements, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface RunnerDefinitionOptions {
  production: RunnerArtifactOptions
  decisions(
    context: RunnerStageContext,
    production: Readonly<RunnerArtifactResult>,
  ): DecisionRequest[]
  host(process: NativeProcessRunner): NativeDelegatedDecisionHost
}

/** Reserve a derived immutable revision only after its exact definition decisions pass. */
export class RunnerDefinitionStages {
  readonly artifacts: RunnerArtifactStages
  readonly decisions: RunnerDecisionStages
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerDefinitionOptions,
  ) {
    this.artifacts = new RunnerArtifactStages(store, options.production)
    this.decisions = new RunnerDecisionStages(store, options.production.identity)
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      revision = this.store.lifecycle.journal
        .get(actual.run)
        .plans.find((p) => p.digest === record.basis)?.revision,
      prepared = this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(prepared.plan).find((s) => s.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find(
          (s) =>
            s.id === record.id && s.invocation === record.invocation && s.basis === record.basis,
        )
    if (
      !retained ||
      prepared.digest !== record.basis ||
      stage?.kind !== 'definition' ||
      contractDigest(request.host) !== contractDigest(this.options.production.identity)
    )
      throw new DeliveryRunnerError('definition-stage-binding')
    return { digest, prepared, stage }
  }
  private observation(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    status: RunnerStageObservation['status'],
    invocationState: RunnerStageObservation['invocationState'],
    evidence: unknown,
    provenance: RunnerStageObservation['provenance'],
    decisions: string[] = [],
    derivedPlan?: RunnerStageObservation['derivedPlan'],
  ): RunnerStageObservation {
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState,
      evidence: contractDigest(evidence),
      provenance,
      decisions,
      ...(derivedPlan ? { derivedPlan } : {}),
      reason:
        status === 'passed'
          ? 'The exact original definition has independently supported delegated decisions and a pinned derived revision; later planning, implementation and acceptance remain separate.'
          : 'Retain the original proposal, decision and budgets; no builder launch or human approval is inferred.',
    }
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('definition-stage-not-dispatched')
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
      throw new DeliveryRunnerError('definition-stage-not-current')
    const grant = this.store.lifecycle.authority.inspect(context.request.grant),
      required = runnerDecisionRequirements(context.plan, context.stage, grant.grant.basis.kind)
    if (
      context.plan.policy.intervention !== 'none' ||
      grant.status !== 'active' ||
      grant.grant.basis.kind !== 'envelope' ||
      !required.length ||
      required.some(
        (item) =>
          !grant.grant.decisions.includes(item.id) ||
          !grant.grant.policy.delegations.some((d) => d.id === item.id),
      )
    )
      return this.observation(
        context.request,
        record,
        'blocked',
        'not-started',
        {
          basis: record.basis,
          grant: grant.digest,
          limitation: 'explicit-definition-delegation-required',
        },
        'host-observed',
      )
    this.store.decisions.pin(context.request.grant)
    const produced = await this.artifacts.execute(context)
    if (produced.status !== 'ready' || produced.provenance !== 'host-observed')
      return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
    // A consumed decision is observed, never replaced by a newly selected request.
    if (
      existsSync(this.store.files.path(`delivery/runner-decision-claims/${record.invocation}.txt`))
    )
      return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
    if (!this.proposal(produced).definition.ready)
      return this.observation(
        context.request,
        record,
        'blocked',
        'stopped',
        produced,
        produced.provenance,
      )
    const requests = this.options.decisions(context, produced)
    await this.decisions.execute(context, requests, (process) => {
      const host = this.options.host(process)
      if (
        !(host instanceof NativeDelegatedDecisionHost) ||
        host.options.native.process !== process ||
        host.purposes.queue.lifecycle.journal.files.root !== this.store.files.root
      )
        throw new DeliveryRunnerError('definition-native-host')
      return host
    })
    return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
  }
  private proposal(produced: Readonly<RunnerArtifactResult>): DeliveryPlan {
    if (
      !produced.artifact ||
      produced.prepared?.kind !== 'delivery-plan' ||
      produced.prepared.disposition !== 'proposal'
    )
      throw new DeliveryRunnerError('definition-proposal-missing')
    const body = readSourceFile(this.store.files.root, produced.artifact.ref, 256 * 1024)
    if (sourceHash(body) !== produced.artifact.sha256)
      throw new DeliveryRunnerError('definition-proposal-bytes')
    const plan = JSON.parse(body) as DeliveryPlan
    if (
      contractDigest(plan) !== produced.prepared.digest ||
      plan.revision !== produced.prepared.revision
    )
      throw new DeliveryRunnerError('definition-proposal-binding')
    return plan
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    const pinned = this.context(request, record)
    const produced = await this.artifacts.inspect(request, record)
    if (produced.status !== 'ready' || produced.provenance !== 'host-observed')
      return this.observation(
        request,
        record,
        produced.status === 'unknown' ? 'unknown' : 'blocked',
        produced.invocationState,
        produced,
        produced.provenance,
      )
    const decision = await this.decisions.inspect(request, record),
      calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = produced.invocationState === 'stopped' && decision.invocationState === 'stopped',
      required = runnerDecisionRequirements(
        pinned.prepared.plan,
        pinned.stage,
        this.store.lifecycle.authority.inspect(request.grant).grant.basis.kind,
      ),
      independent =
        this.store.lifecycle.authority.inspect(request.grant).grant.basis.kind === 'envelope' &&
        required.length > 0 &&
        calls.length >= (produced.ownedCalls?.length ?? 0) + 2 * required.length,
      status =
        !closed || decision.status === 'unknown'
          ? 'unknown'
          : independent && decision.status === 'ready' && decision.provenance === 'host-observed'
            ? 'passed'
            : 'blocked'
    let derivedPlan: RunnerStageObservation['derivedPlan']
    if (status === 'passed') {
      const proposal = this.proposal(produced)
      if (!proposal.definition.ready)
        return this.observation(
          request,
          record,
          'blocked',
          'stopped',
          { produced, decision },
          decision.provenance,
          decision.decisions,
        )
      // This is the first reservation of the next revision. A refused proposal
      // must leave that immutable slot available for a later correction.
      const prepared = this.store.planning.preparePlan(proposal)
      derivedPlan = { revision: prepared.plan.revision, digest: prepared.digest }
    }
    return this.observation(
      request,
      record,
      status,
      closed ? 'stopped' : 'unknown',
      { produced, decision },
      decision.provenance,
      decision.decisions,
      derivedPlan,
    )
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    this.context(request, record)
    if (!signal.aborted)
      new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
  }
}
