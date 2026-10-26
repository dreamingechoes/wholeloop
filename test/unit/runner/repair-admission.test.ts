import { describe, expect, it } from 'vitest'
import { findBudget } from '../../../src/delivery/budget-events.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { admitRunnerRepair } from '../../../src/runner/repair-admission.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { runnerSuiteFixture as setup } from '../../support/runner-suite.js'

describe('explicit original repair budget admission', () => {
  it('preserves supervised use without recording a repair failure or launching a host', async () => {
    await setup(async ({ store, context, engine, driver }) => {
      const reader = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          driver,
          suite: () => {
            throw new Error('Supervised admission cannot select QA')
          },
          gate: () => {
            throw new Error('Supervised admission cannot construct a host')
          },
        }),
        before = findBudget(store.lifecycle.journal.get(context.request.run))?.failures ?? []
      expect(await admitRunnerRepair(reader, context)).toMatchObject({
        status: 'blocked',
        reason: 'explicit-unattended-repair-authority-required',
        repairDispatch: 'not-performed',
      })
      expect(findBudget(store.lifecycle.journal.get(context.request.run))?.failures ?? []).toEqual(
        before,
      )
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it.each(['cancelled', 'paused', 'expired', 'changed-plan', 'revoked', 'unavailable'] as const)(
    'refuses %s original scope without another attempt or budget failure',
    async (mode) => {
      await setup(
        async ({ store, context, engine, driver }) => {
          if (mode === 'cancelled') context.signal = AbortSignal.abort()
          if (mode === 'paused')
            store.lifecycle.transition(context.request.run, {
              to: 'paused',
              reason: 'Block repair admission while paused.',
            })
          if (mode === 'expired') context.deadline = new Date(0).toISOString()
          if (mode === 'changed-plan') context.plan = { ...context.plan, owner: 'Different Owner' }
          if (mode === 'revoked')
            store.lifecycle.authority.revoke({
              schema: 'wholeloop/delivery-revocation-request@1',
              grant: context.request.grant,
              operator: 'Fixture Operator',
              reason: 'Stop subsequent repair admission.',
            })
          const reader = new RunnerVerificationStages(store, {
              identity: context.request.host,
              engine: () => engine,
              driver,
              suite: () => {
                throw new Error('Admission cannot select a new suite')
              },
              gate: () => {
                throw new Error('Admission cannot launch another model')
              },
            }),
            before = findBudget(store.lifecycle.journal.get(context.request.run))
          expect(await admitRunnerRepair(reader, context)).toMatchObject({
            status: 'blocked',
            repairDispatch: 'not-performed',
          })
          const after = findBudget(store.lifecycle.journal.get(context.request.run))
          expect(after?.failures ?? []).toEqual(before?.failures ?? [])
          expect(after?.reservations ?? []).toEqual(before?.reservations ?? [])
          expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
        },
        { unattended: true },
      )
    },
  )
})
