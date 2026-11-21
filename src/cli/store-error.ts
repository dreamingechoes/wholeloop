// Preserves store permission failures across handlers that wrap filesystem errors in CLI errors.
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { storeAccessMessage } from '../diagnostics/store-access.js'
import { storePath } from '../state/paths.js'
import { packagedClient } from './adapter-root.js'

export function storeCommandFailure(error: unknown, argv: readonly string[], root: string) {
  // Normal commands pay no filesystem or manifest reads for error recovery.
  if (!permissionFailure(error)) return undefined
  try {
    const index = argv.indexOf('--store'),
      value = index < 0 ? undefined : argv[index + 1]
    const store = value ? resolve(root, value) : storePath(process.env, homedir())
    const client =
      packagedClient(fileURLToPath(import.meta.url))?.client ??
      (process.env.CODEX_THREAD_ID || process.env.CODEX_SANDBOX
        ? 'codex'
        : process.env.CLAUDECODE
          ? 'claude'
          : undefined)
    return storeAccessMessage(error, store, client)
  } catch {
    // A bad store selection must retain its own error rather than hide it behind a diagnostic.
    return undefined
  }
}

function permissionFailure(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== 'object' || seen.has(error) || seen.size >= 16) return false
  seen.add(error)
  const failure = error as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown }
  return (
    ['EACCES', 'EPERM'].includes(String(failure.code)) ||
    (typeof failure.message === 'string' && /\b(?:EACCES|EPERM)\b/.test(failure.message)) ||
    permissionFailure(failure.cause, seen) ||
    (Array.isArray(failure.errors) &&
      failure.errors.some((value) => permissionFailure(value, seen)))
  )
}
