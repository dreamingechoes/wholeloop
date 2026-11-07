// Captures environment candidate content before the backend can read it.
import { contractDigest } from '../contracts/compatibility.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { captureEnvironmentCandidates } from '../environment/candidates.js'
import type { DockerTransport } from '../environment/docker-command.js'
import type { EnvironmentProvisionRequest } from '../environment/provision.js'
import { EnvironmentRecipes } from '../environment/recipe-store.js'
import type { EnvironmentRuntime } from '../environment/runtime.js'
import provisionSchema from '../environment/schemas/provision-request-v1.json' with { type: 'json' }
import type { RunnerStageContext } from './engine.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerStore } from './store.js'

export type EnvironmentIdentity = Pick<
  EnvironmentRuntime,
  | 'id'
  | 'run'
  | 'basis'
  | 'grant'
  | 'grantDigest'
  | 'recipe'
  | 'candidates'
  | 'key'
  | 'helperImage'
  | 'provenance'
>
export interface EnvironmentPreparation {
  input: EnvironmentProvisionRequest
  expected: EnvironmentIdentity
}

/** Capture candidate content before the backend can reserve an effect or resource. */
export function captureEnvironmentPreparation(
  store: RunnerStore,
  context: RunnerStageContext,
  request: EnvironmentProvisionRequest,
  provenance: DockerTransport['provenance'],
): EnvironmentPreparation {
  const input = structuredClone(request)
  validateDeliveryShape(input, provisionSchema)
  const digest = contractDigest(context.request),
    actual = store.get(digest),
    basis = store.basis(actual),
    record = store.stage(digest, context.stage.id),
    stage = runnerRoute(basis.plan).find((entry) => entry.id === context.stage.id)
  if (
    context.signal.aborted ||
    !context.current() ||
    !Number.isFinite(Date.parse(context.deadline)) ||
    new Date(context.deadline).toISOString() !== context.deadline ||
    Date.now() >= Date.parse(context.deadline) ||
    !record ||
    record.invocation !== context.invocation ||
    record.basis !== basis.digest ||
    !['prepared', 'running'].includes(record.status) ||
    contractDigest(context.plan) !== basis.digest ||
    contractDigest(stage ?? null) !== contractDigest(context.stage) ||
    !['verification', 'integration'].includes(context.stage.kind) ||
    input.run !== actual.run
  )
    throw new DeliveryRunnerError('environment-preparation-not-current')
  const recipes = new EnvironmentRecipes(store.files.root),
    recipe = recipes.get(input.recipe)
  if (recipes.inspect(input.recipe).inputs !== 'current')
    throw new DeliveryRunnerError('environment-preparation-inputs-changed')
  const candidates = captureEnvironmentCandidates(
    recipe.recipe,
    basis.plan,
    basis.authority.grant,
    input.workspaces,
  ).map(({ candidate }) => candidate)
  return {
    input,
    expected: {
      id: `environment-${contractDigest({ run: input.run, basis: basis.digest, key: input.key }).slice(0, 32)}`,
      run: actual.run,
      basis: basis.digest,
      grant: actual.grant,
      grantDigest: basis.authority.digest,
      recipe: input.recipe,
      key: input.key,
      helperImage: input.helperImage,
      candidates,
      provenance,
    },
  }
}

/** Historical inspection checks captured identities without rereading mutable worktrees. */
export function validateEnvironmentPreparation(preparation: EnvironmentPreparation) {
  const { input, expected } = preparation
  validateDeliveryShape(input, provisionSchema)
  if (
    Object.keys(preparation).sort().join(',') !== 'expected,input' ||
    Object.keys(expected).sort().join(',') !==
      'basis,candidates,grant,grantDigest,helperImage,id,key,provenance,recipe,run' ||
    expected.id !==
      `environment-${contractDigest({ run: input.run, basis: expected.basis, key: input.key }).slice(0, 32)}` ||
    expected.run !== input.run ||
    expected.recipe !== input.recipe ||
    expected.key !== input.key ||
    expected.helperImage !== input.helperImage ||
    !Array.isArray(expected.candidates) ||
    expected.candidates.some((candidate) => !/^[a-f0-9]{64}$/.test(candidate.content)) ||
    contractDigest(expected.candidates.map(({ content: _content, ...candidate }) => candidate)) !==
      contractDigest(input.workspaces)
  )
    throw new DeliveryRunnerError('environment-preparation-original-binding')
}
