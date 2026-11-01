import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CI_WAIT,
  type CiCheck,
  type CiClock,
  type CiObservation,
  ciVerdict,
  RunnerCiObserver,
} from '../../../src/runner/ci-observations.js'
import { GithubCliCiHost } from '../../../src/runner/publication-host.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { fixture, git } from '../../support/delivery.js'

const candidate = 'b'.repeat(40),
  trusted = 'github-app:1',
  check = (overrides: Partial<CiCheck> = {}): CiCheck => ({
    name: 'verify',
    issuer: trusted,
    attempt: 1,
    head: candidate,
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  }),
  observation = (overrides: Partial<CiObservation> = {}): CiObservation => ({
    schema: 'wholeloop/delivery-ci@1',
    codeHost: 'github',
    repository: 'https://github.com/fixture/app',
    pr: 'https://github.com/fixture/app/pull/7',
    candidate,
    head: candidate,
    base: 'main',
    observedAt: '2026-11-01T12:00:00.000Z',
    complete: true,
    checks: [check()],
    protection: {
      status: 'observed',
      required: [{ name: 'verify', issuer: trusted }],
      strict: true,
    },
    reviews: { status: 'observed', required: 1, approvals: 1 },
    provenance: 'host-observed',
    ...overrides,
  }),
  policy = { required: [{ name: 'verify', issuer: trusted }] },
  open = (status: 'queued' | 'in_progress'): CiCheck => {
    const { conclusion: _conclusion, ...rest } = check({ status })
    return rest
  }

describe('revision-bound CI verdicts', () => {
  it.each([
    ['a successful trusted check at the candidate', {}, 'passed', 'success'],
    ['a queued check', { checks: [open('queued')] }, 'pending', 'pending'],
    ['an in-progress check', { checks: [open('in_progress')] }, 'pending', 'pending'],
    ['a failed check', { checks: [check({ conclusion: 'failure' })] }, 'failed', 'failure'],
    ['a timed-out check', { checks: [check({ conclusion: 'timed_out' })] }, 'failed', 'failure'],
    ['a cancelled check', { checks: [check({ conclusion: 'cancelled' })] }, 'unknown', 'cancelled'],
    ['a skipped check', { checks: [check({ conclusion: 'skipped' })] }, 'unknown', 'skipped'],
    ['a neutral check', { checks: [check({ conclusion: 'neutral' })] }, 'unknown', 'neutral'],
    ['a check on another head', { checks: [check({ head: 'c'.repeat(40) })] }, 'unknown', 'stale'],
    [
      'a spoofed issuer',
      { checks: [check({ issuer: 'github-app:666' })] },
      'unknown',
      'wrong-issuer',
    ],
    ['a missing check', { checks: [] }, 'unknown', 'missing'],
    [
      'a later successful attempt',
      { checks: [check({ conclusion: 'failure' }), check({ attempt: 2 })] },
      'passed',
      'success',
    ],
    [
      'a later failed attempt',
      { checks: [check(), check({ attempt: 2, conclusion: 'failure' })] },
      'failed',
      'failure',
    ],
    [
      'a spoof beside the trusted result',
      { checks: [check({ issuer: 'github-app:666', conclusion: 'failure' }), check()] },
      'passed',
      'success',
    ],
  ] as const)('evaluates %s', (_name, overrides, status, state) => {
    const verdict = ciVerdict(observation(overrides as Partial<CiObservation>), policy)
    expect(verdict.status).toBe(status)
    expect(verdict.checks).toEqual([{ name: 'verify', issuer: trusted, state }])
  })
  it.each([
    ['a partial check set', { complete: false }, 'incomplete-observation'],
    [
      'permission-filtered protection',
      { protection: { status: 'unknown', required: [] } },
      'unknown-protection',
    ],
    ['a moved pull request head', { head: 'c'.repeat(40) }, 'stale-pull-request-head'],
  ] as const)('never passes %s', (_name, overrides, reason) => {
    const verdict = ciVerdict(observation(overrides as Partial<CiObservation>), policy)
    expect(verdict.status).toBe('unknown')
    expect(verdict.reasons).toContain(reason)
  })
  it('refuses an empty required set and an issuer-less protection rule', () => {
    expect(
      ciVerdict(observation({ protection: { status: 'observed', required: [] } }), {
        required: [],
      }),
    ).toMatchObject({ status: 'unknown', reasons: ['empty-required-set'] })
    expect(
      ciVerdict(
        observation({ protection: { status: 'observed', required: [{ name: 'lint' }] } }),
        policy,
      ),
    ).toMatchObject({
      status: 'unknown',
      checks: expect.arrayContaining([{ name: 'lint', issuer: null, state: 'missing' }]),
    })
    expect(
      ciVerdict(
        observation({
          protection: { status: 'observed', required: [{ name: 'lint' }] },
          checks: [check(), check({ name: 'lint' })],
        }),
        policy,
      ).checks,
    ).toContainEqual({ name: 'lint', issuer: null, state: 'unknown-issuer' })
  })
  it('keeps review requirements unknown unless observed', () => {
    expect(ciVerdict(observation(), policy).reviews).toBe('satisfied')
    expect(
      ciVerdict(observation({ reviews: { status: 'observed', required: 2, approvals: 1 } }), policy)
        .reviews,
    ).toBe('unsatisfied')
    expect(ciVerdict(observation({ reviews: { status: 'unknown' } }), policy).reviews).toBe(
      'unknown',
    )
  })
})

