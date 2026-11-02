import { describe, expect, it } from 'vitest'
import type { MergeEligibility } from '../../../src/runner/merge-eligibility.js'
import {
  type RunnerMergeFacts,
  type RunnerMergeHost,
  type RunnerMergeRead,
  RunnerMerger,
  type RunnerMergeTarget,
} from '../../../src/runner/merge-execution.js'
import {
  GithubCliMergeFactsHost,
  GithubCliMergeHost,
} from '../../../src/runner/publication-host.js'
import { fixture, git } from '../../support/delivery.js'
import { publicationFixture } from '../../support/runner-publication.js'

/** In-memory stub merge host: no hosted protection or SHA semantics are certified. */
class StubMergeHost implements RunnerMergeHost {
  readonly provenance = 'host-observed' as const
  readonly prs = new Map<string, RunnerMergeRead>()
  merges = 0
  lose = false
  reject = false
  other = false
  async actor() {
    return 'wholeloop-operator'
  }
  async read(target: Readonly<RunnerMergeTarget>) {
    const read = this.prs.get(target.pr)
    if (!read) throw new Error('Unknown stub PR.')
    return structuredClone(read)
  }
  async merge(target: Readonly<RunnerMergeTarget>) {
    this.merges++
    const read = this.prs.get(target.pr)
    if (!read || this.reject || read.head !== target.head)
      throw new Error('Stub server refused: head changed or protection unmet.')
    this.prs.set(target.pr, {
      state: 'merged',
      head: read.head,
      mergeCommit: 'd'.repeat(40),
      mergedBy: this.other ? 'someone-else' : 'wholeloop-operator',
    })
    if (this.lose) throw new Error('Stub lost merge response.')
  }
}
const eligible = (expiresAt = '2999-01-01T00:00:00.000Z'): MergeEligibility => ({
  schema: 'wholeloop/merge-eligibility@1',
  status: 'eligible',
  reasons: [],
  evidence: 'e'.repeat(64),
  expiresAt,
})
const ineligible: MergeEligibility = {
  ...eligible(),
  status: 'ineligible',
  reasons: ['required-check-failed'],
}
async function setup(
  run: (input: {
    run: string
    merger: RunnerMerger
    host: StubMergeHost
    targets: RunnerMergeTarget[]
  }) => Promise<void>,
  effects = ['git.push', 'pr.create', 'pr.ready', 'pr.merge'],
) {
  await publicationFixture(
    async ({ store, plan, target }) => {
      const host = new StubMergeHost(),
        targets = [0, 1].map((index) => ({
          ...target,
          branch: `${target.branch}${index ? '-second' : ''}`,
          pr: `https://github.com/fixture/app/pull/${index + 7}`,
          method: 'squash' as const,
        }))
      for (const entry of targets) host.prs.set(entry.pr, { state: 'open', head: entry.head })
      await run({ run: plan.run, merger: new RunnerMerger(store, host), host, targets })
    },
    {
      endpoint: 'to-merge',
      effects: [
        'source.read',
        'report.write',
        'workspace.create',
        'code.write',
        'test.run',
        'git.commit',
        ...effects,
      ],
    },
  )
}
const signal = () => new AbortController().signal

