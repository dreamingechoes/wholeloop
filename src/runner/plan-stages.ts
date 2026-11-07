// Runner stages that produce and approve the delivery plan artifacts.
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../decisions/native-host.js'
import type { DecisionRequest } from '../decisions/store.js'
import { readSourceFile, sourceHash } from '../delivery/input.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import { checkPlanEnvelope } from '../delivery/plan.js'
import { RunnerDecisionStages } from './decision-stages.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerHumanDecisions } from './human-decisions.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError, runnerDecisionRequirements, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface RunnerPlanArtifact {
  ref: string
  sha256: string
}
export interface RunnerPlanOptions {
  identity: RunnerRequest['host']
  requests(context: RunnerStageContext, artifact: Readonly<RunnerPlanArtifact>): DecisionRequest[]
  host(process: NativeProcessRunner): NativeDelegatedDecisionHost
  /** Opt-in: permitted intervention waits for recorded human decisions. */
  humans?: RunnerHumanDecisions
}

/** Accept the current pinned plan; producing another revision here would loop forever. */
export class RunnerPlanStages {
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerPlanOptions,
  ) {
    if (
      options.humans &&
      (!(options.humans instanceof RunnerHumanDecisions) ||
        options.humans.store.files.root !== store.files.root)
    )
      throw new DeliveryRunnerError('plan-stage-human-decisions-store')
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
        ),
      grant = this.store.lifecycle.authority.inspect(request.grant)
    if (
      !retained ||
      prepared.digest !== record.basis ||
      stage?.kind !== 'plan' ||
      contractDigest(request.host) !== contractDigest(this.options.identity)
    )
      throw new DeliveryRunnerError('plan-stage-binding')
    if (grant.grant.basis.kind === 'envelope')
      checkPlanEnvelope(
        prepared.plan,
        this.store.planning.getEnvelope(grant.grant.basis.digest).envelope,
      )
    else if (grant.grant.basis.digest !== record.basis)
      throw new DeliveryRunnerError('plan-stage-exact-authority')
    const ref = `delivery/plans/${request.run}/${prepared.plan.revision}.json`,
      artifact = {
        ref,
        sha256: sourceHash(readSourceFile(this.store.files.root, ref, 2 * 1024 * 1024)),
      },
      required = runnerDecisionRequirements(prepared.plan, stage, grant.grant.basis.kind),
      allowed =
        prepared.plan.policy.intervention === 'none' &&
        grant.status === 'active' &&
        required.every(
          (item) =>
            grant.grant.decisions.includes(item.id) &&
            grant.grant.policy.delegations.some((d) => d.id === item.id),
        )
    // Permitted intervention: an exact-plan grant already names these bytes. Effects
    // under an envelope grant accept a derived plan only through current machine
    // decisions, so a person's acceptance there could not authorize later stages.
    const supervised =
      !!this.options.humans &&
      prepared.plan.policy.intervention !== 'none' &&
      grant.status === 'active' &&
      grant.grant.basis.kind === 'plan'
    return { prepared, stage, artifact, required, allowed, grant, supervised }
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('plan-stage-not-dispatched')
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
      throw new DeliveryRunnerError('plan-stage-not-current')
    if (
      (pinned.supervised || (pinned.allowed && !pinned.required.length)) &&
      !record.runtime &&
      !new RunnerNativeScope(this.store.files, record.invocation).calls().length
    ) {
      // This is actual trusted in-process metadata work, not a model or child
      // launch. Its PID is descriptive only and never a cancellation target.
      context.started({
        backend: 'owned-core',
        instance: context.invocation,
        worker: `pid-${process.pid}`,
      })
    }
    if (
      pinned.allowed &&
      pinned.required.length &&
      !existsSync(this.store.files.path(`delivery/runner-decision-claims/${record.invocation}.txt`))
    ) {
      const requests = this.options.requests(context, Object.freeze({ ...pinned.artifact }))
      await new RunnerDecisionStages(this.store, this.options.identity, pinned.artifact).execute(
        context,
        requests,
        (process) => {
          const host = this.options.host(process)
          if (
            !(host instanceof NativeDelegatedDecisionHost) ||
            host.options.native.process !== process ||
            host.purposes.queue.lifecycle.journal.files.root !== this.store.files.root
          )
            throw new DeliveryRunnerError('plan-stage-native-host')
          return host
        },
      )
    }
    return this.inspect(
      context.request,
      this.store.stage(contractDigest(context.request), record.id) ?? record,
    )
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    const pinned = this.context(request, record),
      calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = calls.every((call) =>
        ['stopped', 'not-started'].includes(call.observed.invocationState),
      )
    let status: RunnerStageObservation['status'] = 'blocked',
      decisions: string[] = [],
      evidence: unknown = { artifact: pinned.artifact, grant: pinned.grant.digest },
      provenance: RunnerStageObservation['provenance'] = 'host-observed'
    const owned =
      !calls.length &&
      record.runtime?.backend === 'owned-core' &&
      record.runtime.instance === record.invocation &&
      /^pid-[1-9][0-9]*$/.test(record.runtime.worker)
    if (pinned.supervised && closed) status = owned ? 'passed' : 'unknown'
    else if (pinned.allowed && closed) {
      if (!pinned.required.length) {
        // Exact-plan authorization already names these immutable bytes. A foreign
        // native prefix must not be laundered through that mechanical shortcut.
        status = owned ? 'passed' : 'unknown'
      } else {
        const decision = await new RunnerDecisionStages(
          this.store,
          this.options.identity,
          pinned.artifact,
        ).inspect(request, record)
        decisions = decision.decisions
        evidence = { artifact: pinned.artifact, decision }
        provenance = decision.provenance
        status =
          decision.status === 'unknown'
            ? 'unknown'
            : decision.status === 'ready' &&
                decision.provenance === 'host-observed' &&
                calls.length >= 2 * pinned.required.length
              ? 'passed'
              : 'blocked'
      }
    } else if (!closed) status = 'unknown'
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState: closed
        ? record.runtime || calls.length
          ? 'stopped'
          : 'not-started'
        : 'unknown',
      evidence: contractDigest(evidence),
      provenance,
      decisions,
      reason:
        status === 'passed'
          ? 'The current immutable delivery plan is authorized by its exact grant or required independent decisions; no new revision, implementation or product acceptance is inferred.'
          : 'Retain the exact pinned plan and original decisions; no new revision, human approval or repeated judgment is inferred.',
    }
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
