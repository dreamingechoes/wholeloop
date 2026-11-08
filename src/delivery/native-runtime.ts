// Where the operator's trusted native clients live on this machine (ADR-0205).
import { isAbsolute, normalize } from 'node:path'
import { DOCKER_IMAGE } from '../environment/docker-policy.js'
import { REFERENCE_NATIVE_VERSIONS } from './native-adapters.js'
import {
  type NativeCredentialReference,
  validNativeCredentialReference,
} from './native-credentials.js'

// biome-ignore lint/suspicious/noControlCharactersInRegex: Native paths and command references deliberately refuse C0 controls and DEL.
const FORBIDDEN_RUNTIME_CONTROL = /[\x00-\x1f\x7f]/

/**
 * Where the operator's trusted clients live on this machine (ADR-0205).
 * Paths only: the client binary to launch and the dedicated client home the
 * owner signed in to. No field carries a credential value, a model or a role;
 * those stay in the bindings document, and containment stays fixed in code.
 * With a credential reference (ADR-0209) the controller injects the named
 * secret-store item per launch and the client home is disposable per run.
 */
export interface NativeRuntimeClient {
  target: keyof typeof REFERENCE_NATIVE_VERSIONS
  client: string
  store: string
  credential?: NativeCredentialReference
}
/**
 * The machine's inputs for one plan repository's unit QA (ADR-0207): a recipe
 * already prepared in the store, a digest-pinned helper image, and which
 * declared commands make up the suite. None of it is authority; the plan's
 * grant still decides what may be touched.
 */
export interface NativeRuntimeRepository {
  repository: string
  recipe: string
  helperImage: string
  suite: { refs: string[]; mapping: Record<string, string>; timeoutMs: number }
}
export interface NativeRuntime {
  schema: 'wholeloop/native-runtime@1'
  clients: NativeRuntimeClient[]
  /** The GitHub CLI binary publication runs; never resolved through PATH. */
  codeHost?: { kind: 'github-cli'; client: string }
  repositories?: NativeRuntimeRepository[]
}

function path(value: unknown) {
  return (
    typeof value === 'string' &&
    value.length <= 1024 &&
    isAbsolute(value) &&
    normalize(value) === value &&
    !/["\\]/.test(value) &&
    !FORBIDDEN_RUNTIME_CONTROL.test(value)
  )
}

const keys = (value: object) => Object.keys(value).sort().join(',')
const ref = (value: unknown) =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 256 &&
  !FORBIDDEN_RUNTIME_CONTROL.test(value)

function validRepository(value: unknown) {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>,
    suite = entry.suite as Record<string, unknown> | null
  if (
    keys(entry) !== 'helperImage,recipe,repository,suite' ||
    typeof entry.repository !== 'string' ||
    !/^[a-z][a-z0-9_-]{0,127}$/.test(entry.repository) ||
    typeof entry.recipe !== 'string' ||
    !/^[a-f0-9]{64}$/.test(entry.recipe) ||
    typeof entry.helperImage !== 'string' ||
    !DOCKER_IMAGE.test(entry.helperImage) ||
    typeof suite !== 'object' ||
    suite === null ||
    keys(suite) !== 'mapping,refs,timeoutMs'
  )
    return false
  const { refs, mapping, timeoutMs } = suite
  if (
    !Array.isArray(refs) ||
    refs.length < 1 ||
    refs.length > 16 ||
    new Set(refs).size !== refs.length ||
    !refs.every(ref) ||
    typeof mapping !== 'object' ||
    mapping === null ||
    Array.isArray(mapping) ||
    // Every ref runs exactly one recipe command, and nothing else is mapped.
    keys(mapping) !== [...refs].sort().join(',') ||
    !Object.values(mapping).every(
      (command) => typeof command === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(command),
    ) ||
    !Number.isInteger(timeoutMs) ||
    (timeoutMs as number) < 100 ||
    (timeoutMs as number) > 600000
  )
    return false
  return true
}

/** Closed shape, one entry per reference client; anything else invalidates the document. */
export function validNativeRuntime(value: unknown): value is NativeRuntime {
  if (typeof value !== 'object' || value === null) return false
  const document = value as Record<string, unknown>,
    optional = ['codeHost', 'repositories'].filter((key) => Object.hasOwn(document, key))
  if (
    keys(document) !== ['clients', 'schema', ...optional].sort().join(',') ||
    document.schema !== 'wholeloop/native-runtime@1' ||
    !Array.isArray(document.clients) ||
    document.clients.length > Object.keys(REFERENCE_NATIVE_VERSIONS).length
  )
    return false
  const seen = new Set<string>()
  for (const entry of document.clients) {
    if (typeof entry !== 'object' || entry === null) return false
    const client = entry as Record<string, unknown>
    const fields = Object.hasOwn(client, 'credential')
      ? 'client,credential,store,target'
      : 'client,store,target'
    if (
      Object.keys(client).sort().join(',') !== fields ||
      (Object.hasOwn(client, 'credential') &&
        !validNativeCredentialReference(client.credential, String(client.target))) ||
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
  if (Object.hasOwn(document, 'codeHost')) {
    const host = document.codeHost as Record<string, unknown> | null
    if (
      typeof host !== 'object' ||
      host === null ||
      keys(host) !== 'client,kind' ||
      host.kind !== 'github-cli' ||
      !path(host.client)
    )
      return false
  }
  if (Object.hasOwn(document, 'repositories')) {
    const entries = document.repositories
    if (
      !Array.isArray(entries) ||
      entries.length < 1 ||
      entries.length > 16 ||
      !entries.every(validRepository) ||
      new Set(entries.map((entry) => (entry as NativeRuntimeRepository).repository)).size !==
        entries.length
    )
      return false
  }
  return true
}

export function nativeRuntimeRepository(runtime: Readonly<NativeRuntime>, repository: string) {
  return runtime.repositories?.find((entry) => entry.repository === repository)
}

export function nativeRuntimeClient(runtime: Readonly<NativeRuntime>, target: string) {
  return runtime.clients.find((entry) => entry.target === target)
}
