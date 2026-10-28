import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { gateRuns } from '../../../src/gates/state.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerVerificationStages } from '../../../src/runner/verification-stages.js'
import { runnerSuiteFixture as setup } from '../../support/runner-suite.js'

describe('owned criterion verification admission', () => {
  it.each(['cancelled', 'changed-plan'] as const)(
    'refuses %s without constructing a native host',
    async (mode) => {
      await setup(async ({ store, context, engine, selection, driver }) => {
        const stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          gate: () => {
            throw new Error('Must not construct a native host')
          },
        })
        if (mode === 'cancelled') {
          const abort = new AbortController()
          abort.abort()
          context.signal = abort.signal
        } else context.plan = { ...context.plan, owner: 'Different Owner' }
        await expect(stages.execute(context)).rejects.toThrow('verification-stage-not-current')
        await expect(stages.advance(context)).rejects.toThrow(
          'verification-continuation-not-current',
        )
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      })
    },
  )
  it('preserves a consumed missing descriptor instead of creating a replacement round', async () => {
    await setup(async ({ store, context, engine, selection, driver }) => {
      const stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          gate: () => {
            throw new Error('Must not construct a native host')
          },
        }),
        record = store.stage(contractDigest(context.request), context.stage.id)
      if (!record) throw new Error('Fixture root stage missing')
      store.files.atomic(
        `delivery/runner-verifications/${context.invocation}.json.consumed`,
        `${context.invocation}\n`,
      )
      expect((await stages.inspect(context.request, record)).status).toBe('unknown')
      await expect(stages.execute(context)).rejects.toThrow(
        'verification-stage-original-unresolved',
      )
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('bounds controller-selected metadata before writing a private descriptor', async () => {
    await setup(async ({ store, context, engine, selection, driver }) => {
      const stages = new RunnerVerificationStages(store, {
        identity: context.request.host,
        engine: () => engine,
        suite: () => ({ ...selection, mapping: { 'package.json#check': 'a'.repeat(70000) } }),
        driver,
        gate: () => {
          throw new Error('Must not construct a native host')
        },
      })
      await expect(stages.execute(context)).rejects.toThrow('oversized')
      expect(
        existsSync(store.files.path(`delivery/runner-verifications/${context.invocation}.json`)),
      ).toBe(false)
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('keeps a custom acceptance lens separate from approved criterion definitions', async () => {
    await setup(async ({ store, context, engine, selection, driver }) => {
      const put = (ref: string, body: object | string) => {
        const path = join(engine.root, ref)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body))
      }
      put('.wholeloop/config.yml', { version: 1, lenses: { add: ['acceptance'] } })
      put('.wholeloop/lenses/acceptance/lens.yml', {
        schema: 1,
        id: 'acceptance',
        gate: 'verify',
        asks: 'Inspect the team acceptance conventions.',
        'fail-safe': false,
        prompt: 'prompt.md',
      })
      put(
        '.wholeloop/lenses/acceptance/prompt.md',
        'Inspect the additional team surface without claiming execution.\n',
      )
      const stages = new RunnerVerificationStages(store, {
        identity: context.request.host,
        engine: () => engine,
        suite: () => selection,
        driver,
        gate: () => {
          throw new Error('Unavailable application evidence cannot create a native host')
        },
      })
      expect((await stages.execute(context)).status).toBe('unknown')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('can cancel original native/application channels after revocation without a new host', async () => {
    await setup(async ({ store, context }) => {
      const record = store.stage(contractDigest(context.request), context.stage.id)
      if (!record) throw new Error('Fixture root stage missing')
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: context.request.grant,
        operator: 'Fixture Operator',
        reason: 'Revoke authority before observing original cancellation.',
      })
      const stages = new RunnerVerificationStages(store, {
        identity: context.request.host,
        engine: () => {
          throw new Error('Stop cannot create a gate engine')
        },
        suite: () => {
          throw new Error('Stop cannot select a new suite')
        },
        gate: () => {
          throw new Error('Stop cannot construct a native host')
        },
      })
      await expect(
        stages.stop(context.request, record, new AbortController().signal),
      ).resolves.toBeUndefined()
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('requires an exact contract artifact selection before consuming a contract-only round', async () => {
    await setup(
      async ({ store, context, engine, selection, driver }) => {
        const stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          gate: () => {
            throw new Error('Missing selection cannot launch a verifier')
          },
        })
        await expect(stages.execute(context)).rejects.toThrow(
          'verification-stage-contract-selection-required',
        )
        expect(
          existsSync(
            store.files.path(`delivery/runner-verifications/${context.invocation}.json.consumed`),
          ),
        ).toBe(false)
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      },
      { unit: 'contract' },
    )
  })
  it('rejects different committed contract bytes before reserving a gate or launching a host', async () => {
    await setup(
      async ({ store, context, engine, selection, driver }) => {
        const originalRuns = gateRuns(engine.store.events()).length
        const stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          contracts: () => ({ 'search-api': 'app.txt' }),
          gate: () => {
            throw new Error('Wrong contract bytes cannot launch a verifier')
          },
        })
        await expect(stages.execute(context)).rejects.toThrow('contract-checksum-mismatch')
        expect(gateRuns(engine.store.events())).toHaveLength(originalRuns)
        expect(
          existsSync(
            store.files.path(`delivery/runner-verifications/${context.invocation}.json.consumed`),
          ),
        ).toBe(false)
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      },
      { unit: 'contract' },
    )
  })
  it('pins real contract requirements without treating an unavailable fixture suite as QA', async () => {
    await setup(
      async ({ store, context, engine, selection, driver }) => {
        const stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          contracts: () => ({ 'search-api': 'search-contract.txt' }),
          gate: () => {
            throw new Error('Fixture suite cannot launch an independent verifier')
          },
        })
        expect((await stages.execute(context)).status).not.toBe('passed')
        const record = store.stage(contractDigest(context.request), context.stage.id)
        if (!record) throw new Error('Fixture root stage missing')
        const latest = gateRuns(engine.store.events()).at(-1)?.rounds.at(-1)?.plan
        expect(latest?.units.some((unit) => unit.origin === 'delivery:contracts')).toBe(true)
        expect(latest?.units.filter((unit) => unit.origin === 'agreed:criteria')).toEqual([])
        store.lifecycle.transition(context.request.run, {
          to: 'paused',
          reason: 'Inspect the original contract verification without reselecting inputs.',
        })
        const fresh = new RunnerVerificationStages(new RunnerStore(store.files.root), {
          identity: context.request.host,
          engine: () => engine,
          driver,
          contracts: () => {
            throw new Error('Recovery cannot select another contract')
          },
          suite: () => {
            throw new Error('Recovery cannot select another suite')
          },
          gate: () => {
            throw new Error('Recovery cannot launch another verifier')
          },
        })
        expect((await fresh.inspect(context.request, record)).status).not.toBe('passed')
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      },
      { unit: 'contract' },
    )
  })
  it('refuses a consumed lost contract binding before calling any selector', async () => {
    await setup(
      async ({ store, context, engine, driver }) => {
        store.files.atomic(
          `delivery/runner-verifications/${context.invocation}.json.consumed`,
          `${context.invocation}\n`,
        )
        const before = gateRuns(engine.store.events()).length,
          stages = new RunnerVerificationStages(store, {
            identity: context.request.host,
            engine: () => engine,
            driver,
            contracts: () => {
              throw new Error('Consumed intent cannot select different contract paths')
            },
            suite: () => {
              throw new Error('Consumed intent cannot select another suite')
            },
            gate: () => {
              throw new Error('Consumed intent cannot launch another verifier')
            },
          })
        await expect(stages.execute(context)).rejects.toThrow(
          'verification-stage-original-unresolved',
        )
        expect(gateRuns(engine.store.events())).toHaveLength(before)
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      },
      { unit: 'contract' },
    )
  })
})
