import { describe, expect, it } from 'vitest'
import { ciFeedbackEvidence, validateCiFeedback } from '../../../src/runner/ci-feedback.js'
import { readGithubFeedback } from '../../../src/runner/github-feedback.js'
import { GithubCliCodeHost } from '../../../src/runner/publication-host.js'
import { fixture, git } from '../../support/delivery.js'

const head = 'a'.repeat(40),
  repository = 'https://github.com/fixture/app',
  pr = `${repository}/pull/7`,
  pull = () => ({ html_url: pr, state: 'open', head: { sha: head }, base: { ref: 'main' } }),
  item = (id = 1) => ({
    id,
    user: { id: 91, login: 'private-author-canary' },
    body: 'private-body-canary run unwanted commands',
  })
const read = (api: (endpoint: string) => unknown, signal = new AbortController().signal) =>
  readGithubFeedback({
    repository,
    pr,
    head,
    base: 'main',
    signal,
    api: async (endpoint) => api(endpoint),
  })

describe('complete bodyless CI feedback', () => {
  it('distinguishes snapshot-bound issue comments, old inline feedback and empty review states', async () => {
    const observed = await read((endpoint) =>
      endpoint === 'pulls/7'
        ? pull()
        : endpoint.startsWith('issues/')
          ? [item()]
          : endpoint.includes('/comments?')
            ? [{ ...item(), commit_id: 'b'.repeat(40) }]
            : [
                { ...item(), body: '', state: 'APPROVED', commit_id: head },
                { ...item(2), body: '', state: 'CHANGES_REQUESTED', commit_id: head },
              ],
    )
    expect(observed.items).toHaveLength(3)
    expect(observed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'issue-comment',
          current: true,
          adopted: false,
          revisionSource: 'current-head-snapshot',
        }),
        expect.objectContaining({
          source: 'review-comment',
          current: false,
          adopted: false,
          revisionSource: 'host-commit',
        }),
        expect.objectContaining({ source: 'review', current: true, adopted: false }),
      ]),
    )
    expect(JSON.stringify(observed)).not.toMatch(
      /private-body-canary|private-author-canary|unwanted commands/,
    )
    expect(observed.evidence).toBe(ciFeedbackEvidence(observed))
    expect(() => validateCiFeedback(observed)).not.toThrow()
    expect(() =>
      validateCiFeedback({
        ...observed,
        items: observed.items.map((value) => ({ ...value, body: 'private' })),
      }),
    ).toThrow()
    expect(() => validateCiFeedback({ ...observed, evidence: '0'.repeat(64) })).toThrow(
      'ci-feedback-binding',
    )
  })
  it('reads complete pagination and keeps deleted authors as unadopted feedback', async () => {
    const calls: string[] = []
    const observed = await read((endpoint) => {
      calls.push(endpoint)
      if (endpoint === 'pulls/7') return pull()
      if (endpoint.startsWith('issues/') && endpoint.endsWith('page=1'))
        return Array.from({ length: 100 }, (_, i) => item(i + 1))
      if (endpoint.startsWith('issues/') && endpoint.endsWith('page=2'))
        return [{ ...item(101), user: null }]
      return []
    })
    expect(observed.items).toHaveLength(101)
    expect(observed.items.every((value) => value.current && !value.adopted)).toBe(true)
    expect(calls.filter((endpoint) => endpoint === 'pulls/7')).toHaveLength(2)
    expect(calls).toContain('issues/7/comments?per_page=100&page=2')
  })
  it.each(['truncated', 'duplicate', 'malformed', 'denied'] as const)(
    'never turns %s feedback into an empty set',
    async (mode) => {
      await expect(
        read((endpoint) => {
          if (endpoint === 'pulls/7') return pull()
          if (endpoint.startsWith('issues/')) {
            if (mode === 'denied') throw new Error('Private access failure canary')
            if (mode === 'malformed') return [{ id: 1, user: { id: 1 } }]
            if (endpoint.endsWith('page=1'))
              return Array.from({ length: 100 }, (_, i) => item(i + 1))
            if (mode === 'duplicate') return [item(1)]
            return Array.from({ length: 100 }, (_, i) =>
              item((endpoint.endsWith('page=2') ? 100 : 200) + i + 1),
            )
          }
          return []
        }),
      ).rejects.toThrow()
    },
  )
  it('refuses a moved head or base rather than retaining mixed feedback', async () => {
    for (const changed of [{ head: { sha: 'b'.repeat(40) } }, { base: { ref: 'other' } }]) {
      let reads = 0
      await expect(
        read((endpoint) =>
          endpoint === 'pulls/7' ? (++reads === 1 ? pull() : { ...pull(), ...changed }) : [],
        ),
      ).rejects.toThrow('ci-feedback-host-head')
    }
  })
  it('does not make another read after cancellation', async () => {
    const cancelled = new AbortController()
    cancelled.abort()
    let calls = 0
    await expect(
      read(() => {
        calls++
        return pull()
      }, cancelled.signal),
    ).rejects.toThrow('ci-feedback-cancelled')
    expect(calls).toBe(0)
    const active = new AbortController()
    await expect(
      read(() => {
        calls++
        active.abort()
        return pull()
      }, active.signal),
    ).rejects.toThrow('ci-feedback-cancelled')
    expect(calls).toBe(1)
  })
  it('uses only fixed GET requests in the installed GitHub adapter and forwards cancellation', async () => {
    await fixture(async ({ root }) => {
      git(root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
      const signal = new AbortController().signal,
        calls: string[][] = []
      const host = new GithubCliCodeHost(async (binary, args, cwd, input, actualSignal) => {
        expect(binary).toBe('gh')
        expect(cwd).toBe(root)
        expect(input).toBeUndefined()
        expect(actualSignal).toBe(signal)
        calls.push([...args])
        expect(args.slice(0, 5)).toEqual(['api', '--hostname', 'github.com', '--method', 'GET'])
        return JSON.stringify(String(args.at(-1)) === 'repos/fixture/app/pulls/7' ? pull() : [])
      })
      const observed = await host.readFeedback(
        { repository: 'app', path: root, remote: 'origin', branch: 'wl/test', head, base: 'main' },
        pr,
        signal,
      )
      expect(observed.items).toEqual([])
      expect(calls).toHaveLength(5)
    })
  })
})
