import { describe, expect, it } from 'vitest'
import { RunnerRepairCommits } from '../../../src/runner/repair-commits.js'
import { RunnerRepairWorkers } from '../../../src/runner/repair-workers.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { runnerWorkerFixture as setup } from '../../support/runner-worker.js'

describe('original correction workers', () => {
  it('refuses supervised authority before selecting inputs, reserving or launching correction', async () => {
    await setup(async ({ store, queue, options, request, dispatch }) => {
      const context = dispatch('review:search'),
        reader = new RunnerReviewStages(store, {
          identity: request.host,
          engine: () => {
            throw new Error('Cannot select QA')
          },
          gate: () => {
            throw new Error('Cannot construct a host')
          },
        }),
        repair = new RunnerRepairWorkers(store, queue, options)
      const checkpoint = new RunnerRepairCommits(repair),
        later = RunnerRepairWorkers.after(checkpoint, request, context.invocation, 'f'.repeat(64))
      expect(later.checkpointScope(context.invocation)).toBe('f'.repeat(64))
      expect(later.owns('e'.repeat(64))).toBe(false)
      expect(() => later.checkpointScope('e'.repeat(64))).toThrow('repair-predecessor-invocation')
      expect(() =>
        RunnerRepairWorkers.after(checkpoint, request, context.invocation, '../other'),
      ).toThrow('repair-predecessor-scope')
      expect(await later.execute(reader, context)).toMatchObject({
        status: 'blocked',
        reason: 'explicit-unattended-repair-authority-required',
      })
      options.context = () => {
        throw new Error('Cannot select correction inputs')
      }
      expect(await repair.execute(reader, context)).toMatchObject({
        status: 'blocked',
        reason: 'explicit-unattended-repair-authority-required',
        commit: 'pending',
        qa: 'pending',
      })
      expect(queue.inspect(request.run)).toEqual([])
      expect(await new RunnerRepairCommits(repair).execute(context)).toMatchObject({
        status: 'blocked',
        qa: 'pending',
        candidateChain: 'pending',
      })
      expect(() => repair.production(request, context.invocation)).toThrow(
        'original-repair-intent-missing',
      )
      expect(await repair.inspect(request, context.invocation)).toMatchObject({ status: 'unknown' })
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: request.grant,
        operator: 'Fixture Operator',
        reason: 'Retain original cancellation ownership.',
      })
      expect(() => repair.stop(request, context.invocation)).not.toThrow()
      const foreign = new RunnerRepairWorkers(store, queue, {
        ...options,
        identity: { ...request.host, id: 'different-host' },
      })
      expect(() => new RunnerRepairCommits(foreign).stop(request, context.invocation)).toThrow(
        'original-repair-commit-owner-required',
      )
      expect(() => repair.stop(request, 'f'.repeat(64))).toThrow('original-repair-owner-required')
    })
  })
  it('audits the original completed production after its owned commit changes HEAD', async () => {
    await setup(
      async ({ workers, request, dispatch, observe, host, queue }) => {
        expect(() => workers.productionLease(request, 'search')).toThrow(
          'original-production-required',
        )
        observe(await workers.execute(dispatch('implementation:search')))
        const lease = workers.productionLease(request, 'search')
        observe(await host.execute(dispatch('commit:search')))
        expect(workers.productionLease(request, 'search')).toEqual(lease)
        queue.fence(lease)
        expect(() => workers.productionLease(request, 'search')).toThrow(
          'original-production-not-closed',
        )
      },
      'complete',
      { provenance: 'host-observed' },
    )
  })
})
