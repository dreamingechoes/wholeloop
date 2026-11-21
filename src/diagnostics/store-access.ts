// Explains external-store permission failures without changing a client's security settings.
// Declared configuration is evidence of configuration only, never of effective native access.
import { isAbsolute, join, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { isObject } from '../config/schema.js'
import { readRegularText } from '../fs/regular-file.js'
import { canonicalPath, inside } from '../state/paths.js'

const remedies: Record<string, string> = {
  codex: 'allow this directory in sandbox_workspace_write.writable_roots for a workspace-write run',
  claude: 'include this directory with --add-dir and approve its writes',
  opencode: 'review permission.external_directory for this directory and approve its writes',
  copilot: 'include this directory with --add-dir and approve its writes',
  gemini: 'include this directory with --include-directories and approve its writes',
  cursor: 'include this directory with --add-dir and approve its writes',
  antigravity: 'approve write_file for this directory in the client permission settings',
}

export function storeAccessMessage(
  error: unknown,
  store: string,
  client?: string,
): string | undefined {
  const root = physical(store),
    seen = new Set<unknown>()
  function denied(value: unknown): boolean {
    if (!value || typeof value !== 'object' || seen.has(value) || seen.size >= 16) return false
    seen.add(value)
    const failure = value as {
      code?: unknown
      message?: unknown
      path?: unknown
      dest?: unknown
      cause?: unknown
      errors?: unknown
    }
    const message = typeof failure.message === 'string' ? failure.message : ''
    if (['EACCES', 'EPERM'].includes(String(failure.code)) || /\b(?:EACCES|EPERM):/.test(message)) {
      const paths = [
        failure.path,
        failure.dest,
        ...Array.from(message.matchAll(/'([^']+)'/g), (match) => match[1]),
      ]
      if (
        [...new Set(paths)].some((path) => {
          if (typeof path !== 'string' || !isAbsolute(path)) return false
          const selected = physical(path)
          return inside(root, selected) || inside(selected, root)
        })
      )
        return true
    }
    return denied(failure.cause) || (Array.isArray(failure.errors) && failure.errors.some(denied))
  }
  if (!denied(error)) return undefined
  const remedy = remedies[client ?? ''] ?? 'allow this directory in the client writable paths'
  return `Cannot write the wholeloop store at ${JSON.stringify(root)}; ${remedy}, or restore filesystem write access.`
}

function physical(path: string): string {
  try {
    return canonicalPath(path)
  } catch {
    return resolve(path)
  }
}

export function codexStoreAccess(
  store: string,
  home: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const path = physical(store)
  return {
    target: 'codex' as const,
    store: path,
    file: join(
      env.CODEX_HOME && isAbsolute(env.CODEX_HOME) ? env.CODEX_HOME : join(home, '.codex'),
      'config.toml',
    ),
    snippet: `sandbox_mode = "workspace-write"\n\n[sandbox_workspace_write]\nwritable_roots = [${JSON.stringify(path)}]`,
    applied: false as const,
  }
}

export function inspectCodexStore(
  store: string,
  root: string,
  home: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const access = codexStoreAccess(store, home, env)
  const repair = {
    instruction:
      'Review the Codex store-access snippet; merge it with existing settings only after choosing to allow this directory. Active client overrides and policies may still refuse writes.',
    command: ['wl', 'install', '--target', 'codex', '--scope', 'user', '--dry-run'],
  }
  const check = (status: 'pass' | 'fail' | 'unknown', summary: string) => ({
    id: 'store.codex',
    status,
    summary,
    ...(status === 'pass' ? {} : { repair }),
  })
  let mode: unknown, roots: unknown
  for (const file of new Set([access.file, join(root, '.codex', 'config.toml')])) {
    try {
      const text = readRegularText(file, 1024 * 1024, { follow: true })
      if (text === undefined) continue
      const settings = parseToml(text)
      if ('sandbox_mode' in settings) mode = settings.sandbox_mode
      const sandbox = settings.sandbox_workspace_write
      if (isObject(sandbox) && 'writable_roots' in sandbox) roots = sandbox.writable_roots
    } catch {
      return check('unknown', `Cannot inspect Codex configuration at ${file}; contents omitted.`)
    }
  }
  if (mode === undefined)
    return check(
      'unknown',
      `No sandbox mode is declared for Codex; store access at ${access.store} depends on the active client settings.`,
    )
  if (mode === 'danger-full-access')
    return check(
      'pass',
      `The declared Codex mode already allows ${access.store}; active policies may differ.`,
    )
  if (mode !== 'workspace-write')
    return check('fail', `The declared Codex mode does not allow writes to ${access.store}.`)
  if (
    roots !== undefined &&
    (!Array.isArray(roots) || !roots.every((path) => typeof path === 'string' && isAbsolute(path)))
  )
    return check(
      'unknown',
      'Codex writable_roots must contain absolute directory paths; contents omitted.',
    )
  if (
    inside(physical(root), access.store) ||
    (Array.isArray(roots) &&
      roots.some(
        (path) =>
          typeof path === 'string' && isAbsolute(path) && inside(physical(path), access.store),
      ))
  )
    return check(
      'pass',
      `Declared Codex writable paths include ${access.store}; active policies may differ.`,
    )
  return check(
    'fail',
    `Codex workspace-write configuration does not include ${access.store} in sandbox_workspace_write.writable_roots.`,
  )
}
