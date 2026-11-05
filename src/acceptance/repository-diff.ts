import { contractDigest } from '../contracts/compatibility.js'
import type { ProcessResult } from '../fanout/process.js'
import { assemblyGitArguments, assertAssemblyGitConfiguration } from '../integration/git-process.js'
import { AcceptanceError } from './contracts.js'

export const REPOSITORY_DIFF_OPERATIONS = [
  'configuration',
  'head',
  'status',
  'ancestor',
  'diff',
  'head',
] as const
export type RepositoryDiffOperation = (typeof REPOSITORY_DIFF_OPERATIONS)[number]
export interface RepositoryDiffBinding {
  repository: string
  path: string
  base: string
  head: string
  snapshot: string
}
export interface RepositoryDiffControl {
  invocation: string
  deadline: string
  signal: AbortSignal
}
export interface RepositoryDiffResult extends ProcessResult {
  binding: RepositoryDiffBinding
  ownership: { invocation: string; invocationState: string; evidence: string }
}
export type RepositoryDiffReader = (
  repository: string,
  operation: RepositoryDiffOperation,
  control: RepositoryDiffControl,
) => Promise<RepositoryDiffResult>
export interface RepositoryDiffExecution {
  kind: 'repository.diff'
  invocation: string
  source: RepositoryDiffBinding
  calls: { operation: RepositoryDiffOperation; invocation: string; evidence: string }[]
}
export function repositoryDiffArguments(
  operation: RepositoryDiffOperation,
  base: string,
  head: string,
) {
  const sha = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
  if (!sha.test(base) || !sha.test(head)) throw new AcceptanceError('repository-diff-revision')
  const commands = {
    configuration: ['config', '--local', '--no-includes', '--name-only', '--null', '--list'],
    head: ['rev-parse', '--verify', '--end-of-options', 'HEAD^{commit}'],
    status: ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    ancestor: ['merge-base', '--is-ancestor', base, head],
    diff: [
      'diff-tree',
      '--no-commit-id',
      '--raw',
      '--no-abbrev',
      '--no-renames',
      '--no-ext-diff',
      '--no-textconv',
      '-r',
      '-z',
      base,
      head,
      '--',
    ],
  }
  if (!Object.hasOwn(commands, operation)) throw new AcceptanceError('repository-diff-operation')
  return [
    '--no-pager',
    ...assemblyGitArguments('/dev/null', 'Observation Owner', commands[operation]),
  ]
}
/** Raw NUL-delimited committed-object metadata, never worker-provided observations. */
export function parseRepositoryDiff(raw: string) {
  if (raw.includes('\uFFFD') || (raw !== '' && !raw.endsWith('\0')))
    throw new AcceptanceError('repository-diff-encoding')
  const fields = raw === '' ? [] : raw.slice(0, -1).split('\0')
  if (fields.length % 2 || fields.length > 10000) throw new AcceptanceError('repository-diff-shape')
  const changes = []
  for (let i = 0; i < fields.length; i += 2) {
    const header =
        /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([AMDT])$/.exec(
          fields[i] ?? '',
        ),
      path = fields[i + 1]
    if (
      !header ||
      !path ||
      path.startsWith('/') ||
      path.split('/').some((p) => !p || p === '.' || p === '..' || p === '.git') ||
      /[\r\n]/.test(path)
    )
      throw new AcceptanceError('repository-diff-shape')
    changes.push({
      path,
      before: { mode: header[1], oid: header[3] },
      after: { mode: header[2], oid: header[4] },
      status: header[5],
    })
  }
  changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  if (new Set(changes.map((change) => change.path)).size !== changes.length)
    throw new AcceptanceError('repository-diff-duplicate-path')
  return changes
}
export async function observeRepositoryDiff(
  expected: RepositoryDiffBinding,
  control: RepositoryDiffControl,
  reader: RepositoryDiffReader,
  current: () => void,
) {
  const calls: RepositoryDiffExecution['calls'] = []
  let raw = '',
    baseAncestor = false
  for (const operation of REPOSITORY_DIFF_OPERATIONS) {
    current()
    const result = await reader(expected.repository, operation, control)
    current()
    if (
      contractDigest(result.binding) !== contractDigest(expected) ||
      result.ownership.invocationState !== 'stopped' ||
      result.signal ||
      (result.code !== 0 && !(operation === 'ancestor' && result.code === 1)) ||
      !['succeeded', ...(operation === 'ancestor' ? ['crashed'] : [])].includes(result.status)
    )
      throw new AcceptanceError('repository-diff-read-unavailable')
    calls.push({
      operation,
      invocation: result.ownership.invocation,
      evidence: result.ownership.evidence,
    })
    if (operation === 'configuration') assertAssemblyGitConfiguration(result.stdout)
    if (operation === 'head' && result.stdout.trim() !== expected.head)
      throw new AcceptanceError('repository-diff-head-changed')
    if (operation === 'status' && result.stdout !== '')
      throw new AcceptanceError('repository-diff-dirty-candidate')
    if (operation === 'ancestor') baseAncestor = result.code === 0
    if (operation === 'diff') raw = result.stdout
  }
  const changes = parseRepositoryDiff(raw)
  return {
    observation: {
      base: expected.base,
      head: expected.head,
      baseAncestor,
      changedPaths: changes.map((change) => change.path),
      changes,
    },
    execution: {
      kind: 'repository.diff' as const,
      invocation: control.invocation,
      source: expected,
      calls,
    },
  }
}
