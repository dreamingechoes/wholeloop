// The operator's binding of each role to one trusted native client, which cannot relax containment.
import { contractDigest } from '../contracts/compatibility.js'
import { NATIVE_DELIVERY_TARGETS, REFERENCE_NATIVE_VERSIONS } from './native-adapters.js'
import type { WorkerRole } from './worker-protocol.js'

const ROLES: readonly WorkerRole[] = [
  'builder',
  'verifier',
  'reviewer',
  'refuter',
  'researcher',
  'planner',
  'challenger',
]
/** One explicitly trusted client: no field can relax containment, tools or credentials. */
export interface NativeBinding {
  target: keyof typeof REFERENCE_NATIVE_VERSIONS
  version: string
  model: string
  roles: WorkerRole[]
}
export interface NativeBindings {
  schema: 'wholeloop/native-bindings@1'
  bindings: NativeBinding[]
}
export type NativeBindingDecision =
  | { bound: true; binding: string }
  | {
      bound: false
      reason: 'invalid-bindings' | 'unbound-native-client' | 'unpinned-native-client'
    }

/** The conservative default trusts no native client for unattended runs. */
export const NATIVE_BINDINGS_DEFAULT: Readonly<NativeBindings> = Object.freeze({
  schema: 'wholeloop/native-bindings@1',
  bindings: [],
})

/** Closed shape: any unknown field invalidates the whole document. */
export function validNativeBindings(value: unknown): value is NativeBindings {
  if (typeof value !== 'object' || value === null) return false
  const document = value as Record<string, unknown>
  if (
    Object.keys(document).sort().join(',') !== 'bindings,schema' ||
    document.schema !== 'wholeloop/native-bindings@1' ||
    !Array.isArray(document.bindings) ||
    document.bindings.length > 32
  )
    return false
  const seen = new Set<string>()
  for (const entry of document.bindings) {
    if (typeof entry !== 'object' || entry === null) return false
    const binding = entry as Record<string, unknown>
    if (
      Object.keys(binding).sort().join(',') !== 'model,roles,target,version' ||
      typeof binding.target !== 'string' ||
      typeof binding.version !== 'string' ||
      typeof binding.model !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(binding.model) ||
      !Array.isArray(binding.roles) ||
      !binding.roles.length ||
      binding.roles.some((role) => !ROLES.includes(role as WorkerRole)) ||
      new Set(binding.roles).size !== binding.roles.length
    )
      return false
    const key = contractDigest([binding.target, binding.version, binding.model])
    if (seen.has(key)) return false
    seen.add(key)
  }
  return true
}

/** Exact matches only: a pinned reference recipe, an explicit model and a named role. */
export function nativeBinding(
  bindings: unknown,
  request: { target: string; version: string; model: string; role: WorkerRole },
): NativeBindingDecision {
  if (!validNativeBindings(bindings)) return { bound: false, reason: 'invalid-bindings' }
  const pinned = REFERENCE_NATIVE_VERSIONS[request.target as keyof typeof REFERENCE_NATIVE_VERSIONS]
  if (
    !(NATIVE_DELIVERY_TARGETS as readonly string[]).includes(request.target) ||
    pinned === undefined ||
    pinned !== request.version
  )
    return { bound: false, reason: 'unpinned-native-client' }
  const binding = bindings.bindings.find(
    (entry) =>
      entry.target === request.target &&
      entry.version === request.version &&
      entry.model === request.model &&
      entry.roles.includes(request.role),
  )
  return binding
    ? { bound: true, binding: contractDigest(binding) }
    : { bound: false, reason: 'unbound-native-client' }
}
