import { isObject, validate } from '../config/schema.js'
import { isReleaseVersion } from './notes.js'
import contextSchema from './schemas/context-v1.json' with { type: 'json' }

export interface ReleaseContext {
  schema: 'wholeloop/release-context@1'
  repository: string
  public: boolean
  defaultBranch: string
  ref: string
  commit: string
  event: string
  workflow: string
}
function packageRepository(pkg: Record<string, unknown>) {
  try {
    const repository = pkg.repository
    const url = new URL(
      String(isObject(repository) ? repository.url : repository).replace(/^git\+/, ''),
    )
    if (
      url.origin !== 'https://github.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined
    return url.pathname.slice(1).replace(/\.git$/, '')
  } catch {
    return undefined
  }
}

/** This consistency plan authorizes no publication and authenticates no supplied CI observation. */
export function releasePreflight(input: {
  version: string
  builtVersion: string
  package: unknown
  lock: unknown
  context: unknown
  source: { head: string; clean: boolean; indexClean: boolean }
}) {
  if (!isReleaseVersion(input.version) || input.version.includes('+'))
    throw new Error('Use an exact npm release version without build metadata')
  if (
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(input.source.head) ||
    typeof input.source.clean !== 'boolean' ||
    typeof input.source.indexClean !== 'boolean'
  )
    throw new Error('Use an exact source commit and observed worktree status')
  if (
    validate(input.context, contextSchema).length ||
    !isObject(input.package) ||
    !isObject(input.lock)
  )
    throw new Error(
      'Use bounded package, lock and wholeloop/release-context@1 metadata; contents omitted',
    )
  const context = input.context as unknown as ReleaseContext
  const pkg = input.package,
    lock = input.lock
  const rootLock =
    isObject(lock.packages) && isObject(lock.packages['']) ? lock.packages[''] : undefined
  const reasons: string[] = []
  if (pkg.name !== 'wholeloop') reasons.push('package-name')
  if (pkg.version !== input.version || input.builtVersion !== input.version)
    reasons.push('version-mismatch')
  if (
    lock.version !== input.version ||
    rootLock?.version !== input.version ||
    lock.name !== pkg.name ||
    rootLock?.name !== pkg.name
  )
    reasons.push('lock-mismatch')
  if (pkg.private !== false) reasons.push('package-private')
  if (!context.public) reasons.push('repository-private')
  if (packageRepository(pkg) !== context.repository) reasons.push('repository-mismatch')
  if (context.ref !== `refs/heads/${context.defaultBranch}`) reasons.push('not-default-branch')
  if (context.event !== 'workflow_dispatch') reasons.push('not-explicit-dispatch')
  if (context.commit !== input.source.head) reasons.push('commit-mismatch')
  if (!input.source.clean) reasons.push('source-dirty')
  if (!input.source.indexClean) reasons.push('source-index-flags')
  return {
    schema: 'wholeloop/release-preflight@1',
    status: reasons.length ? 'blocked' : 'ready',
    version: input.version,
    tag: `v${input.version}`,
    npmTag: input.version.includes('-') ? 'next' : 'latest',
    repository: context.repository,
    commit: input.source.head,
    workflow: context.workflow,
    reasons,
    publication: 'not-performed',
    limitations: [
      'Supplied CI metadata is not authenticated by this local consistency check.',
      'Ready is not permission to publish, native acceptance, npm ownership, OIDC configuration or provenance evidence.',
      'No version, file, ref, tag, visibility or publication is changed.',
    ],
  }
}
