import { chmodSync, readFileSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerArtifactStages } from '../../../src/runner/artifact-stages.js'
import { RunnerBuilderPlanningStages } from '../../../src/runner/builder-planning-stages.js'
import { RunnerDecisionStages } from '../../../src/runner/decision-stages.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerNativeStage } from '../../../src/runner/native-stage.js'
import { runnerBuilderPlanningFixture as setup } from '../../support/runner-builder-planning.js'

const record = (fixture: Parameters<Parameters<typeof setup>[0]>[0]) => {
  const value = fixture.store.stage(
    contractDigest(fixture.context.request),
    fixture.context.stage.id,
  )
  if (!value) throw new Error('Fixture root stage missing')
  return value
}
describe('owned builder plans precede their delegated approval', () => {
  it('refuses missing delegation before producing an artifact or constructing a decision host', async () => {
    await setup(
      async ({ stages, context, store }) => {
        expect(await stages.execute(context)).toMatchObject({
          status: 'blocked',
          invocationState: 'not-started',
        })
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      },
      { delegate: false },
    )
  })
  it('retains cancelled admission without producing a proposal', async () => {
    await setup(async ({ stages, context, store }) => {
      const abort = new AbortController()
      abort.abort()
      context.signal = abort.signal
      await expect(stages.execute(context)).rejects.toThrow('builder-planning-stage-not-current')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('cannot approve fixture-only production or construct a decision host from it', async () => {
    await setup(async ({ options, store, context }) => {
      const stages = new RunnerBuilderPlanningStages(store, {
        ...options,
        host: () => {
          throw new Error('Fixture output cannot buy a judgment')
        },
      })
      expect(await stages.execute(context)).toMatchObject({
        status: 'blocked',
        provenance: 'fixture',
        decisions: [],
      })
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
    })
  })
  it('requires the decision to cite the exact original produced artifact before new native work', async () => {
    await setup(
      async ({ options, store, context }) => {
        const stages = new RunnerBuilderPlanningStages(store, {
          ...options,
          decision: (ctx, production) => ({
            ...options.decision(ctx, production),
            artifacts: [{ ref: 'another.json', sha256: 'a'.repeat(64) }],
          }),
          host: () => {
            throw new Error('Mismatched output cannot buy a judgment')
          },
        })
        await expect(stages.execute(context)).rejects.toThrow('decision-stage-production-binding')
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
      },
      { provenance: 'host-observed' },
    )
  })
  it('refuses a lost producer locator rather than treating any closed native prefix as production', async () => {
    await setup(
      async (fixture) => {
        const produced = await new RunnerArtifactStages(
          fixture.store,
          fixture.options.production,
        ).execute(fixture.context)
        expect(produced.ownedCalls).toHaveLength(1)
        const path = fixture.store.files.path(
          `delivery/runner-artifacts/${fixture.context.invocation}.json`,
        )
        renameSync(path, `${path}.retained`)
        await expect(
          new RunnerDecisionStages(fixture.store, fixture.context.request.host).execute(
            fixture.context,
            [fixture.request(produced)],
            fixture.options.host,
          ),
        ).rejects.toThrow('decision-stage-production-unavailable')
        expect(
          new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
        ).toHaveLength(1)
        expect(
          (await fixture.stages.inspect(fixture.context.request, record(fixture))).status,
        ).toBe('unknown')
      },
      { provenance: 'host-observed' },
    )
  })
  it('does not promote an old artifact descriptor without original producer call ownership', async () => {
    await setup(
      async (fixture) => {
        const produced = await new RunnerArtifactStages(
            fixture.store,
            fixture.options.production,
          ).execute(fixture.context),
          path = fixture.store.files.path(
            `delivery/runner-artifacts/${fixture.context.invocation}.json`,
          ),
          binding = JSON.parse(readFileSync(path, 'utf8'))
        delete binding.calls
        binding.version = 1
        fixture.store.files.atomic(
          `delivery/runner-artifacts/${fixture.context.invocation}.json`,
          JSON.stringify(binding),
        )
        await expect(
          new RunnerDecisionStages(fixture.store, fixture.context.request.host).execute(
            fixture.context,
            [fixture.request(produced)],
            fixture.options.host,
          ),
        ).rejects.toThrow('decision-stage-production-unavailable')
        expect(
          new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
        ).toHaveLength(1)
      },
      { provenance: 'host-observed' },
    )
  })
  it('refuses an extra closed native call after production before starting any judgment', async () => {
    await setup(
      async (fixture) => {
        const produced = await new RunnerArtifactStages(
          fixture.store,
          fixture.options.production,
        ).execute(fixture.context)
        fixture.store.files.atomic(
          'unrelated-native/codex',
          `#!${process.execPath}\nprocess.stdout.write('Unrelated fixture call.\\n')\n`,
        )
        const executable = fixture.store.files.path('unrelated-native/codex')
        chmodSync(executable, 0o700)
        await new RunnerNativeStage(fixture.store, fixture.context).run((process) =>
          process('codex', [], {
            cwd: fixture.store.files.root,
            env: { PATH: `${dirname(executable)}:${dirname(globalThis.process.execPath)}` },
            input: '',
            signal: fixture.context.signal,
            timeoutMs: 1000,
          }),
        )
        await expect(
          new RunnerDecisionStages(fixture.store, fixture.context.request.host).execute(
            fixture.context,
            [fixture.request(produced)],
            fixture.options.host,
          ),
        ).rejects.toThrow('decision-stage-production-unavailable')
        expect(
          new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
        ).toHaveLength(2)
      },
      { provenance: 'host-observed' },
    )
  })
  it('refuses a later phase attempting to extend the original producer deadline', async () => {
    await setup(
      async ({ options, context, store }) => {
        const stages = new RunnerBuilderPlanningStages(store, {
          ...options,
          decision: (current, produced) => {
            const request = options.decision(current, produced)
            context.deadline = new Date(Date.parse(context.deadline) + 60000).toISOString()
            return request
          },
          host: () => {
            throw new Error('An extended deadline cannot buy another worker')
          },
        })
        await expect(stages.execute(context)).rejects.toThrow('decision-stage-production-deadline')
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
      },
      { provenance: 'host-observed' },
    )
  })
  it('persists the composed version and original producer proof before constructing a decision host', async () => {
    await setup(
      async (fixture) => {
        const produced = await new RunnerArtifactStages(
          fixture.store,
          fixture.options.production,
        ).execute(fixture.context)
        await expect(
          new RunnerDecisionStages(fixture.store, fixture.context.request.host).execute(
            fixture.context,
            [fixture.request(produced)],
            () => {
              throw new Error('Stop after retaining composed intent')
            },
          ),
        ).rejects.toThrow('Stop after retaining composed intent')
        const binding = JSON.parse(
          readFileSync(
            fixture.store.files.path(
              `delivery/runner-decisions/${fixture.context.invocation}.json`,
            ),
            'utf8',
          ),
        )
        expect(binding.version).toBe(2)
        expect(binding.production).toEqual({
          artifact: produced.artifact,
          prepared: produced.prepared,
          deadline: produced.deadline,
          calls: produced.ownedCalls,
        })
        expect(
          new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
        ).toHaveLength(1)
      },
      { provenance: 'host-observed' },
    )
  })
  it('can cancel original native work after revocation without constructing a new host', async () => {
    await setup(async (fixture) => {
      fixture.store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: fixture.context.request.grant,
        operator: 'Fixture Operator',
        reason: 'Stop only the original planning invocation.',
      })
      await expect(
        fixture.stages.stop(fixture.context.request, record(fixture), new AbortController().signal),
      ).resolves.toBeUndefined()
      expect(
        new RunnerNativeScope(fixture.store.files, fixture.context.invocation).calls(),
      ).toEqual([])
    })
  })
})
