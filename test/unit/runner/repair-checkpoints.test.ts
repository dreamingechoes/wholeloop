import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { runnerWorkerFixture } from '../../support/runner-worker.js'

describe('recorded correction checkpoint reconstruction', () => {
  it.each(['initial-head', 'foreign-host'] as const)(
    'refuses %s without selecting work',
    async (mode) => {
      await runnerWorkerFixture(
        async ({ store, request, dispatch, observe, workers, host, queue }) => {
          if (mode === 'initial-head') {
            const produced = await workers.execute(dispatch('implementation:search'))
            expect(produced.status).toBe('passed')
            observe(produced)
            const committed = await host.execute(dispatch('commit:search'))
            expect(committed.status).toBe('passed')
            observe(committed)
          }
          let selections = 0
          const deny = () => {
              selections++
              throw new Error('Reconstruction cannot select or dispatch')
            },
            factory = new RunnerRepairWorkers(store, queue, {
              get native() {
                return deny()
              },
              identity:
                mode === 'foreign-host' ? { ...request.host, id: 'foreign-host' } : request.host,
              context: deny,
              boundary: deny,
              admit: deny,
            }),
            before = contractDigest(store.lifecycle.journal.events())
          expect(() => RunnerRepairCommits.reopen(factory, request, 'search')).toThrow(
            mode === 'foreign-host'
              ? 'checkpoint-reopen-host-required'
              : 'checkpoint-reopen-exact-locator-required',
          )
          expect(selections).toBe(0)
          expect(contractDigest(store.lifecycle.journal.events())).toBe(before)
        },
        'complete',
        { unattended: true, provenance: 'host-observed', stageBudget: 'plan' },
      )
    },
  )
})
