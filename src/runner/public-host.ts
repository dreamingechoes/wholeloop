// The fixed public runner host, its identity and its retained bindings.
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import {
  NATIVE_BINDINGS_DEFAULT,
  type NativeBindings,
  nativeBinding,
  validNativeBindings,
} from '../delivery/native-bindings.js'
import { type NativeRuntime, validNativeRuntime } from '../delivery/native-runtime.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import type { WorkerRole } from '../delivery/worker-protocol.js'
import { VERSION } from '../version.js'
import type { DeliveryRunnerHost } from './engine.js'
import {
  DeliveryRunnerError,
  type RunnerStage,
  runnerDecisionRequirements,
  runnerRoute,
} from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export const PUBLIC_RUNNER_HOST = 'wholeloop-fixed-dispatch'

/**
 * The identity binds the exact bindings document and, when given, the runtime
 * document naming each client's binary and home (ADR-0205). A changed list or
 * path is a different host; without a runtime the identity is unchanged.
 */
export function publicRunnerIdentity(
  bindings: Readonly<NativeBindings>,
  runtime?: Readonly<NativeRuntime>,
): RunnerRequest['host'] {
  if (!validNativeBindings(bindings)) throw new DeliveryRunnerError('public-host-bindings')
  if (runtime !== undefined && !validNativeRuntime(runtime))
    throw new DeliveryRunnerError('public-host-runtime')
  return {
    id: PUBLIC_RUNNER_HOST,
    version: VERSION,
    configuration: contractDigest({
      schema: 'wholeloop/delivery-public-host@1',
      bindings,
      ...(runtime ? { runtime } : {}),
    }),
  }
}
export interface PublicHostConfiguration {
  bindings: NativeBindings
  runtime?: NativeRuntime
}
function path(configuration: string) {
  if (!/^[a-f0-9]{64}$/.test(configuration)) throw new DeliveryRunnerError('public-host-bindings')
  return `delivery/runner-public-hosts/${configuration}.json`
}
/** Content-addressed, so a controller child can read the exact documents its identity names. */
export function retainPublicBindings(
  store: RunnerStore,
  bindings: Readonly<NativeBindings>,
  runtime?: Readonly<NativeRuntime>,
) {
  const identity = publicRunnerIdentity(bindings, runtime),
    // A bindings-only host keeps its original retained bytes.
    body = `${JSON.stringify(runtime ? { bindings, runtime } : bindings)}\n`
  safeSourceText(body, 65536)
  store.files.locked(() => {
    if (!existsSync(store.files.path(path(identity.configuration))))
      store.files.atomic(path(identity.configuration), body)
  })
  return identity
}
export function retainedPublicBindings(
  store: RunnerStore,
  host: RunnerRequest['host'],
): PublicHostConfiguration {
  if (host.id !== PUBLIC_RUNNER_HOST || host.version !== VERSION)
    throw new DeliveryRunnerError('public-host-identity')
  const value: unknown = existsSync(store.files.path(path(host.configuration)))
    ? JSON.parse(readSourceFile(store.files.root, path(host.configuration), 65536))
    : undefined
  const configuration: PublicHostConfiguration | undefined = validNativeBindings(value)
    ? { bindings: value }
    : typeof value === 'object' &&
        value !== null &&
        Object.keys(value).sort().join(',') === 'bindings,runtime'
      ? (value as PublicHostConfiguration)
      : undefined
  if (
    !configuration ||
    !validNativeBindings(configuration.bindings) ||
    (configuration.runtime !== undefined && !validNativeRuntime(configuration.runtime)) ||
    contractDigest(publicRunnerIdentity(configuration.bindings, configuration.runtime)) !==
      contractDigest(host)
  )
    throw new DeliveryRunnerError('public-host-bindings')
  return configuration
}

/** Roles whose native clients a stage would launch; core, Git and Docker work needs none. */
export function publicNativeRoles(
  plan: Readonly<DeliveryPlan>,
  stages: readonly RunnerStage[],
  basis: 'plan' | 'envelope',
): WorkerRole[] {
  const roles = new Set<WorkerRole>(),
    judged = (stage: RunnerStage) =>
      runnerDecisionRequirements(plan as DeliveryPlan, stage, basis).length > 0
  for (const stage of stages) {
    if (judged(stage)) roles.add('planner').add('challenger')
    if (['definition', 'acceptance-definition', 'build-plan'].includes(stage.kind))
      roles.add('planner')
    if (stage.kind === 'implementation') roles.add('builder')
    if (stage.kind === 'research') roles.add('researcher')
    if (stage.kind === 'verification') roles.add('verifier').add('refuter')
    if (stage.kind === 'review') roles.add('reviewer').add('refuter')
  }
  return [...roles].sort()
}

