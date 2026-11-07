// Runner stage that pins acceptance tests before builders start, without executing or accepting
// them.
import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { type RunnerArtifactOptions, RunnerArtifactStages } from './artifact-stages.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

/** Pin the tests before builders; this stage never executes or accepts them. */
export class RunnerAcceptanceDefinitionStages {
  readonly artifacts: RunnerArtifactStages
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerArtifactOptions,
  ) {
    this.artifacts = new RunnerArtifactStages(store, options)
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      revision = this.store.lifecycle.journal
        .get(actual.run)
        .plans.find((plan) => plan.digest === record.basis)?.revision,
      prepared = this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(prepared.plan).find((entry) => entry.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find(
          (entry) =>
            entry.id === record.id &&
            entry.invocation === record.invocation &&
            entry.basis === record.basis,
        )
    if (
      !retained ||
      prepared.digest !== record.basis ||
      stage?.kind !== 'acceptance-definition' ||
      contractDigest(request.host) !== contractDigest(this.options.identity)
    )
      throw new DeliveryRunnerError('acceptance-definition-stage-binding')
    return { prepared, stage }
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('acceptance-definition-stage-not-dispatched')
    const pinned = this.context(context.request, record)
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage)
    )
      throw new DeliveryRunnerError('acceptance-definition-context-binding')
    await this.artifacts.execute(context)
    return this.inspect(
      context.request,
      this.store.stage(contractDigest(context.request), record.id) ?? record,
    )
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    const { prepared } = this.context(request, record),
      produced = await this.artifacts.inspect(request, record)
    let status: RunnerStageObservation['status'] =
      produced.status === 'unknown' ? 'unknown' : 'blocked'
    let pinned: string | undefined
    if (
      produced.status === 'ready' &&
      produced.provenance === 'host-observed' &&
      produced.invocationState === 'stopped'
    ) {
      if (!produced.ownedCalls?.length) status = 'unknown'
      else if (
        produced.prepared?.kind === 'acceptance' &&
        produced.prepared.disposition === 'pinned'
      ) {
        const accepted = new DeliveryAcceptance(this.store.files.root).get(produced.prepared.digest)
        if (
          accepted.plan.run !== request.run ||
          accepted.plan.revision !== prepared.plan.revision ||
          accepted.plan.plan !== record.basis ||
          accepted.plan.source !== prepared.plan.source
        )
          throw new DeliveryRunnerError('acceptance-definition-pinned-basis')
        pinned = accepted.digest
        status = 'passed'
      }
    }
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState: produced.invocationState,
      evidence: contractDigest({ produced, pinned: pinned ?? null }),
      provenance: produced.provenance,
      reason:
        status === 'passed'
          ? 'Complete acceptance definitions are pinned before builders; no test execution, product acceptance or human approval is inferred.'
          : 'Retain the original definition producer and ownership; unavailable or fixture evidence cannot authorize builder readiness.',
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
