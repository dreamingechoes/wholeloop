import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import {
  NATIVE_BINDINGS_DEFAULT,
  type NativeBindings,
  nativeBinding,
  validNativeBindings,
} from '../delivery/native-bindings.js'
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

/** The identity binds the exact bindings document; a changed list is a different host. */
export function publicRunnerIdentity(bindings: Readonly<NativeBindings>): RunnerRequest['host'] {
  if (!validNativeBindings(bindings)) throw new DeliveryRunnerError('public-host-bindings')
  return {
    id: PUBLIC_RUNNER_HOST,
    version: VERSION,
    configuration: contractDigest({ schema: 'wholeloop/delivery-public-host@1', bindings }),
  }
}
function path(configuration: string) {
  if (!/^[a-f0-9]{64}$/.test(configuration)) throw new DeliveryRunnerError('public-host-bindings')
  return `delivery/runner-public-hosts/${configuration}.json`
}
/** Content-addressed, so a controller child can read the exact document its identity names. */
export function retainPublicBindings(store: RunnerStore, bindings: Readonly<NativeBindings>) {
  const identity = publicRunnerIdentity(bindings),
    body = `${JSON.stringify(bindings)}\n`
  safeSourceText(body, 65536)
  store.files.locked(() => {
    if (!existsSync(store.files.path(path(identity.configuration))))
      store.files.atomic(path(identity.configuration), body)
  })
  return identity
}
export function retainedPublicBindings(store: RunnerStore, host: RunnerRequest['host']) {
  if (host.id !== PUBLIC_RUNNER_HOST || host.version !== VERSION)
    throw new DeliveryRunnerError('public-host-identity')
  const value: unknown = existsSync(store.files.path(path(host.configuration)))
    ? JSON.parse(readSourceFile(store.files.root, path(host.configuration), 65536))
    : undefined
  if (
    !validNativeBindings(value) ||
    contractDigest(publicRunnerIdentity(value)) !== contractDigest(host)
  )
    throw new DeliveryRunnerError('public-host-bindings')
  return value
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

/**
 * The public host composes only adapters that launch no native client. A bound
 * role is necessary, never sufficient: until a trusted runtime observer exists
 * (P6-27), routes that need native clients stop in preflight before dispatch.
 */
export class RunnerPublicHost implements DeliveryRunnerHost {
  readonly identity: RunnerRequest['host']
  private readonly bindings: Readonly<NativeBindings>
  constructor(
    readonly store: RunnerStore,
    bindings: Readonly<NativeBindings> = NATIVE_BINDINGS_DEFAULT,
  ) {
    this.identity = Object.freeze(publicRunnerIdentity(bindings))
    this.bindings = Object.freeze(structuredClone(bindings))
  }
  // No stage adapter is composed yet: every route reaches a native stage before
  // any other work, and fixed domain adapters would outgrow the bounded core.
  private adapter(): never {
    throw new DeliveryRunnerError('public-host-unsupported-stage')
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
    if (roles.length) return unavailable('public-host-native-runtime-unavailable')
    return unavailable('public-host-unsupported-stage')
  }
  async execute(): Promise<never> {
    return this.adapter()
  }
  async inspect(): Promise<never> {
    return this.adapter()
  }
  async stop(): Promise<never> {
    return this.adapter()
  }
  async endpoint(): Promise<never> {
    throw new DeliveryRunnerError('public-host-endpoint-unavailable')
  }
}
