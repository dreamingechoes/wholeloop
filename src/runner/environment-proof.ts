// Reopens an environment's original preparation and ready snapshot without probing it live.
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { EnvironmentOperations } from '../environment/operations.js'
import { EnvironmentResources } from '../environment/runtime.js'
import type { RunnerEnvironmentScope } from './environment-scope.js'
import { DeliveryRunnerError } from './route.js'

export interface PreparedEnvironmentBody {
  version: 1
  origin: NonNullable<ReturnType<RunnerEnvironmentScope['origin']>>
  input: string
  startedAt: string
  completedAt: string
  environment: { id: string; digest: string; sequence: number }
  effect: string
  preflight: string
  owners: string
  native: string
}
const canonical = (at: string) =>
  Number.isFinite(Date.parse(at)) && new Date(at).toISOString() === at

/** Reopen original native outcomes and the applied ready snapshot, never probe live readiness. */
export function originalPreparedEnvironment(
  scope: RunnerEnvironmentScope,
  body: Omit<PreparedEnvironmentBody, 'owners' | 'native'>,
  admission = false,
) {
  const { store } = scope,
    origin = scope.origin(),
    preparation = scope.originalPreparation(),
    closed = scope.inspect()
  if (
    !origin ||
    !preparation ||
    contractDigest(origin) !== contractDigest(body.origin) ||
    body.version !== 1 ||
    body.input !== contractDigest(preparation.input) ||
    !/^[a-f0-9]{64}$/.test(body.preflight) ||
    !/^[a-f0-9]{64}$/.test(body.environment.digest) ||
    !canonical(body.startedAt) ||
    !canonical(body.completedAt) ||
    body.startedAt > body.completedAt ||
    body.completedAt > origin.deadline ||
    origin.environment !== body.environment.id ||
    closed.invocationState !== 'stopped' ||
    closed.provenance !== 'host-observed' ||
    !closed.operations.length ||
    !closed.reads.length
  )
    throw new DeliveryRunnerError('environment-producer-original-owners-required')
  const snapshot = new EnvironmentResources(store.files).snapshot(
      body.environment.id,
      body.environment.digest,
    ),
    runtime = snapshot.record,
    effect = store.recovery.effects.get(runtime.run, body.effect),
    retained = new EnvironmentOperations(store.files, runtime.id, runtime.provenance).list(),
    selected = closed.operations.map((entry) => entry?.operation.id),
    preflight = JSON.parse(
      readSourceFile(
        store.files.root,
        `delivery/environment-preflights/${body.preflight}.json`,
        256 * 1024,
      ),
    )
  if (
    snapshot.sequence !== body.environment.sequence ||
    runtime.state !== 'ready' ||
    runtime.provenance !== 'host-observed' ||
    runtime.effect !== body.effect ||
    runtime.invocation !== effect.invocation ||
    runtime.createdAt < body.startedAt ||
    runtime.createdAt > body.completedAt ||
    runtime.deadline > origin.deadline ||
    effect.status !== 'applied' ||
    effect.intent.key !== `environment-${preparation.input.key}` ||
    effect.intent.operation !== 'workspace.create' ||
    effect.intent.basis !== origin.plan ||
    effect.intent.grant !== preparation.expected.grant ||
    effect.intent.grantDigest !== preparation.expected.grantDigest ||
    effect.intent.inputDigest !==
      contractDigest({
        recipe: runtime.recipe,
        helperImage: runtime.helperImage,
        candidates: runtime.candidates,
      }) ||
    effect.admission?.provenance !== 'host-observed' ||
    effect.admission.evidence !== body.preflight ||
    !effect.observations.some(
      (observed) =>
        observed.binding === effect.digest &&
        observed.status === 'applied' &&
        observed.provenance === 'host-observed' &&
        observed.invocationState === 'stopped' &&
        observed.evidence === snapshot.digest &&
        observed.resource?.revision === snapshot.digest &&
        observed.resource.ref === effect.intent.ref,
    ) ||
    preflight.evidence !== body.preflight ||
    contractDigest({ ...preflight, evidence: null }) !== body.preflight ||
    preflight.available !== true ||
    preflight.provenance !== 'host-observed' ||
    retained.some(
      (entry) => (admission || entry.at < body.completedAt) && !selected.includes(entry.id),
    )
  )
    throw new DeliveryRunnerError('environment-producer-original-ready-required')
  const native: unknown[] = []
  for (const observed of closed.operations) {
    if (observed?.status !== 'stopped')
      throw new DeliveryRunnerError('environment-producer-original-operation-required')
    const { operation } = observed,
      directory = `delivery/environment-operations/${runtime.id}/${operation.id}`,
      outcome = JSON.parse(readSourceFile(store.files.root, `${directory}/outcome.json`, 65536)),
      close = JSON.parse(readSourceFile(store.files.root, `${directory}/client-close.json`, 65536))
    if (
      operation.at < runtime.createdAt ||
      !canonical(outcome.at) ||
      !canonical(close.at) ||
      outcome.at > body.completedAt ||
      close.at > body.completedAt ||
      outcome.reason !== 'finished' ||
      outcome.code !== 0 ||
      outcome.signal !== undefined ||
      close.status !== 'succeeded' ||
      close.code !== 0
    )
      throw new DeliveryRunnerError('environment-producer-original-operation-required')
    native.push({ operation: operation.id, outcome, close })
  }
  for (const observed of closed.reads) {
    const directory = `delivery/runner-native/${observed.invocation}`,
      intent = JSON.parse(readSourceFile(store.files.root, `${directory}/intent.json`, 65536)),
      outcome = JSON.parse(readSourceFile(store.files.root, `${directory}/outcome.json`, 65536))
    // A missing cached image may be a legitimate nonzero read before a declared
    // pull. Require original finished owners, not universal probe exit success.
    if (
      observed.invocationState !== 'stopped' ||
      observed.reason !== 'finished' ||
      observed.code === undefined ||
      observed.signal !== undefined ||
      !canonical(intent.deadline) ||
      intent.deadline > origin.deadline ||
      !canonical(outcome.at) ||
      outcome.at > body.completedAt
    )
      throw new DeliveryRunnerError('environment-producer-original-read-required')
    native.push({ invocation: observed.invocation, intent, outcome })
  }
  return { owners: closed.evidence, native: contractDigest(native), snapshot }
}