/** Supplied only by the installed controller bundle; the core composes nothing. */
export type PublicHostComposer = (input: {
  store: RunnerStore
  request: Readonly<RunnerRequest>
  plan: Readonly<DeliveryPlan>
  stages: readonly RunnerStage[]
  configuration: Readonly<Required<PublicHostConfiguration>>
}) => DeliveryRunnerHost | undefined

/**
 * A bound role is necessary, never sufficient. The core composes no adapter,
 * so its routes stop in preflight. The controller bundle passes a composer;
 * with a runtime document it composes the fixed adapters for supported routes,
 * whose native stages still need their own trusted runtime observation.
 */
export class RunnerPublicHost implements DeliveryRunnerHost {
  readonly identity: RunnerRequest['host']
  private readonly bindings: Readonly<NativeBindings>
  private readonly runtime: Readonly<NativeRuntime> | undefined
  private readonly composed = new Map<string, DeliveryRunnerHost | undefined>()
  constructor(
    readonly store: RunnerStore,
    bindings: Readonly<NativeBindings> = NATIVE_BINDINGS_DEFAULT,
    runtime?: Readonly<NativeRuntime>,
    private readonly composer?: PublicHostComposer,
  ) {
    this.identity = Object.freeze(publicRunnerIdentity(bindings, runtime))
    this.bindings = Object.freeze(structuredClone(bindings))
    this.runtime = runtime ? Object.freeze(structuredClone(runtime)) : undefined
  }
  /** One composition per request, from the request's own pinned basis and route. */
  private host(request: Readonly<RunnerRequest>) {
    const key = contractDigest(request)
    if (!this.composed.has(key)) {
      let host: DeliveryRunnerHost | undefined
      if (
        this.composer &&
        this.runtime &&
        contractDigest(request.host) === contractDigest(this.identity)
      ) {
        const plan = this.store.basis(request).plan
        host = this.composer({
          store: this.store,
          request,
          plan,
          stages: runnerRoute(plan),
          configuration: { bindings: this.bindings, runtime: this.runtime },
        })
      }
      this.composed.set(key, host)
    }
    const host = this.composed.get(key)
    if (!host) throw new DeliveryRunnerError('public-host-unsupported-stage')
    return host
  }
  async preflight(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    stages: readonly RunnerStage[],
    signal: AbortSignal,
  ) {
    if (signal.aborted) throw new DeliveryRunnerError('public-host-preflight-cancelled')
    const unavailable = (reason: string) => ({
      available: false,
      interactive: 'unverified' as const,
      humanRequired: false,
      reason,
    })
    let roles: WorkerRole[]
    try {
      if (
        contractDigest(request.host) !== contractDigest(this.identity) ||
        this.store.basis(request).digest !== contractDigest(plan) ||
        contractDigest(stages) !== contractDigest(runnerRoute(plan as DeliveryPlan))
      )
        throw new DeliveryRunnerError('public-host-original-route')
      roles = publicNativeRoles(
        plan,
        stages,
        this.store.lifecycle.authority.inspect(request.grant).grant.basis.kind,
      )
    } catch {
      return unavailable('public-host-original-route')
    }
    const unbound = roles.filter(
      (role) =>
        !this.bindings.bindings.some(
          (binding) =>
            nativeBinding(this.bindings, {
              target: binding.target,
              version: binding.version,
              model: binding.model,
              role,
            }).bound,
        ),
    )
    if (unbound.length) return unavailable('public-host-native-unbound')
    if (!this.composer || !this.runtime)
      return unavailable(
        roles.length ? 'public-host-native-runtime-unavailable' : 'public-host-unsupported-stage',
      )
    let host: DeliveryRunnerHost
    try {
      host = this.host(request)
    } catch {
      return unavailable('public-host-unsupported-stage')
    }
    return host.preflight(request, plan, stages, signal)
  }
  async execute(context: Parameters<DeliveryRunnerHost['execute']>[0]) {
    return this.host(context.request).execute(context)
  }
  async inspect(...input: Parameters<DeliveryRunnerHost['inspect']>) {
    return this.host(input[0]).inspect(...input)
  }
  async stop(...input: Parameters<NonNullable<DeliveryRunnerHost['stop']>>) {
    const host = this.host(input[0])
    if (!host.stop) throw new DeliveryRunnerError('public-host-unsupported-stage')
    return host.stop(...input)
  }
  async endpoint(...input: Parameters<DeliveryRunnerHost['endpoint']>) {
    let host: DeliveryRunnerHost
    try {
      host = this.host(input[0])
    } catch {
      throw new DeliveryRunnerError('public-host-endpoint-unavailable')
    }
    return host.endpoint(...input)
  }
}
