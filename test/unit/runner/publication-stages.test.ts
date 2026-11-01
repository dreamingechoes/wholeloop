import { describe, expect, it } from 'vitest'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { RunnerAcceptanceStages } from '../../../src/runner/acceptance-stages.js'
import { RunnerAssemblyReadiness } from '../../../src/runner/assembly-readiness.js'
import { RunnerFeatureReadiness } from '../../../src/runner/feature-readiness.js'
import { RunnerIntegrationStages } from '../../../src/runner/integration-stages.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import {
  publicationMarker,
  publicationTargets,
  publicationText,
  RunnerPublicationStages,
} from '../../../src/runner/publication-stages.js'
import { runnerRoute } from '../../../src/runner/route.js'
import { RunnerStageDispatcher } from '../../../src/runner/stage-dispatcher.js'
import type { RunnerRequest, RunnerStore } from '../../../src/runner/store.js'
import { git } from '../../support/delivery.js'
import { runnerGitFixture } from '../../support/runner-git.js'
import { StubCodeHost, publicationFixture as setup } from '../../support/runner-publication.js'

const ok = () => undefined
const signal = () => new AbortController().signal
const plan = {
  run: 'delivery-0123456789abcdef',
  source: 'source-1',
  scope: { outcomes: [{ id: 'locate', text: 'Locate tasks using their titles.' }], exclusions: [] },
  repositories: [{ id: 'app', root: '/repo', target: 'refs/heads/main', base: 'a'.repeat(40) }],
} as unknown as DeliveryPlan
const assembly = {
  repository: 'app',
  path: '/work',
  ref: 'refs/heads/wl/integration-1',
  head: 'b'.repeat(40),
}

describe('publication targets and text', () => {
  it.each([
    ['an ungranted remote', assembly, []],
    [
      'a non-topic branch',
      { ...assembly, ref: 'refs/heads/feature' },
      [{ repository: 'app', remote: 'origin' }],
    ],
    [
      'the target branch',
      { ...assembly, ref: 'refs/heads/main' },
      [{ repository: 'app', remote: 'origin' }],
    ],
    [
      'an unknown repository',
      { ...assembly, repository: 'web' },
      [{ repository: 'web', remote: 'origin' }],
    ],
    [
      'an abbreviated head',
      { ...assembly, head: 'abc' },
      [{ repository: 'app', remote: 'origin' }],
    ],
  ])('refuses %s', (_name, value, grants) => {
    expect(() => publicationTargets(plan, [value], grants)).toThrow('publication-target-scope')
  })
  it('binds each accepted head to its owned topic and base', () => {
    expect(publicationTargets(plan, [assembly], [{ repository: 'app', remote: 'origin' }])).toEqual(
      [
        {
          repository: 'app',
          path: '/work',
          remote: 'origin',
          branch: 'wl/integration-1',
          base: 'main',
          head: 'b'.repeat(40),
        },
      ],
    )
  })
  it('names machine acceptance as not human testing and a person only from a record', () => {
    const [target] = publicationTargets(plan, [assembly], [{ repository: 'app', remote: 'origin' }])
    if (!target) throw new Error('Target required')
    const machine = publicationText(plan, { decisions: ['d'.repeat(64)] }, target),
      human = publicationText(plan, { decisions: [], human: 'e'.repeat(64) }, target)
    expect(machine.body).toContain('This is not human testing.')
    expect(machine.body).toContain(publicationMarker(plan.run, 'app'))
    expect(human.body).toContain(`recorded acceptance of the exact product (${'e'.repeat(64)})`)
    expect(human.body).not.toContain('Delegated')
    expect(() => publicationText(plan, { decisions: [] }, target)).toThrow('publication-text')
    expect(() =>
      publicationText(
        {
          ...plan,
          scope: { ...plan.scope, outcomes: [{ id: 'x', text: 'Generated with Claude Code' }] },
        },
        { decisions: ['d'.repeat(64)] },
        target,
      ),
    ).toThrow('publication-text')
  })
})

