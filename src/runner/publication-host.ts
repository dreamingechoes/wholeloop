// GitHub code, CI and merge hosts through the installed git and gh clients and their credential
// store.
import { isObject } from '../config/schema.js'
import {
  type CommandExecutor,
  codehostRepository,
  executeCodehostCommand,
} from '../pull-requests/codehost.js'
import { type CiObservation, type RunnerCiHost, validateCiObservation } from './ci-observations.js'
import { readGithubFeedback } from './github-feedback.js'
import type { MergeMethod } from './merge-eligibility.js'
import {
  assertMergeTarget,
  type RunnerMergeFacts,
  type RunnerMergeFactsHost,
  type RunnerMergeHost,
  type RunnerMergeRead,
  type RunnerMergeTarget,
} from './merge-execution.js'
import type {
  RunnerCodeHost,
  RunnerPublicationTarget,
  RunnerPullRequest,
} from './publication-stages.js'
import { DeliveryRunnerError } from './route.js'

const SHA = /^[a-f0-9]{40,64}$/
/**
 * GitHub through the installed `git` and `gh` clients and their own credential
 * stores. Pushes pin the object and never force; reads are complete or refuse.
 * Other hosts stay unsupported until a reviewed client exposes the same semantics.
 */
export class GithubCliCodeHost implements RunnerCodeHost {
  readonly provenance = 'host-observed' as const
  constructor(readonly execute: CommandExecutor = executeCodehostCommand) {}
  private repository(target: Readonly<RunnerPublicationTarget>) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(target.remote))
      throw new DeliveryRunnerError('publication-host-remote')
    const repo = codehostRepository(target.path, target.remote)
    if (repo.host !== 'github.com') throw new DeliveryRunnerError('publication-host-unsupported')
    return repo
  }
  private async api(
    target: Readonly<RunnerPublicationTarget>,
    endpoint: string,
    method = 'GET',
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const repo = this.repository(target),
      output = await this.execute(
        'gh',
        [
          'api',
          '--hostname',
          repo.host,
          '--method',
          method,
          `repos/${repo.path}/${endpoint}`,
          ...(body ? ['--input', '-'] : []),
        ],
        target.path,
        body ? JSON.stringify(body) : undefined,
        signal,
      )
    try {
      return JSON.parse(output) as unknown
    } catch {
      throw new DeliveryRunnerError('publication-host-incomplete')
    }
  }
  async readFeedback(target: Readonly<RunnerPublicationTarget>, pr: string, signal: AbortSignal) {
    const repo = this.repository(target)
    return readGithubFeedback({
      repository: repo.url,
      pr,
      head: target.head,
      base: target.base,
      signal,
      api: async (endpoint, signal) => {
        if (signal.aborted) throw new DeliveryRunnerError('ci-feedback-cancelled')
        const output = await this.execute(
          'gh',
          ['api', '--hostname', repo.host, '--method', 'GET', `repos/${repo.path}/${endpoint}`],
          target.path,
          undefined,
          signal,
        )
        try {
          return JSON.parse(output) as unknown
        } catch {
          throw new DeliveryRunnerError('ci-feedback-host-incomplete')
        }
      },
    })
  }
  async remoteHead(target: Readonly<RunnerPublicationTarget>, signal?: AbortSignal) {
    this.repository(target)
    const output = await this.execute(
        'git',
        ['ls-remote', '--heads', '--', target.remote, `refs/heads/${target.branch}`],
        target.path,
        undefined,
        signal,
      ),
      lines = output.split('\n').filter((line) => line.trim())
    if (lines.length > 1) throw new DeliveryRunnerError('publication-host-ambiguous-ref')
    if (!lines.length) return null
    const [sha, ref] = (lines[0] ?? '').split('\t')
    if (!sha || !SHA.test(sha) || ref !== `refs/heads/${target.branch}`)
      throw new DeliveryRunnerError('publication-host-incomplete')
    return sha
  }
  async push(target: Readonly<RunnerPublicationTarget>, _signal?: AbortSignal) {
    this.repository(target)
    if (!SHA.test(target.head)) throw new DeliveryRunnerError('publication-host-head')
    // Pin the object; no force, lease override, tags or other refs.
    await this.execute(
      'git',
      [
        'push',
        '--no-follow-tags',
        '--',
        target.remote,
        `${target.head}:refs/heads/${target.branch}`,
      ],
      target.path,
    )
  }
  async pullRequests(target: Readonly<RunnerPublicationTarget>, signal?: AbortSignal) {
    const repo = this.repository(target),
      owner = repo.path.split('/')[0] ?? '',
      value = await this.api(
        target,
        `pulls?state=all&per_page=100&head=${encodeURIComponent(`${owner}:${target.branch}`)}`,
        'GET',
        undefined,
        signal,
      )
    if (!Array.isArray(value) || value.length >= 100)
      throw new DeliveryRunnerError('publication-host-incomplete')
    return value.map((entry): RunnerPullRequest => {
      const head = isObject(entry) && isObject(entry.head) ? entry.head : {},
        base = isObject(entry) && isObject(entry.base) ? entry.base : {}
      if (
        !isObject(entry) ||
        typeof entry.html_url !== 'string' ||
        !entry.html_url.startsWith(`${repo.url}/pull/`) ||
        typeof head.ref !== 'string' ||
        typeof base.ref !== 'string' ||
        typeof head.sha !== 'string' ||
        !SHA.test(head.sha) ||
        typeof entry.draft !== 'boolean' ||
        !['open', 'closed'].includes(String(entry.state))
      )
        throw new DeliveryRunnerError('publication-host-incomplete')
      return {
        url: entry.html_url,
        branch: head.ref,
        base: base.ref,
        sha: head.sha,
        draft: entry.draft,
        state: entry.merged_at ? 'merged' : (entry.state as 'open' | 'closed'),
        body: typeof entry.body === 'string' ? entry.body : '',
      }
    })
  }
  async create(
    target: Readonly<RunnerPublicationTarget>,
    text: Readonly<{ title: string; body: string }>,
    _signal?: AbortSignal,
  ) {
    await this.api(target, 'pulls', 'POST', {
      head: target.branch,
      base: target.base,
      title: text.title,
      body: text.body,
      draft: true,
      maintainer_can_modify: false,
    })
  }
  async ready(target: Readonly<RunnerPublicationTarget>, url: string, _signal?: AbortSignal) {
    const repo = this.repository(target)
    if (!url.startsWith(`${repo.url}/pull/`) || !/\/pull\/[1-9][0-9]*$/.test(url))
      throw new DeliveryRunnerError('publication-host-pull-request')
    await this.execute(
      'gh',
      ['pr', 'ready', '--repo', `${repo.host}/${repo.path}`, '--', url],
      target.path,
    )
  }
}

