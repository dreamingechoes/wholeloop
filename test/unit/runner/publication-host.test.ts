import { describe, expect, it } from 'vitest'
import { GithubCliCodeHost } from '../../../src/runner/publication-host.js'
import type { RunnerPublicationTarget } from '../../../src/runner/publication-stages.js'
import { fixture, git } from '../../support/delivery.js'

type Call = { binary: string; args: readonly string[]; input?: string }
/** A stub executor: it records argument shapes and returns canned complete JSON. */
async function setup(
  run: (input: {
    host: GithubCliCodeHost
    calls: Call[]
    target: RunnerPublicationTarget
    reply: (value: string) => void
  }) => Promise<void>,
  remote = 'https://github.com/fixture/app.git',
) {
  await fixture(async ({ root }) => {
    git(root, ['remote', 'add', 'origin', remote])
    const calls: Call[] = []
    let next = ''
    const host = new GithubCliCodeHost(async (binary, args, _cwd, input) => {
      calls.push({ binary, args, ...(input ? { input } : {}) })
      return next
    })
    await run({
      host,
      calls,
      reply: (value) => {
        next = value
      },
      target: {
        repository: 'app',
        path: root,
        remote: 'origin',
        branch: 'wl/integration-1',
        base: 'main',
        head: 'b'.repeat(40),
      },
    })
  })
}
const pr = (overrides: Record<string, unknown> = {}) => ({
  html_url: 'https://github.com/fixture/app/pull/7',
  head: { ref: 'wl/integration-1', sha: 'b'.repeat(40) },
  base: { ref: 'main' },
  draft: true,
  state: 'open',
  body: 'Owned.',
  ...overrides,
})

describe('GitHub CLI code host (stub executor)', () => {
  it('pushes the pinned object without force and reads the exact remote tip', () =>
    setup(async ({ host, calls, target, reply }) => {
      await host.push(target, new AbortController().signal)
      expect(calls[0]).toEqual({
        binary: 'git',
        args: [
          'push',
          '--no-follow-tags',
          '--',
          'origin',
          `${'b'.repeat(40)}:refs/heads/wl/integration-1`,
        ],
      })
      expect(calls.flatMap((call) => call.args).some((arg) => /force|\+/.test(arg))).toBe(false)
      reply('')
      expect(await host.remoteHead(target, new AbortController().signal)).toBeNull()
      reply(`${'c'.repeat(40)}\trefs/heads/wl/integration-1\n`)
      expect(await host.remoteHead(target, new AbortController().signal)).toBe('c'.repeat(40))
      reply(
        `${'c'.repeat(40)}\trefs/heads/wl/integration-1\n${'d'.repeat(40)}\trefs/heads/wl/integration-1\n`,
      )
      await expect(host.remoteHead(target, new AbortController().signal)).rejects.toThrow(
        'ambiguous',
      )
      reply('garbage\n')
      await expect(host.remoteHead(target, new AbortController().signal)).rejects.toThrow(
        'incomplete',
      )
    }))
  it('reads complete PR sets and refuses truncated or foreign listings', () =>
    setup(async ({ host, calls, target, reply }) => {
      reply(JSON.stringify([pr()]))
      expect(await host.pullRequests(target, new AbortController().signal)).toEqual([
        {
          url: 'https://github.com/fixture/app/pull/7',
          branch: 'wl/integration-1',
          base: 'main',
          sha: 'b'.repeat(40),
          draft: true,
          state: 'open',
          body: 'Owned.',
        },
      ])
      expect(calls[0]?.args).toContain(
        'repos/fixture/app/pulls?state=all&per_page=100&head=fixture%3Awl%2Fintegration-1',
      )
      reply(JSON.stringify(Array.from({ length: 100 }, () => pr())))
      await expect(host.pullRequests(target, new AbortController().signal)).rejects.toThrow(
        'incomplete',
      )
      reply(JSON.stringify([pr({ html_url: 'https://github.com/other/app/pull/7' })]))
      await expect(host.pullRequests(target, new AbortController().signal)).rejects.toThrow(
        'incomplete',
      )
      reply('not json')
      await expect(host.pullRequests(target, new AbortController().signal)).rejects.toThrow(
        'incomplete',
      )
    }))
  it('creates only drafts and readies only this repository PR', () =>
    setup(async ({ host, calls, target, reply }) => {
      reply('{}')
      await host.create(target, { title: 'Title', body: 'Body' }, new AbortController().signal)
      expect(JSON.parse(calls[0]?.input ?? '{}')).toEqual({
        head: 'wl/integration-1',
        base: 'main',
        title: 'Title',
        body: 'Body',
        draft: true,
        maintainer_can_modify: false,
      })
      await host.ready(
        target,
        'https://github.com/fixture/app/pull/7',
        new AbortController().signal,
      )
      expect(calls[1]).toEqual({
        binary: 'gh',
        args: [
          'pr',
          'ready',
          '--repo',
          'github.com/fixture/app',
          '--',
          'https://github.com/fixture/app/pull/7',
        ],
      })
      await expect(
        host.ready(target, 'https://github.com/other/app/pull/7', new AbortController().signal),
      ).rejects.toThrow('publication-host-pull-request')
      expect(calls).toHaveLength(2)
    }))
  it('keeps other code hosts unsupported', () =>
    setup(async ({ host, calls, target }) => {
      await expect(host.push(target, new AbortController().signal)).rejects.toThrow(
        'publication-host-unsupported',
      )
      expect(calls).toEqual([])
    }, 'https://gitlab.com/fixture/app.git'))
})
