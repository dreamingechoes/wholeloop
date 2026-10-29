import { createServer } from 'node:http'
import { expect, it } from 'vitest'
import { DeliveryAcceptance } from '../../../src/acceptance/store.js'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { acceptanceFixture } from '../../support/acceptance.js'

it('aborts an actual in-flight HTTP request through the original parent signal', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host, calls }) => {
    let requested = () => {}
    const received = new Promise<void>((resolve) => {
        requested = resolve
      }),
      server = createServer(() => requested())
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing local test address')
      const pinned = acceptance.prepare(plan),
        abort = new AbortController(),
        controlled = new DeliveryAcceptance(acceptance.planning.sources.files.root, {
          control: {
            deadline: new Date(Date.now() + 5000).toISOString(),
            signal: abort.signal,
            current: () => true,
          },
        }),
        result = controlled.executeCase(pinned.digest, 'find-title', 'http', boundary, {
          ...host,
          async execute(test, context) {
            await fetch(`http://127.0.0.1:${address.port}/`, { signal: context.signal })
            return host.execute(test, context)
          },
        })
      await received
      abort.abort()
      const observed = await result
      expect(observed.status).toBe('interrupted')
      expect(observed.invocationState).toBe('stopped')
      expect(calls.count).toBe(0)
      expect(observed.artifacts).toEqual([])
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }))

it.each(['cancelled', 'expired', 'fenced', 'invalid-deadline'] as const)(
  'refuses %s parent control without starting a case or consuming budget',
  (mode) =>
    acceptanceFixture(async ({ acceptance, plan, boundary, host, calls }) => {
      const pinned = acceptance.prepare(plan),
        abort = new AbortController()
      if (mode === 'cancelled') abort.abort()
      const controlled = new DeliveryAcceptance(acceptance.planning.sources.files.root, {
          control: {
            signal: abort.signal,
            deadline:
              mode === 'invalid-deadline'
                ? 'tomorrow'
                : new Date(Date.now() + (mode === 'expired' ? -1 : 30000)).toISOString(),
            current: () => mode !== 'fenced',
          },
        }),
        before = contractDigest(acceptance.budgets.lifecycle.journal.events())
      await expect(
        controlled.executeCase(pinned.digest, 'find-title', 'bounded', boundary, host),
      ).rejects.toThrow('acceptance-controller-fenced')
      expect(calls.count).toBe(0)
      expect(controlled.observedResults(pinned.digest, 'find-title')).toEqual([])
      expect(contractDigest(acceptance.budgets.lifecycle.journal.events())).toBe(before)
    }),
)

it.each(['cancelled', 'expired', 'fenced'] as const)(
  'rechecks %s parent control after boundary observation before accounting',
  (mode) =>
    acceptanceFixture(async ({ acceptance, plan, boundary, host, calls }) => {
      const pinned = acceptance.prepare(plan),
        abort = new AbortController(),
        deadline = new Date(Date.now() + 5000).toISOString()
      let current = true,
        now = new Date().toISOString()
      const controlled = new DeliveryAcceptance(acceptance.planning.sources.files.root, {
          now: () => now,
          control: { deadline, signal: abort.signal, current: () => current },
        }),
        before = contractDigest(acceptance.budgets.lifecycle.journal.events())
      await expect(
        controlled.executeCase(
          pinned.digest,
          'find-title',
          'bounded',
          {
            ...boundary,
            async observe(value) {
              const result = await boundary.observe(value)
              if (mode === 'cancelled') abort.abort()
              if (mode === 'expired') now = deadline
              if (mode === 'fenced') current = false
              return result
            },
          },
          host,
        ),
      ).rejects.toThrow('acceptance-controller-fenced')
      expect(calls.count).toBe(0)
      expect(contractDigest(acceptance.budgets.lifecycle.journal.events())).toBe(before)
    }),
)

it('retains the captured narrower parent deadline despite later caller mutation', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    const pinned = acceptance.prepare(plan),
      deadline = new Date(Date.now() + 5000).toISOString(),
      control = { deadline, signal: new AbortController().signal, current: () => true },
      controlled = new DeliveryAcceptance(acceptance.planning.sources.files.root, { control })
    control.deadline = new Date(Date.now() + 60000).toISOString()
    let observed = false
    const result = await controlled.executeCase(pinned.digest, 'find-title', 'bounded', boundary, {
      ...host,
      async execute(test, context) {
        expect(context.deadline).toBe(deadline)
        expect(context.timeoutMs).toBeLessThanOrEqual(5000)
        observed = true
        return host.execute(test, context)
      },
    })
    expect(observed).toBe(true)
    expect(result.status).toBe('passed')
    expect(controlled.control?.deadline).toBe(deadline)
  }))

it.each(['cancelled', 'fenced', 'expired'] as const)(
  'interrupts an active host on parent %s and retains original stopped evidence',
  (mode) =>
    acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
      const pinned = acceptance.prepare(plan),
        abort = new AbortController()
      let now = new Date().toISOString(),
        current = true,
        entered = () => {},
        stopped = 0
      const started = new Promise<void>((resolve) => {
          entered = resolve
        }),
        controlled = new DeliveryAcceptance(acceptance.planning.sources.files.root, {
          now: () => now,
          control: {
            deadline: new Date(Date.now() + 5000).toISOString(),
            signal: abort.signal,
            current: () => current,
          },
        }),
        result = controlled.executeCase(pinned.digest, 'find-title', 'bounded', boundary, {
          ...host,
          async execute(_test, context) {
            entered()
            await new Promise<void>((resolve) => {
              context.signal.addEventListener('abort', () => resolve(), { once: true })
              if (context.signal.aborted) resolve()
            })
            throw new Error('Original case cancelled')
          },
          async stop() {
            stopped++
            return 'stopped'
          },
        })
      await started
      if (mode === 'cancelled') abort.abort()
      else if (mode === 'expired') now = controlled.control?.deadline ?? ''
      else current = false
      const observed = await result
      expect(observed.status).toBe('interrupted')
      expect(observed.invocationState).toBe('stopped')
      expect(stopped).toBe(1)
      expect(controlled.observedCase(pinned.digest, 'find-title', 'bounded')).toEqual(observed)
      const before = contractDigest(acceptance.budgets.lifecycle.journal.events())
      await expect(
        controlled.executeCase(pinned.digest, 'find-title', 'another', boundary, host),
      ).rejects.toThrow('acceptance-controller-fenced')
      expect(contractDigest(acceptance.budgets.lifecycle.journal.events())).toBe(before)
    }),
)

it('refuses a late capture after parent ownership is lost', () =>
  acceptanceFixture(async ({ acceptance, plan, boundary, host }) => {
    const pinned = acceptance.prepare(plan)
    let current = true
    const controlled = new DeliveryAcceptance(acceptance.planning.sources.files.root, {
        control: {
          deadline: new Date(Date.now() + 5000).toISOString(),
          signal: new AbortController().signal,
          current: () => current,
        },
      }),
      result = await controlled.executeCase(pinned.digest, 'find-title', 'bounded', boundary, {
        ...host,
        async execute(test, context) {
          current = false
          return host.execute(test, context)
        },
      })
    expect(result.status).toBe('unavailable')
    expect(result.reason).toBe('acceptance-controller-fenced')
    expect(result.artifacts).toEqual([])
    expect(acceptance.budgets.inspect(plan.run).artifacts).toEqual([])
  }))
