import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerPlanStages } from '../../../src/runner/plan-stages.js'
import {
  type RunnerStageAdapters,
  RunnerStageDispatcher,
} from '../../../src/runner/stage-dispatcher.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerPlanFixture as setup } from '../../support/runner-plan.js'

describe('fixed original domain-stage dispatch', () => {
  it.each(['before', 'after'] as const)(
    'refuses observation cancelled %s its asynchronous read',
    async (when) => {
      await setup(
        async (f) => {
          const dispatcher = new RunnerStageDispatcher(f.store, f.context.request.host, {
              plan: f.stages,
            }),
            result = await dispatcher.execute(f.context)
          f.observe(result)
          const record = f.store.stage(contractDigest(f.context.request), 'plan'),
            abort = new AbortController(),
            journal = contractDigest(f.store.lifecycle.journal.events())
          if (!record) throw new Error('Original plan stage required')
          if (when === 'before') abort.abort()
          const pending = dispatcher.inspect(f.context.request, record, abort.signal)
          if (when === 'after') abort.abort()
          await expect(pending).rejects.toThrow('dispatcher-observation-cancelled')
          expect(contractDigest(f.store.lifecycle.journal.events())).toBe(journal)
        },
        { withinEnvelope: false },
      )
    },
  )
  it('executes original core planning and recovers the same result while paused', async () => {
    await setup(
      async (f) => {
        const adapters = { plan: f.stages },
          dispatcher = new RunnerStageDispatcher(f.store, f.context.request.host, adapters)
        adapters.plan = new RunnerPlanStages(f.store, {
          ...f.options,
          identity: { ...f.context.request.host, configuration: '0'.repeat(64) },
        })
        const result = await dispatcher.execute(f.context)
        expect(result.status).toBe('passed')
        expect(result.invocationState).toBe('stopped')
        f.observe(result)
        const record = f.store.stage(contractDigest(f.context.request), 'plan')
        if (!record) throw new Error('Original plan stage required')
        f.store.lifecycle.transition(f.context.request.run, {
          to: 'paused',
          reason: 'Recover fixed dispatch without repeating core work.',
        })
        const journal = contractDigest(f.store.lifecycle.journal.events()),
          fresh = new RunnerStageDispatcher(
            new RunnerStore(f.store.files.root),
            f.context.request.host,
            { plan: f.stages },
          )
        expect(
          await fresh.inspect(f.context.request, record, new AbortController().signal),
        ).toEqual(result)
        expect(contractDigest(f.store.lifecycle.journal.events())).toBe(journal)
        expect(new RunnerNativeScope(f.store.files, record.invocation).calls()).toEqual([])
        expect(dispatcher.coverage(f.context.plan)).toMatchObject({ complete: false })
        expect(dispatcher.coverage(f.context.plan).unsupported).toContain('handoff')
      },
      { withinEnvelope: false },
    )
  })
  it.each([
    'cancelled',
    'expired',
    'fenced',
    'malformed-deadline',
    'different-kind',
    'different-plan',
    'foreign-host',
    'foreign-invocation',
    'missing-adapter',
    'product-on-plan',
  ] as const)('refuses %s before domain execution', async (mode) => {
    await setup(
      async (f) => {
        const dispatcher = new RunnerStageDispatcher(
            f.store,
            mode === 'foreign-host'
              ? { ...f.context.request.host, configuration: '0'.repeat(64) }
              : f.context.request.host,
            mode === 'missing-adapter' ? {} : { plan: f.stages },
          ),
          before = contractDigest(f.store.lifecycle.journal.events())
        if (mode === 'cancelled') f.context.signal = AbortSignal.abort()
        if (mode === 'expired') f.context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') f.context.current = () => false
        if (mode === 'malformed-deadline') f.context.deadline = 'invalid'
        if (mode === 'different-kind')
          f.context.stage = { ...f.context.stage, kind: 'implementation' }
        if (mode === 'different-plan')
          f.context.plan = { ...f.context.plan, owner: 'Different Owner' }
        if (mode === 'foreign-invocation') f.context.invocation = '0'.repeat(64)
        await expect(
          dispatcher.execute(
            f.context,
            mode === 'product-on-plan'
              ? {
                  selection: {
                    schema: 'wholeloop/integration-verification-request@1',
                    candidate: 'a'.repeat(64),
                    assembly: 'b'.repeat(64),
                    environment: `environment-${'c'.repeat(32)}`,
                  },
                }
              : undefined,
          ),
        ).rejects.toThrow('Delivery runner refused:')
        const record = f.store.stage(contractDigest(f.context.request), 'plan')
        expect(record?.runtime).toBeUndefined()
        expect(contractDigest(f.store.lifecycle.journal.events())).toBe(before)
      },
      { withinEnvelope: false },
    )
  })
  it.each(['foreign-store', 'structural-host', 'constructor-key'] as const)(
    'refuses %s registration',
    async (mode) => {
      await setup(
        async (f) => {
          const adapter =
              mode === 'foreign-store'
                ? new RunnerPlanStages(
                    new RunnerStore(f.store.files.path('foreign-store')),
                    f.options,
                  )
                : mode === 'structural-host'
                  ? {
                      store: f.store,
                      execute: () => {
                        throw new Error('Untrusted host')
                      },
                    }
                  : f.stages,
            adapters = {
              [mode === 'constructor-key' ? 'constructor' : 'plan']: adapter,
            } as Partial<RunnerStageAdapters>
          expect(
            () => new RunnerStageDispatcher(f.store, f.context.request.host, adapters),
          ).toThrow('dispatcher-fixed-domain-adapter-required')
        },
        { withinEnvelope: false },
      )
    },
  )
})
