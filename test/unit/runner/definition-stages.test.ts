import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerDefinitionStages } from '../../../src/runner/definition-stages.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { runnerDefinitionFixture as setup } from '../../support/runner-definition.js'

type Fixture = Parameters<Parameters<typeof setup>[0]>[0]
const calls = (f: Fixture) => new RunnerNativeScope(f.store.files, f.context.invocation).calls()
const unreserved = (f: Fixture) =>
  expect(() => f.store.planning.getPlan(f.context.request.run, 2)).toThrow()

describe('owned definitions reserve only independently approved revisions', () => {
  it.each([{ withinEnvelope: false }, { delegate: false }])(
    'refuses unavailable derivation or delegation before any producer: %j',
    async (settings) => {
      await setup(async (f) => {
        expect(await f.stages.execute(f.context)).toMatchObject({
          status: 'blocked',
          invocationState: 'not-started',
        })
        expect(calls(f)).toEqual([])
        unreserved(f)
      }, settings)
    },
  )
  it('refuses cancelled admission without reserving the next immutable revision', async () => {
    await setup(async (f) => {
      f.context.signal = AbortSignal.abort()
      await expect(f.stages.execute(f.context)).rejects.toThrow('definition-stage-not-current')
      expect(calls(f)).toEqual([])
      unreserved(f)
    })
  })
  it('cannot use fixture production as approval or reserve a revision', async () => {
    await setup(async (f) => {
      const stages = new RunnerDefinitionStages(f.store, {
        ...f.options,
        host: () => {
          throw new Error('Fixture production cannot acquire approval')
        },
      })
      expect(await stages.execute(f.context)).toMatchObject({
        status: 'blocked',
        provenance: 'fixture',
        decisions: [],
      })
      expect(calls(f)).toHaveLength(1)
      unreserved(f)
    })
  })
  it('leaves an incomplete definition available for correction before constructing any judgment host', async () => {
    await setup(
      async (f) => {
        const stages = new RunnerDefinitionStages(f.store, {
          ...f.options,
          host: () => {
            throw new Error('An incomplete definition cannot request approval')
          },
        })
        expect(await stages.execute(f.context)).toMatchObject({
          status: 'blocked',
          invocationState: 'stopped',
        })
        expect(calls(f)).toHaveLength(1)
        unreserved(f)
      },
      { provenance: 'host-observed', mode: 'incomplete' },
    )
  })
  it('requires every independent decision to cite the exact produced definition', async () => {
    await setup(
      async (f) => {
        const stages = new RunnerDefinitionStages(f.store, {
          ...f.options,
          decisions: (ctx, produced) =>
            f.options
              .decisions(ctx, produced)
              .map((request) =>
                request.decision === 'approve-spec'
                  ? { ...request, artifacts: [{ ref: 'different.json', sha256: 'a'.repeat(64) }] }
                  : request,
              ),
          host: () => {
            throw new Error('Mismatched input cannot acquire approval')
          },
        })
        await expect(stages.execute(f.context)).rejects.toThrow('decision-stage-production-binding')
        expect(calls(f)).toHaveLength(1)
        unreserved(f)
      },
      { provenance: 'host-observed' },
    )
  })
  it('cannot omit framing or scope approval before reserving the revision', async () => {
    await setup(
      async (f) => {
        const stages = new RunnerDefinitionStages(f.store, {
          ...f.options,
          decisions: (ctx, produced) => f.options.decisions(ctx, produced).slice(1),
          host: () => {
            throw new Error('An omitted decision cannot acquire approval')
          },
        })
        await expect(stages.execute(f.context)).rejects.toThrow('decision-stage-request-binding')
        expect(calls(f)).toHaveLength(1)
        unreserved(f)
      },
      { provenance: 'host-observed' },
    )
  })
  it('persists all three exact decision requests and original ownership before any judgment dispatch', async () => {
    await setup(
      async (f) => {
        const stages = new RunnerDefinitionStages(f.store, {
          ...f.options,
          host: () => {
            throw new Error('Interrupt after immutable decision intent')
          },
        })
        await expect(stages.execute(f.context)).rejects.toThrow(
          'Interrupt after immutable decision intent',
        )
        const binding = JSON.parse(
          readFileSync(
            f.store.files.path(`delivery/runner-decisions/${f.context.invocation}.json`),
            'utf8',
          ),
        )
        expect(binding).toMatchObject({
          version: 2,
          plan: contractDigest(f.context.plan),
          production: {
            deadline: f.context.deadline,
            prepared: { kind: 'delivery-plan', revision: 2, disposition: 'proposal' },
          },
        })
        expect(binding.requests.map((r: { decision: string }) => r.decision).sort()).toEqual([
          'approve-scopes',
          'approve-spec',
          'frame-outcome',
        ])
        expect(binding.production.calls).toHaveLength(1)
        expect(calls(f)).toHaveLength(1)
        unreserved(f)
      },
      { provenance: 'host-observed' },
    )
  })
})
