// Negotiates what a native client can do from trusted runtime observations, not its help output.
import type { BudgetMetering } from './budget-events.js'
import type { NativeDeliveryRecipe } from './native-adapters.js'
import { validateDeliveryShape } from './plan.js'
import observationSchema from './schemas/native-observation-v1.json' with { type: 'json' }
import type { WorkerAssignment, WorkerRole } from './worker-protocol.js'

export const NATIVE_OBSERVATION_SCHEMA = observationSchema
export interface NativeDeliveryObservation {
  schema: 'wholeloop/delivery-native-observation@1'
  target: NativeDeliveryRecipe['target']
  version: string
  role: WorkerRole
  assignment: string
  policy: string
  evidence: string
  provenance: 'fixture' | 'host-observed'
  model: string
  authenticated: boolean
  boundary: {
    contained: boolean
    controllerStoreDenied: boolean
    credentialsDenied: boolean
    toolsRestricted: boolean
    interactiveDisabled: boolean
    cancellable: boolean
    completeOutput: boolean
    ownedOutputReader: boolean
  }
  metering: { hardTokens: false; hardCurrency: false }
}
export type NativeFailure =
  | 'runtime-unobserved'
  | 'invalid-runtime-observation'
  | 'runtime-binding'
  | 'authentication-required'
  | 'containment-unavailable'
  | 'permission-denied'
  | 'model-unavailable'
  | 'mcp-unavailable'
  | 'invalid-output'
  | 'launch-failed'
  | 'timed-out'
  | 'cancelled'
  | 'output-limit'
  | 'stale'
  | 'changed'
  | 'artifact-limit'

/** Version/help and worker JSON cannot supply this trusted runtime observation. */
export function negotiateNativeDelivery(
  assignment: WorkerAssignment,
  recipe: NativeDeliveryRecipe,
  model: string,
  observed?: NativeDeliveryObservation,
):
  | { available: true; observation: NativeDeliveryObservation; metering: BudgetMetering }
  | { available: false; reason: NativeFailure } {
  if (!observed) return { available: false, reason: 'runtime-unobserved' }
  try {
    validateDeliveryShape(observed, observationSchema)
  } catch {
    return { available: false, reason: 'invalid-runtime-observation' }
  }
  if (
    observed.assignment !== assignment.assignment ||
    observed.policy !== recipe.policy ||
    observed.target !== recipe.target ||
    observed.version !== recipe.version ||
    observed.role !== assignment.identity.role ||
    observed.model !== model
  )
    return { available: false, reason: 'runtime-binding' }
  if (!observed.authenticated) return { available: false, reason: 'authentication-required' }
  if (Object.values(observed.boundary).some((value) => !value))
    return { available: false, reason: 'containment-unavailable' }
  return {
    available: true,
    observation: structuredClone(observed),
    metering: {
      hardTokens: false,
      hardCurrency: false,
      meter: `native:${recipe.target}:${recipe.version}`,
      evidence: observed.evidence,
      provenance: observed.provenance,
    },
  }
}

/** Inspect bounded diagnostics in memory; callers retain hashes/typed reasons rather than raw errors. */
export function nativeFailureReason(text: string): NativeFailure {
  const diagnostic = text.slice(0, 65536)
  if (
    /permission[_ -](?:denied|denials)|approval[_ -]required|not (?:allowed|permitted)|sandbox.*(?:denied|unavailable)/i.test(
      diagnostic,
    )
  )
    return 'permission-denied'
  if (/mcp.*(?:failed|unavailable|timeout|denied|error)|(?:failed|unable).*mcp/i.test(diagnostic))
    return 'mcp-unavailable'
  if (
    /model.*(?:unavailable|not found|not supported|denied)|(?:unknown|invalid).*model/i.test(
      diagnostic,
    )
  )
    return 'model-unavailable'
  if (
    /not (?:logged|signed) in|authentication|unauthorized|login required|auth.*(?:missing|required|invalid)/i.test(
      diagnostic,
    )
  )
    return 'authentication-required'
  return 'launch-failed'
}
