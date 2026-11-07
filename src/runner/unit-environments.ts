// The committed candidate a unit's verification round runs against.
import { contractDigest } from '../contracts/compatibility.js'
import type { NativeRuntimeRepository } from '../delivery/native-runtime.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import type { EnvironmentProvisionRequest } from '../environment/provision.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerEnvironmentProducer } from './environment-producer.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

/** The committed candidate one verification round runs its suite against. */
export interface RunnerUnitCandidate {
  repository: string
  path: string
  head: string
}

/**
 * Prepares a unit's QA environment inside its own verification invocation
 * (ADR-0207), as ADR-0173 does for product environments. Each round, the
 * original or one correction, has one fixed phase, so a recovered controller
 * reads its original result back instead of provisioning again. The pinned
 * runtime inputs choose the recipe and image; they grant nothing.
 */
export class RunnerUnitEnvironments {
  private readonly inputs: ReadonlyMap<string, Readonly<NativeRuntimeRepository>>
  constructor(
    readonly store: RunnerStore,
    inputs: readonly NativeRuntimeRepository[],
    readonly driver: DockerTransport = new DockerCli(),
  ) {
    this.inputs = new Map(
      inputs.map((entry) => [entry.repository, Object.freeze(structuredClone(entry))]),
    )
  }
  configured(repository: string) {
    return this.inputs.has(repository)
  }
  /** `round` is `original` or the correction receipt digest that produced the head. */
  async prepare(
    context: RunnerStageContext,
    candidate: Readonly<RunnerUnitCandidate>,
    round: string,
  ): Promise<string> {
    const input = this.inputs.get(candidate.repository)
    if (!input) throw new DeliveryRunnerError('unit-environment-input-required')
    if (round !== 'original' && !/^[a-f0-9]{64}$/.test(round))
      throw new DeliveryRunnerError('unit-environment-round')
    const phase = contractDigest({ phase: 'unit-qa-environment', round }),
      provision: EnvironmentProvisionRequest = {
        schema: 'wholeloop/environment-provision-request@1',
        run: context.request.run,
        recipe: input.recipe,
        // Derived from the original invocation and round, never from configuration.
        key: `runner-unit-${contractDigest({ invocation: context.invocation, round }).slice(0, 40)}`,
        helperImage: input.helperImage,
        workspaces: [
          {
            repository: candidate.repository,
            path: candidate.path,
            head: candidate.head,
            snapshot: workspaceSnapshot(candidate.path).digest,
          },
        ],
      },
      produced = await new RunnerEnvironmentProducer(this.store, phase).prepare(
        context,
        provision,
        this.driver,
      )
    if (produced.status !== 'recorded-ready' || !produced.environment)
      throw new DeliveryRunnerError('unit-environment-ready-unavailable')
    // Provisioning leaves the run waiting for its effect. Only this positively
    // observed original result releases it for the suite; ownership and
    // authority are rechecked inside the transaction, so a pause stays a pause.
    this.store.lifecycle.journal.transaction(
      { kind: 'controller', name: 'delivery-runner-unit-environment' },
      (view, append) => {
        if (context.signal.aborted || !context.current())
          throw new DeliveryRunnerError('unit-environment-not-current')
        const state = view().get(context.request.run),
          authority = this.store.lifecycle.authority.inspect(context.request.grant)
        if (authority.status !== 'active' || authority.digest !== state?.grant?.digest)
          throw new DeliveryRunnerError('unit-environment-inactive-authority')
        if (state?.state === 'waiting-external')
          append(context.request.run, {
            schema: 'wholeloop/delivery-control-event@1',
            from: state.state,
            to: 'queued',
            basis: contractDigest(context.plan),
            reason: "The unit's original QA environment is observed ready before its suite.",
          })
      },
    )
    return produced.environment.id
  }
}
