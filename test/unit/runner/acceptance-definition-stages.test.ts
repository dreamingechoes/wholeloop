import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerAcceptanceDefinitionStages } from '../../../src/runner/acceptance-definition-stages.js'
import type { RunnerArtifactOptions } from '../../../src/runner/artifact-stages.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { StateStore } from '../../../src/state/store.js'
import { runnerArtifactFixture as setup } from '../../support/runner-artifact.js'

type Fixture = Parameters<Parameters<typeof setup>[0]>[0]
const options = (f: Fixture): RunnerArtifactOptions => ({
  identity: f.context.request.host,
  native: (process) => ({ ...f.native, process }),
  context: () => f.input,
})
const record = (f: Fixture) => {
  const value = f.store.stage(contractDigest(f.context.request), f.context.stage.id)
  if (!value) throw new Error('Fixture root stage missing')
  return value
}
describe('owned acceptance definitions precede builders', () => {
  it('pins observed complete definitions without executing tests or recording approval', async () => {
    await setup(async (f) => {
      const stage = new RunnerAcceptanceDefinitionStages(f.store, options(f)),
        result = await stage.execute(f.context)
      expect(result).toMatchObject({
        status: 'passed',
        invocationState: 'stopped',
        provenance: 'host-observed',
      })
      expect(result.reason).toContain('no test execution')
      expect(new RunnerNativeScope(f.store.files, f.context.invocation).calls()).toHaveLength(1)
      expect(new StateStore(f.store.files.root).events()).toEqual([])
      const produced = await stage.artifacts.inspect(f.context.request, record(f))
      if (!produced.prepared) throw new Error('Fixture pinned definitions missing')
      const acceptance = new DeliveryAcceptance(f.store.files.root)
      for (const test of acceptance.get(produced.prepared.digest).plan.cases)
        expect(acceptance.observedResults(produced.prepared.digest, test.id)).toEqual([])
      expect(
        existsSync(f.store.files.path(`delivery/acceptance-human/${produced.prepared.digest}`)),
      ).toBe(false)
    }, 'host-observed')
  })
  it('recovers lost original pin metadata while paused without context selection or another worker', async () => {
    await setup(async (f) => {
      const stage = new RunnerAcceptanceDefinitionStages(f.store, options(f)),
        result = await stage.execute(f.context),
        produced = await stage.artifacts.inspect(f.context.request, record(f))
      if (!produced.prepared) throw new Error('Fixture prepared definitions missing')
      const index = f.store.files.path(`delivery/acceptance-index/${produced.prepared.digest}.json`)
      renameSync(index, `${index}.retained`)
      f.store.lifecycle.transition(f.context.request.run, {
        to: 'paused',
        reason: 'Recover only the original pinned test definitions.',
      })
      const fresh = new RunnerAcceptanceDefinitionStages(new RunnerStore(f.store.files.root), {
        identity: f.context.request.host,
        native: () => {
          throw new Error('Paused recovery cannot construct a native host')
        },
        context: () => {
          throw new Error('Paused recovery cannot select context')
        },
      })
      expect(await fresh.inspect(f.context.request, record(f))).toEqual(result)
      expect(existsSync(index)).toBe(true)
      expect(new RunnerNativeScope(f.store.files, f.context.invocation).calls()).toHaveLength(1)
      expect(f.store.lifecycle.journal.get(f.context.request.run).state).toBe('paused')
    }, 'host-observed')
  })
  it('cannot promote fixture output into builder readiness', async () => {
    await setup(async (f) => {
      expect(
        await new RunnerAcceptanceDefinitionStages(f.store, options(f)).execute(f.context),
      ).toMatchObject({ status: 'blocked', provenance: 'fixture' })
      expect(new RunnerNativeScope(f.store.files, f.context.invocation).calls()).toHaveLength(1)
    })
  })
  it.each(['malformed', 'wrong-basis', 'unknown'] as const)(
    'retains %s output without a positive root stage',
    async (mode) => {
      await setup(
        async (f) => {
          expect(
            (await new RunnerAcceptanceDefinitionStages(f.store, options(f)).execute(f.context))
              .status,
          ).not.toBe('passed')
          expect(new RunnerNativeScope(f.store.files, f.context.invocation).calls()).toHaveLength(1)
        },
        'host-observed',
        { mode },
      )
    },
  )
  it('refuses a different artifact purpose before launching a worker', async () => {
    await setup(
      async (f) => {
        await expect(
          new RunnerAcceptanceDefinitionStages(f.store, options(f)).execute(f.context),
        ).rejects.toThrow('acceptance-definition-stage-binding')
        expect(new RunnerNativeScope(f.store.files, f.context.invocation).calls()).toEqual([])
      },
      'host-observed',
      { stage: 'definition' },
    )
  })
  it('cannot reuse a definition after its captured bytes change', async () => {
    await setup(async (f) => {
      const stage = new RunnerAcceptanceDefinitionStages(f.store, options(f))
      await stage.execute(f.context)
      const produced = await stage.artifacts.inspect(f.context.request, record(f))
      if (!produced.artifact) throw new Error('Fixture captured definition missing')
      writeFileSync(
        f.store.files.path(produced.artifact.ref),
        'Changed captured acceptance definitions.',
      )
      expect((await stage.inspect(f.context.request, record(f))).status).not.toBe('passed')
      expect(new RunnerNativeScope(f.store.files, f.context.invocation).calls()).toHaveLength(1)
    }, 'host-observed')
  })
})
