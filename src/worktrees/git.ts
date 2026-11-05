import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { canonicalPath } from '../state/paths.js'
import {
  assertObservationWritable,
  inReadObservation,
  observedRead,
} from '../state/read-observation.js'

export function git(root: string, args: readonly string[], hooks?: string): string {
  return gitBytes(root, args, hooks).toString('utf8')
}
/** Byte-bound Git paths must be checked before UTF-8 decoding can replace invalid names. */
export function gitBytes(root: string, args: readonly string[], hooks?: string): Buffer {
  if (!inReadObservation()) return readGit(root, args, hooks)
  // A scoped observer cannot run even an accidentally supplied Git mutation.
  // The fixed readers use only these queries; unknown commands fail closed.
  const command = args[0] === '-c' ? args[2] : args[0],
    query = args[0] === '-c' ? args.slice(2) : args
  if (
    (args[0] === '-c' && args[1] !== 'diff.autoRefreshIndex=false') ||
    !command ||
    !(
      ['rev-parse', 'ls-files', 'status', 'rev-list', 'merge-base'].includes(command) ||
      (command === 'diff' && !query.some((arg) => arg.startsWith('--output'))) ||
      (command === 'branch' && query.length === 2 && query[1] === '--show-current') ||
      (command === 'worktree' &&
        query[1] === 'list' &&
        query.slice(2).every((arg) => ['--porcelain', '-z'].includes(arg))) ||
      (command === 'remote' &&
        query[1] === 'get-url' &&
        (query.length === 3 ||
          (query.length === 5 && query[2] === '--push' && query[3] === '--all'))) ||
      (command === 'config' &&
        ((['--get', '--get-all', '--get-regexp'].includes(query[1] ?? '') &&
          query.length === 3 &&
          !query[2]?.startsWith('-')) ||
          query.join('\0') === 'config\0--local\0--no-includes\0--null\0--list'))
    )
  )
    assertObservationWritable()
  const path = resolve(root),
    input = [...args],
    environment = environmentIdentity(),
    key = JSON.stringify(['git', path, input, hooks ?? null, environment])
  return Buffer.from(
    observedRead(key, () => {
      if (environmentIdentity() !== environment) assertObservationWritable()
      const bytes = readGit(path, input, hooks)
      return { bytes, value: bytes }
    }),
  )
}
function environmentIdentity() {
  return createHash('sha256')
    .update(JSON.stringify(Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex')
}
function readGit(root: string, args: readonly string[], hooks?: string): Buffer {
  const response = spawnSync(
    'git',
    [...(hooks ? ['-c', `core.hooksPath=${hooks}`] : []), ...args],
    {
      cwd: root,
      encoding: 'buffer',
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  )
  if (response.error || response.status !== 0)
    throw new Error(
      `Git ${args[0]} failed; inspect repository permissions and the requested reference`,
    )
  return response.stdout
}
export function ancestor(root: string, head: string, base: string): boolean {
  if (!inReadObservation()) return readAncestor(root, head, base)
  const path = resolve(root),
    environment = environmentIdentity(),
    value = observedRead(JSON.stringify(['ancestor', path, head, base, environment]), () => {
      if (environmentIdentity() !== environment) assertObservationWritable()
      const result = readAncestor(path, head, base)
      return { bytes: Buffer.from([Number(result)]), value: result }
    })
  return value
}
function readAncestor(root: string, head: string, base: string): boolean {
  const response = spawnSync('git', ['merge-base', '--is-ancestor', head, base], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    timeout: 30_000,
  })
  if (response.status !== 0 && response.status !== 1)
    throw new Error('Cannot establish branch ancestry; no cleanup is safe')
  return response.status === 0
}
export function repository(root: string) {
  const path = canonicalPath(git(root, ['rev-parse', '--show-toplevel']).trim())
  // Git returns a path relative to the command's cwd in a primary checkout.
  // Resolve there explicitly instead of treating output as relative to this process.
  const commonDir = canonicalPath(
    resolve(root, git(root, ['rev-parse', '--git-common-dir']).trim()),
  )
  return { path, commonDir, key: createHash('sha256').update(commonDir).digest('hex').slice(0, 16) }
}
export function namedBase(root: string, input: string) {
  if (!input.trim() || input.startsWith('-') || /[\n\r\0]/.test(input))
    throw new Error('Provide a named base branch')
  const ref = git(root, [
    'rev-parse',
    '--verify',
    '--symbolic-full-name',
    '--end-of-options',
    input,
  ]).trim()
  if (!/^refs\/(heads|remotes)\/.+/.test(ref) || /[\n\r]/.test(ref))
    throw new Error('Base must resolve to one named local or remote branch')
  const sha = git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim()
  return { ref, sha }
}
export function registeredWorktrees(root: string) {
  const result: { path: string; branch: string; locked: boolean }[] = []
  let current: { path: string; branch: string; locked: boolean } | undefined
  for (const token of git(root, ['worktree', 'list', '--porcelain', '-z']).split('\0')) {
    if (token.startsWith('worktree ')) {
      current = { path: canonicalPath(token.slice(9)), branch: '', locked: false }
      result.push(current)
    } else if (current && token.startsWith('branch ')) current.branch = token.slice(7)
    else if (current && (token === 'locked' || token.startsWith('locked '))) current.locked = true
  }
  return result
}