/** Complete GitHub reads of one PR's checks, protection and reviews; permission gaps stay unknown. */
export class GithubCliCiHost implements RunnerCiHost {
  constructor(readonly execute: CommandExecutor = executeCodehostCommand) {}
  async observe(
    target: Readonly<{ path: string; remote: string; base: string; head: string }>,
    pr: string,
    _signal?: AbortSignal,
  ): Promise<CiObservation> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(target.remote))
      throw new DeliveryRunnerError('publication-host-remote')
    const repo = codehostRepository(target.path, target.remote)
    if (repo.host !== 'github.com') throw new DeliveryRunnerError('publication-host-unsupported')
    const number = /^https:\/\/github\.com\/[^?#]+\/pull\/([1-9][0-9]*)$/.exec(pr)?.[1]
    if (!number || !pr.startsWith(`${repo.url}/pull/`))
      throw new DeliveryRunnerError('publication-host-pull-request')
    const api = async (endpoint: string) => {
      const output = await this.execute(
        'gh',
        ['api', '--hostname', repo.host, '--method', 'GET', `repos/${repo.path}/${endpoint}`],
        target.path,
      )
      try {
        return JSON.parse(output) as unknown
      } catch {
        throw new DeliveryRunnerError('publication-host-incomplete')
      }
    }
    const pull = await api(`pulls/${number}`),
      head = isObject(pull) && isObject(pull.head) ? pull.head.sha : undefined,
      base = isObject(pull) && isObject(pull.base) ? pull.base.ref : undefined
    if (typeof head !== 'string' || !SHA.test(head) || typeof base !== 'string')
      throw new DeliveryRunnerError('publication-host-incomplete')
    // Checks are read at the candidate, never at the moving PR head.
    const runs: Record<string, unknown>[] = []
    let total = -1,
      complete = false
    for (let page = 1; page <= 10; page++) {
      const value = await api(`commits/${target.head}/check-runs?per_page=100&page=${page}`)
      if (
        !isObject(value) ||
        typeof value.total_count !== 'number' ||
        !Array.isArray(value.check_runs)
      )
        throw new DeliveryRunnerError('publication-host-incomplete')
      total = value.total_count
      runs.push(...value.check_runs.filter(isObject))
      if (runs.length >= total || value.check_runs.length < 100) {
        complete = runs.length === total
        break
      }
    }
    const attempts = new Map<string, number>(),
      checks = runs
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((run) => {
          const app = isObject(run.app) ? run.app : {},
            issuer = typeof app.id === 'number' ? `github-app:${app.id}` : undefined,
            key = `${String(run.name)}\u0000${issuer ?? ''}`,
            attempt = (attempts.get(key) ?? 0) + 1
          attempts.set(key, attempt)
          return {
            name: String(run.name),
            ...(issuer ? { issuer } : {}),
            attempt,
            head: String(run.head_sha),
            status: String(run.status),
            ...(typeof run.conclusion === 'string' ? { conclusion: run.conclusion } : {}),
          }
        }) as CiObservation['checks']
    let protection: CiObservation['protection'] = { status: 'unknown', required: [] },
      reviews: CiObservation['reviews'] = { status: 'unknown' }
    try {
      const value = await api(`branches/${encodeURIComponent(base)}/protection`)
      if (!isObject(value)) throw new Error()
      const statuses = isObject(value.required_status_checks) ? value.required_status_checks : {},
        rules = isObject(value.required_pull_request_reviews)
          ? value.required_pull_request_reviews
          : {}
      protection = {
        status: 'observed',
        required: (Array.isArray(statuses.checks) ? statuses.checks : [])
          .filter(isObject)
          .map((entry) => ({
            name: String(entry.context),
            ...(typeof entry.app_id === 'number' ? { issuer: `github-app:${entry.app_id}` } : {}),
          })),
        ...(typeof statuses.strict === 'boolean' ? { strict: statuses.strict } : {}),
      }
      reviews.required =
        typeof rules.required_approving_review_count === 'number'
          ? rules.required_approving_review_count
          : 0
    } catch {
      // A denied or unreadable protection read is unknown, never an empty rule set.
    }
    if (reviews.required !== undefined) {
      try {
        const value = await api(`pulls/${number}/reviews?per_page=100`)
        if (!Array.isArray(value) || value.length >= 100) throw new Error()
        const latest = new Map<string, unknown>()
        for (const review of value.filter(isObject))
          if (isObject(review.user)) latest.set(String(review.user.id), review)
        reviews = {
          status: 'observed',
          required: reviews.required,
          approvals: [...latest.values()].filter(
            (review) =>
              isObject(review) && review.state === 'APPROVED' && review.commit_id === target.head,
          ).length,
        }
      } catch {
        reviews = { status: 'unknown' }
      }
    }
    const observation: CiObservation = {
      schema: 'wholeloop/delivery-ci@1',
      codeHost: 'github',
      repository: repo.url,
      pr,
      candidate: target.head,
      head,
      base,
      observedAt: new Date().toISOString(),
      complete,
      checks,
      protection,
      reviews,
      provenance: 'host-observed',
    }
    validateCiObservation(observation)
    return observation
  }
}

