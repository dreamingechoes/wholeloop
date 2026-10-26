import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { git } from '../../support/delivery.js'
import { runnerGitRouteFixture, runnerGitFixture as setup } from '../../support/runner-git.js'

describe('fixed owned Git stages join the original runner invocation', () => {
  it('requires actual current committed bytes before exposing a candidate to read-only gates', async () => {
    await setup(async ({ host, request, dispatch, observe }) => {
      observe(await host.execute(dispatch('workspace:contract')))
      const workspace = host.workspace(request, 'contract')
      writeFileSync(join(workspace.repository.path, 'app.txt'), 'Exact committed candidate.\n')
      observe(await host.execute(dispatch('commit:contract')))
      expect(host.candidate(request, 'contract').receipt.head).toBe(
        git(workspace.repository.path, ['rev-parse', 'HEAD']),
      )
      writeFileSync(join(workspace.repository.path, 'app.txt'), 'Uncommitted later edit.\n')
      expect(() => host.candidate(request, 'contract')).toThrow('git-stage-candidate-not-current')
    })
  })
  it('pins a reviewed committed predecessor before preparing the next actual topic', async () => {
    await setup(async ({ host, request, digest, dispatch, observe }) => {
      observe(await host.execute(dispatch('workspace:contract')))
      const parent = host.workspace(request, 'contract')
      writeFileSync(join(parent.repository.path, 'app.txt'), 'Committed predecessor.\n')
      observe(await host.execute(dispatch('commit:contract')))
      const review = dispatch('review:contract')
      review.started({ backend: 'fixture', instance: review.invocation, worker: review.stage.id })
      observe({
        schema: 'wholeloop/delivery-runner-stage-observation@1',
        request: digest,
        plan: request.plan,
        stage: review.stage.id,
        invocation: review.invocation,
        status: 'passed',
        invocationState: 'stopped',
        evidence: 'f'.repeat(64),
        provenance: 'fixture',
        reason: 'Synthetic review, never actual QA.',
      })
      expect((await host.execute(dispatch('workspace:search'))).status).toBe('passed')
      const next = host.workspace(request, 'search')
      expect(next.parts).toHaveLength(1)
      expect(next.parts[0]?.head).toBe(git(parent.repository.path, ['rev-parse', 'HEAD']))
      expect(readFileSync(join(next.repository.path, 'app.txt'), 'utf8')).toBe(
        'Committed predecessor.\n',
      )
      expect(host.workspaces.effects.inspect(request.run)).toHaveLength(5)
    })
  })
  it('cancels only the bound private Git owner through a fresh controller after revocation', async () => {
    await setup(async ({ store, host, request, digest, dispatch }) => {
      const context = dispatch('workspace:contract'),
        started = context.started
      context.started = (runtime) => {
        started(runtime)
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'Revoke after actual wrapper registration, before native input.',
        })
      }
      await expect(host.execute(context)).rejects.toThrow('inactive-runner-basis')
      const binding = JSON.parse(
          readFileSync(store.files.path(`delivery/runner-git/${context.invocation}.json`), 'utf8'),
        ),
        effect = host.workspaces.effects.inspect(request.run)[0],
        record = store.stage(digest, context.stage.id)
      if (!effect?.invocation || !record) throw new Error('Fixture original issued owner missing')
      const root = `delivery/workspace-operations/${binding.resource}/${effect.invocation}`,
        intent = JSON.parse(readFileSync(store.files.path(`${root}/intent.json`), 'utf8'))
      await new RunnerGitStages(new RunnerStore(store.files.root)).stop(
        request,
        record,
        new AbortController().signal,
      )
      expect(JSON.parse(readFileSync(store.files.path(`${root}/cancel.json`), 'utf8'))).toEqual({
        nonce: intent.nonce,
      })
      expect(host.workspaces.effects.inspect(request.run)).toHaveLength(1)
      expect(store.inspect(digest).outcome).toBeNull()
    })
  })
  it('keeps an issued real Git unit live through the engine without accepting fixture semantics', async () => {
    const result = await runnerGitRouteFixture(true, true)
    expect(result).toMatchObject({ state: 'paused', outcome: null, effects: 3 })
    const stages = result.stages.filter((stage) => /^(workspace|commit):/.test(stage.id))
    expect(stages).toHaveLength(2)
    expect(
      stages.every((stage) => stage.status === 'passed' && stage.provenance === 'host-observed'),
    ).toBe(true)
    expect(result.stages.slice(0, -1).every((stage) => stage.status === 'passed')).toBe(true)
    expect(result.stages.at(-1)).toMatchObject({ id: 'verification:search', status: 'blocked' })
  })
  it('executes actual workspace and candidate stages once, then observes them from a fresh controller', async () => {
    await setup(async ({ store, host, request, root, digest, dispatch, observe }) => {
      const personal = git(root, ['rev-parse', 'HEAD']),
        workspace = dispatch('workspace:contract'),
        first = await host.execute(workspace)
      expect(first).toMatchObject({
        status: 'passed',
        invocationState: 'stopped',
        provenance: 'host-observed',
      })
      expect(store.stage(digest, workspace.stage.id)?.runtime?.backend).toBe('owned-git')
      observe(first)
      const allocation = host.workspace(request, 'contract')
      writeFileSync(join(allocation.repository.path, 'app.txt'), 'Owned candidate.\n')
      const commit = dispatch('commit:contract'),
        result = await host.execute(commit)
      expect(
        result,
        JSON.stringify(
          host.workspaces.effects.inspect(request.run).map((effect) => ({
            status: effect.status,
            reason: effect.observations.at(-1)?.reason,
            invocationState: effect.observations.at(-1)?.invocationState,
          })),
        ),
      ).toMatchObject({ status: 'passed', invocationState: 'stopped' })
      expect(store.stage(digest, commit.stage.id)?.runtime?.backend).toBe('owned-git')
      expect((await host.execute(commit)).status).toBe('passed')
      const fresh = new RunnerGitStages(new RunnerStore(store.files.root)),
        record = store.stage(digest, commit.stage.id)
      if (!record) throw new Error('Fixture stage missing')
      expect((await fresh.inspect(request, record)).status).toBe('passed')
      expect(host.workspaces.effects.inspect(request.run)).toHaveLength(3)
      expect(git(root, ['rev-parse', 'HEAD'])).toBe(personal)
      expect(store.inspect(digest).outcome).toBeNull()
    })
  })
  it('holds a missing private binding rather than claiming that a known issued stage never started', async () => {
    await setup(async ({ store, host, request, digest, dispatch }) => {
      const context = dispatch('workspace:contract')
      await host.execute(context)
      const path = store.files.path(`delivery/runner-git/${context.invocation}.json`)
      renameSync(path, `${path}.retained`)
      const record = store.stage(digest, context.stage.id)
      if (!record) throw new Error('Fixture stage missing')
      expect(await host.inspect(request, record)).toMatchObject({
        status: 'unknown',
        invocationState: 'unknown',
      })
      expect(host.workspaces.effects.inspect(request.run)).toHaveLength(1)
    })
  })
  it.each(['cancelled', 'expired', 'fenced'] as const)(
    'refuses %s control before a Git issue',
    async (mode) => {
      await setup(async ({ store, host, request, digest, dispatch }) => {
        const context = dispatch('workspace:contract'),
          abort = new AbortController()
        if (mode === 'cancelled') abort.abort()
        context.signal = abort.signal
        if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') context.current = () => false
        await expect(host.execute(context)).rejects.toThrow('git-stage-not-current')
        expect(
          host.workspaces.effects.inspect(request.run).some((effect) => effect.invocation),
        ).toBe(false)
        expect(store.inspect(digest).outcome).toBeNull()
      })
    },
  )
  it('refuses a changed plan, changed unit and cross-stage resource without executing Git', async () => {
    await setup(async ({ store, host, request, digest, dispatch }) => {
      const context = dispatch('workspace:contract')
      await expect(
        host.execute({ ...context, plan: { ...context.plan, owner: 'Another Owner' } }),
      ).rejects.toThrow('git-stage-not-current')
      await expect(
        host.execute({ ...context, stage: { ...context.stage, unit: 'search' } }),
      ).rejects.toThrow('git-stage-not-current')
      await host.execute(context)
      const path = store.files.path(`delivery/runner-git/${context.invocation}.json`),
        binding = JSON.parse(readFileSync(path, 'utf8'))
      binding.unit = 'search'
      writeFileSync(path, JSON.stringify(binding))
      const record = store.stage(digest, context.stage.id)
      if (!record) throw new Error('Fixture stage missing')
      await expect(host.inspect(request, record)).rejects.toThrow('git-stage-resource-binding')
      expect(host.workspaces.effects.inspect(request.run)).toHaveLength(1)
    })
  })
  it('recovers a closed workspace while paused without resuming or repeating checkout', async () => {
    await setup(async ({ store, host, request, digest, dispatch }) => {
      const context = dispatch('workspace:contract')
      await host.execute(context)
      store.lifecycle.transition(request.run, {
        to: 'paused',
        reason: 'Pause before publishing the stage result.',
      })
      const record = store.stage(digest, context.stage.id)
      if (!record) throw new Error('Fixture stage missing')
      expect(
        (await new RunnerGitStages(new RunnerStore(store.files.root)).inspect(request, record))
          .status,
      ).toBe('passed')
      expect(store.lifecycle.journal.get(request.run).state).toBe('paused')
      expect(host.workspaces.effects.inspect(request.run)).toHaveLength(1)
    })
  })
})