class FakeClock implements CiClock {
  at = Date.parse('2026-11-01T12:00:00.000Z')
  sleeps: number[] = []
  now() {
    return this.at
  }
  async sleep(ms: number) {
    this.sleeps.push(ms)
    this.at += ms
  }
}
async function observer(
  run: (input: { store: RunnerStore; runId: string; clock: FakeClock }) => Promise<void>,
) {
  await fixture(async ({ planning, plan }) => {
    await run({
      store: new RunnerStore(planning.sources.files.root),
      runId: plan.run,
      clock: new FakeClock(),
    })
  })
}
const target = { path: '/repo', remote: 'origin', base: 'main', head: candidate }

describe('finite CI waits (fake clock)', () => {
  it('polls pending checks every 15 seconds until they settle', () =>
    observer(async ({ store, runId, clock }) => {
      const states = [open('in_progress'), open('queued'), check()]
      const wait = await new RunnerCiObserver(
        store,
        {
          observe: async () => observation({ checks: [states.shift() ?? check()] }),
        },
        clock,
      ).wait({
        run: runId,
        target,
        pr: observation().pr,
        policy,
        deadline: clock.at + 3600000,
        signal: new AbortController().signal,
      })
      expect(wait).toMatchObject({ outcome: 'settled', verdict: { status: 'passed' } })
      expect(clock.sleeps).toEqual([CI_WAIT.pollMs, CI_WAIT.pollMs])
      expect(wait.observations).toHaveLength(3)
      for (const digest of wait.observations)
        expect(existsSync(store.files.path(`delivery/runner-ci/${runId}/${digest}.json`))).toBe(
          true,
        )
    }))
  it.each([
    ['the run deadline', 60000, 60000],
    ['the 30-minute CI wait', 3 * 3600000, CI_WAIT.totalMs],
  ])('ends a pending wait at %s without prompting', (_name, deadline, bound) =>
    observer(async ({ store, runId, clock }) => {
      const start = clock.at,
        wait = await new RunnerCiObserver(
          store,
          {
            observe: async () => observation({ checks: [open('queued')] }),
          },
          clock,
        ).wait({
          run: runId,
          target,
          pr: observation().pr,
          policy,
          deadline: start + deadline,
          signal: new AbortController().signal,
        })
      expect(wait).toMatchObject({ outcome: 'deadline', verdict: { status: 'pending' } })
      expect(clock.at - start).toBe(bound)
    }),
  )
  it('retries unreadable observations but settles permission-filtered protection as unknown', () =>
    observer(async ({ store, runId, clock }) => {
      let reads = 0
      const unreadable = await new RunnerCiObserver(
        store,
        {
          observe: async () => {
            reads++
            throw new Error('Synthetic unavailable read.')
          },
        },
        clock,
      ).wait({
        run: runId,
        target,
        pr: observation().pr,
        policy,
        deadline: clock.at + 45000,
        signal: new AbortController().signal,
      })
      expect(unreadable).toMatchObject({
        outcome: 'deadline',
        verdict: { status: 'unknown', reasons: ['unavailable-read'] },
      })
      expect(reads).toBe(3)
      const filtered = await new RunnerCiObserver(
        store,
        {
          observe: async () => observation({ protection: { status: 'unknown', required: [] } }),
        },
        clock,
      ).wait({
        run: runId,
        target,
        pr: observation().pr,
        policy,
        deadline: clock.at + 3600000,
        signal: new AbortController().signal,
      })
      expect(filtered).toMatchObject({
        outcome: 'settled',
        verdict: { status: 'unknown', reasons: ['unknown-protection'] },
      })
    }))
  it('refuses an observation of another candidate and stops when cancelled', () =>
    observer(async ({ store, runId, clock }) => {
      const abort = new AbortController(),
        wait = await new RunnerCiObserver(
          store,
          {
            observe: async () => {
              abort.abort()
              return observation({ candidate: 'c'.repeat(40), head: 'c'.repeat(40) })
            },
          },
          clock,
        ).wait({
          run: runId,
          target,
          pr: observation().pr,
          policy,
          deadline: clock.at + 3600000,
          signal: abort.signal,
        })
      expect(wait).toMatchObject({
        outcome: 'cancelled',
        observations: [],
        verdict: { status: 'unknown' },
      })
    }))
})

