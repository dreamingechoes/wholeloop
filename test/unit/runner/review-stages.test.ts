import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerReviewStages } from '../../../src/runner/review-stages.js'
import { nativeGateFixture as setup } from '../../support/native-gate.js'

describe('review stage admission and recovery do not invent native work', () => {
  it.each(['cancelled', 'changed-plan'] as const)(
    'refuses %s before consuming a review round',
    async (mode) => {
      await setup(async ({ store, context, engine, options }) => {
        const stages = new RunnerReviewStages(store, {
          identity: context.request.host,
          engine: () => engine,
          gate: options,
        })
        if (mode === 'cancelled') {
          const abort = new AbortController()
          abort.abort()
          context.signal = abort.signal
        } else context.plan = { ...context.plan, owner: 'Another Owner' }
        await expect(stages.execute(context)).rejects.toThrow('review-stage-not-current')
        await expect(stages.advance(context)).rejects.toThrow('review-continuation-not-current')
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      })
    },
  )
  it('keeps a lost original descriptor unknown and its consumed invocation fenced', async () => {
    await setup(async ({ store, context, engine, options }) => {
      const stages = new RunnerReviewStages(store, {
          identity: context.request.host,
          engine: () => engine,
          gate: options,
        }),
        record = store.stage(contractDigest(context.request), context.stage.id)
      if (!record) throw new Error('Fixture stage missing')
      store.files.atomic(
        `delivery/runner-reviews/${context.invocation}.json.consumed`,
        `${context.invocation}\n`,
      )
      expect((await stages.inspect(context.request, record)).status).toBe('unknown')
      await expect(stages.execute(context)).rejects.toThrow('review-stage-original-unresolved')
      await expect(stages.advance(context)).rejects.toThrow('review-continuation-not-current')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('can address original private cancellation after authority is revoked', async () => {
    await setup(async ({ store, context, engine, options }) => {
      const stages = new RunnerReviewStages(store, {
          identity: context.request.host,
          engine: () => engine,
          gate: options,
        }),
        record = store.stage(contractDigest(context.request), context.stage.id)
      if (!record) throw new Error('Fixture stage missing')
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: context.request.grant,
        operator: 'Fixture Operator',
        reason: 'Fence authority without losing the original cancellation scope.',
      })
      await expect(
        stages.stop(context.request, record, new AbortController().signal),
      ).resolves.toBeUndefined()
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
})
