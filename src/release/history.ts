import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import type { ReleaseCommit } from './notes.js'

const sha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
function localGit(repository: string, args: string[], allowed = [0], environment = process.env) {
  const result = spawnSync(
    'git',
    ['--no-pager', '-c', 'log.showSignature=false', '-c', 'core.fsmonitor=false', ...args],
    {
      cwd: repository,
      encoding: 'utf8',
      timeout: 10000,
      killSignal: 'SIGKILL',
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...environment,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_LAZY_FETCH: '1',
        GIT_NO_REPLACE_OBJECTS: '1',
      },
    },
  )
  if (result.error || result.status === null || !allowed.includes(result.status))
    throw new Error('Cannot read bounded local release history; diagnostics omitted')
  return result
}

/** Observe exact source identity without printing changed paths or invoking configured monitors. */
export function releaseSource(repository: string) {
  const environment = { ...process.env }
  // Ambient Git selectors must not make package metadata and source status refer to different trees.
  for (const key of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_COMMON_DIR',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  ])
    delete environment[key]
  const git = (args: string[]) => localGit(repository, args, [0], environment)
  const top = git(['rev-parse', '--show-toplevel']).stdout.trim()
  if (realpathSync(top) !== realpathSync(repository))
    throw new Error('Release preflight must run at the source checkout root')
  const head = git(['rev-parse', '--verify', 'HEAD']).stdout.trim()
  if (!sha.test(head)) throw new Error('Release source needs one exact local commit')
  const status = git([
    'status',
    '--porcelain=v1',
    '--untracked-files=normal',
    '--ignore-submodules=none',
  ]).stdout
  const entries = git(['ls-files', '-v', '-z']).stdout.split('\0').filter(Boolean)
  const indexClean = !entries.some((entry) => /^[a-z]/.test(entry) || entry.startsWith('S '))
  return { head, clean: status.length === 0, indexClean }
}

/** Read only complete local history; retain no subprocess diagnostics or commit bodies. */
export function releaseHistory(repository: string, from: string | undefined, to = 'HEAD') {
  const git = (args: string[], allowed = [0]) => localGit(repository, args, allowed)
  if (git(['rev-parse', '--is-shallow-repository']).stdout.trim() !== 'false')
    throw new Error('Release notes require complete local history, not a shallow clone')
  if (
    git(['config', '--get-regexp', '^(extensions.partialclone|remote..*.promisor)$'], [0, 1])
      .status === 0
  )
    throw new Error('Release notes require a complete local clone without lazy object fetching')
  const revision = (ref: string) => {
    const value = git([
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${ref}^{commit}`,
    ]).stdout.trim()
    if (!sha.test(value)) throw new Error('Release revision did not resolve to one commit')
    return value
  }
  const end = revision(to),
    start = from === undefined ? undefined : revision(from)
  if (start && git(['merge-base', '--is-ancestor', start, end], [0, 1]).status !== 0)
    throw new Error('Release starting revision must be an ancestor of its ending revision')
  const raw = git([
    'log',
    '--reverse',
    '--max-count=1001',
    '--no-decorate',
    '--no-notes',
    '--format=%H%x00%B%x00',
    end,
    ...(start ? [`^${start}`] : []),
    '--',
  ]).stdout
  const parts = raw.split('\0')
  if (parts.pop()?.trim() || parts.length % 2)
    throw new Error('Incomplete release history response')
  const commits: ReleaseCommit[] = []
  for (let index = 0; index < parts.length; index += 2) {
    const id = parts[index]?.trim(),
      message = parts[index + 1]
    if (!id || !sha.test(id) || message === undefined)
      throw new Error('Invalid release history record')
    commits.push({ sha: id, message })
  }
  if (commits.length > 1000)
    throw new Error('Release history exceeds 1000 commits; select a narrower range')
  return { from: start ?? null, to: end, commits }
}