describe('GitHub CLI CI reads (stub executor)', () => {
  const run = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    name: 'verify',
    app: { id: 1 },
    head_sha: candidate,
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  })
  async function host(
    responses: (endpoint: string) => unknown,
    read: (value: CiObservation) => void,
  ) {
    await fixture(async ({ root }) => {
      git(root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
      const ci = new GithubCliCiHost(async (_binary, args) => {
        const endpoint = String(args.at(-1)).replace('repos/fixture/app/', '')
        const value = responses(endpoint)
        if (value instanceof Error) throw value
        return JSON.stringify(value)
      })
      read(await ci.observe({ ...target, path: root }, 'https://github.com/fixture/app/pull/7'))
    })
  }
  const pull = { head: { sha: candidate }, base: { ref: 'main' } },
    protection = {
      required_status_checks: { strict: true, checks: [{ context: 'verify', app_id: 1 }] },
      required_pull_request_reviews: { required_approving_review_count: 1 },
    }
  it('paginates complete check sets and maps issuers, attempts and approvals at the candidate', () =>
    host(
      (endpoint) => {
        if (endpoint === 'pulls/7') return pull
        if (endpoint.endsWith('&page=1'))
          return {
            total_count: 105,
            check_runs: Array.from({ length: 100 }, (_, index) =>
              run({ id: index + 10, name: `c${index}` }),
            ),
          }
        if (endpoint.endsWith('&page=2'))
          return {
            total_count: 105,
            check_runs: [
              run({ id: 1, conclusion: 'failure' }),
              run({ id: 2 }),
              run({ id: 3, app: { id: 666 } }),
              run({ id: 4, name: 'x' }),
              run({ id: 5, name: 'y' }),
            ],
          }
        if (endpoint.startsWith('branches/')) return protection
        return [
          { user: { id: 1 }, state: 'APPROVED', commit_id: candidate },
          { user: { id: 2 }, state: 'APPROVED', commit_id: 'c'.repeat(40) },
          { user: { id: 3 }, state: 'APPROVED', commit_id: candidate },
          { user: { id: 3 }, state: 'CHANGES_REQUESTED', commit_id: candidate },
        ]
      },
      (value) => {
        expect(value.complete).toBe(true)
        expect(value.checks).toHaveLength(105)
        expect(value.checks.filter((entry) => entry.name === 'verify')).toEqual([
          {
            name: 'verify',
            issuer: 'github-app:1',
            attempt: 1,
            head: candidate,
            status: 'completed',
            conclusion: 'failure',
          },
          {
            name: 'verify',
            issuer: 'github-app:1',
            attempt: 2,
            head: candidate,
            status: 'completed',
            conclusion: 'success',
          },
          {
            name: 'verify',
            issuer: 'github-app:666',
            attempt: 1,
            head: candidate,
            status: 'completed',
            conclusion: 'success',
          },
        ])
        expect(value.protection).toEqual({
          status: 'observed',
          required: [{ name: 'verify', issuer: 'github-app:1' }],
          strict: true,
        })
        expect(value.reviews).toEqual({ status: 'observed', required: 1, approvals: 1 })
        expect(ciVerdict(value, policy).status).toBe('passed')
      },
    ))
  it('marks a short page set partial and denied protection unknown', () =>
    host(
      (endpoint) => {
        if (endpoint === 'pulls/7') return pull
        if (endpoint.includes('check-runs')) return { total_count: 150, check_runs: [run()] }
        return new Error('HTTP 403')
      },
      (value) => {
        expect(value.complete).toBe(false)
        expect(value.protection).toEqual({ status: 'unknown', required: [] })
        expect(value.reviews).toEqual({ status: 'unknown' })
        expect(ciVerdict(value, policy)).toMatchObject({ status: 'unknown', reviews: 'unknown' })
      },
    ))
})