describe('conditional merge execution (stub merge host)', () => {
  it('merges an eligible candidate once with its expected head', () =>
    setup(async ({ run, merger, host, targets }) => {
      const [first] = targets
      if (!first) throw new Error('Target required')
      const result = await merger.merge(run, [first], async () => eligible(), signal())
      expect(result).toEqual({
        outcome: 'merged',
        repositories: [{ repository: 'app', outcome: 'merged', reasons: [] }],
        rollback: 'not-proposed',
      })
      expect(host.merges).toBe(1)
      expect(
        merger.effects.inspect(run).find((e) => e.intent.operation === 'pr.merge'),
      ).toMatchObject({
        status: 'applied',
        intent: { expectedHead: first.head },
      })
    }))
  it.each([
    ['an ineligible candidate', async () => ineligible, 'ineligible'],
    ['an expired eligibility', async () => eligible('2000-01-01T00:00:00.000Z'), 'ineligible'],
  ] as const)('does not merge %s', (_name, verdict, outcome) =>
    setup(async ({ run, merger, host, targets }) => {
      const result = await merger.merge(run, targets.slice(0, 1), verdict, signal())
      expect(result.outcome).toBe(outcome)
      expect(host.merges).toBe(0)
      expect(merger.effects.inspect(run)).toEqual([])
    }),
  )
  it('reports an existing external merge and a queue entry without claiming them', () =>
    setup(async ({ run, merger, host, targets }) => {
      const [first, second] = targets
      if (!first || !second) throw new Error('Targets required')
      host.prs.set(first.pr, { state: 'merged', head: first.head, mergedBy: 'someone-else' })
      host.prs.set(second.pr, { state: 'queued', head: second.head })
      const result = await merger.merge(run, targets, async () => eligible(), signal())
      expect(result.repositories.map((entry) => entry.outcome)).toEqual([
        'externally-merged',
        'queued',
      ])
      expect(result.outcome).toBe('partial')
      expect(host.merges).toBe(0)
    }))
  it('reconciles a lost merge response by reading, never merging again', () =>
    setup(async ({ run, merger, host, targets }) => {
      host.lose = true
      const result = await merger.merge(run, targets.slice(0, 1), async () => eligible(), signal())
      expect(result.outcome).toBe('merged')
      expect(host.merges).toBe(1)
    }))
  it('keeps a merge someone else completed during the call distinct', () =>
    setup(async ({ run, merger, host, targets }) => {
      host.other = true
      const result = await merger.merge(run, targets.slice(0, 1), async () => eligible(), signal())
      expect(result.outcome).toBe('externally-merged')
      expect(merger.effects.inspect(run)[0]?.status).toBe('unknown')
      expect(host.merges).toBe(1)
    }))
  it('stops after a server refusal or head race and never retries', () =>
    setup(async ({ run, merger, host, targets }) => {
      host.reject = true
      const result = await merger.merge(run, targets, async () => eligible(), signal())
      expect(result.repositories.map((entry) => entry.outcome)).toEqual([
        'ineligible',
        'not-attempted',
      ])
      expect(result.repositories[0]?.reasons).toEqual(['server-refused-merge'])
      expect(host.merges).toBe(1)
      await expect(
        merger.merge(run, targets.slice(0, 1), async () => eligible(), signal()),
      ).rejects.toThrow()
      expect(host.merges).toBe(1)
    }))
  it('keeps a partial multi-repository delivery partial with no rollback', () =>
    setup(async ({ run, merger, host, targets }) => {
      let calls = 0
      const result = await merger.merge(
        run,
        targets,
        async () => (calls++ ? ineligible : eligible()),
        signal(),
      )
      expect(result).toEqual({
        outcome: 'partial',
        repositories: [
          { repository: 'app', outcome: 'merged', reasons: [] },
          { repository: 'app', outcome: 'ineligible', reasons: ['required-check-failed'] },
        ],
        rollback: 'not-proposed',
      })
      expect(host.merges).toBe(1)
    }))
  it('cannot merge without the merge effect in the grant', () =>
    setup(
      async ({ run, merger, host, targets }) => {
        await expect(
          merger.merge(run, targets.slice(0, 1), async () => eligible(), signal()),
        ).rejects.toThrow()
        expect(host.merges).toBe(0)
      },
      ['git.push', 'pr.create', 'pr.ready'],
    ))
})

