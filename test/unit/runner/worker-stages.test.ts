import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { findBudget } from '../../../src/delivery/budget-events.js'
import type { NativeRunReceipt } from '../../../src/delivery/native-host.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import { deliveryAttempts } from '../../../src/delivery/reducer.js'
import { ManagedRunnerProcess } from '../../../src/runner/native-process.js'
import { RunnerNativeScope } from '../../../src/runner/native-scope.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { RunnerWorkerStages } from '../../../src/runner/worker-stages.js'
import {
  type RunnerWorkerFixture as Fixture,
  runnerWorkerFixture as setup,
} from '../../support/runner-worker.js'

function record(input: Fixture, id = 'implementation:search') {
  const stage = input.store.stage(input.digest, id)
  if (!stage) throw new Error('Fixture stage missing')
  return stage
}

describe('owned native workers join the original root stage', () => {
  it('binds the native directory before registering an actual boundary control and then the model', async () => {
    await setup(async (input) => {
      const { workers, options, queue, request, store, dispatch } = input,
        boundary = options.boundary
      options.boundary = (process, workspace) => ({
        observe: async (observation) => {
          const entry = queue.inspect(request.run)[0]
          if (!entry?.attempt) throw new Error('Original claim must precede boundary control')
          expect(
            workers.native.binding(queue.assigned(request.run, entry.attempt))?.directory,
          ).toBeDefined()
          const result = await process('codex', ['--version'], {
            cwd: store.files.root,
            input: '',
            timeoutMs: 3000,
            signal: new AbortController().signal,
            env: { PATH: options.native.path },
          })
          expect(result.ownership.invocationState).toBe('stopped')
          expect(result.code).toBe(0)
          return boundary(process, workspace).observe(observation)
        },
      })
      const context = dispatch('implementation:search')
      expect((await workers.execute(context)).status).toBe('passed')
      const entry = queue.inspect(request.run)[0]
      const reservation = findBudget(queue.lifecycle.journal.get(request.run))?.reservations.find(
        (item) => item.id === entry?.attempt,
      )
      expect(reservation?.deadline).toBe(context.deadline)
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(2)
    })
  })
  it('ignores a conflicting later receipt and keeps the journal-selected original result', async () => {
    await setup(async (input) => {
      const { workers, dispatch, queue, request, store } = input,
        context = dispatch('implementation:search')
      await workers.execute(context)
      const entry = queue.inspect(request.run)[0]
      if (!entry?.attempt) throw new Error('Fixture claim missing')
      const lease = queue.assigned(request.run, entry.attempt),
        receipt = workers.native.retained(lease)?.receipt
      if (!receipt) throw new Error('Fixture receipt missing')
      const later = { ...receipt, status: 'failed', reason: 'stale' }
      store.files.atomic(
        `${receipt.directory}/receipt-${contractDigest(later)}.json`,
        JSON.stringify(later),
      )
      expect(workers.native.retained(lease)?.receipt).toEqual(receipt)
      expect((await workers.inspect(request, record(input))).status).toBe('passed')
    })
  })
  it('records an unavailable admission as positively not started without claiming another queue entry', async () => {
    await setup(async (input) => {
      const { options, store, queue, request, dispatch } = input
      options.admit = () => ({ ready: false, reason: 'environment-unavailable' })
      const workers = new RunnerWorkerStages(store, queue, options),
        context = dispatch('implementation:search')
      expect(await workers.execute(context)).toMatchObject({
        status: 'blocked',
        invocationState: 'not-started',
      })
      expect(await workers.inspect(request, record(input))).toMatchObject({
        status: 'blocked',
        invocationState: 'not-started',
      })
      expect(deliveryAttempts(store.lifecycle.journal.get(request.run)).records).toEqual([])
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
    })
  })
  it('stops the original actual native group from a fresh controller after revocation', async () => {
    await setup(async (input) => {
      const { options, store, queue, request, dispatch } = input,
        workers = new RunnerWorkerStages(store, queue, options),
        context = dispatch('implementation:search'),
        execution = workers.execute(context),
        deadline = Date.now() + 8000
      let completed = false
      const result = execution.finally(() => {
        completed = true
      })
      try {
        while (!existsSync(store.files.path('fixture-bin/ready'))) {
          if (completed || Date.now() >= deadline)
            throw new Error('The actual fixture worker did not receive input')
          await new Promise((resolve) => setTimeout(resolve, 30))
        }
        store.lifecycle.authority.revoke({
          schema: 'wholeloop/delivery-revocation-request@1',
          grant: request.grant,
          operator: 'Fixture Operator',
          reason: 'Revoke the original actual worker without granting replacement execution.',
        })
        const fresh = new RunnerWorkerStages(
          new RunnerStore(store.files.root),
          new DeliveryQueue(store.files.root),
          options,
        )
        await fresh.stop(request, record(input), new AbortController().signal)
        const calls = new RunnerNativeScope(store.files, context.invocation).calls(),
          call = calls[0]
        if (!call) throw new Error('Original native control missing')
        const manager = new ManagedRunnerProcess(store.files, call.invocation),
          intent = JSON.parse(
            readFileSync(store.files.path(`${manager.relative}/intent.json`), 'utf8'),
          )
        expect(
          JSON.parse(readFileSync(store.files.path(`${manager.relative}/cancel.json`), 'utf8')),
        ).toEqual({ nonce: intent.nonce })
        const observed = await result
        expect(observed.status).not.toBe('passed')
        expect(manager.observe().invocationState).toBe('stopped')
        expect(calls).toHaveLength(1)
      } finally {
        new RunnerNativeScope(store.files, context.invocation).requestCancellation()
        await result
      }
    }, 'hang')
  })
  it('recovers an original completed worker from a fresh controller without launching it again', async () => {
    await setup(async (input) => {
      const { workers, dispatch, store, request, queue, options } = input,
        context = dispatch('implementation:search'),
        result = await workers.execute(context),
        lease = queue.assigned(request.run, queue.inspect(request.run)[0]?.attempt ?? ''),
        retained = workers.native.retained(lease)
      expect(result).toMatchObject({
        status: 'passed',
        invocationState: 'stopped',
        provenance: 'fixture',
      })
      expect(retained?.receipt).toMatchObject({
        status: 'succeeded',
        acceptance: 'not-established',
      })
      expect(workers.native.completed(lease)).toBe(true)
      expect(record(input).runtime?.backend).toBe('owned-native')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
      store.lifecycle.transition(request.run, {
        to: 'paused',
        reason: 'Simulate a lost final reply without resuming the run.',
      })
      const fresh = new RunnerWorkerStages(
        new RunnerStore(store.files.root),
        new DeliveryQueue(store.files.root),
        options,
      )
      expect((await fresh.inspect(request, record(input))).status).toBe('passed')
      expect(store.lifecycle.journal.get(request.run).state).toBe('paused')
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
      expect(store.inspect(input.digest).outcome).toBeNull()
    })
  })
  it.each(['context', 'copied-input', 'artifact', 'candidate', 'receipt'] as const)(
    'refuses changed %s without replay or inferred QA',
    async (mode) => {
      await setup(async (input) => {
        const { workers, dispatch, store, request, queue } = input,
          context = dispatch('implementation:search')
        await workers.execute(context)
        const lease = queue.assigned(request.run, queue.inspect(request.run)[0]?.attempt ?? ''),
          retained = workers.native.retained(lease)
        if (!retained?.receipt) throw new Error('Fixture receipt missing')
        const { binding, receipt } = retained
        if (mode === 'context')
          writeFileSync(join(binding.contextRoot, 'artifacts/guidance.txt'), 'Changed guidance.')
        if (mode === 'copied-input')
          writeFileSync(
            store.files.path(`${binding.directory}/inputs/artifacts/guidance.txt`),
            'Changed copied guidance.',
          )
        if (mode === 'artifact') {
          const artifact = receipt.artifacts?.[0]
          if (!artifact) throw new Error('Fixture captured artifact missing')
          writeFileSync(store.files.path(artifact.ref), 'Changed captured output.')
        }
        if (mode === 'candidate')
          writeFileSync(join(binding.workspace ?? '', 'app.txt'), 'Changed candidate.')
        if (mode === 'receipt') {
          const attempt = deliveryAttempts(store.lifecycle.journal.get(request.run)).records.find(
            (item) => item.id === lease.attempt,
          )
          writeFileSync(
            store.files.path(`${binding.directory}/receipt-${attempt?.evidence}.json`),
            JSON.stringify({ ...receipt, model: 'another-model' } satisfies NativeRunReceipt),
          )
        }
        if (mode === 'receipt')
          await expect(workers.inspect(request, record(input))).rejects.toThrow(
            'native-receipt-binding',
          )
        else expect((await workers.inspect(request, record(input))).status).not.toBe('passed')
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
        expect(store.inspect(input.digest).outcome).toBeNull()
      })
    },
  )
  it('retains a failed asynchronous probe and its one-shot directory before any model launch', async () => {
    await setup(async (input) => {
      const { store, request, queue, options, dispatch } = input,
        context = dispatch('implementation:search')
      options.boundary = () => ({
        observe: async () => {
          throw new Error('Private diagnostic must not escape')
        },
      })
      const workers = new RunnerWorkerStages(store, queue, options)
      await expect(workers.execute(context)).rejects.toThrow('original attempt retained')
      const lease = queue.assigned(request.run, queue.inspect(request.run)[0]?.attempt ?? ''),
        binding = workers.native.binding(lease)
      expect(binding?.assignment.identity.attempt).toBe(lease.attempt)
      expect((await workers.execute(context)).status).toBe('unknown')
      expect(queue.inspect(request.run)).toHaveLength(1)
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(0)
      expect(deliveryAttempts(store.lifecycle.journal.get(request.run)).records[0]?.state).toBe(
        'claimed',
      )
      if (!binding) throw new Error('Fixture binding missing')
      await expect(
        workers.native.run(lease, options.context(context, binding.workspace), {
          ...options.native,
        }),
      ).rejects.toThrow('native-already-invoked')
    })
  })
  it('keeps a missing original binding unknown and refuses cross-stage private metadata', async () => {
    await setup(async (input) => {
      const { workers, dispatch, store, request } = input,
        context = dispatch('implementation:search')
      await workers.execute(context)
      const path = store.files.path(`delivery/runner-workers/${context.invocation}/binding.json`),
        body = readFileSync(path, 'utf8')
      renameSync(path, `${path}.retained`)
      expect((await workers.inspect(request, record(input))).status).toBe('unknown')
      writeFileSync(path, JSON.stringify({ ...JSON.parse(body), unit: 'another-unit' }))
      await expect(workers.inspect(request, record(input))).rejects.toThrow(
        'worker-stage-resource-binding',
      )
      expect(new RunnerNativeScope(store.files, context.invocation).calls()).toHaveLength(1)
    })
  })
  it.each(['cancelled', 'expired', 'fenced', 'plan', 'host'] as const)(
    'refuses %s input before queue admission',
    async (mode) => {
      await setup(async (input) => {
        const { workers, dispatch, queue, options, store } = input,
          context = dispatch('implementation:search')
        if (mode === 'cancelled') {
          const abort = new AbortController()
          abort.abort()
          context.signal = abort.signal
        }
        if (mode === 'expired') context.deadline = new Date(Date.now() - 1).toISOString()
        if (mode === 'fenced') context.current = () => false
        if (mode === 'plan') context.plan = { ...context.plan, owner: 'Another Owner' }
        if (mode === 'host') options.identity = { ...options.identity, version: 'different' }
        await expect(workers.execute(context)).rejects.toThrow(/worker-stage-(not-current|binding)/)
        expect(queue.inspect(context.request.run)).toEqual([])
        expect(new RunnerNativeScope(store.files, context.invocation).calls()).toEqual([])
      })
    },
  )
})
