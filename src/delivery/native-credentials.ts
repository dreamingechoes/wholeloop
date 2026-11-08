// Worker credentials owned by the controller and kept in the operating system's secret store (ADR-0209).
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

/**
 * A credential reference names an item in a secret store, never its value. The
 * kind decides the single variable the client consumes; a client session
 * (Codex signed in with a ChatGPT account) has no reference because the client
 * keeps and refreshes it in its own keyring.
 */
export interface NativeCredentialReference {
  store: NativeSecretStore
  item: string
  kind: NativeCredentialKind
}
export type NativeSecretStore = 'macos-keychain' | 'secret-service'
export type NativeCredentialKind = 'api-key' | 'oauth-token'
export type NativeCredentialFailure =
  | 'credential-missing'
  | 'credential-store-unavailable'
  | 'credential-unsupported'

/** One supported variable per client and account kind; anything else is unsupported. */
const VARIABLES: Record<string, Partial<Record<NativeCredentialKind, string>>> = {
  claude: { 'api-key': 'ANTHROPIC_API_KEY', 'oauth-token': 'CLAUDE_CODE_OAUTH_TOKEN' },
  codex: { 'api-key': 'CODEX_API_KEY' },
}
/**
 * Every variable a client reads a credential from. A launch clears all of them
 * before injecting its own, so an operator's ambient key can never reach a worker.
 */
export const NATIVE_CREDENTIAL_VARIABLES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CODEX_API_KEY',
  'OPENAI_API_KEY',
  'CODEX_ACCESS_TOKEN',
] as const

// One service groups every wholeloop item, so an item name cannot address another program's secret.
export const NATIVE_SECRET_SERVICE = 'wholeloop-worker'
const ITEM = /^[a-z0-9][a-z0-9._-]{0,63}$/
// Tokens only: the interactive Keychain command parses the value, so anything
// that would need quoting is refused rather than escaped.
const VALUE = /^[A-Za-z0-9._~+/=-]{8,4096}$/
// Linux has no fixed location; only these trusted paths are used, never PATH.
const SECRET_TOOL = ['/usr/bin/secret-tool', '/usr/local/bin/secret-tool']
const SECURITY = '/usr/bin/security'

export function nativeCredentialVariable(target: string, kind: NativeCredentialKind) {
  return VARIABLES[target]?.[kind]
}
/** Closed shape; the kind must be one the target supports. */
export function validNativeCredentialReference(
  value: unknown,
  target: string,
): value is NativeCredentialReference {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    Object.keys(entry).sort().join(',') === 'item,kind,store' &&
    (entry.store === 'macos-keychain' || entry.store === 'secret-service') &&
    typeof entry.item === 'string' &&
    ITEM.test(entry.item) &&
    (entry.kind === 'api-key' || entry.kind === 'oauth-token') &&
    nativeCredentialVariable(target, entry.kind) !== undefined
  )
}

/** Runs one store command without a shell; the secret only ever travels through stdin or stdout. */
export type SecretStoreRunner = (
  command: string,
  args: string[],
  input: string,
) => Promise<{ code: number | null; stdout: string }>

function storeCommand(
  store: NativeSecretStore,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
) {
  if (store === 'macos-keychain')
    return platform === 'darwin' && exists(SECURITY) ? SECURITY : undefined
  return platform === 'linux' ? SECRET_TOOL.find((path) => exists(path)) : undefined
}

/**
 * What a launch receives: the reference, for evidence, and a resolver that
 * reads the value at the moment of the launch. Nothing caches the value.
 */
export interface NativeInjectedCredential {
  reference: NativeCredentialReference
  resolve(): Promise<NativeCredentialResolution>
}
export function nativeInjectedCredential(
  reference: Readonly<NativeCredentialReference>,
  target: string,
  run: SecretStoreRunner = spawnSecretStore,
): NativeInjectedCredential {
  return {
    reference: { ...reference },
    resolve: () => resolveNativeCredential(reference, target, run),
  }
}

export type NativeCredentialResolution =
  | { resolved: true; variable: string; value: string }
  | { resolved: false; reason: NativeCredentialFailure }

