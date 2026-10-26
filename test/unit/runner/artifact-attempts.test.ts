import { readFileSync, renameSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NativePurposeAttempts } from '../../../src/delivery/native-purpose.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { RunnerArtifactAttempts } from '../../../src/runner/artifact-attempts.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { runnerArtifactFixture as setup } from '../../support/runner-artifact.js'

describe('original-budget native artifact production is separate from delegated judgment', () => {
  it('produces a report with no delegated decision, fabricated unit or approval', async () => {
    await setup(async ({ store, context, attempts, input, execute }) => {
      const lease = attempts.claim(input)
      expect(lease.assignment.identity).toMatchObject({
        role: 'planner',
        cell: `artifact:acceptance-definition:${lease.key}`,
      })
      expect(lease.assignment.identity.unit).toBeUndefined()
      expect(lease.assignment.tools.workspace).toBe('none')
      const receipt = await execute(lease)
      expect(receipt.status).toBe('succeeded')
      expect(attempts.completed(lease, receipt)).toBe(true)
      expect(receipt.acceptance).toBe('not-established')
      expect(store.lifecycle.authority.inspect(context.request.grant).grant.decisions).toEqual([])
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
      const legacy = new NativePurposeAttempts(new DeliveryQueue(store.files.root))
      expect(() =>
        legacy.claim({
          ...input,
          run: context.request.run,
          grant: context.request.grant,
          decision: 'acceptance',
          key: 'f'.repeat(64),
          role: 'planner',
        }),
      ).toThrow('purpose-not-delegated')
    })
  })
  it('recovers exact original artifact bytes while paused without another process', async () => {
    await setup(async ({ store, context, attempts, input, execute, native }) => {
      const lease = attempts.claim(input),
        receipt = await execute(lease)
      store.lifecycle.transition(context.request.run, {
        to: 'paused',
        reason: 'Observe original artifact output without continuing.',
      })
      const fresh = new RunnerArtifactAttempts(store, context)
      expect(fresh.completed(lease, receipt)).toBe(true)
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
      const artifact = receipt.artifacts?.[0]
      if (!artifact) throw new Error('Fixture artifact missing')
      expect(JSON.parse(readFileSync(store.files.path(artifact.ref), 'utf8'))).toEqual({
        purpose: 'fixture',
        role: 'planner',
      })
      await expect(fresh.run(lease, native)).rejects.toThrow()
    })
  })
  it('cannot buy another attempt by extending the original context deadline', async () => {
    await setup(async ({ store, context, attempts, input }) => {
      attempts.claim(input)
      const changed = new RunnerArtifactAttempts(store, {
        ...context,
        deadline: new Date(Date.parse(context.deadline) + 60000).toISOString(),
      })
      expect(() => changed.claim(input)).toThrow('purpose-already-claimed')
      expect(
        deliveryAttempts(store.lifecycle.journal.get(context.request.run)).records,
      ).toHaveLength(1)
    })
  })
  it('holds a consumed lost lease instead of replacing its original artifact attempt', async () => {
    await setup(async ({ store, context, attempts, input, execute }) => {
      const lease = attempts.claim(input),
        receipt = await execute(lease),
        path = store.files.path(
          `delivery/runner-artifact-attempts/${lease.assignment.identity.attempt}.json`,
        )
      renameSync(path, `${path}.retained`)
      expect(attempts.completed(lease, receipt)).toBe(false)
      expect(() => new RunnerArtifactAttempts(store, context).claim(input)).toThrow(
        'purpose-already-claimed',
      )
    })
  })
  it.each(['cancelled', 'changed-plan', 'guidance'] as const)(
    'refuses %s before claiming an artifact worker',
    async (mode) => {
      await setup(async ({ store, context, input, attempts }) => {
        if (mode === 'cancelled') {
          const abort = new AbortController()
          abort.abort()
          context.signal = abort.signal
        }
        if (mode === 'changed-plan') context.plan = { ...context.plan, owner: 'Different Owner' }
        if (mode === 'guidance') input.context = []
        expect(() => attempts.claim(input)).toThrow()
        expect(deliveryAttempts(store.lifecycle.journal.get(context.request.run)).records).toEqual(
          [],
        )
      })
    },
  )
})