const METHOD_FLAG: Record<MergeMethod, string> = {
  merge: '--merge',
  squash: '--squash',
  rebase: '--rebase',
}
/**
 * GitHub merge through `gh pr merge` with `--match-head-commit`, so the server
 * enforces the exact head. It never passes --admin, --auto or --delete-branch.
 */
export class GithubCliMergeHost implements RunnerMergeHost {
  readonly provenance = 'host-observed' as const
  constructor(readonly execute: CommandExecutor = executeCodehostCommand) {}
  private repository(target: Readonly<RunnerMergeTarget>) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(target.remote))
      throw new DeliveryRunnerError('publication-host-remote')
    const repo = codehostRepository(target.path, target.remote)
    if (repo.host !== 'github.com') throw new DeliveryRunnerError('publication-host-unsupported')
    assertMergeTarget(target)
    if (!target.pr.startsWith(`${repo.url}/pull/`))
      throw new DeliveryRunnerError('publication-host-pull-request')
    return repo
  }
  async actor(_signal?: AbortSignal) {
    const value: unknown = JSON.parse(
      await this.execute('gh', ['api', '--method', 'GET', 'user'], process.cwd()),
    )
    if (!isObject(value) || typeof value.login !== 'string' || !value.login)
      throw new DeliveryRunnerError('publication-host-incomplete')
    return value.login
  }
  async read(target: Readonly<RunnerMergeTarget>, _signal?: AbortSignal): Promise<RunnerMergeRead> {
    const repo = this.repository(target),
      number = target.pr.slice(`${repo.url}/pull/`.length)
    let value: unknown
    try {
      value = JSON.parse(
        await this.execute(
          'gh',
          ['api', '--hostname', repo.host, '--method', 'GET', `repos/${repo.path}/pulls/${number}`],
          target.path,
        ),
      )
    } catch {
      throw new DeliveryRunnerError('publication-host-incomplete')
    }
    const head = isObject(value) && isObject(value.head) ? value.head.sha : undefined
    if (!isObject(value) || typeof head !== 'string' || !SHA.test(head))
      throw new DeliveryRunnerError('publication-host-incomplete')
    const by = isObject(value.merged_by) ? value.merged_by.login : undefined
    return {
      state: value.merged === true ? 'merged' : value.state === 'open' ? 'open' : 'closed',
      head,
      ...(typeof value.merge_commit_sha === 'string' && value.merged === true
        ? { mergeCommit: value.merge_commit_sha }
        : {}),
      ...(typeof by === 'string' ? { mergedBy: by } : {}),
    }
  }
  async merge(target: Readonly<RunnerMergeTarget>, _signal?: AbortSignal) {
    const repo = this.repository(target)
    if (!SHA.test(target.head)) throw new DeliveryRunnerError('publication-host-head')
    await this.execute(
      'gh',
      [
        'pr',
        'merge',
        '--repo',
        `${repo.host}/${repo.path}`,
        METHOD_FLAG[target.method],
        '--match-head-commit',
        target.head,
        '--',
        target.pr,
      ],
      target.path,
    )
  }
}

