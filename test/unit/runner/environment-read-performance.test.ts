import { renameSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentOperations } from '../../../src/environment/operations.js'
import { runnerEnvironmentFixture as setup } from '../../support/runner-environment.js'

afterEach(() => vi.restoreAllMocks())

describe('environment stage bindings read once per inert Docker query (ADR-0244)', () => {
  it.each([1, 4])('lists operations once for each of %i inert reads', async (reads) => {
    await setup(async ({ scope, context, environment, driver }) => {
      const list = vi.spyOn(EnvironmentOperations.prototype, 'list')
      await scope.run(context, environment, driver, async (selected) => {
        list.mockClear()
        for (let index = 0; index < reads; index++)
          expect((await selected.call(['info'])).status).toBe('succeeded')
        // One complete binding read under the writer lock per query; the
        // former admission read repeated the same listing just before it.
        expect(list).toHaveBeenCalledTimes(reads)
      })
      expect(scope.inspect().reads).toHaveLength(reads)
    })
  })

  it('reads each operation record once while listing', async () => {
    await setup(async ({ scope, context, environment, driver, operations }) => {
      const registration = operations.begin(['container', 'create', 'fixture'], 5000)
      await scope.run(context, environment, driver, (selected) =>
        selected.call(['container', 'create', 'fixture'], { registration }),
      )
      const reader = vi.spyOn(
        EnvironmentOperations.prototype as unknown as { read: (...args: unknown[]) => unknown },
        'read',
      )
      expect(operations.list()).toHaveLength(1)
      // Each record once: the process checks reuse the validated started/outcome.
      expect(reader.mock.calls.map(([, name]) => name)).toEqual([
        'started',
        'outcome',
        'client-close',
        'cancel',
        'exec-release',
      ])
    })
  })

  it.each([
    [['info'], 'environment-stage-original-unresolved'],
    [['container', 'create', 'unowned'], 'environment-stage-original-unresolved'],
  ])('keeps the unresolved-binding refusal first for %j', async (args, problem) => {
    await setup(async ({ store, scope, context, environment, driver }) => {
      await scope.run(context, environment, driver, async (selected) => {
        const path = store.files.path(`delivery/runner-environments/${context.invocation}.json`)
        renameSync(path, `${path}.retained`)
        await expect(selected.call(args)).rejects.toThrow(problem)
        renameSync(`${path}.retained`, path)
      })
    })
  })

  it('registers no read owner for a query answered in-process (ADR-0244)', async () => {
    await setup(async ({ scope, context, environment, driver }) => {
      const answer = {
        status: 'succeeded' as const,
        stdout: '{"ID":"fixture"}\n',
        code: 0,
        digest: 'a'.repeat(64),
      }
      let served = 0
      const queried = {
        provenance: driver.provenance,
        call: (args: string[], options?: Parameters<typeof driver.call>[1]) =>
          driver.call(args, options),
        query: async (args: string[]) => {
          served++
          return args[0] === 'info' ? answer : undefined
        },
      }
      await scope.run(context, environment, queried, async (selected) => {
        expect(await selected.call(['info', '--format', '{{json .}}'])).toEqual(answer)
        // An unserved shape still takes the original owned read path.
        expect((await selected.call(['version'])).status).toBe('succeeded')
      })
      expect(served).toBe(2)
      expect(scope.inspect().reads).toHaveLength(1)
    })
  })
})
