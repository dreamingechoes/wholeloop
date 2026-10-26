import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../decisions/native-host.js'
import type { DecisionRequest } from '../decisions/store.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import {
  type RunnerArtifactOptions,
  type RunnerArtifactResult,
  RunnerArtifactStages,
} from './artifact-stages.js'
import { RunnerDecisionStages } from './decision-stages.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface RunnerBuilderPlanningOptions {
  production: RunnerArtifactOptions
  decision(context: RunnerStageContext, production: Readonly<RunnerArtifactResult>): DecisionRequest
  host(process: NativeProcessRunner): NativeDelegatedDecisionHost
}

/** An observed proposal needs its own delegated judgment before a builder may run. */
export class RunnerBuilderPlanningStages {
  readonly artifacts: RunnerArtifactStages
  readonly decisions: RunnerDecisionStages
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerBuilderPlanningOptions,
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
      stage?.kind !== 'build-plan' ||
      !stage.unit ||
      contractDigest(request.host) !== contractDigest(this.options.production.identity)
    )
      throw new DeliveryRunnerError('builder-planning-stage-binding')
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
      reason:
        status === 'passed'
          ? 'The exact original builder plan has an independently supported delegated decision; implementation, QA and acceptance remain separate.'
          : 'Retain the original proposal, decision and budgets; no builder launch or human approval is inferred.',
    }
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('builder-planning-stage-not-dispatched')
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
      throw new DeliveryRunnerError('builder-planning-stage-not-current')
    const grant = this.store.lifecycle.authority.inspect(context.request.grant)
    if (
      context.plan.policy.intervention !== 'none' ||
      grant.status !== 'active' ||
      !grant.grant.decisions.includes('approve-build-plan') ||
      !grant.grant.policy.delegations.some((d) => d.id === 'approve-build-plan')
    )
      return this.observation(
        context.request,
        record,
        'blocked',
        'not-started',
        {
          basis: record.basis,
          grant: grant.digest,
          limitation: 'explicit-builder-plan-delegation-required',
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
    const request = this.options.decision(context, produced)
    await this.decisions.execute(context, [request], (process) => {
      const host = this.options.host(process)
      if (
        !(host instanceof NativeDelegatedDecisionHost) ||
        host.options.native.process !== process ||
        host.purposes.queue.lifecycle.journal.files.root !== this.store.files.root
      )
        throw new DeliveryRunnerError('builder-planning-native-host')
      return host
    })
    return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    this.context(request, record)
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
      independent = calls.length >= (produced.ownedCalls?.length ?? 0) + 2,
      status =
        !closed || decision.status === 'unknown'
          ? 'unknown'
          : independent && decision.status === 'ready' && decision.provenance === 'host-observed'
            ? 'passed'
            : 'blocked'
    return this.observation(
      request,
      record,
      status,
      closed ? 'stopped' : 'unknown',
      { produced, decision },
      decision.provenance,
      decision.decisions,
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
