import { spawnSync } from 'node:child_process'
import type { ReleaseCommit } from './notes.js'

const sha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
/** Read only complete local history; retain no subprocess diagnostics or commit bodies. */
export function releaseHistory(repository: string, from: string | undefined, to = 'HEAD') {
  const git = (args: string[], allowed = [0]) => {
    const result = spawnSync('git', ['--no-pager', '-c', 'log.showSignature=false', ...args], {
      cwd: repository,
      encoding: 'utf8',
      timeout: 10000,
      killSignal: 'SIGKILL',
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_LAZY_FETCH: '1',
      },
    })
    if (result.error || result.status === null || !allowed.includes(result.status))
      throw new Error('Cannot read bounded local release history; diagnostics omitted')
    return result
  }
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
