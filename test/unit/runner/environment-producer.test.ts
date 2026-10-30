import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DockerTransport } from '../../../src/environment/docker-command.js'
import { EnvironmentResources } from '../../../src/environment/runtime.js'
import { RunnerEnvironmentProducer } from '../../../src/runner/environment-producer.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { runnerPreparationFixture as setup } from '../../support/runner-preparation.js'

const deny: DockerTransport = {
  provenance: 'host-observed',
  call: async () => {
    throw new Error('Recovery must not execute another backend command')
  },
}
describe('original recorded environment inputs', () => {
  it.each(['cancelled', 'expired', 'fenced', 'changed-stage', 'foreign-invocation'] as const)(
    'refuses %s without provisioning or recording a result',
    async (mode) => {
      await setup(async ({ store, scope, context, request, ready }) => {
        const producer = new RunnerEnvironmentProducer(store, scope.phase ?? ''),
          abort = new AbortController(),
          journal = contractDigest(store.lifecycle.journal.events())
        context.signal = abort.signal
        if (mode === 'cancelled') abort.abort()
        if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') context.current = () => false
        if (mode === 'changed-stage') context.stage = { ...context.stage, criteria: [] }
        if (mode === 'foreign-invocation') context.invocation = '0'.repeat(64)
        await expect(producer.prepare(context, request, deny)).rejects.toThrow()
        expect(existsSync(ready)).toBe(false)
        expect(new EnvironmentResources(store.files).list()).toEqual([])
        expect(producer.inspect(context.invocation).status).toBe('unknown')
        expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
      })
    },
  )
  it('retains unsuccessful original preflight without capturing readiness or retrying', async () => {
    await setup(async ({ store, scope, context, request, driver }) => {
      const producer = new RunnerEnvironmentProducer(store, scope.phase ?? ''),
        first = await producer.prepare(context, request, driver),
        journal = contractDigest(store.lifecycle.journal.events()),
        owners = scope.inspect()
      expect(first.status).toBe('unknown')
      expect(first.environment).toBeUndefined()
      expect(first.readiness).toBe('historical-only')
      expect(first.acceptance).toBe('not-established')
      expect(owners.invocationState).toBe('stopped')
      expect(await producer.prepare(context, request, deny)).toEqual(first)
      expect(scope.inspect()).toEqual(owners)
      expect(
        new RunnerEnvironmentProducer(new RunnerStore(store.files.root), scope.phase ?? '').inspect(
          context.invocation,
        ),
      ).toEqual(first)
      await expect(
        producer.prepare(context, { ...request, key: 'substituted-key' }, deny),
      ).rejects.toThrow('input-conflict')
      expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
    })
  })
  it('cannot import a readiness assertion through a result locator or renew lost preparation', async () => {
    await setup(async ({ store, scope, context, request, ready }) => {
      const producer = new RunnerEnvironmentProducer(store, scope.phase ?? ''),
        base = `delivery/runner-environment-results/${context.invocation}/${scope.phase}`,
        journal = contractDigest(store.lifecycle.journal.events())
      store.files.atomic(`${base}/consumed`, `${'a'.repeat(64)}\n`)
      store.files.atomic(`${base}/result.json`, JSON.stringify({ artifact: 'a'.repeat(64) }))
      const result = await producer.prepare(context, request, deny)
      expect(result.status).toBe('unknown')
      expect(result.environment).toBeUndefined()
      expect(existsSync(ready)).toBe(false)
      expect(scope.origin()).toBeUndefined()
      expect(contractDigest(store.lifecycle.journal.events())).toBe(journal)
    })
  })
  it('preserves the original signal through native preflight and captures no late result', async () => {
    await setup(async ({ store, scope, context, request, driver, ready }) => {
      const producer = new RunnerEnvironmentProducer(store, scope.phase ?? ''),
        abort = new AbortController()
      context.signal = abort.signal
      const pending = producer.prepare(context, request, driver),
        until = Date.now() + 3000
      while (!existsSync(ready) && Date.now() < until)
        await new Promise((resolve) => setTimeout(resolve, 10))
      try {
        expect(existsSync(ready)).toBe(true)
        context.signal = new AbortController().signal
        abort.abort()
        await expect(pending).rejects.toThrow('parent-not-current')
        expect(scope.inspect().invocationState).toBe('stopped')
        expect(producer.inspect(context.invocation).status).toBe('unknown')
      } finally {
        abort.abort()
        await pending.catch(() => {})
      }
    }, true)
  })
})
