import { createHash } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import {
  DOCKER_HELPER_CPUS,
  DOCKER_HELPER_MEMORY_MIB,
  DOCKER_REFERENCE_HELPER,
  dockerImage,
} from '../environment/docker-policy.js'
import type { EnvironmentCommand } from '../environment/recipe.js'
import { type AcceptanceCase, AcceptanceError, acceptanceShape } from './contracts.js'
import { type CollectedDockerObservation, DockerObservedHost } from './docker-effect.js'
import type { DockerBehaviorRuntime } from './docker-runtime.js'
import { observeMutation } from './mutation.js'
import { privateBaseline, privateExecutionIdentity } from './private-identity.js'
import { privateCaseReference } from './private-input.js'
import { PrivateAcceptance } from './private-plan.js'
import { PRIVATE_SEED_PROGRAM, privateSeedInput } from './private-seed.js'
import observationSchema from './schemas/private-observation-v1.json' with { type: 'json' }
import type { AcceptanceHost } from './store.js'

declare const __WL_PRIVATE_EVALUATOR__: string

export function privateEvaluatorSource() {
  if (typeof __WL_PRIVATE_EVALUATOR__ !== 'string' || !__WL_PRIVATE_EVALUATOR__)
    throw new AcceptanceError('private-evaluator-build-unavailable')
  return __WL_PRIVATE_EVALUATOR__
}
/** The private volume is never an application workspace or a caller-supplied host mount. */
export class DockerPrivateHost extends DockerObservedHost {
  readonly id = 'docker-private-http'
  constructor(...args: ConstructorParameters<typeof DockerObservedHost>) {
    super(...args)
    new PrivateAcceptance(this.acceptance).forCase(this.digest, this.test)
  }
  protected async observe(
    test: AcceptanceCase,
    context: Parameters<AcceptanceHost['execute']>[1],
    runtime: DockerBehaviorRuntime,
  ): Promise<CollectedDockerObservation> {
    const manifest = new PrivateAcceptance(this.acceptance).forCase(this.digest, test)
    if (
      privateCaseReference(test) !== manifest.digest ||
      runtime.recipe.network.runtime !== 'internal'
    )
      throw new AcceptanceError('private-boundary-unavailable')
    const input = manifest.plan.behavior,
      service = runtime.service(input.service)
    await runtime.origin(input.service, input.port)
    const app = await runtime.resources.owned(service.resource),
      record = runtime.records.get(runtime.environment).record
    const network = record.resources.find((r) => r.kind === 'network' && r.purpose === 'network')
    if (!network?.id || record.helperImage !== DOCKER_REFERENCE_HELPER)
      throw new AcceptanceError('private-network-unavailable')
    await runtime.resources.owned(network)
    const selected = (
      app.NetworkSettings as { Networks: Record<string, { NetworkID: string; IPAddress: string }> }
    ).Networks[network.name]
    if (selected?.NetworkID !== network.id || !selected.IPAddress)
      throw new AcceptanceError('private-app-address-unavailable')
    const baseline = privateBaseline(
      record,
      runtime.recipe,
      this.acceptance.planning.getPlan(manifest.plan.run, manifest.plan.revision).plan,
    )
    const executionIdentity = privateExecutionIdentity(runtime.recipe)
    const image = await dockerImage(
      runtime.driver,
      DOCKER_REFERENCE_HELPER,
      runtime.recipe.backend.architecture,
    )
    if (!image) throw new AcceptanceError('private-evaluator-image-unavailable')
    const script = privateEvaluatorSource(),
      runner = createHash('sha256').update(script).digest('hex')
    const body = JSON.stringify(manifest.plan),
      cases = createHash('sha256').update(body).digest('hex')
    const slot = `private-${contractDigest(context.invocation).slice(0, 20)}`
    const volume = await runtime.resources.volume(slot, 'input')
    if (!volume.id) throw new AcceptanceError('private-volume-unobserved')
    for (const resource of runtime.records
      .get(runtime.environment)
      .record.resources.filter(
        (r) => r.kind === 'container' && ['service', 'test', 'setup'].includes(r.purpose),
      )) {
      const existing = await runtime.resources.owned(resource)
      if ((existing.Mounts as { Name?: string }[]).some((mount) => mount.Name === volume.id))
        throw new AcceptanceError('private-input-exposed-to-application')
    }
    const initializer = await runtime.resources.container(`${slot}-seed`, 'seed', {
      image,
      command: {
        argv: ['node', '-e', PRIVATE_SEED_PROGRAM],
        cwd: '/tmp',
        origin: { kind: 'recipe' },
      },
      mounts: [{ source: volume.id, target: '/private', write: true }],
      network: 'none',
      ports: [],
      user: '0:0',
      memoryMiB: DOCKER_HELPER_MEMORY_MIB,
      cpus: DOCKER_HELPER_CPUS,
      interactive: true,
    })
    const seeded = await runtime.resources.job(
      initializer,
      privateSeedInput(body, script),
      runtime.remaining(30000),
    )
    const copied = JSON.parse(seeded.stdout) as {
      initialized: boolean
      cases: string
      runner: string
    }
    if (copied.initialized !== true || copied.cases !== cases || copied.runner !== runner)
      throw new AcceptanceError('private-input-copy-unobserved')
    const mutation = await observeMutation(runtime, manifest.plan.sensitivity.mutation)
    const command: EnvironmentCommand = {
      argv: ['node', '/private/runner.mjs'],
      cwd: '/tmp',
      origin: { kind: 'recipe' },
    }
    const job = await runtime.resources.container(
      `${slot}-verify`,
      'test',
      {
        image,
        command,
        mounts: [{ source: volume.id, target: '/private', write: false }],
        network: network.name,
        ports: [],
        user: '65532:65532',
        memoryMiB: service.service.memoryMiB,
        cpus: DOCKER_HELPER_CPUS,
        interactive: true,
      },
      input.service,
    )
    const result = await runtime.observeJob(
      job,
      command,
      image.ref,
      JSON.stringify({
        schema: 'wholeloop/private-evaluator-bootstrap@1',
        origin: `http://${selected.IPAddress}:${input.port}`,
        definition: manifest.digest,
        runner,
        deadline: context.deadline,
        limit: runtime.recipe.limits.outputBytes,
      }),
      runtime.remaining(120000),
    )
    if (result.application.code !== 0) throw new AcceptanceError('private-evaluation-incomplete')
    const observation = JSON.parse(result.application.stdout) as {
      schema: string
      definition: string
      runner: string
      complete: boolean
      assertions: { id: string; status: 'passed' | 'failed' | 'unavailable'; evidence: string }[]
      requests: { id: string; evidence: string }[]
    }
    acceptanceShape(observation, observationSchema)
    if (
      observation.schema !== 'wholeloop/private-evaluation-observation@1' ||
      !observation.complete ||
      observation.definition !== manifest.digest ||
      observation.runner !== runner ||
      contractDigest(observation.assertions.map((a) => a.id)) !==
        contractDigest(manifest.plan.assertions.map((a) => a.id))
    )
      throw new AcceptanceError('private-observation-binding')
    const passed = observation.assertions.every((a) => a.status === 'passed')
    return {
      observation: {
        private: observation,
        mutation,
        baseline,
        executionIdentity,
        volume: volume.id,
        isolation: 'owned-evaluator-only-volume',
        privacyScope:
          'Owned Docker application containers only; same-user controller filesystem is not a private boundary.',
      },
      execution: result.execution,
      ...(result.process
        ? {
            process: {
              argv: result.process.argv,
              cwd: result.process.cwd,
              pid: result.process.pid,
              startedAt: result.process.startedAt,
              endedAt: result.process.endedAt,
              ...(result.process.code !== null ? { code: result.process.code } : {}),
              ...(result.process.signal ? { signal: result.process.signal } : {}),
            },
          }
        : {}),
      assertions: [
        {
          id: 'private-outcome',
          status: passed
            ? 'passed'
            : observation.assertions.some((a) => a.status === 'unavailable')
              ? 'unavailable'
              : 'failed',
        },
      ],
    }
  }
}
