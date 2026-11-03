import { isAbsolute, normalize } from 'node:path'
import { REFERENCE_NATIVE_VERSIONS } from './native-adapters.js'

/**
 * Where the operator's trusted clients live on this machine (ADR-0205).
 * Paths only: the client binary to launch and the dedicated client home the
 * owner signed in to. No field carries a credential, a model or a role; those
 * stay in the bindings document, and containment stays fixed in code.
 */
export interface NativeRuntimeClient {
  target: keyof typeof REFERENCE_NATIVE_VERSIONS
  client: string
  store: string
}
export interface NativeRuntime {
  schema: 'wholeloop/native-runtime@1'
  clients: NativeRuntimeClient[]
}

function path(value: unknown) {
  return (
    typeof value === 'string' &&
    value.length <= 1024 &&
    isAbsolute(value) &&
    normalize(value) === value &&
    !/["\\]/.test(value) &&
    ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
}

/** Closed shape, one entry per reference client; anything else invalidates the document. */
export function validNativeRuntime(value: unknown): value is NativeRuntime {
  if (typeof value !== 'object' || value === null) return false
  const document = value as Record<string, unknown>
  if (
    Object.keys(document).sort().join(',') !== 'clients,schema' ||
    document.schema !== 'wholeloop/native-runtime@1' ||
    !Array.isArray(document.clients) ||
    document.clients.length > Object.keys(REFERENCE_NATIVE_VERSIONS).length
  )
    return false
  const seen = new Set<string>()
  for (const entry of document.clients) {
    if (typeof entry !== 'object' || entry === null) return false
    const client = entry as Record<string, unknown>
    if (
      Object.keys(client).sort().join(',') !== 'client,store,target' ||
      typeof client.target !== 'string' ||
      !Object.hasOwn(REFERENCE_NATIVE_VERSIONS, client.target) ||
      seen.has(client.target) ||
      !path(client.client) ||
      !path(client.store) ||
      client.client === client.store
    )
      return false
    seen.add(client.target)
  }
  return true
}

export function nativeRuntimeClient(runtime: Readonly<NativeRuntime>, target: string) {
  return runtime.clients.find((entry) => entry.target === target)
}
