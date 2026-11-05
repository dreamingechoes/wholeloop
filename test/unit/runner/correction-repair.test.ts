import { writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { StateStore } from '../../../src/state/store.js'
import { gateWorkerFixture } from '../../support/gate-worker.js'
import { runnerCorrectionFixture } from '../../support/runner-correction.js'

it.each([2, 3])(
  'keeps the original %i-restart budget while repairing the exact seeded correction',
  async (restarts) => {
    await runnerCorrectionFixture(
      async ({ store, request, host, production, dispatch, root }) => {
        const corrected = host.candidate(request, 'search'),
          settings = store.files.path('review-settings.json')
        writeFileSync(settings, JSON.stringify({ version: 1, gates: { review: { rounds: 2 } } }))
        const engine = new FlowEngine(
            new StateStore(store.files.root),
            root,
            settings,
            store.files.path('fixture-home'),
          ),
          reader = new RunnerReviewStages(store, {
            identity: request.host,
            engine: () => engine,
            gate: gateWorkerFixture(
              store,
              corrected.allocation.repository.path,
              'confirmed',
              'host-observed',
            ),
          }),
          context = dispatch('review:search')
        expect((await reader.execute(context)).status).toBe('blocked')
        expect(findBudget(store.lifecycle.journal.get(request.run))?.limits?.restarts).toBe(
          restarts,
        )
        const claim = production.queue.claim.bind(production.queue),
          before = new RunnerNativeScope(store.files, context.invocation).calls().length
        let deferred: { reason: string }[] = []
        production.queue.claim = (...args) => {
          const result = claim(...args)
          deferred = result.deferred
          return result
        }
        const workers = new RunnerRepairWorkers(store, production.queue, production.options),
          repaired = await workers.execute(reader, context)
        if (restarts === 2) {
          expect(repaired).toMatchObject({
            status: 'blocked',
            reason: 'original-repair-claim-refused',
          })
          expect(deferred.map((entry) => entry.reason)).toEqual(['restart-limit'])
          expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(
            before,
          )
          expect(
            deliveryAttempts(store.lifecycle.journal.get(request.run))
              .records.filter((attempt) => attempt.role === 'builder')
              .map((attempt) => attempt.generation),
          ).toEqual([1, 2, 3])
          return
        }
        expect(repaired, JSON.stringify(repaired)).toMatchObject({
          status: 'produced',
          commit: 'pending',
          qa: 'pending',
        })
        const calls = new RunnerNativeScope(store.files, context.invocation).calls().length
        expect(await workers.execute(reader, context)).toEqual(repaired)
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(calls)
        const checkpoint = new RunnerRepairCommits(workers),
          committed = await checkpoint.execute(context)
        expect(committed).toMatchObject({
          status: 'committed',
          qa: 'pending',
          candidateChain: 'pending',
        })
        const candidate = host.candidate(request, 'search', checkpoint)
        expect(candidate.receipt.parent).toBe(corrected.receipt.head)
        expect(candidate.receipt.digest).not.toBe(corrected.receipt.digest)
        const journal = contractDigest(store.lifecycle.journal.events()),
          reopened = RunnerRepairCommits.reopen(
            new RunnerRepairWorkers(store, production.queue, production.options),
            request,
            'search',
          )
        expect(host.candidate(request, 'search', reopened).receipt).toEqual(candidate.receipt)
        expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(calls)
      },
      { restarts },
    )
  },
  120000,
)