/**
 * Reads one item for one launch. A missing store is a named failure; there is
 * no file fallback, so a host without a supported store cannot run workers that
 * need a credential.
 */
export async function resolveNativeCredential(
  reference: Readonly<NativeCredentialReference>,
  target: string,
  run: SecretStoreRunner,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): Promise<NativeCredentialResolution> {
  if (!validNativeCredentialReference(reference, target))
    return { resolved: false, reason: 'credential-unsupported' }
  const variable = nativeCredentialVariable(target, reference.kind) as string,
    command = storeCommand(reference.store, platform, exists)
  if (!command) return { resolved: false, reason: 'credential-store-unavailable' }
  const args =
    reference.store === 'macos-keychain'
      ? ['find-generic-password', '-s', NATIVE_SECRET_SERVICE, '-a', reference.item, '-w']
      : ['lookup', 'service', NATIVE_SECRET_SERVICE, 'account', reference.item]
  let result: Awaited<ReturnType<SecretStoreRunner>>
  try {
    result = await run(command, args, '')
  } catch {
    return { resolved: false, reason: 'credential-store-unavailable' }
  }
  // Both tools print the value plus one newline; a value that would not have
  // been accepted for storage is treated as missing rather than injected.
  const value = result.stdout.replace(/\n$/, '')
  if (result.code !== 0 || !VALUE.test(value))
    return { resolved: false, reason: 'credential-missing' }
  return { resolved: true, variable, value }
}

/**
 * Stores one item for the operator. The value arrives on stdin and leaves on
 * stdin: `security -i` reads its command there, and `secret-tool store` reads
 * the secret there, so it never appears in any process's arguments.
 */
export async function storeNativeCredential(
  reference: Readonly<NativeCredentialReference>,
  target: string,
  value: string,
  run: SecretStoreRunner,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): Promise<
  { stored: true } | { stored: false; reason: NativeCredentialFailure | 'credential-invalid' }
> {
  if (!validNativeCredentialReference(reference, target))
    return { stored: false, reason: 'credential-unsupported' }
  if (!VALUE.test(value)) return { stored: false, reason: 'credential-invalid' }
  const command = storeCommand(reference.store, platform, exists)
  if (!command) return { stored: false, reason: 'credential-store-unavailable' }
  const [args, input] =
    reference.store === 'macos-keychain'
      ? [
          ['-i'],
          `add-generic-password -U -s ${NATIVE_SECRET_SERVICE} -a ${reference.item} -l ${NATIVE_SECRET_SERVICE} -w ${value}\n`,
        ]
      : [
          [
            'store',
            `--label=${NATIVE_SECRET_SERVICE} ${reference.item}`,
            'service',
            NATIVE_SECRET_SERVICE,
            'account',
            reference.item,
          ],
          value,
        ]
  let result: Awaited<ReturnType<SecretStoreRunner>>
  try {
    result = await run(command, args, input)
  } catch {
    return { stored: false, reason: 'credential-store-unavailable' }
  }
  return result.code === 0
    ? { stored: true }
    : { stored: false, reason: 'credential-store-unavailable' }
}

/**
 * The real store runner: no shell, a fixed small environment, bounded output
 * and a short timeout. stderr is discarded because store tools may echo the
 * item they failed to find, and nothing else is needed from it.
 */
export const spawnSecretStore: SecretStoreRunner = (command, args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'ignore'],
      // The Keychain resolves through HOME and USER; Secret Service through the session bus.
      env: Object.fromEntries(
        Object.entries({
          PATH: '/usr/bin:/bin',
          LANG: 'C',
          HOME: process.env.HOME,
          USER: process.env.USER,
          DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS,
          XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
        }).filter(([, value]) => value !== undefined),
      ),
      timeout: 10000,
    })
    const chunks: Buffer[] = []
    let bytes = 0
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes <= 8192) chunks.push(chunk)
    })
    child.once('error', reject)
    child.once('close', (code) =>
      resolve({ code: bytes > 8192 ? null : code, stdout: Buffer.concat(chunks).toString('utf8') }),
    )
    child.stdin.end(input)
  })
