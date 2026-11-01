import { isObject } from '../config/schema.js'
import {
  type CommandExecutor,
  codehostRepository,
  executeCodehostCommand,
} from '../pull-requests/codehost.js'
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
