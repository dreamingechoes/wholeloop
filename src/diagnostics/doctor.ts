// `wl doctor`: observes runtimes, client versions, store access and managed files without repairing
// or certifying anything.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdtempSync, rmdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { artifactDigest, generateAdapter } from '../adapters/generate.js'
import { loadConfig, loadExtensionOptions } from '../config/load.js'
import { readRegularFile, readRegularText } from '../fs/regular-file.js'
import type { InstallInput } from '../installation/contracts.js'
import { inspectInstallation } from '../installation/inspect.js'
import { scopeModels } from '../installation/models.js'
import { detectMcp, detectProvider } from '../providers/detect.js'
import { loadProviders } from '../providers/load.js'
import { StoreFiles } from '../state/files.js'
import { canonicalPath, inside, storePath } from '../state/paths.js'
import { inspectCodexStore, storeAccessMessage } from './store-access.js'

const DEFAULT_TARGETS = ['claude', 'codex', 'opencode', 'copilot'] as const
export const DOCTOR_TARGETS = [...DEFAULT_TARGETS, 'gemini', 'antigravity', 'cursor'] as const
// The same version number can come from another build, such as a source checkout, so the message
// names a version only when it differs from the running one.
function staleWriter(installed: readonly string[], running: string) {
  if (!installed.length) return `another wholeloop version, and this is ${running}`
  if (installed.length === 1 && installed[0] === running)
    return `a different build of wholeloop ${running}`
  return `wholeloop ${installed.join(', ')}, and this is ${running}`
}
export interface DoctorCheck {
  id: string
  status: 'pass' | 'fail' | 'unknown' | 'skip'
  summary: string
  version?: string
  reason?: string
  repair?: { instruction: string; command: string[] }
}
export interface VersionProbe {
  version?: string
  status: 'observed' | 'unavailable' | 'invalid'
  reason?: 'missing' | 'timeout' | 'output-limit' | 'exit' | 'launch' | 'invalid-version'
}
export interface DoctorOptions {
  root: string
  home: string
  store: string
  userFile?: string
  targets?: readonly string[]
  artifact?: { path: string; target: string; expected: ReturnType<typeof generateAdapter> }
  env?: NodeJS.ProcessEnv
  probe?: (binary: string) => VersionProbe
  node?: string
  managed?: Pick<InstallInput, 'canonical' | 'core' | 'version'>
}
const installations: Record<string, string[]> = {
  cursor: ['agent', '--version'],
  antigravity: ['agy', '--version'],
  gemini: ['npm', 'install', '-g', '@google/gemini-cli'],
  claude: ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
  codex: ['npm', 'install', '-g', '@openai/codex'],
  opencode: ['npm', 'install', '-g', 'opencode-ai'],
  copilot: ['npm', 'install', '-g', '@github/copilot'],
}
export function versionProbe(
  binary: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd?: string,
): VersionProbe {
  const result = spawnSync(binary, ['--version'], {
    env,
    ...(cwd ? { cwd } : {}),
    encoding: 'utf8',
    timeout: 2500,
    // Version checks have no interactive work to preserve; SIGTERM handlers must not defeat the deadline.
    killSignal: 'SIGKILL',
    maxBuffer: 65536,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    const code = (result.error as NodeJS.ErrnoException | undefined)?.code
    return {
      status: 'unavailable',
      reason:
        code === 'ENOENT'
          ? 'missing'
          : code === 'ETIMEDOUT'
            ? 'timeout'
            : code === 'ENOBUFS'
              ? 'output-limit'
              : result.error
                ? 'launch'
                : 'exit',
    }
  }
  // Retain only a version token, never raw client output or warning/config values.
  const match = /\bv?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)\b/.exec(result.stdout)
  return match?.[1]
    ? { status: 'observed', version: match[1] }
    : { status: 'invalid', reason: 'invalid-version' }
}
/** OpenCode initializes caches/logs before parsing --version; dry-run must not touch the real home. */
export function openCodeVersionProbe(
  env: NodeJS.ProcessEnv = process.env,
  cwd?: string,
): VersionProbe {
  const home = mkdtempSync(join(tmpdir(), 'wholeloop-version-'))
  try {
    return versionProbe(
      'opencode',
      {
        ...env,
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: join(home, 'config'),
        XDG_DATA_HOME: join(home, 'data'),
        XDG_STATE_HOME: join(home, 'state'),
        XDG_CACHE_HOME: join(home, 'cache'),
        OPENCODE_CONFIG: undefined,
        OPENCODE_CONFIG_DIR: undefined,
        OPENCODE_CONFIG_CONTENT: undefined,
        OPENCODE_PERMISSION: undefined,
      },
      cwd,
    )
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}
/** A real unique write/rename probe, with cleanup restricted to files/directories it created. */
export function probeStore(root: string) {
  const files = new StoreFiles(root)
  const relative = `diagnostics/probe-${randomUUID()}`
  const path = files.path(relative)
  const missing: string[] = []
  let directory = dirname(path)
  while (!existsSync(directory)) {
    missing.push(directory)
    directory = dirname(directory)
  }
  const failures: unknown[] = []
  try {
    files.atomic(relative, 'wholeloop store write probe\n')
  } catch (error) {
    failures.push(error)
  }
  try {
    if (existsSync(path)) rmSync(path)
  } catch (error) {
    failures.push(error)
  }
  for (const directory of missing)
    try {
      rmdirSync(directory)
    } catch (error) {
      if (!['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? ''))
        failures.push(error)
    }
  if (failures.length) throw new AggregateError(failures, 'Store probe or cleanup failed')
}
// The repair must change something: suggesting doctor again on the store that just failed
// fixes nothing. A selected client gets its sandbox remedy first; ordinary filesystem access
// is restored with chmod for an owned directory, otherwise with another external store.
export function storeRepair(store: string, error: unknown, home: string, client?: string) {
  const message = client ? storeAccessMessage(error, store, client) : undefined
  if (client && message)
    return {
      instruction: message,
      command: ['wl', 'install', '--target', client, '--scope', 'user', '--dry-run'],
    }

  const failures = error instanceof AggregateError ? error.errors : [error]
  const denied = failures.some((failure) =>
    ['EACCES', 'EPERM'].includes((failure as NodeJS.ErrnoException)?.code ?? ''),
  )
  let directory = resolve(store)
  while (!existsSync(directory) && dirname(directory) !== directory) directory = dirname(directory)
  if (denied && process.getuid && statSync(directory).uid === process.getuid())
    return {
      instruction: 'Restore your write access to the store directory, then rerun doctor.',
      command: ['chmod', 'u+rwx', directory],
    }
  const fallback = storePath({}, home)
  const alternative =
    resolve(fallback) === resolve(store) ? join(home, '.local/state/wholeloop-store') : fallback
  return {
    instruction:
      'Choose an external accessible store (not inside a Git repository), then rerun doctor with it.',
    command: ['wl', 'doctor', '--store', alternative, '--json'],
  }
}
export function inspectArtifact(path: string, expected: ReturnType<typeof generateAdapter>) {
  const root = canonicalPath(path)
  if (lstatSync(resolve(path)).isSymbolicLink()) throw new Error('Artifact root is a symlink')
  for (const [relative, file] of expected.files) {
    const absolute = join(root, relative)
    // Mode and digest come from the descriptor that was read, so they describe the same file.
    const found = inside(root, canonicalPath(absolute))
      ? readRegularFile(absolute, 4 * 1024 * 1024)
      : undefined
    if (
      !found ||
      found.mode !== file.mode ||
      artifactDigest(found.bytes.toString('utf8')) !== artifactDigest(file.content)
    )
      throw new Error('Generated artifact is missing, edited or stale')
  }
  return expected.manifest
}
/** File integrity accepts either known dialect; native compatibility remains a separate observation. */
export function expectedArtifact(
  target: string,
  path: string,
  canonical: ReadonlyMap<string, string>,
  core: string,
  version: string,
) {
  if (target === 'opencode') {
    try {
      const hook = join(path, '.opencode/plugins/wholeloop.js')
      const directory = lstatSync(path)
      // Format detection must obey the same containment boundary as full inspection.
      const content =
        directory.isDirectory() &&
        !directory.isSymbolicLink() &&
        inside(canonicalPath(path), canonicalPath(hook))
          ? readRegularText(hook, 65536)
          : undefined
      if (content !== undefined) {
        const modern = generateAdapter(target, canonical, core, version, '2.0.0')
        if (
          artifactDigest(content) ===
          artifactDigest(modern.files.get('.opencode/plugins/wholeloop.js')?.content ?? '')
        )
          return modern
      }
    } catch {
      /* The normal artifact inspection reports missing or changed files. */
    }
  }
  return generateAdapter(target, canonical, core, version)
}
/** Diagnosis observes availability, not authentication, client discovery or successful model execution. */
export function doctor(options: DoctorOptions) {
  const targets = options.targets ?? DEFAULT_TARGETS
  if (
    !targets.length ||
    new Set(targets).size !== targets.length ||
    targets.some((target) => !DOCTOR_TARGETS.includes(target as (typeof DOCTOR_TARGETS)[number]))
  )
    throw new Error('Choose unique doctor targets: claude,codex,opencode,copilot,gemini')
  const checks: DoctorCheck[] = []
  const node = options.node ?? process.versions.node
  checks.push({
    id: 'node',
    status: Number(node.split('.')[0]) >= 20 ? 'pass' : 'fail',
    summary: 'The published core requires Node 20 or newer.',
    version: node,
    ...(Number(node.split('.')[0]) >= 20
      ? {}
      : {
          repair: {
            instruction:
              'Install a supported Node release using your platform runtime manager, then rerun this check.',
            command: ['node', '--version'],
          },
        }),
  })
  const probe =
    options.probe ??
    ((binary: string) =>
      binary === 'opencode'
        ? openCodeVersionProbe(options.env, options.root)
        : versionProbe(binary, options.env))
  const git = probe('git')
  const parts = git.version?.split('.').map(Number) ?? []
  const gitUsable =
    git.status === 'observed' && ((parts[0] ?? 0) > 2 || (parts[0] === 2 && (parts[1] ?? 0) >= 36))
  checks.push({
    id: 'git',
    status: gitUsable ? 'pass' : 'fail',
    summary:
      'Git 2.36 or newer is required for unambiguous NUL-delimited worktree ownership; actual workflow/platform compatibility still needs verification.',
    ...(git.version ? { version: git.version } : {}),
    ...(git.reason ? { reason: git.reason } : {}),
    ...(!gitUsable
      ? {
          repair: {
            instruction:
              'Install/update Git with your platform package manager and verify its version.',
            command: ['git', '--version'],
          },
        }
      : {}),
  })
  let found = 0
  let opencodeVersion: string | undefined
  for (const target of targets) {
    const observed = probe(
      target === 'antigravity' ? 'agy' : target === 'cursor' ? 'agent' : target,
    )
    const available = observed.status === 'observed'
    if (target === 'opencode' && available) opencodeVersion = observed.version
    if (available) found++
    checks.push({
      id: `cli.${target}`,
      status: available ? 'pass' : options.targets ? 'fail' : 'skip',
      summary: available
        ? 'Version observed; native discovery, permissions and authentication remain unverified.'
        : `The ${target} version command is missing, failed, timed out or returned no version.`,
      ...(observed.version ? { version: observed.version } : {}),
      ...(observed.reason ? { reason: observed.reason } : {}),
      ...(!available
        ? {
            repair: {
              instruction:
                observed.reason === 'missing' || !observed.reason
                  ? 'Install the selected CLI or repair PATH, then rerun doctor. The npm recipes require Node 22 or newer; authentication remains a separate action.'
                  : 'Inspect the existing version command: timeout is 2500 ms, output is limited to 64 KiB and nonzero/malformed replies stay unobserved. No reinstallation or authentication was attempted.',
              command:
                observed.reason === 'missing' || !observed.reason
                  ? (installations[target] ?? [])
                  : [
                      target === 'antigravity' ? 'agy' : target === 'cursor' ? 'agent' : target,
                      '--version',
                    ],
            },
          }
        : {}),
    })
  }
  if (!found && !options.targets)
    checks.push({
      id: 'cli.any',
      status: 'fail',
      summary: 'No selected tier-A CLI reported a version.',
      repair: {
        instruction: 'Install at least one supported CLI and rerun doctor.',
        command: installations.codex ?? [],
      },
    })
  try {
    probeStore(options.store)
    checks.push({
      id: 'store',
      status: 'pass',
      summary:
        'An actual atomic write/rename probe succeeded and its temporary files were removed.',
    })
  } catch (error) {
    checks.push({
      id: 'store',
      status: 'fail',
      summary:
        'The store is inside Git, inaccessible or its probe/cleanup failed; no journal was changed.',
      repair: storeRepair(
        options.store,
        error,
        options.home,
        options.targets?.length === 1 ? options.targets[0] : undefined,
      ),
    })
  }
  if ((options.targets ?? DEFAULT_TARGETS).includes('codex'))
    checks.push(
      inspectCodexStore(options.store, options.root, options.home, options.env ?? process.env),
    )
  let providerSummary: { id: string; kind: string; available: boolean; authenticated: false }[] = []
  try {
    loadConfig({ root: options.root, ...(options.userFile ? { userFile: options.userFile } : {}) })
    const registry = loadProviders(
      loadExtensionOptions({
        root: options.root,
        ...(options.userFile ? { userFile: options.userFile } : {}),
      }),
    )
    const detection = detectMcp(options.root, options.home, options.env)
    providerSummary = registry.providers.map((provider) => {
      const detected = detectProvider(provider.manifest, detection.declarations, options.env?.PATH)
      return {
        id: provider.manifest.id,
        kind: detected.kind,
        available: detected.available,
        authenticated: false,
      }
    })
    const problems = registry.problems.length + detection.problems.length
    checks.push({
      id: 'providers',
      status: problems ? 'fail' : 'pass',
      summary: problems
        ? 'Provider manifests or MCP declarations need inspection; contents omitted.'
        : 'Provider availability inspected without executing manifest commands or contacting services.',
      ...(problems
        ? {
            repair: {
              instruction:
                'Inspect provider/MCP declarations and correct their syntax; do not copy credentials into reports.',
              command: ['wl', 'provider', 'list', '--json'],
            },
          }
        : {}),
    })
  } catch {
    checks.push({
      id: 'providers',
      status: 'fail',
      summary: 'Layered configuration or provider loading failed; contents omitted.',
      repair: {
        instruction:
          'Inspect layered configuration and extension declarations, correct invalid values and rerun doctor.',
        command: ['wl', 'config', 'show', '--json'],
      },
    })
  }
  if (options.artifact) {
    try {
      inspectArtifact(options.artifact.path, options.artifact.expected)
      checks.push({
        id: 'artifacts',
        status: 'pass',
        summary:
          'Every expected generated file, executable mode, manifest and source/core hash matches the current build.',
      })
    } catch {
      checks.push({
        id: 'artifacts',
        status: 'fail',
        summary: 'The artifact is missing, changed, unsafe or from another source/core version.',
        repair: {
          instruction:
            'Preserve edited output. Build into a new directory and inspect the returned ownership manifest.',
          command: [
            'wl',
            'build',
            '--target',
            options.artifact.target,
            '--out',
            `${resolve(options.artifact.path)}-fresh`,
            '--json',
          ],
        },
      })
    }
  } else
    checks.push({
      id: 'artifacts',
      status: 'unknown',
      summary:
        'No explicit standalone artifact directory was checked; see managed scope checks when available. Native discovery remains unverified.',
      repair: {
        instruction:
          'Generate an artifact, then supply its directory and target to doctor. This does not install or activate it.',
        command: [
          'wl',
          'build',
          '--target',
          targets[0] ?? 'codex',
          '--out',
          join(tmpdir(), 'wholeloop-doctor-artifact'),
          '--json',
        ],
      },
    })
  if (options.managed)
    for (const scope of ['user', 'project'] as const) {
      if (scope === 'project' && options.root === dirname(options.root)) continue
      let models: ReturnType<typeof scopeModels> = {}
      try {
        // The configuration check above reports an invalid file; here it only means no mapping.
        models = scopeModels(
          scope,
          options.root,
          options.home,
          options.env ?? process.env,
          ...(options.userFile ? [options.userFile] : []),
        )
      } catch {}
      const result = inspectInstallation({
        ...options.managed,
        targets,
        context: {
          root: options.root,
          home: options.home,
          store: options.store,
          scope,
          ...(opencodeVersion ? { opencodeVersion } : {}),
          ...(options.env ? { env: options.env } : {}),
          models,
        },
      })
      const selected = result.targets.length ? result.targets : targets
      const changed = 'changed' in result ? (result.changed ?? []) : []
      const installed = 'installed' in result ? (result.installed ?? []) : []
      // An edited or missing owned file blocks install and uninstall alike, and no command
      // overwrites a person's edit; naming the files is what lets them restore or move it.
      const repair = [
        'wl',
        result.status === 'stale' || result.status === 'changed' ? 'install' : 'uninstall',
        '--target',
        selected.join(','),
        '--scope',
        scope,
        '--store',
        options.store,
        ...(result.status === 'stale' ? [] : ['--dry-run']),
        '--json',
      ]
      const failed = !['current', 'absent'].includes(result.status)
      checks.push({
        id: `installation.${scope}`,
        status:
          result.status === 'current' ? 'pass' : result.status === 'absent' ? 'unknown' : 'fail',
        summary:
          result.status === 'current'
            ? 'Owned native files match this source/core; actual client activation remains unverified.'
            : result.status === 'absent'
              ? 'No owned receipt at this scope; existing unmanaged native components remain unverified.'
              : result.status === 'stale'
                ? `Owned installation was written by ${staleWriter(installed, options.managed.version)}; none of its files were edited, so updating it is safe.`
                : `Owned installation is ${result.status}; preserve edits and inspect its external receipt.`,
        ...(result.status === 'stale' && installed.length ? { version: installed.join(', ') } : {}),
        ...(failed
          ? {
              repair: {
                instruction:
                  result.status === 'stale'
                    ? 'Run this command to update the installation; the files it replaces are kept as backups in the store.'
                    : result.status === 'changed'
                      ? `Owned files were changed outside wholeloop: ${changed.map((change) => `${change.path} (${change.state})`).join(', ') || 'unknown'}. Copy any edit you want to keep elsewhere, undo the change or restore the file, then confirm with this dry run.`
                      : 'Inspect the writer and receipt; pending does not prove the writer stopped. Preserve edited/unowned data before recovering all pending targets together. A dry run may refuse unknown ownership.',
                command: repair,
              },
            }
          : {}),
      })
    }
  return {
    schema: 'wholeloop/doctor@1',
    status: checks.some((check) => check.status === 'fail') ? 'needs-attention' : 'observed',
    checks,
    providers: providerSummary,
    conformance: 'unverified',
    authenticated: false,
  }
}