describe('owned publication effects (stub code host)', () => {
  it.each([false, true])('pushes once and opens one owned PR (ready %s)', async (ready) => {
    await setup(
      async ({ store, plan, host, publisher, publication, target }) => {
        expect(await publisher.publish(plan.run, publication, ok, signal())).toBe(true)
        expect(host.writes).toEqual({ push: 1, create: 1, ready: ready ? 1 : 0 })
        expect(host.tips.get(target.branch)).toBe(target.head)
        expect(host.prs).toHaveLength(1)
        expect(host.prs[0]).toMatchObject({ draft: !ready, sha: target.head, base: 'main' })
        const observed = await publisher.observe(plan.run, publication)
        expect(observed).toMatchObject({ complete: true, unresolved: false })
        expect(store.lifecycle.journal.get(plan.run).state).toBe('queued')
        // A second publication of the same run issues nothing new.
        await expect(publisher.publish(plan.run, publication, ok, signal())).rejects.toThrow()
        expect(host.writes.push).toBe(1)
      },
      { ready },
    )
  })
  it.each([
    ['a competing remote writer', 'push'],
    ['a foreign open PR', 'create'],
    ['two owned PRs', 'create'],
    ['an owned PR at a changed snapshot', 'create'],
    ['an unreadable remote', 'push'],
  ] as const)('refuses %s without overwriting', async (name, step) => {
    await setup(async ({ plan, host, publisher, publication, target }) => {
      const pr = {
        url: 'https://github.com/fixture/app/pull/9',
        branch: target.branch,
        base: 'main',
        sha: target.head,
        draft: true,
        state: 'open' as const,
        body: publicationMarker(plan.run, 'app'),
      }
      if (name === 'a competing remote writer') host.tips.set(target.branch, 'c'.repeat(40))
      if (name === 'a foreign open PR') host.prs.push({ ...pr, body: 'Someone else.' })
      if (name === 'two owned PRs') host.prs.push(pr, { ...pr, url: `${pr.url}0` })
      if (name === 'an owned PR at a changed snapshot')
        host.prs.push({ ...pr, sha: 'c'.repeat(40) })
      if (name === 'an unreadable remote') host.fail.add('read')
      const before = structuredClone(host.prs)
      expect(await publisher.publish(plan.run, publication, ok, signal())).toBe(false)
      expect(host.writes.create).toBe(0)
      expect(host.prs).toEqual(before)
      if (step === 'push') expect(host.writes.push).toBe(0)
      else expect(host.writes.push).toBe(1)
      if (name === 'a competing remote writer')
        expect(host.tips.get(target.branch)).toBe('c'.repeat(40))
    })
  })
  it.each(['push', 'create', 'ready'] as const)(
    'reconciles a lost %s response by reading the resource, never writing again',
    async (step) => {
      await setup(
        async ({ plan, host, publisher, publication }) => {
          host.lose.add(step)
          expect(await publisher.publish(plan.run, publication, ok, signal())).toBe(false)
          expect(host.writes[step]).toBe(1)
          const observed = await publisher.observe(plan.run, publication)
          const records = observed.records[0] ?? {}
          expect(records[step]?.status).toBe('applied')
          expect(host.writes[step]).toBe(1)
          expect(host.prs.length).toBe(step === 'push' ? 0 : 1)
          // The interrupted publication is not continued; later steps were never issued.
          expect(observed.complete).toBe(step === 'ready')
        },
        { ready: true },
      )
    },
  )
  it('refuses to ready a PR that someone else moved after creation', async () => {
    await setup(
      async ({ plan, host, publisher, publication }) => {
        const original = host.create.bind(host)
        host.create = async (target, text) => {
          await original(target, text)
          const pr = host.prs[0]
          if (pr) pr.sha = 'c'.repeat(40)
        }
        expect(await publisher.publish(plan.run, publication, ok, signal())).toBe(false)
        expect(host.writes.ready).toBe(0)
        expect(host.prs[0]?.draft).toBe(true)
      },
      { ready: true },
    )
  })
  it.each([
    ['without push authority', ['source.read', 'report.write', 'pr.create']],
    ['without PR authority', ['source.read', 'report.write', 'git.push']],
  ])('performs no write %s', async (_name, effects) => {
    await setup(
      async ({ plan, host, publisher, publication }) => {
        await expect(publisher.publish(plan.run, publication, ok, signal())).rejects.toThrow()
        expect(host.writes).toEqual({
          push: effects.includes('git.push') ? 1 : 0,
          create: 0,
          ready: 0,
        })
      },
      { effects },
    )
  })
  it('performs no write after the grant is revoked', async () => {
    await setup(async ({ store, plan, host, publisher, publication, grant }) => {
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant,
        operator: 'Fixture Operator',
        reason: 'Withdraw publication authority before any push.',
      })
      await expect(publisher.publish(plan.run, publication, ok, signal())).rejects.toThrow()
      expect(host.writes).toEqual({ push: 0, create: 0, ready: 0 })
    })
  })
})