describe('GitHub CLI merge host (stub executor)', () => {
  it('pins the expected head and never bypasses, arms auto-merge or deletes branches', () =>
    fixture(async ({ root }) => {
      git(root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
      const calls: (readonly string[])[] = [],
        host = new GithubCliMergeHost(async (_binary, args) => {
          calls.push(args)
          return JSON.stringify({
            login: 'wholeloop-operator',
            state: 'closed',
            merged: true,
            merge_commit_sha: 'd'.repeat(40),
            merged_by: { login: 'wholeloop-operator' },
            head: { sha: 'b'.repeat(40) },
          })
        }),
        target: RunnerMergeTarget = {
          repository: 'app',
          path: root,
          remote: 'origin',
          branch: 'wl/integration-1',
          base: 'main',
          head: 'b'.repeat(40),
          pr: 'https://github.com/fixture/app/pull/7',
          method: 'squash',
        }
      await host.merge(target)
      expect(calls[0]).toEqual([
        'pr',
        'merge',
        '--repo',
        'github.com/fixture/app',
        '--squash',
        '--match-head-commit',
        'b'.repeat(40),
        '--',
        'https://github.com/fixture/app/pull/7',
      ])
      expect(calls.flat().some((arg) => /admin|auto|delete-branch|force/.test(arg))).toBe(false)
      expect(await host.read(target)).toEqual({
        state: 'merged',
        head: 'b'.repeat(40),
        mergeCommit: 'd'.repeat(40),
        mergedBy: 'wholeloop-operator',
      })
      expect(await host.actor()).toBe('wholeloop-operator')
      await expect(
        host.merge({ ...target, pr: 'https://github.com/other/app/pull/7' }),
      ).rejects.toThrow('publication-host-pull-request')
    }))
})

describe('GitHub CLI merge facts (stub executor)', () => {
  const pages = (overrides: Record<string, unknown> = {}) => {
    const thread = (resolved: boolean) => ({ isResolved: resolved })
    return (args: readonly string[]) => {
      const endpoint = args.at(-1) ?? ''
      if (args[1] === 'graphql') {
        const second = args.includes('after=cursor-1')
        return {
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  nodes: second ? [thread(false)] : [thread(true), thread(false)],
                  pageInfo: second
                    ? { hasNextPage: false, endCursor: null }
                    : { hasNextPage: true, endCursor: 'cursor-1' },
                },
              },
            },
          },
        }
      }
      if (endpoint.endsWith('/pulls/7'))
        return {
          state: 'open',
          draft: false,
          merged: false,
          mergeable: true,
          changed_files: 101,
          head: { sha: 'b'.repeat(40) },
          base: { ref: 'main' },
          ...(overrides.pull as object),
        }
      if (endpoint.includes('/pulls/7/files'))
        return Array.from({ length: endpoint.endsWith('page=1') ? 100 : 1 }, (_, index) => ({
          filename: `src/${endpoint.endsWith('page=1') ? index : 100}.ts`,
        }))
      if (endpoint.includes('/compare/')) return { behind_by: 0, ...(overrides.compare as object) }
      return {
        allow_merge_commit: false,
        allow_squash_merge: true,
        allow_rebase_merge: false,
        ...(overrides.repo as object),
      }
    }
  }
  const run = async (overrides: Record<string, unknown> = {}) => {
    let facts: RunnerMergeFacts | undefined
    await fixture(async ({ root }) => {
      git(root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
      const respond = pages(overrides),
        host = new GithubCliMergeFactsHost(async (_binary, args) => JSON.stringify(respond(args)))
      facts = await host.facts(
        {
          repository: 'app',
          path: root,
          remote: 'origin',
          branch: 'wl/integration-1',
          base: 'main',
          head: 'b'.repeat(40),
          pr: 'https://github.com/fixture/app/pull/7',
          method: 'squash',
        },
        new AbortController().signal,
      )
    })
    return facts
  }
  it('reads every changed file, every discussion page, methods and base currency', async () => {
    const facts = await run()
    expect(facts).toMatchObject({
      state: 'open',
      draft: false,
      mergeable: true,
      unresolvedDiscussions: 2,
      allowedMethods: ['squash'],
      baseCurrent: true,
    })
    expect(facts?.files).toHaveLength(101)
  })
  it.each([
    ['a file list shorter than the PR reports', { pull: { changed_files: 150 } }, 'files'],
    [
      'settings hidden without push access',
      { repo: { allow_squash_merge: undefined } },
      'allowedMethods',
    ],
    ['pending mergeability', { pull: { mergeable: null } }, 'mergeable'],
    ['an unreadable comparison', { compare: { behind_by: 'x' } }, 'baseCurrent'],
  ])('reports %s as unknown, never as empty', async (_name, overrides, field) => {
    const facts = await run(overrides)
    expect(facts?.[field as keyof RunnerMergeFacts]).toBe('unknown')
  })
  it('reports a base the head is behind as not current', async () => {
    expect((await run({ compare: { behind_by: 3 } }))?.baseCurrent).toBe(false)
  })
})
