import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { canonicalPath } from '../state/paths.js'
import {
  assertObservationWritable,
  inReadObservation,
  observedRead,
} from '../state/read-observation.js'
import { gitEnvironmentIdentity } from './git-environment.js'

export { gitEnvironmentIdentity } from './git-environment.js'

export function git(root: string, args: readonly string[], hooks?: string): string {
  return gitBytes(root, args, hooks).toString('utf8')
}
/** Byte-bound Git paths must be checked before UTF-8 decoding can replace invalid names. */
export function gitBytes(root: string, args: readonly string[], hooks?: string): Buffer {
  if (!inReadObservation()) {
    // Announce every possible Git write so observations reused within one
    // decision are renewed after it (ADR-0243); queries are not effects.
    if (!readOnlyGit(args)) assertObservationWritable()
    return readGit(root, args, hooks)
  }
  // A scoped observer cannot run even an accidentally supplied Git mutation.
  // The fixed readers use only these queries; unknown commands fail closed.
  if (!readOnlyGit(args)) assertObservationWritable()
  const path = resolve(root),
    input = [...args],
    environment = gitEnvironmentIdentity(),
    key = JSON.stringify(['git', path, input, hooks ?? null, environment])
  return Buffer.from(
    observedRead(key, () => {
      if (gitEnvironmentIdentity() !== environment) assertObservationWritable()
      const bytes = readGit(path, input, hooks)
      return { bytes, value: bytes }
    }),
  )
}
function readOnlyGit(args: readonly string[]): boolean {
  const command = args[0] === '-c' ? args[2] : args[0],
    query = args[0] === '-c' ? args.slice(2) : args
  return !(
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
    environment = gitEnvironmentIdentity(),
    value = observedRead(JSON.stringify(['ancestor', path, head, base, environment]), () => {
      if (gitEnvironmentIdentity() !== environment) assertObservationWritable()
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
/** Split one multi-query output only when every answer is a newline-terminated, newline-free line. */
function lines(output: string, count: number): string[] | undefined {
  const parts = output.split('\n')
  return parts.length === count + 1 && parts[count] === '' ? parts.slice(0, count) : undefined
}
function repositoryFacts(root: string, toplevel: string, common: string) {
  const path = canonicalPath(toplevel.trim())
  // Git returns a path relative to the command's cwd in a primary checkout.
  // Resolve there explicitly instead of treating output as relative to this process.
  const commonDir = canonicalPath(resolve(root, common.trim()))
  return { path, commonDir, key: createHash('sha256').update(commonDir).digest('hex').slice(0, 16) }
}
/** Both answers come from one repository discovery (ADR-0243). A path containing a
 * newline makes the joined output ambiguous; it keeps the original separate queries. */
export function repository(root: string) {
  const joined = lines(git(root, ['rev-parse', '--show-toplevel', '--git-common-dir']), 2)
  if (joined) return repositoryFacts(root, joined[0] ?? '', joined[1] ?? '')
  const toplevel = git(root, ['rev-parse', '--show-toplevel'])
  return repositoryFacts(root, toplevel, git(root, ['rev-parse', '--git-common-dir']))
}
function namedBaseInput(input: string): void {
  if (!input.trim() || input.startsWith('-') || /[\n\r\0]/.test(input))
    throw new Error('Provide a named base branch')
}
function namedRef(root: string, input: string): string {
  const ref = git(root, [
    'rev-parse',
    '--verify',
    '--symbolic-full-name',
    '--end-of-options',
    input,
  ]).trim()
  if (!/^refs\/(heads|remotes)\/.+/.test(ref) || /[\n\r]/.test(ref))
    throw new Error('Base must resolve to one named local or remote branch')
  return ref
}
/**
 * Repository identity plus a named base, for callers that accept only when the
 * symbolic name equals the requested full ref. The commit is then peeled from
 * that same name inside the identity query: three answers, one process. The
 * symbolic resolution stays separate because it is a different rev-parse mode.
 */
export function repositoryBase(root: string, target: string) {
  namedBaseInput(target)
  const joined = lines(
    git(root, [
      'rev-parse',
      '--show-toplevel',
      '--git-common-dir',
      '--verify',
      '--end-of-options',
      `${target}^{commit}`,
    ]),
    3,
  )
  if (!joined) return { ...repository(root), ...namedBase(root, target) }
  return {
    ...repositoryFacts(root, joined[0] ?? '', joined[1] ?? ''),
    ref: namedRef(root, target),
    sha: (joined[2] ?? '').trim(),
  }
}
export function namedBase(root: string, input: string) {
  namedBaseInput(input)
  const ref = namedRef(root, input)
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
