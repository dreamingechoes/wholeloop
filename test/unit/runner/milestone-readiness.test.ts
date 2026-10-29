import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { RunnerMilestoneReadiness } from '../../../src/runner/milestone-readiness.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerUnitReadiness } from '../../../src/runner/unit-readiness.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { StateStore } from '../../../src/state/store.js'
import { runnerGitFixture } from '../../support/runner-git.js'

describe('complete current unit vector before assembly', () => {
  it.each(['missing-reader', 'partial-coverage', 'pending-qa', 'unknown-milestone'] as const)(
    'refuses %s without selecting work or changing the journal',
    async (mode) => {
      await runnerGitFixture(async ({ store, request, root }) => {
        let selected = 0
        const deny = () => {
            selected++
            throw new Error('Assembly readiness cannot select work')
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
          readers = new Map<string, RunnerUnitReadiness>(
            mode === 'missing-reader'
              ? []
              : mode === 'partial-coverage'
                ? [['search', reader]]
                : [
                    ['contract', reader],
                    ['search', reader],
                  ],
          ),
          readiness = new RunnerMilestoneReadiness(store, readers),
          before = contractDigest(store.lifecycle.journal.events()),
          result = await readiness.inspect(
            request,
            mode === 'unknown-milestone' ? 'absent' : 'feature',
          )
        expect(result.status).toBe(mode === 'unknown-milestone' ? 'unknown' : 'blocked')
        expect(result.parts).toBeUndefined()
        expect(result.integrationQa).toBe('not-established')
        expect(result.acceptance).toBe('not-established')
        expect(selected).toBe(0)
        expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
      })
    },
  )
})
