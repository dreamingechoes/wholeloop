import { existsSync, readFileSync, renameSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { RunnerEnvironmentScope } from '../../../src/runner/environment-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerEnvironmentFixture as setup } from '../../support/runner-environment.js'

describe('root-owned environment operations retain their original private invokers', () => {
  it('recovers actual inert reads under their own durable process owner', async () => {
    await setup(async ({ scope, context, environment, driver, operations }) => {
      const result = await scope.run(context, environment, driver, (selected) =>
        selected.call(['info']),
      )
      expect(result.status).toBe('succeeded')
      const observation = scope.inspect()
      expect(observation.invocationState).toBe('stopped')
      expect(observation.reads).toHaveLength(1)
      expect(operations.list()).toEqual([])
      expect(new RunnerEnvironmentScope(scope.store, context.invocation).inspect()).toEqual(
        observation,
      )
    })
  })
  it('keeps separate phase owners and original observations without overwriting or replay', async () => {
    await setup(async ({ store, scope, context, environment, driver }) => {
      await scope.run(context, environment, driver, (selected) => selected.call(['info']))
      const original = scope.inspect(),
        phase = contractDigest({ gate: 'verify', round: 2 }),
        later = new RunnerEnvironmentScope(store, context.invocation, phase)
      await later.run(context, environment, driver, (selected) => selected.call(['info']))
      const observed = later.inspect()
      expect(observed.invocationState).toBe('stopped')
      expect(observed.reads[0]?.invocation).not.toBe(original.reads[0]?.invocation)
      expect(scope.inspect()).toEqual(original)
      expect(
        new RunnerEnvironmentScope(
          new RunnerStore(store.files.root),
          context.invocation,
          phase,
        ).inspect(),
      ).toEqual(observed)
      await expect(later.run(context, environment, driver, async () => undefined)).rejects.toThrow(
        'environment-stage-original-unresolved',
      )
      expect(() => new RunnerEnvironmentScope(store, context.invocation, '../another')).toThrow(
        'environment-stage-invocation',
      )
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: context.request.grant,
        operator: 'Fixture Operator',
        reason: 'Retain all original phase cancellation channels.',
      })
      scope.cancelAll()
      expect(scope.inspect()).toEqual(original)
      expect(later.inspect()).toEqual(observed)
    })
  })
  it('cancels other original phase effects even when one private locator is lost', async () => {
    await setup(async ({ store, scope, context, environment, operations, driver }) => {
      const phases = ['first', 'second'].map(
          (name) => new RunnerEnvironmentScope(store, context.invocation, contractDigest(name)),
        ),
        owned = []
      for (const [index, phase] of phases.entries()) {
        const args = ['container', 'create', `phase-${index}`],
          registration = operations.begin(args, 5000)
        await phase.run(context, environment, driver, async (selected) => {
          operations.close(registration, await selected.call(args, { registration }))
        })
        owned.push(registration)
      }
      const first = store.files.path(
        `delivery/runner-environments/${context.invocation}/${phases[0]?.phase}.json`,
      )
      renameSync(first, `${first}.lost`)
      expect(() => scope.cancelAll()).toThrow('environment-stage-cancellation-unresolved')
      expect(existsSync(owned[0]?.cancel ?? '')).toBe(false)
      expect(existsSync(owned[1]?.cancel ?? '')).toBe(true)
      expect(() => phases[1]?.cancelAll()).toThrow('environment-stage-root-scope-required')
    })
  })
  it('holds a live inert read and cancels only its original private group from a fresh controller', async () => {
    await setup(async ({ store, scope, context, environment, driver, ready, operations }) => {
      const pending = scope.run(context, environment, driver, (selected) =>
        selected.call(['info'], { timeoutMs: 10000 }),
      )
      const until = Date.now() + 5000
      while (!existsSync(ready) && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 10))
      expect(existsSync(ready)).toBe(true)
      const fresh = new RunnerEnvironmentScope(
        new RunnerStore(store.files.root),
        context.invocation,
      )
      expect(fresh.inspect().invocationState).toBe('unknown')
      fresh.cancel()
      expect((await pending).status).not.toBe('succeeded')
      expect(fresh.inspect().invocationState).toBe('stopped')
      expect(operations.list()).toEqual([])
    }, true)
  })
  it('does not promote a normalized read without an actual native invoker into observed closure', async () => {
    await setup(async ({ scope, context, environment }) => {
      await expect(
        scope.run(
          context,
          environment,
          {
            provenance: 'fixture',
            call: async () => {
              throw new Error('Must not run')
            },
          },
          async () => undefined,
        ),
      ).rejects.toThrow('environment-stage-not-current')
      await scope.run(
        context,
        environment,
        {
          provenance: 'host-observed',
          call: async () => ({
            status: 'succeeded',
            stdout: 'Unobserved fixture claim.',
            code: 0,
            digest: 'f'.repeat(64),
          }),
        },
        (selected) => selected.call(['info']),
      )
      expect(scope.inspect().invocationState).toBe('unknown')
    })
  })
  it('refuses an operation already issued elsewhere and preserves unrelated private cancellation channels', async () => {
    await setup(async ({ scope, context, environment, operations, driver }) => {
      const args = ['container', 'create', 'fixture'],
        original = operations.begin(args, 5000),
        unrelated = operations.begin(['container', 'create', 'unrelated'], 5000)
      await scope.run(context, environment, driver, async (selected) => {
        const result = await selected.call(args, { registration: original })
        operations.close(original, result)
        await expect(selected.call(args, { registration: original })).rejects.toThrow(
          'environment-stage-operation-already-issued',
        )
      })
      scope.cancel()
      expect(existsSync(original.cancel)).toBe(true)
      expect(existsSync(unrelated.cancel)).toBe(false)
      expect(scope.inspect().invocationState).toBe('stopped')
    })
  })
  it('preserves the original effect timeout even when the caller requests a longer allowance', async () => {
    await setup(async ({ scope, context, environment, operations, driver }) => {
      const args = ['container', 'create', 'fixture'],
        registration = operations.begin(args, 500),
        started = Date.now()
      const result = await scope.run(context, environment, driver, (selected) =>
        selected.call(args, { registration, timeoutMs: 5000 }),
      )
      operations.close(registration, result)
      expect(result.status).not.toBe('succeeded')
      expect(Date.now() - started).toBeLessThan(2500)
    }, true)
  })
  it('keeps a lost original read owner unknown instead of recreating it', async () => {
    await setup(async ({ store, scope, context, environment, driver }) => {
      await scope.run(context, environment, driver, (selected) => selected.call(['info']))
      const read = scope.inspect().reads[0]
      if (!read) throw new Error('Fixture read owner missing')
      const path = store.files.path(`delivery/runner-native/${read.invocation}/intent.json`)
      renameSync(path, `${path}.retained`)
      expect(scope.inspect().invocationState).toBe('unknown')
      await expect(scope.run(context, environment, driver, async () => undefined)).rejects.toThrow(
        'environment-stage-original-unresolved',
      )
    })
  })
  it('fences escaped read transports after the original scope has ended', async () => {
    await setup(async ({ scope, context, environment, driver, ready }) => {
      let late: (() => ReturnType<typeof driver.call>) | undefined
      await scope.run(context, environment, driver, async (selected) => {
        late = () => selected.call(['info'])
      })
      if (!late) throw new Error('Fixture transport missing')
      await expect(late()).rejects.toThrow('environment-stage-fenced')
      expect(existsSync(ready)).toBe(false)
    })
  })
  it('registers before input and recovers exact closed operations while paused without replay or QA authority', async () => {
    await setup(async ({ store, context, scope, environment, operations, driver }) => {
      const args = ['container', 'create', 'fixture'],
        registration = operations.begin(args, 5000)
      const result = await scope.run(context, environment, driver, async (selected) => {
        const result = await selected.call(args, { registration, timeoutMs: 5000 })
        operations.close(registration, result)
        return result
      })
      expect(result).toMatchObject({
        status: 'succeeded',
        stdout: 'Observed synthetic client output.',
      })
      expect(store.stage(contractDigest(context.request), context.stage.id)?.runtime?.backend).toBe(
        'owned-docker',
      )
      const first = scope.inspect()
      expect(first.invocationState).toBe('stopped')
      expect(first.operations).toHaveLength(1)
      store.lifecycle.transition(context.request.run, {
        to: 'paused',
        reason: 'Observe original operation without continuing.',
      })
      const fresh = new RunnerEnvironmentScope(
        new RunnerStore(store.files.root),
        context.invocation,
      )
      expect(fresh.inspect()).toEqual(first)
      expect(new EnvironmentResources(store.files).get(environment).record.acceptance).toBe(
        'not-established',
      )
      await expect(scope.run(context, environment, driver, async () => undefined)).rejects.toThrow()
      expect(operations.list()).toHaveLength(1)
    })
  })
  it.each(['cancelled', 'expired', 'changed-plan'] as const)(
    'refuses %s before any native call',
    async (mode) => {
      await setup(async ({ scope, context, environment, driver, ready }) => {
        if (mode === 'cancelled') {
          const abort = new AbortController()
          abort.abort()
          context.signal = abort.signal
        }
        if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'changed-plan') context.plan = { ...context.plan, owner: 'Different Owner' }
        await expect(
          scope.run(context, environment, driver, (selected) => selected.call(['info'])),
        ).rejects.toThrow('environment-stage-not-current')
        expect(existsSync(ready)).toBe(false)
      })
    },
  )
  it('rejects unregistered mutations and changed command bindings before dispatch', async () => {
    await setup(async ({ scope, context, environment, operations, driver, ready }) => {
      await scope.run(context, environment, driver, async (selected) => {
        await expect(selected.call(['container', 'create', 'unowned'])).rejects.toThrow(
          'environment-stage-unregistered-operation',
        )
        const registration = operations.begin(['container', 'create', 'fixture'], 5000)
        await expect(
          selected.call(['container', 'create', 'changed'], { registration }),
        ).rejects.toThrow('environment-stage-operation-binding')
      })
      expect(existsSync(ready)).toBe(false)
    })
  })
  it('keeps a lost consumed descriptor unknown and refuses a replacement invocation', async () => {
    await setup(async ({ store, scope, context, environment, driver }) => {
      await scope.run(context, environment, driver, async () => undefined)
      const path = store.files.path(`delivery/runner-environments/${context.invocation}.json`)
      renameSync(path, `${path}.retained`)
      expect(scope.inspect().invocationState).toBe('unknown')
      await expect(scope.run(context, environment, driver, async () => undefined)).rejects.toThrow(
        'environment-stage-original-unresolved',
      )
    })
  })
  it('cancels an actual live original operation from a fresh controller after revocation', async () => {
    await setup(async ({ store, scope, context, environment, operations, driver, ready }) => {
      const args = ['container', 'create', 'fixture'],
        registration = operations.begin(args, 10000)
      const pending = scope.run(context, environment, driver, async (selected) => {
        const result = await selected.call(args, { registration, timeoutMs: 10000 })
        operations.close(registration, result)
        return result
      })
      const until = Date.now() + 5000
      while (!existsSync(ready) && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 10))
      expect(existsSync(ready)).toBe(true)
      store.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: context.request.grant,
        operator: 'Fixture Operator',
        reason: 'Retain exact cancellation ownership after authority ends.',
      })
      const fresh = new RunnerEnvironmentScope(
        new RunnerStore(store.files.root),
        context.invocation,
      )
      fresh.cancel()
      expect((await pending).status).not.toBe('succeeded')
      expect(fresh.inspect().invocationState).toBe('stopped')
      expect(JSON.parse(readFileSync(registration.cancel, 'utf8')).nonce).toBe(registration.nonce)
    }, true)
  })
})
