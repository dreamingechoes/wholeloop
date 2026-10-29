import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { RunnerGitStages } from '../../../src/runner/git-stages.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerUnitReadiness } from '../../../src/runner/unit-readiness.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { StateStore } from '../../../src/state/store.js'
import { runnerGitFixture } from '../../support/runner-git.js'

describe('current QA admission before predecessor incorporation', () => {
  it.each(['cancelled', 'expired', 'fenced'] as const)(
    'rechecks %s control after asynchronous predecessor observation',
    async (mode) => {
      await runnerGitFixture(async ({ store, host, request, dispatch }) => {
        const context = dispatch('workspace:contract'),
          abort = new AbortController(),
          before = contractDigest(store.lifecycle.journal.events())
        context.signal = abort.signal
        queueMicrotask(() => {
          if (mode === 'cancelled') abort.abort()
          if (mode === 'expired') context.deadline = new Date(0).toISOString()
          if (mode === 'fenced') context.current = () => false
        })
        await expect(host.execute(context)).rejects.toThrow('git-stage-not-current')
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        expect(host.workspaces.effects.inspect(request.run)).toHaveLength(0)
      })
    },
  )
  it.each(['missing-reader', 'missing-qa', 'caller-map-changed'] as const)(
    'refuses %s before preparing another workspace',
    async (mode) => {
      await runnerGitFixture(async ({ store, host, request, root, dispatch, observe }) => {
        observe(await host.execute(dispatch('workspace:contract')))
        const parent = host.workspace(request, 'contract')
        writeFileSync(join(parent.repository.path, 'app.txt'), 'Owned original predecessor.\n')
        observe(await host.execute(dispatch('commit:contract')))
        let selected = 0
        const deny = () => {
            selected++
            throw new Error('Predecessor observation cannot select work')
          },
          engine = () =>
            new FlowEngine(
              new StateStore(store.files.root),
              root,
              store.files.path('fixture-config.yml'),
              store.files.path('fixture-home'),
            ),
          reader = new RunnerUnitReadiness(
            new RunnerVerificationStages(store, {
              identity: request.host,
              engine,
              suite: deny,
              gate: deny,
            }),
            new RunnerReviewStages(store, { identity: request.host, engine, gate: deny }),
          ),
          readers = new Map(mode === 'missing-reader' ? [] : [['contract', reader]]),
          next = new RunnerGitStages(store, readers),
          context = dispatch('workspace:search'),
          before = contractDigest(store.lifecycle.journal.events())
        if (mode === 'caller-map-changed') readers.clear()
        await expect(next.execute(context)).rejects.toThrow(
          mode === 'missing-reader'
            ? 'git-stage-predecessor-readiness-required'
            : 'git-stage-predecessor-qa-not-current',
        )
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        expect(selected).toBe(0)
        expect(() => next.workspace(request, 'search')).toThrow('git-stage-missing-resource')
      })
    },
  )
})
