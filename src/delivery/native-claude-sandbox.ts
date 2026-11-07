// The macOS sandbox profile and trusted paths that contain a Claude Code worker.
import { isAbsolute, join, normalize } from 'node:path'
import { safeSourceText } from './input.js'

/**
 * Trusted controller paths that contain a Claude Code process on macOS. The
 * client authenticates through the login Keychain, which it reaches only with
 * the operator's real home, so containment cannot come from hiding the home: the
 * operating system profile denies every file the run has no reason to touch.
 */
export interface NativeClaudeContainment {
  kind: 'macos-sandbox'
  /** Absolute sandbox-exec; never resolved through the worker PATH. */
  sandbox: string
  /** Canonical client binary, so a PATH entry cannot substitute another program. */
  client: string
  /** The operator's home; the Keychain lookup needs it. */
  home: string
  user: string
  /** Dedicated client home (CLAUDE_CONFIG_DIR), signed in once by the operator. */
  store: string
}

function quoted(path: string) {
  safeSourceText(path, 4096)
  // SBPL strings are double-quoted; refuse rather than escape anything unusual.
  if (
    !isAbsolute(path) ||
    normalize(path) !== path ||
    /["\\]/.test(path) ||
    [...path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new Error('Native sandbox paths must be absolute, normalized and unquoted')
  return JSON.stringify(path)
}
/**
 * File names a client could use for a plaintext credential. The client keeps
 * its login in the Keychain, which the profile lets it read but not write; a
 * token refresh inside the sandbox once fell back to writing one of these into
 * the client home (2026-11-03). Their creation is denied, so a refresh that
 * cannot reach the Keychain fails without leaving a credential on disk.
 */
export const CLAUDE_CREDENTIAL_FILES = ['.credentials.json', 'credentials.json', 'auth.json']

const rule = (operation: string, filters: string[]) =>
  filters.length ? [`(allow ${operation} ${filters.join(' ')})`] : []

/**
 * A read and write allow-list. Later rules override the leading deny, so the
 * order is part of the policy. Only the assignment's outputs, temporary
 * directories, the client home and a writable workspace accept writes.
 * Network and process rules stay open: the client needs its API, and
 * restricted mode already removes every tool that runs commands.
 */
export function claudeSandboxProfile(input: {
  containment: Readonly<NativeClaudeContainment>
  directory: string
  output: 'files' | 'inline-proposal'
  workspace?: string
  workspaceWrite: boolean
  /** Probe-only: the controller's own Node runtime, never part of a launch. */
  probe?: string
}) {
  const { containment } = input,
    sub = (path: string) => `(subpath ${quoted(path)})`,
    literal = (path: string) => `(literal ${quoted(path)})`
  const read = [
      literal('/'),
      ...['/private', '/etc', '/var', '/tmp'].map(literal),
      ...['/usr', '/bin', '/System', '/Library', '/private/etc', '/private/var/db'].map(sub),
      sub(containment.client),
      // The client's own security(1) lookup reads the encrypted login keychain.
      sub(join(containment.home, 'Library', 'Keychains')),
      sub(input.directory),
      ...(input.workspace ? [sub(input.workspace)] : []),
      ...(input.probe ? [sub(input.probe)] : []),
    ],
    write = [
      sub('/dev'),
      sub(containment.store),
      sub(join(input.directory, 'home')),
      sub(join(input.directory, 'tmp')),
      ...(input.output === 'files' ? [sub(join(input.directory, 'outputs'))] : []),
      ...(input.workspace && input.workspaceWrite ? [sub(input.workspace)] : []),
    ]
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-read* file-write* (subpath "/"))',
    ...rule('file-read*', read),
    ...rule('file-read* file-write*', write),
    // Last, so it overrides the client-home write allowance above.
    `(deny file-write* ${CLAUDE_CREDENTIAL_FILES.map((name) => literal(join(containment.store, name))).join(' ')})`,
    // The profile hides /var/select/developer_dir, so the /usr/bin/git shim the
    // client calls concludes no developer tools exist and asks the user's GUI
    // session to install them, once per launch (2026-11-03). Denying that
    // request keeps the failure silent; Git stays unavailable, as before.
    '(deny mach-lookup (global-name "com.apple.dt.CommandLineTools.installondemand"))',
  ].join('')
}
