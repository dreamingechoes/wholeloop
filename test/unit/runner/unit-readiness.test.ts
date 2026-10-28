import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerNativeStage } from '../../../src/runner/native-stage.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerUnitReadiness } from '../../../src/runner/unit-readiness.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { StateStore } from '../../../src/state/store.js'
import { runnerWorkerFixture } from '../../support/runner-worker.js'

describe('current joint unit QA readiness', () => {
  it.each(['pending', 'stage-flags'] as const)(
    'does not promote %s into actual QA',
    async (mode) => {
      await runnerWorkerFixture(
        async ({ store, root, request, dispatch, observe, workers, host, options }) => {
          const digest = contractDigest(request)
          if (mode === 'stage-flags') {
            const produced = await workers.execute(dispatch('implementation:search'))
            expect(produced.status).toBe('passed')
            observe(produced)
            const committed = await host.execute(dispatch('commit:search'))
            expect(committed.status).toBe('passed')
            observe(committed)
            for (const stage of ['verification:search', 'review:search']) {
              const context = dispatch(stage),
                closed = await new RunnerNativeStage(store, context).run((process) =>
                  process('codex', ['--version'], {
                    cwd: store.files.root,
                    input: '',
                    timeoutMs: 3000,
                    signal: context.signal,
                    env: { PATH: options.native.path },
                  }),
                )
              expect(closed.code).toBe(0)
              expect(closed.ownership.invocationState).toBe('stopped')
              observe({
                schema: 'wholeloop/delivery-runner-stage-observation@1',
                request: digest,
                plan: contractDigest(context.plan),
                stage,
                invocation: context.invocation,
                status: 'passed',
                invocationState: 'stopped',
                evidence: 'f'.repeat(64),
                provenance: 'host-observed',
                reason: 'Root stage flags alone are not captured QA evidence.',
              })
            }
          }
          let selections = 0
          const deny = () => {
              selections++
              throw new Error('Inspection must not select or launch work')
            },
            engine = () =>
              new FlowEngine(
                new StateStore(store.files.root),
                root,
                store.files.path('fixture-config.yml'),
                store.files.path('fixture-home'),
              ),
            verification = new RunnerVerificationStages(store, {
              identity: request.host,
              engine,
              suite: deny,
              gate: deny,
            }),
            review = new RunnerReviewStages(store, { identity: request.host, engine, gate: deny }),
            result = await new RunnerUnitReadiness(verification, review).inspect(request, 'search')
          expect(result.status).toBe(mode === 'pending' ? 'blocked' : 'unknown')
          expect(result.candidate).toBeUndefined()
          expect(result.acceptance).toBe('not-established')
          expect(selections).toBe(0)
          if (mode === 'stage-flags') {
            for (const id of ['verification:search', 'review:search']) {
              const stage = store.stage(digest, id)
              expect(stage?.status).toBe('passed')
              if (!stage) throw new Error('Original flagged stage required')
              const calls = new RunnerNativeScope(store.files, stage.invocation).inspect()
              expect(calls).toHaveLength(1)
              expect(calls[0]?.observed.invocationState).toBe('stopped')
            }
          }
        },
        'complete',
        { unattended: true, provenance: 'host-observed', stageBudget: 'plan' },
      )
    },
  )
  it('requires fixed readers in the same original store', async () => {
    await runnerWorkerFixture(async ({ store, request }) => {
      const deny = () => {
          throw new Error('Construction cannot execute')
        },
        foreign = new RunnerStore(store.files.path('foreign-fixture-store')),
        verification = new RunnerVerificationStages(store, {
          identity: request.host,
          engine: deny,
          suite: deny,
          gate: deny,
        }),
        review = new RunnerReviewStages(foreign, {
          identity: request.host,
          engine: deny,
          gate: deny,
        })
      expect(() => new RunnerUnitReadiness(verification, review)).toThrow(
        'unit-readiness-fixed-readers-required',
      )
    })
  })
})
