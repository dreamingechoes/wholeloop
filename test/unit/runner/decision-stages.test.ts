import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { RunnerDecisionStages } from '../../../src/runner/decision-stages.js'
import type { RunnerStageContext } from '../../../src/runner/engine.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerNativeStage } from '../../../src/runner/native-stage.js'
import { RunnerStore } from '../../../src/runner/store.js'

import { runnerDecisionFixture as setup } from '../../support/runner-decision.js'

function record(store: RunnerStore, context: RunnerStageContext) {
  const value = store.stage(contractDigest(context.request), context.stage.id)
  if (!value) throw new Error('Fixture root record missing')
  return value
}

describe('root stages consume their original private delegated decisions', () => {
  it('refuses recognizable credential-bearing metadata before retaining a root intent', async () => {
    await setup(async ({ stages, store, context, decision, host }) => {
      const selected = {
        ...decision,
        unknowns: [
          {
            id: 'baseline',
            who: 'Fixture Owner',
            missing: `Authorization: Bearer ${'x'.repeat(24)}`,
          },
        ],
      }
      await expect(stages.execute(context, [selected], host)).rejects.toThrow(
        'unsafe-or-oversized-content; contents omitted',
      )
      expect(
        existsSync(store.files.path(`delivery/runner-decisions/${context.invocation}.json`)),
      ).toBe(false)
      expect(deliveryAttempts(store.lifecycle.journal.get(context.request.run)).records).toEqual([])
    })
  })
  it('recovers only its exact published decision when the final key locator was lost', async () => {
    await setup(async ({ stages, store, context, decision, host }) => {
      const result = await stages.execute(context, [decision], host),
        path = `delivery/decision-keys/${decision.run}/${decision.key}.json`
      store.files.atomic(path, JSON.stringify({ request: contractDigest(decision) }))
      expect(await stages.inspect(context.request, record(store, context))).toEqual(result)
      await new RunnerNativeStage(store, context).run((process) =>
        store.decisions.decide({ ...decision, key: 'replacement' }, host(process), context.signal),
      )
      expect(await stages.inspect(context.request, record(store, context))).toMatchObject({
        status: 'unknown',
        decisions: [],
      })
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(4)
    })
  })
  it('requires no model or synthetic judgment when the stage has no delegated decision', async () => {
    await setup(async ({ stages, store, context }) => {
      expect(
        await stages.execute(context, [], () => {
          throw new Error('No decision host is needed')
        }),
      ).toMatchObject({
        status: 'ready',
        decisions: [],
        invocationState: 'not-started',
        gates: 'unchanged',
        humanApproval: 'not-recorded',
      })
      expect(deliveryAttempts(store.lifecycle.journal.get(context.request.run)).records).toEqual([])
    }, 'plan')
  })
  it('registers independent actual native decision workers and keeps fixture authority blocked', async () => {
    await setup(async ({ stages, store, context, decision, host }) => {
      const result = await stages.execute(context, [decision], host)
      expect(result).toMatchObject({
        status: 'blocked',
        provenance: 'fixture',
        invocationState: 'stopped',
        gates: 'unchanged',
        humanApproval: 'not-recorded',
      })
      expect(result.decisions).toHaveLength(1)
      expect(store.decisions.inspect(result.decisions[0] ?? '').record.status).toBe('fixture-only')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(2)
      expect(record(store, context).runtime?.backend).toBe('owned-native')
      expect(
        deliveryAttempts(store.lifecycle.journal.get(context.request.run)).records.map(
          (item) => item.role,
        ),
      ).toEqual(['planner', 'challenger'])
      expect(
        await stages.execute(context, [decision], () => {
          throw new Error('Must not relaunch')
        }),
      ).toEqual(result)
    })
  })
  it('recovers the exact private published receipt while paused without resuming or invoking a host', async () => {
    await setup(async ({ stages, store, context, decision, host }) => {
      const result = await stages.execute(context, [decision], host)
      store.lifecycle.transition(context.request.run, {
        to: 'paused',
        reason: 'Lose the root reply after its original decision published.',
      })
      const fresh = new RunnerDecisionStages(
        new RunnerStore(store.files.root, store.now),
        context.request.host,
      )
      expect(await fresh.inspect(context.request, record(store, context))).toEqual(result)
      expect(store.lifecycle.journal.get(context.request.run).state).toBe('paused')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(2)
    })
  })
  it.each(['missing', 'extra', 'grant', 'revision', 'plan'] as const)(
    'refuses %s decision scope before claiming a native purpose',
    async (mode) => {
      await setup(async ({ stages, store, context, decision, host }) => {
        const selected = structuredClone(decision)
        if (mode === 'grant') selected.grant = 'authorization-aaaaaaaaaaaaaaaa'
        if (mode === 'revision') selected.revision++
        if (mode === 'plan') selected.plan = 'f'.repeat(64)
        await expect(
          stages.execute(
            context,
            mode === 'missing' ? [] : mode === 'extra' ? [selected, decision] : [selected],
            host,
          ),
        ).rejects.toThrow(/decision-stage-request-(scope|binding)/)
        expect(deliveryAttempts(store.lifecycle.journal.get(context.request.run)).records).toEqual(
          [],
        )
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      })
    },
  )
  it('retains a lost native response and refuses a changed request instead of buying another judgment', async () => {
    await setup(async ({ stages, store, context, decision, host }) => {
      await expect(
        stages.execute(context, [decision], (process) => {
          const selected = host(process)
          selected.judge = async () => {
            throw new Error('Lost original report')
          }
          return selected
        }),
      ).rejects.toThrow('Lost original report')
      expect(
        await stages.execute(context, [decision], () => {
          throw new Error('Must not retry')
        }),
      ).toMatchObject({ status: 'unknown' })
      await expect(
        stages.execute(context, [{ ...decision, key: 'new-key' }], host),
      ).rejects.toThrow('decision-stage-input-conflict')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      const path = store.files.path(`delivery/runner-decisions/${context.invocation}.json`)
      renameSync(path, `${path}.retained`)
      await expect(
        stages.execute(context, [{ ...decision, key: 'new-key' }], host),
      ).rejects.toThrow('decision-stage-missing-binding')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('keeps a missing root binding unknown and refuses another stage identity', async () => {
    await setup(async ({ stages, store, context, decision, host }) => {
      await stages.execute(context, [decision], host)
      const path = store.files.path(`delivery/runner-decisions/${context.invocation}.json`),
        body = readFileSync(path, 'utf8')
      renameSync(path, `${path}.retained`)
      expect(await stages.inspect(context.request, record(store, context))).toMatchObject({
        status: 'unknown',
        invocationState: 'unknown',
      })
      await expect(
        stages.execute(context, [{ ...decision, key: 'another-key' }], host),
      ).rejects.toThrow('decision-stage-missing-binding')
      writeFileSync(path, JSON.stringify({ ...JSON.parse(body), stage: 'build-plan:another' }))
      await expect(stages.inspect(context.request, record(store, context))).rejects.toThrow(
        'decision-stage-request-binding',
      )
    })
  })
  it('cannot extend the original root deadline even if a judgment ignores cancellation', async () => {
    await setup(async ({ stages, store, context, decision, host }) => {
      context.deadline = new Date(Date.now() + 300).toISOString()
      let signal: AbortSignal | undefined
      await expect(
        stages.execute(context, [decision], (process) => {
          const selected = host(process)
          selected.judge = async (input) => {
            signal = input.signal
            return new Promise(() => {})
          }
          return selected
        }),
      ).rejects.toThrow('decision-interrupted')
      expect(signal?.aborted).toBe(true)
      expect((await stages.inspect(context.request, record(store, context))).status).toBe('unknown')
    })
  })
})
