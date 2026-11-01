import { isObject } from '../config/schema.js'
import {
  type CommandExecutor,
  codehostRepository,
  executeCodehostCommand,
} from '../pull-requests/codehost.js'
import { type CiObservation, type RunnerCiHost, validateCiObservation } from './ci-observations.js'
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
      )
    try {
      return JSON.parse(output) as unknown
    } catch {
      throw new DeliveryRunnerError('publication-host-incomplete')
    }
  }
  async remoteHead(target: Readonly<RunnerPublicationTarget>, _signal?: AbortSignal) {
    this.repository(target)
    const output = await this.execute(
        'git',
        ['ls-remote', '--heads', '--', target.remote, `refs/heads/${target.branch}`],
        target.path,
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
  async pullRequests(target: Readonly<RunnerPublicationTarget>, _signal?: AbortSignal) {
    const repo = this.repository(target),
      owner = repo.path.split('/')[0] ?? '',
      value = await this.api(
        target,
        `pulls?state=all&per_page=100&head=${encodeURIComponent(`${owner}:${target.branch}`)}`,
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
