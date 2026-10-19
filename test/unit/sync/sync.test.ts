import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FlowEngine } from '../../../src/flow/engine.js'
import type { ProviderHost } from '../../../src/providers/operations.js'
import type { PullRequest } from '../../../src/pull-requests/contracts.js'
import { StateStore } from '../../../src/state/store.js'
import { syncReady, syncState } from '../../../src/sync/contracts.js'
import { SyncWorkflow } from '../../../src/sync/workflow.js'
import { WorktreeManager } from '../../../src/worktrees/manager.js'

async function fixture(
  run: (context: {
    dir: string
    root: string
    engine: FlowEngine
    workflow: SyncWorkflow
  }) => void | Promise<void>,
) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-sync-'))
  const root = join(dir, 'repo')
  mkdirSync(root)
  const engine = new FlowEngine(
    new StateStore(join(dir, 'state', 'wholeloop')),
    root,
    join(dir, 'user/config.yml'),
    join(dir, 'home'),
  )
  try {
    await run({ dir, root, engine, workflow: new SyncWorkflow(engine) })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function item(engine: FlowEngine, kind: 'scope' | 'slice' | 'part', parent?: string) {
  return engine.store.create({
    kind,
    title: `Fixture ${kind}`,
    owner: 'Alex',
    body: 'Synthetic delivery item',
    repository: engine.root,
    ...(parent ? { parent } : {}),
  })
}
function published(engine: FlowEngine, subject: string, sha = 'a'.repeat(40)) {
  let plan = ''
  const pr: PullRequest = {
    url: `https://github.com/example/product/pull/${engine.store.events().length + 1}`,
    repository: 'https://github.com/example/product',
    head: `wl/${subject}`,
    base: 'main',
    sha,
    draft: true,
    merged: false,
    state: 'open',
  }
  engine.store.transaction((events, append) => {
    append(subject, {
      type: 'pr.planned',
      data: {
        plan: {
          root: engine.root,
          repository: pr.repository,
          remote: 'origin',
          branch: pr.head,
          base: pr.base,
          head: sha,
          snapshot: 'b'.repeat(64),
          title: 'feat: fixture delivery',
          body: 'Fixture manual validation',
          provider: 'github',
          convention: { ref: 'fixture-convention', origin: 'harness', digest: 'c'.repeat(64) },
          gated: false,
        },
      },
    })
    plan = events.at(-1)?.id ?? ''
    append(subject, {
      type: 'pr.tested',
      data: {
        plan,
        by: 'Alex',
        note: 'Inspected the synthetic fixture outcome.',
        snapshot: 'b'.repeat(64),
      },
    })
    append(subject, {
      type: 'decision.recorded',
      data: { decision: 'test-it', basis: plan, by: 'Alex', outcome: 'approved' },
    })
    append(subject, { type: 'pr.requested', data: { plan } })
    append(subject, { type: 'pr.published', data: { plan, pr } })
  })
  return { plan, pr }
}
function host(pr: PullRequest, overrides: Partial<PullRequest> = {}): ProviderHost {
  return {
    invoke: async (call) => {
      expect(call.operation).toBe('codehost.pr-status')
      expect(call.args.ref).toBe(pr.url)
      return {
        status: 'succeeded',
        ref: pr.url,
        complete: true,
        body: JSON.stringify({ ...pr, draft: false, merged: true, state: 'merged', ...overrides }),
      }
    },
  }
}
function tracker(root: string) {
  mkdirSync(join(root, '.wholeloop/providers/tracker-fixture'), { recursive: true })
  writeFileSync(
    join(root, '.wholeloop/providers/tracker-fixture/provider.json'),
    JSON.stringify({
      schema: 1,
      id: 'tracker-fixture',
      name: 'Tracker fixture',
      description: 'Synthetic revision-bound status transition',
      capabilities: ['tracker'],
      access: { native: true },
      operations: {
        'tracker.read-item': { tool: 'read_item' },
        'tracker.transition': { tool: 'transition_item' },
      },
      degrade: { 'tracker.read-item': 'open-question', 'tracker.transition': 'handoff-artifact' },
    }),
  )
  const target = {
    provider: 'tracker-fixture',
    ref: 'https://example.com/tracker/1',
    state: 'done',
  }
  const state = { value: 'todo', writes: 0, reads: 0, lose: false, apply: true }
  const provider: ProviderHost = {
    invoke: async (call) => {
      if (call.operation === 'tracker.read-item') {
        state.reads++
        return {
          status: 'succeeded',
          ref: target.ref,
          complete: true,
          revision: `revision-${state.reads}`,
          body: JSON.stringify({ ref: target.ref, state: state.value }),
        }
      }
      expect(call.operation).toBe('tracker.transition')
      expect(call.args).toMatchObject({
        ref: target.ref,
        state: 'done',
        from: 'todo',
        revision: 'revision-1',
      })
      state.writes++
      if (state.apply) state.value = 'done'
      if (state.lose) throw new Error('private fixture diagnostic')
      return { status: 'succeeded', ref: target.ref }
    },
  }
  return { target, state, provider }
}
function git(root: string, ...args: string[]) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(root, 'no-global-config'),
      GIT_CONFIG_NOSYSTEM: '1',
    },
  })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

