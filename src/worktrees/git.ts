// Byte-exact Git plumbing for worktrees, refs, objects and repository identity.
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
/**
 * Read-only object plumbing for pinned trees: `ls-tree` lists a commit once and
 * `cat-file --batch` returns many blobs from one process, so reading a pinned
 * guidance set costs two processes per repository rather than one per file.
 * Sealed observations have their own fixed readers; this one refuses inside them.
 */
export function gitObjects(
  root: string,
  args: readonly ['ls-tree' | 'cat-file', ...string[]],
  input?: Buffer,
  maxBuffer = 64 * 1024 * 1024,
): Buffer {
  if (inReadObservation()) assertObservationWritable()
  const response = spawnSync('git', [...args], {
    cwd: root,
    encoding: 'buffer',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    timeout: 30_000,
    maxBuffer,
    ...(input ? { input } : {}),
  })
  if (response.error || response.status !== 0)
    throw new Error(
      `Git ${args[0]} failed; inspect repository permissions and the requested reference`,
    )
  return response.stdout
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
/**
 * HEAD's commit and current branch from one process (ADR-0243). The symbolic
 * name is `HEAD` when detached and the full branch ref otherwise; any other
 * answer, a failure or an unexpected shape reruns the original two queries so
 * their outputs and errors, including a HEAD outside refs/heads, stay exact.
 */
export function currentHead(root: string): { head: string; branch: string } {
  let joined: string[] | undefined
  // A sealed observation shares each original query with its other readers by
  // key; a joined query there would add a process instead of saving one.
  if (!inReadObservation())
    try {
      joined = lines(git(root, ['rev-parse', 'HEAD', '--symbolic-full-name', 'HEAD']), 2)
    } catch {
      joined = undefined
    }
  const name = joined?.[1]
  if (joined && name !== undefined && (name === 'HEAD' || name.startsWith('refs/heads/')))
    return {
      head: joined[0] ?? '',
      branch: name === 'HEAD' ? '' : name.slice('refs/heads/'.length),
    }
  const head = git(root, ['rev-parse', 'HEAD']).trim()
  return { head, branch: git(root, ['branch', '--show-current']).trim() }
}
/**
 * Repository identity, absolute Git directory and current branch from one
 * process (ADR-0243), or undefined when the caller must run its original
 * separate queries: inside a sealed observation, after a failure, for an
 * ambiguous multi-line answer, or for a HEAD neither detached nor a branch.
 * Those queries then fail exactly as before.
 */
export function repositoryControl(root: string) {
  // Sealed observations keep the original queries, which other readers share.
  if (inReadObservation()) return undefined
  let joined: string[] | undefined
  try {
    joined = lines(
      git(root, [
        'rev-parse',
        '--show-toplevel',
        '--git-common-dir',
        '--absolute-git-dir',
        '--symbolic-full-name',
        'HEAD',
      ]),
      4,
    )
  } catch {
    return undefined
  }
  const name = joined?.[3]
  if (!joined || name === undefined || (name !== 'HEAD' && !name.startsWith('refs/heads/')))
    return undefined
  return {
    ...repositoryFacts(root, joined[0] ?? '', joined[1] ?? ''),
    gitDir: (joined[2] ?? '').trim(),
    branch: name === 'HEAD' ? '' : name.slice('refs/heads/'.length),
  }
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
