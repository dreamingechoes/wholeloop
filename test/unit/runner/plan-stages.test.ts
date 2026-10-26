import { chmodSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerNativeStage } from '../../../src/runner/native-stage.js'
import { RunnerPlanStages } from '../../../src/runner/plan-stages.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerPlanFixture as setup } from '../../support/runner-plan.js'

type Fixture = Parameters<Parameters<typeof setup>[0]>[0]
const calls = (f: Fixture) => new RunnerNativeScope(f.store.files, f.context.invocation).calls()
const record = (f: Fixture) => {
  const value = f.store.stage(contractDigest(f.context.request), f.context.stage.id)
  if (!value) throw new Error('Fixture plan stage missing')
  return value
}
describe('current immutable plan authorization', () => {
  it('records actual core metadata work for an exact-plan grant without selecting or launching judgment', async () => {
    await setup(
      async (f) => {
        const stage = new RunnerPlanStages(f.store, {
          ...f.options,
          requests: () => {
            throw new Error('An exact grant does not need another decision')
          },
          host: () => {
            throw new Error('Core metadata work cannot launch a model')
          },
        })
        expect((await stage.inspect(f.context.request, record(f))).status).toBe('unknown')
        const result = await stage.execute(f.context)
        expect(result).toMatchObject({
          status: 'passed',
          invocationState: 'stopped',
          decisions: [],
        })
        expect(record(f).runtime).toEqual({
          backend: 'owned-core',
          instance: f.context.invocation,
          worker: `pid-${process.pid}`,
        })
        f.observe(result)
        expect(calls(f)).toEqual([])
        expect(() => f.store.planning.getPlan(f.context.request.run, 2)).toThrow()
      },
      { withinEnvelope: false },
    )
  })
  it('refuses an unrelated closed native call as exact-plan core execution', async () => {
    await setup(
      async (f) => {
        f.store.files.atomic(
          'unrelated-native/codex',
          `#!${process.execPath}\nprocess.stdout.write('Unrelated fixture call.\\n')\n`,
        )
        const executable = f.store.files.path('unrelated-native/codex')
        chmodSync(executable, 0o700)
        await new RunnerNativeStage(f.store, f.context).run((process) =>
          process('codex', [], {
            cwd: f.store.files.root,
            env: { PATH: `${dirname(executable)}:${dirname(globalThis.process.execPath)}` },
            input: '',
            signal: f.context.signal,
            timeoutMs: 1000,
          }),
        )
        expect((await f.stages.execute(f.context)).status).toBe('unknown')
        expect(record(f).runtime?.backend).toBe('owned-native')
        expect(calls(f)).toHaveLength(1)
      },
      { withinEnvelope: false },
    )
  })
  it('cannot promote fixture judgments to current envelope plan acceptance', async () => {
    await setup(async (f) => {
      expect(await f.stages.execute(f.context)).toMatchObject({
        status: 'blocked',
        provenance: 'fixture',
      })
      expect(calls(f)).toHaveLength(2)
      expect(() => f.store.planning.getPlan(f.context.request.run, 2)).toThrow()
    })
  })
  it('keeps supervised authorization out of the unattended adapter', async () => {
    await setup(
      async (f) => {
        expect(await f.stages.execute(f.context)).toMatchObject({
          status: 'blocked',
          invocationState: 'not-started',
        })
        expect(calls(f)).toEqual([])
      },
      { delegate: false },
    )
  })
  it('cannot infer metadata execution from a positive grant after cancellation', async () => {
    await setup(
      async (f) => {
        f.context.signal = AbortSignal.abort()
        await expect(f.stages.execute(f.context)).rejects.toThrow('plan-stage-not-current')
        expect(record(f).runtime).toBeUndefined()
        expect(calls(f)).toEqual([])
      },
      { withinEnvelope: false },
    )
  })
  it('requires the exact immutable plan record in every decision request before native dispatch', async () => {
    await setup(async (f) => {
      const stage = new RunnerPlanStages(f.store, {
        ...f.options,
        requests: (context, artifact) =>
          f.options.requests(context, artifact).map((request) => ({
            ...request,
            artifacts: [{ ref: 'different.json', sha256: 'a'.repeat(64) }],
          })),
        host: () => {
          throw new Error('A different plan cannot acquire a judgment')
        },
      })
      await expect(stage.execute(f.context)).rejects.toThrow('decision-stage-required-artifact')
      expect(calls(f)).toEqual([])
    })
  })
  it('cannot rewrite the pinned artifact through request selection', async () => {
    await setup(async (f) => {
      const stage = new RunnerPlanStages(f.store, {
        ...f.options,
        requests: (_context, artifact) => {
          Object.defineProperty(artifact, 'sha256', { value: 'a'.repeat(64) })
          return []
        },
      })
      await expect(stage.execute(f.context)).rejects.toThrow(TypeError)
      expect(calls(f)).toEqual([])
    })
  })
  it('cannot omit envelope plan acceptance before native dispatch', async () => {
    await setup(async (f) => {
      const stage = new RunnerPlanStages(f.store, { ...f.options, requests: () => [] })
      await expect(stage.execute(f.context)).rejects.toThrow('decision-stage-request-binding')
      expect(calls(f)).toEqual([])
    })
  })
  it('retains consumed lost decision intent without selecting another request or launching a host', async () => {
    await setup(async (f) => {
      const stage = new RunnerPlanStages(f.store, {
        ...f.options,
        host: () => {
          throw new Error('Interrupt after intent')
        },
      })
      await expect(stage.execute(f.context)).rejects.toThrow('Interrupt after intent')
      const path = f.store.files.path(`delivery/runner-decisions/${f.context.invocation}.json`)
      renameSync(path, `${path}.retained`)
      const fresh = new RunnerPlanStages(new RunnerStore(f.store.files.root), {
        ...f.options,
        requests: () => {
          throw new Error('Lost intent cannot select another request')
        },
        host: () => {
          throw new Error('Lost intent cannot buy another worker')
        },
      })
      expect((await fresh.execute(f.context)).status).toBe('unknown')
      expect(calls(f)).toEqual([])
    })
  })
})