describe('evidence-bound synchronization', () => {
  it('closes a matching merged slice, advances delivery to rollout and changes nothing on a second run', async () =>
    fixture(async ({ engine, workflow }) => {
      const scope = item(engine, 'scope')
      const slice = item(engine, 'slice', scope.id)
      const publication = published(engine, slice.id)
      const hosts = { codehost: () => host(publication.pr) }
      const first = await workflow.run(hosts)
      expect(first.changed).toBe(true)
      expect(engine.store.get(slice.id).status).toBe('closed')
      expect(engine.store.get(scope.id).status).toBe('open')
      expect(syncReady(syncState(engine.store.events()), scope.id)).toBe(true)
      expect(engine.plan(scope.id).next).toBe('prepare-launch')
      const length = engine.store.events().length
      expect((await workflow.run(hosts)).changed).toBe(false)
      expect(engine.store.events()).toHaveLength(length)
    }))

  it.each([
    { merged: false, state: 'open' as const },
    { merged: false, state: 'closed' as const },
    { sha: 'd'.repeat(40) },
    { base: 'other' },
    { head: 'another-branch' },
    { url: 'https://github.com/example/product/pull/999' },
    { draft: true },
  ])('retains work without an exact matching non-draft merge %j', async (overrides) =>
    fixture(async ({ engine, workflow }) => {
      const slice = item(engine, 'slice')
      const publication = published(engine, slice.id)
      const result = await workflow.run({ codehost: () => host(publication.pr, overrides) })
      expect(result.changed).toBe(false)
      expect(engine.store.get(slice.id).status).toBe('open')
      expect(engine.store.events().some((event) => event.type === 'sync.merged')).toBe(false)
    }),
  )

  it('keeps unreadable/partial sources unknown and never records a merge', async () =>
    fixture(async ({ engine, workflow }) => {
      const slice = item(engine, 'slice')
      published(engine, slice.id)
      const result = await workflow.run({
        codehost: () => ({
          invoke: async () => {
            throw new Error('private fixture data')
          },
        }),
      })
      expect(result.observations[0]?.status).toBe('unknown')
      expect(JSON.stringify(result)).not.toContain('private fixture data')
      expect(result.changed).toBe(false)
    }))

  it('requires every repository part before closing a slice, including a slice with its own PR', async () =>
    fixture(async ({ engine, workflow }) => {
      const scope = item(engine, 'scope')
      const slice = item(engine, 'slice', scope.id)
      const one = item(engine, 'part', slice.id)
      const two = item(engine, 'part', slice.id)
      const publications = [
        published(engine, slice.id),
        published(engine, one.id),
        published(engine, two.id),
      ]
      let secondMerged = false
      const hosts = {
        codehost: (_plan: unknown, context: { subject: string }) => {
          const index = context.subject === slice.id ? 0 : context.subject === one.id ? 1 : 2
          const publication = publications[index]
          if (!publication) throw new Error('Missing fixture publication')
          return host(
            publication.pr,
            index === 2 && !secondMerged ? { merged: false, state: 'open' } : {},
          )
        },
      }
      await workflow.run(hosts)
      expect(engine.store.get(one.id).status).toBe('closed')
      expect(engine.store.get(two.id).status).toBe('open')
      expect(engine.store.get(slice.id).status).toBe('open')
      secondMerged = true
      await workflow.run(hosts)
      expect(engine.store.get(slice.id).status).toBe('closed')
      expect(syncReady(syncState(engine.store.events()), scope.id)).toBe(true)
    }))

  it('does not treat manually closed slices as delivered and invalidates stale readiness after reopening', async () =>
    fixture(async ({ engine, workflow }) => {
      const scope = item(engine, 'scope')
      const one = item(engine, 'slice', scope.id)
      const two = item(engine, 'slice', scope.id)
      const publication = published(engine, one.id)
      engine.store.update(two.id, { status: 'closed' })
      await workflow.run({ codehost: () => host(publication.pr) })
      expect(syncReady(syncState(engine.store.events()), scope.id)).toBe(false)
      const second = published(engine, two.id)
      await workflow.run({ codehost: () => host(second.pr) })
      expect(syncReady(syncState(engine.store.events()), scope.id)).toBe(true)
      engine.store.update(one.id, { status: 'open' })
      expect(syncReady(syncState(engine.store.events()), scope.id)).toBe(false)
      await workflow.run({ codehost: () => host(publication.pr) })
      expect(engine.store.get(one.id).status).toBe('open')
      expect(
        JSON.parse(engine.store.files.read(`items/${scope.id}/sync.json`) ?? '{}').deliveryReady,
      ).toBe(false)
    }))

  it('preserves later external tracker edits instead of reapplying a cached desired state', async () =>
    fixture(async ({ engine, root, workflow }) => {
      const slice = item(engine, 'slice')
      const publication = published(engine, slice.id)
      const remote = tracker(root)
      const hosts = { codehost: () => host(publication.pr), tracker: remote.provider }
      const options = { targets: { [slice.id]: remote.target } }
      await workflow.run(hosts, options)
      remote.state.value = 'reopened-by-owner'
      expect((await workflow.run(hosts, options)).tracker[0]?.status).toBe('drifted')
      expect(remote.state.writes).toBe(1)
      expect(remote.state.value).toBe('reopened-by-owner')
    }))

  it('checks replay proofs and refuses fabricated closures or delivery readiness', async () =>
    fixture(({ engine }) => {
      const scope = item(engine, 'scope')
      const slice = item(engine, 'slice', scope.id)
      const before = engine.store.events().length
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(slice.id, { type: 'sync.closed', data: { proofs: ['invented'] } }),
        ),
      ).toThrow('merge proofs')
      expect(() =>
        engine.store.transaction((_events, append) =>
          append(scope.id, {
            type: 'sync.delivery-ready',
            data: { slices: [slice.id], proofs: ['invented'] },
          }),
        ),
      ).toThrow('every slice')
      expect(engine.store.events()).toHaveLength(before)
    }))

  it('transitions only an explicit tracker target through complete reads and observed final state', async () =>
    fixture(async ({ engine, root, workflow }) => {
      const slice = item(engine, 'slice')
      const publication = published(engine, slice.id)
      const remote = tracker(root)
      const options = { targets: { [slice.id]: remote.target } }
      const hosts = { codehost: () => host(publication.pr), tracker: remote.provider }
      expect((await workflow.run(hosts, options)).tracker[0]?.status).toBe('succeeded')
      expect(remote.state.writes).toBe(1)
      expect(remote.state.reads).toBe(2)
      const before = engine.store.events().length
      expect((await workflow.run(hosts, options)).changed).toBe(false)
      expect(remote.state.writes).toBe(1)
      expect(engine.store.events()).toHaveLength(before)
    }))

  it.each([true, false])(
    'reconciles a lost transition without a second write; remotely applied=%s',
    async (applied) =>
      fixture(async ({ engine, root, workflow }) => {
        const slice = item(engine, 'slice')
        const publication = published(engine, slice.id)
        const remote = tracker(root)
        remote.state.lose = true
        remote.state.apply = applied
        const hosts = { codehost: () => host(publication.pr), tracker: remote.provider }
        const options = { targets: { [slice.id]: remote.target } }
        expect((await workflow.run(hosts, options)).tracker[0]?.status).toBe('unknown')
        const second = await workflow.run(hosts, options)
        expect(second.tracker[0]?.status).toBe(applied ? 'succeeded' : 'ambiguous')
        expect(remote.state.writes).toBe(1)
        expect(JSON.stringify(engine.store.events())).not.toContain('private fixture diagnostic')
      }),
  )

  it('blocks tracker writes without delivery proof and preserves unbound handoffs', async () =>
    fixture(async ({ engine, root, workflow }) => {
      const slice = item(engine, 'slice')
      const remote = tracker(root)
      expect((await workflow.transition(slice.id, remote.target, remote.provider)).status).toBe(
        'blocked',
      )
      expect(remote.state.reads).toBe(0)
      const publication = published(engine, slice.id)
      const result = await workflow.run(
        { codehost: () => host(publication.pr) },
        { targets: { [slice.id]: remote.target } },
      )
      expect(result.tracker[0]?.status).toBe('handoff')
      expect(remote.state.writes).toBe(0)
    }))

  it('retains active worktrees, then prunes only stopped clean locally merged work while retaining the branch', async () =>
    fixture(async ({ engine, root, workflow }) => {
      git(root, 'init', '-b', 'main')
      writeFileSync(join(root, 'seed.txt'), 'seed\n')
      git(root, 'add', 'seed.txt')
      git(
        root,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.com',
        'commit',
        '-m',
        'feat: seed sync fixture',
        '-m',
        'Exercise safe local merged-worktree cleanup without any remote.',
      )
      const slice = item(engine, 'slice')
      const manager = new WorktreeManager(engine)
      const allocation = manager.create(slice.id, { base: 'main' })
      const publication = published(engine, slice.id, git(root, 'rev-parse', 'HEAD'))
      const hosts = { codehost: () => host(publication.pr) }
      expect((await workflow.run(hosts)).cleanup[0]?.action).toBe('retained')
      manager.stop(slice.id)
      expect((await workflow.run(hosts)).cleanup[0]?.action).toBe('pruned')
      expect(git(root, 'branch', '--show-current')).toBe('main')
      expect(git(root, 'rev-parse', `refs/heads/wl/${slice.id}`)).toBe(publication.pr.sha)
      expect((await workflow.run(hosts)).changed).toBe(false)
      expect(allocation.record.path).not.toBe(root)
    }))

  it('runs compiled sync against explicit imported observations, rebuilds projections and stays idempotent', async () =>
    fixture(({ engine, workflow, dir, root }) => {
      const scope = item(engine, 'scope')
      const slice = item(engine, 'slice', scope.id)
      const publication = published(engine, slice.id)
      const file = join(dir, 'observations.json')
      writeFileSync(
        file,
        JSON.stringify({
          schema: 'wholeloop/sync-observations@1',
          observations: [
            {
              plan: publication.plan,
              ref: publication.pr.url,
              result: {
                status: 'succeeded',
                ref: publication.pr.url,
                complete: true,
                body: JSON.stringify({
                  ...publication.pr,
                  draft: false,
                  merged: true,
                  state: 'merged',
                }),
              },
            },
          ],
        }),
      )
      const env = {
        ...process.env,
        XDG_STATE_HOME: join(dir, 'state'),
        XDG_CONFIG_HOME: join(dir, 'config'),
        HOME: join(dir, 'home'),
      }
      const cli = () => {
        const result = spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'sync',
            '--for',
            scope.id,
            '--file',
            file,
            '--prune',
            'off',
            '--json',
          ],
          { cwd: root, env, encoding: 'utf8' },
        )
        expect(result.status, result.stderr || result.stdout).toBe(0)
        return JSON.parse(result.stdout)
      }
      expect(cli().changed).toBe(true)
      expect(cli().changed).toBe(false)
      const content = engine.store.files.read(`items/${scope.id}/sync.json`)
      engine.store.rebuild()
      expect(engine.store.files.read(`items/${scope.id}/sync.json`)).toBe(content)
      expect(engine.store.get(scope.id).status).toBe('open')
      expect(workflow.engine.plan(scope.id).next).toBe('prepare-launch')
    }))
})
