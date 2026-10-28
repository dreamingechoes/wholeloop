import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { RunnerSuiteStages } from '../../../src/runner/suite-stages.js'
import { runnerSuiteFixture as setup } from '../../support/runner-suite.js'

describe('owned suite admission never promotes declarations into observed QA', () => {
  it.each(['cancelled', 'changed-plan'] as const)(
    'refuses %s before a backend call',
    async (mode) => {
      await setup(async ({ context, suite, gate, selection }) => {
        if (mode === 'cancelled') {
          const abort = new AbortController()
          abort.abort()
          context.signal = abort.signal
        } else context.plan = { ...context.plan, owner: 'Different Owner' }
        await expect(
          suite.execute(context, gate, selection, {
            provenance: 'fixture',
            call: async () => {
              throw new Error('Must not run')
            },
          }),
        ).rejects.toThrow('suite-stage-not-current')
      })
    },
  )
  it('refuses an unrelated gate before suite discovery or backend execution', async () => {
    await setup(async ({ context, suite, gate, selection }) => {
      await expect(
        suite.execute(context, { ...gate, gate: 'review' }, selection, {
          provenance: 'fixture',
          call: async () => {
            throw new Error('Must not run')
          },
        }),
      ).rejects.toThrow()
    })
  })
  it.each(['wrong-digest', 'first-round'] as const)(
    'refuses %s as a new suite phase before a backend call',
    async (mode) => {
      await setup(async ({ store, context, suite, gate, selection }) => {
        const phase = mode === 'wrong-digest' ? 'f'.repeat(64) : contractDigest(gate),
          next = new RunnerSuiteStages(store, { ...suite.options, phase })
        await expect(
          next.execute(context, gate, selection, {
            provenance: 'fixture',
            call: async () => {
              throw new Error('No backend dispatch')
            },
          }),
        ).rejects.toThrow('suite-stage-phase-binding')
        expect(
          store.files.read(`delivery/runner-suites/${context.invocation}/${phase}.json`),
        ).toBeUndefined()
      })
    },
  )
  it('leaves a lost consumed suite binding unknown without invoking a backend', async () => {
    await setup(async ({ store, context, suite, gate, selection }) => {
      store.files.atomic(
        `delivery/runner-suites/${context.invocation}.json.consumed`,
        `${context.invocation}\n`,
      )
      const record = store.stage(contractDigest(context.request), context.stage.id)
      if (!record) throw new Error('Fixture root stage missing')
      expect((await suite.inspect(context.request, record)).status).toBe('unknown')
      await expect(
        suite.execute(context, gate, selection, {
          provenance: 'fixture',
          call: async () => {
            throw new Error('Must not run')
          },
        }),
      ).rejects.toThrow('suite-stage-original-unresolved')
    })
  })
  it('refuses mismatched mapping keys rather than guessing which command a case executes', async () => {
    await setup(async ({ context, suite, gate, selection }) => {
      await expect(
        suite.execute(
          context,
          gate,
          { ...selection, mapping: { 'package.json#test': 'suite' } },
          {
            provenance: 'fixture',
            call: async () => {
              throw new Error('Must not run')
            },
          },
        ),
      ).rejects.toThrow('suite-stage-input-binding')
    })
  })
  it('can address original private cancellation after revocation without rechecking active candidate authority', async () => {
    await setup(async ({ store, context }) => {
      const record = store.stage(contractDigest(context.request), context.stage.id)
      if (!record) throw new Error('Fixture root stage missing')
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: context.request.grant,
        operator: 'Fixture Operator',
        reason: 'Revoke before a suite can dispatch.',
      })
      const reader = new RunnerSuiteStages(store, {
        identity: context.request.host,
        engine: () => {
          throw new Error('Stop cannot construct a new gate engine')
        },
      })
      await expect(
        reader.stop(context.request, record, new AbortController().signal),
      ).rejects.toThrow('environment-stage-original-unresolved')
    })
  })
})