const THREADS = `query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$after){nodes{isResolved}pageInfo{hasNextPage endCursor}}}}}`
/**
 * Complete pull-request facts through `gh` (ADR-0199). Each fact is read on its
 * own: one that is denied, malformed or beyond its page bound becomes unknown
 * and keeps the candidate from merging, while the others stay observed.
 */
export class GithubCliMergeFactsHost implements RunnerMergeFactsHost {
  readonly provenance = 'host-observed' as const
  constructor(readonly execute: CommandExecutor = executeCodehostCommand) {}
  async facts(
    target: Readonly<RunnerMergeTarget>,
    _signal?: AbortSignal,
  ): Promise<RunnerMergeFacts> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(target.remote))
      throw new DeliveryRunnerError('publication-host-remote')
    const repo = codehostRepository(target.path, target.remote)
    if (repo.host !== 'github.com') throw new DeliveryRunnerError('publication-host-unsupported')
    assertMergeTarget(target)
    if (!target.pr.startsWith(`${repo.url}/pull/`))
      throw new DeliveryRunnerError('publication-host-pull-request')
    const number = target.pr.slice(`${repo.url}/pull/`.length),
      [owner, name] = repo.path.split('/'),
      json = async (args: string[]) => {
        const output = await this.execute('gh', args, target.path)
        try {
          return JSON.parse(output) as unknown
        } catch {
          throw new DeliveryRunnerError('publication-host-incomplete')
        }
      },
      api = (endpoint: string) =>
        json(['api', '--hostname', repo.host, '--method', 'GET', `repos/${repo.path}/${endpoint}`])
    const pull = await api(`pulls/${number}`),
      head = isObject(pull) && isObject(pull.head) ? pull.head.sha : undefined,
      base = isObject(pull) && isObject(pull.base) ? pull.base.ref : undefined
    if (
      !isObject(pull) ||
      typeof head !== 'string' ||
      !SHA.test(head) ||
      typeof base !== 'string' ||
      typeof pull.draft !== 'boolean'
    )
      throw new DeliveryRunnerError('publication-host-incomplete')
    const unknown = async <T>(read: () => Promise<T>): Promise<T | 'unknown'> => {
      try {
        return await read()
      } catch {
        return 'unknown'
      }
    }
    const files = await unknown(async () => {
        const total = pull.changed_files
        if (typeof total !== 'number' || total > 3000) throw new Error()
        const names: string[] = []
        for (let page = 1; names.length < total && page <= 30; page++) {
          const value = await api(`pulls/${number}/files?per_page=100&page=${page}`)
          if (!Array.isArray(value) || !value.length) throw new Error()
          for (const entry of value)
            if (isObject(entry) && typeof entry.filename === 'string') names.push(entry.filename)
            else throw new Error()
        }
        if (names.length !== total) throw new Error()
        return names.sort()
      }),
      unresolvedDiscussions = await unknown(async () => {
        let after: string | undefined,
          open = 0
        for (let page = 0; page < 10; page++) {
          const value = await json([
            'api',
            'graphql',
            '--hostname',
            repo.host,
            '-f',
            `query=${THREADS}`,
            '-F',
            `owner=${owner}`,
            '-F',
            `name=${name}`,
            '-F',
            `number=${number}`,
            ...(after ? ['-f', `after=${after}`] : []),
          ])
          const threads =
            isObject(value) &&
            isObject(value.data) &&
            isObject(value.data.repository) &&
            isObject(value.data.repository.pullRequest)
              ? value.data.repository.pullRequest.reviewThreads
              : undefined
          if (!isObject(threads) || !Array.isArray(threads.nodes) || !isObject(threads.pageInfo))
            throw new Error()
          for (const node of threads.nodes)
            if (!isObject(node) || typeof node.isResolved !== 'boolean') throw new Error()
            else if (!node.isResolved) open++
          if (threads.pageInfo.hasNextPage !== true) return open
          if (typeof threads.pageInfo.endCursor !== 'string') throw new Error()
          after = threads.pageInfo.endCursor
        }
        throw new Error()
      }),
      allowedMethods = await unknown(async () => {
        const value = await json([
          'api',
          '--hostname',
          repo.host,
          '--method',
          'GET',
          `repos/${repo.path}`,
        ])
        if (!isObject(value)) throw new Error()
        const flags: [MergeMethod, unknown][] = [
          ['merge', value.allow_merge_commit],
          ['squash', value.allow_squash_merge],
          ['rebase', value.allow_rebase_merge],
        ]
        // Without push access GitHub omits these settings; that is unknown, not "none".
        if (flags.some(([, flag]) => typeof flag !== 'boolean')) throw new Error()
        return flags.filter(([, flag]) => flag === true).map(([method]) => method)
      }),
      baseCurrent = await unknown(async () => {
        const value = await api(`compare/${encodeURIComponent(base)}...${head}`)
        if (!isObject(value) || typeof value.behind_by !== 'number') throw new Error()
        return value.behind_by === 0
      })
    return {
      state: pull.merged === true ? 'merged' : pull.state === 'open' ? 'open' : 'closed',
      draft: pull.draft,
      head,
      base,
      // GitHub computes mergeability asynchronously and reports null meanwhile.
      mergeable: typeof pull.mergeable === 'boolean' ? pull.mergeable : 'unknown',
      files,
      unresolvedDiscussions,
      allowedMethods,
      baseCurrent,
      observedAt: new Date().toISOString(),
    }
  }
}