const remote = (plan: DeliveryPlan) => {
  for (const repository of plan.repositories) {
    git(repository.root, ['remote', 'add', 'origin', 'https://github.com/fixture/app.git'])
    repository.remote = { name: 'origin', url: 'https://github.com/fixture/app' }
  }
}
describe('publication stage composition', () => {
  const adapter = (store: RunnerStore, identity: RunnerRequest['host'], host: StubCodeHost) => {
    const deny = () => {
      throw new Error('Publication never selects a model or judgment')
    }
    return new RunnerPublicationStages(
      store,
      new RunnerAcceptanceStages(
        store,
        new RunnerFeatureReadiness(
          store,
          new RunnerIntegrationStages(
            store,
            new RunnerAssemblyReadiness(store, new RunnerMilestoneReadiness(store, new Map())),
          ),
        ),
        { identity, requests: deny, host: deny },
      ),
      { identity, host },
    )
  }
  it('publishes nothing without a current accepted product', () =>
    runnerGitFixture(
      async ({ store, request, dispatch }) => {
        const host = new StubCodeHost(),
          stages = adapter(store, request.host, host),
          dispatcher = new RunnerStageDispatcher(store, request.host, { publication: stages }),
          plan = store.basis(request).plan
        expect(
          runnerRoute(plan)
            .map((stage) => stage.id)
            .slice(-2),
        ).toEqual(['publication', 'handoff'])
        expect(dispatcher.coverage(plan).unsupported).not.toContain('publication')
        expect(dispatcher.coverage(plan).unsupported).not.toContain('handoff')
        expect(await dispatcher.execute(dispatch('publication'))).toMatchObject({
          status: 'blocked',
          invocationState: 'not-started',
        })
        expect(host.writes).toEqual({ push: 0, create: 0, ready: 0 })
        expect(store.lifecycle.journal.get(request.run).state).not.toBe('waiting-external')
      },
      {
        configure: (plan) => {
          plan.policy.endpoint = 'to-pr'
          remote(plan)
        },
      },
    ))
  it('refuses conditional merge routes before any dispatch', () =>
    runnerGitFixture(
      async ({ store, request, digest }) => {
        const host = new StubCodeHost(),
          dispatcher = new RunnerStageDispatcher(store, request.host, {
            publication: adapter(store, request.host, host),
          })
        expect(
          await dispatcher.preflight(
            request,
            store.basis(request).plan,
            store.inspect(digest).route,
            new AbortController().signal,
          ),
        ).toMatchObject({ available: false, reason: 'dispatcher-merge-unavailable' })
        expect(dispatcher.coverage(store.basis(request).plan).unsupported).toEqual(
          expect.arrayContaining(['publication', 'handoff']),
        )
      },
      {
        configure: (plan) => {
          plan.policy.endpoint = 'to-merge'
          remote(plan)
        },
      },
    ))
})
