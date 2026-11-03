import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { gateRuns } from '../../../src/gates/state.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerUnitEnvironments } from '../../../src/runner/unit-environments.js'
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

describe('original verification re-entry after review', () => {
  it('refuses re-entry before original verification and review pass, without any effect', async () => {
    await setup(async ({ store, engine, selection, driver, dispatch }) => {
      const context = dispatch('reverification:search'),
        stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          gate: () => {
            throw new Error('Must not construct a native host')
          },
        }),
        runs = gateRuns(engine.store.events()).length,
        journal = contractDigest(store.lifecycle.journal.events())
      expect(context.stage).toMatchObject({ kind: 'verification', unit: 'search' })
      await expect(stages.execute(context)).rejects.toThrow(
        'verification-reentry-predecessors-required',
      )
      for (const suffix of ['.consumed', '.attested', ''])
        expect(
          existsSync(
            store.files.path(`delivery/runner-verifications/${context.invocation}.json${suffix}`),
          ),
        ).toBe(false)
      expect(gateRuns(engine.store.events())).toHaveLength(runs)
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
    })
  })
  it.each(['changed-head', 'lost-consumption'] as const)(
    'refuses a %s attestation locator instead of reporting a pass',
    async (mode) => {
      await setup(async ({ store, engine, selection, driver, dispatch }) => {
        const context = dispatch('reverification:search'),
          stages = new RunnerVerificationStages(store, {
            identity: context.request.host,
            engine: () => engine,
            suite: () => selection,
            driver,
            gate: () => {
              throw new Error('Must not construct a native host')
            },
          }),
          record = store.stage(contractDigest(context.request), context.stage.id),
          base = `delivery/runner-verifications/${context.invocation}.json`,
          attestation = {
            version: 1,
            request: contractDigest(context.request),
            plan: context.request.plan,
            stage: context.stage.id,
            invocation: context.invocation,
            original: { invocation: 'a'.repeat(64), evidence: 'b'.repeat(64) },
            head: mode === 'changed-head' ? 'c'.repeat(40) : 'd'.repeat(40),
          }
        if (!record) throw new Error('Original re-entry stage required')
        store.files.atomic(`${base}.attested`, `${JSON.stringify(attestation)}\n`)
        store.files.atomic(
          `${base}.consumed`,
          `${mode === 'lost-consumption' ? 'e'.repeat(64) : contractDigest(attestation)}\n`,
        )
        if (mode === 'lost-consumption')
          await expect(stages.inspect(context.request, record)).rejects.toThrow(
            'verification-reentry-attestation-binding',
          )
        else
          expect(await stages.inspect(context.request, record)).toMatchObject({
            status: 'unknown',
            provenance: 'fixture',
          })
        await expect(stages.execute(context)).rejects.toThrow()
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      })
    },
  )
  it('cancels re-entry and original verification records but no other stage', async () => {
    await setup(async ({ store, context, engine, selection, driver, dispatch }) => {
      const stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          gate: () => {
            throw new Error('Must not construct a native host')
          },
        }),
        digest = contractDigest(context.request),
        reentry = dispatch('reverification:search'),
        review = dispatch('review:search')
      for (const id of [context.stage.id, reentry.stage.id]) {
        const record = store.stage(digest, id)
        if (!record) throw new Error('Original stage required')
        await expect(
          stages.stop(context.request, record, new AbortController().signal),
        ).resolves.toBeUndefined()
      }
      const other = store.stage(digest, review.stage.id)
      if (!other) throw new Error('Original review stage required')
      await expect(
        stages.stop(context.request, other, new AbortController().signal),
      ).rejects.toThrow('verification-stage-binding')
    })
  })
})

describe('unit QA environment preparation (ADR-0207)', () => {
  const input = (repository: string) => ({
    repository,
    recipe: 'a'.repeat(64),
    helperImage: `node@sha256:${'b'.repeat(64)}`,
    suite: {
      refs: ['package.json#check'],
      mapping: { 'package.json#check': 'suite' },
      timeoutMs: 5000,
    },
  })
  it('accepts only the fixed preparer on the same store', async () => {
    await setup(async ({ store, context, engine, selection, driver }) => {
      const options = {
        identity: context.request.host,
        engine: () => engine,
        suite: () => selection,
        driver,
        gate: () => {
          throw new Error('Must not construct a native host')
        },
      }
      expect(
        () =>
          new RunnerVerificationStages(store, {
            ...options,
            environments: { prepare: async () => 'environment' } as never,
          }),
      ).toThrow('verification-stage-fixed-environments-required')
      const other = new RunnerStore(join(dirname(store.files.root), 'other-store'))
      expect(
        () =>
          new RunnerVerificationStages(store, {
            ...options,
            environments: new RunnerUnitEnvironments(other, [input('app')], driver),
          }),
      ).toThrow('verification-stage-fixed-environments-required')
    })
  })
  it('refuses an unconfigured repository before consuming the round or provisioning', async () => {
    await setup(async ({ store, context, engine, selection }) => {
      let calls = 0
      const driver = {
          provenance: 'host-observed' as const,
          call: async () => {
            calls++
            throw new Error('Must not reach the backend')
          },
        },
        stages = new RunnerVerificationStages(store, {
          identity: context.request.host,
          engine: () => engine,
          suite: () => selection,
          driver,
          environments: new RunnerUnitEnvironments(store, [input('other')], driver),
          gate: () => {
            throw new Error('Must not construct a native host')
          },
        })
      await expect(stages.execute(context)).rejects.toThrow('unit-environment-input-required')
      expect(calls).toBe(0)
      expect(
        existsSync(
          store.files.path(`delivery/runner-verifications/${context.invocation}.json.consumed`),
        ),
      ).toBe(false)
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('refuses a round that is neither the original nor a correction digest', async () => {
    await setup(async ({ store, context, driver }) => {
      const environments = new RunnerUnitEnvironments(store, [input('app')], driver)
      await expect(
        environments.prepare(
          context,
          { repository: 'app', path: store.files.root, head: 'c'.repeat(40) },
          'retry',
        ),
      ).rejects.toThrow('unit-environment-round')
    })
  })
})
