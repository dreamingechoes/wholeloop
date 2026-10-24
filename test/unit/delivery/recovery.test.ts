import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryCheckpoints } from '../../../src/delivery/checkpoints.js'
import type { EffectIntent, EffectObservation } from '../../../src/delivery/effect-events.js'
import { DeliveryEffects, type EffectHost } from '../../../src/delivery/effects.js'
import { DeliveryQueue } from '../../../src/delivery/queue.js'
import {
  boundedRecoveryCall,
  type RecoveryClock,
  recoveryRead,
} from '../../../src/delivery/read-retry.js'
import { authorization, entry, fixture } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
const input = (ref: string) => ({
  schema: 'wholeloop/delivery-checkpoint-request@1',
  key: 'source',
  stage: 'source-adopted',
  inputs: [ref],
})
function observation(
  intent: EffectIntent,
  status: EffectObservation['status'] = 'applied',
): EffectObservation {
  return {
    binding: contractDigest(intent),
    status,
    evidence: 'a'.repeat(64),
    provenance: 'fixture',
    invocationState: 'stopped',
    reason: 'observed',
    ...(status === 'applied'
      ? { resource: { ref: intent.ref, revision: 'fixture-revision' } }
      : {}),
  }
}
function host(invoke: EffectHost['invoke'] = async () => {}): EffectHost {
  return {
    eligible: () => ({ allowed: true, provenance: 'fixture', evidence: 'a'.repeat(64) }),
    invoke,
    observe: async (intent) => ({ available: true, value: observation(intent) }),
  }
}

describe('checkpoint manifests', () => {
  it('retains exact input bytes and idempotent checkpoint identity without authority', () =>
    fixture(({ planning, plan, source }) => {
      planning.preparePlan(plan)
      const checkpoints = new DeliveryCheckpoints(planning.sources.files.root, () => at)
      checkpoints.lifecycle.track({ run: plan.run, revision: 1 })
      const request = input(`delivery/sources/${source.id}.json`)
      const first = checkpoints.capture(plan.run, request)
      expect(first).toMatchObject({
        status: 'current',
        problems: [],
        manifest: { basis: checkpoints.lifecycle.journal.get(plan.run).basis.digest },
      })
      const events = checkpoints.lifecycle.journal.events()
      expect(checkpoints.capture(plan.run, request)).toEqual(first)
      expect(checkpoints.lifecycle.journal.events()).toEqual(events)
      expect(checkpoints.lifecycle.journal.get(plan.run).grant).toBeUndefined()
      expect(checkpoints.lifecycle.journal.rebuild().runs).toBe(1)
    }))

  it('hashes binary artifacts, reports changed/missing inputs and keeps old manifests intact', () =>
    fixture(({ planning, plan }) => {
      planning.preparePlan(plan)
      const checkpoints = new DeliveryCheckpoints(planning.sources.files.root, () => at)
      checkpoints.lifecycle.track({ run: plan.run, revision: 1 })
      const files = checkpoints.lifecycle.journal.files
      mkdirSync(files.path('delivery/artifacts'), { recursive: true })
      const ref = 'delivery/artifacts/screenshot.bin',
        path = files.path(ref)
      writeFileSync(path, Buffer.from([0, 255, 1, 254]))
      const first = checkpoints.capture(plan.run, input(ref))
      if (!first) throw new Error('Checkpoint must be retained')
      const manifest = files.path(`delivery/checkpoints/${plan.run}/${first.digest}.json`)
      const before = readFileSync(manifest)
      writeFileSync(path, Buffer.from([1, 255, 1, 254]))
      expect(checkpoints.inspect(plan.run)[0]).toMatchObject({
        status: 'stale',
        problems: ['changed-input'],
      })
      expect(() => checkpoints.capture(plan.run, input(ref))).toThrow('changed-checkpoint')
      rmSync(path)
      expect(checkpoints.inspect(plan.run)[0]).toMatchObject({
        status: 'stale',
        problems: ['unavailable-input'],
      })
      expect(readFileSync(manifest)).toEqual(before)
    }))

  it.each(['duplicate', 'traversal', 'private', 'alias'] as const)(
    'refuses %s input references before journaling',
    (kind) =>
      fixture(({ planning, plan, source }) => {
        planning.preparePlan(plan)
        const checkpoints = new DeliveryCheckpoints(planning.sources.files.root, () => at)
        checkpoints.lifecycle.track({ run: plan.run, revision: 1 })
        const ref = `delivery/sources/${source.id}.json`
        const request = input(ref)
        if (kind === 'duplicate') request.inputs.push(ref)
        if (kind === 'traversal') request.inputs = ['delivery/artifacts/../../authority/value.json']
        if (kind === 'private') request.inputs = ['delivery/authority/grants/value.json']
        if (kind === 'alias') {
          mkdirSync(checkpoints.lifecycle.journal.files.path('delivery/artifacts'))
          symlinkSync(
            checkpoints.lifecycle.journal.files.path(ref),
            checkpoints.lifecycle.journal.files.path('delivery/artifacts/alias.json'),
          )
          request.inputs = ['delivery/artifacts/alias.json']
        }
        const before = checkpoints.lifecycle.journal.events()
        expect(() => checkpoints.capture(plan.run, request)).toThrow()
        expect(checkpoints.lifecycle.journal.events()).toEqual(before)
      }),
  )
})

describe('effect intent and exact read reconciliation', () => {
  async function prepared(run: Parameters<typeof fixture>[0]) {
    await fixture(run)
  }

  it('issues once, observes separately and never treats a lost response as a retryable write', () =>
    prepared(async ({ planning, plan }) => {
      const receipt = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      queue.lifecycle.authority.authorize(authorization(plan, receipt.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: 'authorization-0123456789abcdef' })
      queue.enqueue(plan.run, { unit: 'contract' })
      const effects = new DeliveryEffects(planning.sources.files.root, () => at)
      const request = {
        key: 'commit',
        operation: 'git.commit' as const,
        repository: 'app',
        ref: 'wl/contract',
        expectedHead: entry(plan.repositories, 0).base,
        inputDigest: 'b'.repeat(64),
      }
      const effect = effects.prepare(plan.run, request)
      expect(effects.prepare(plan.run, request)).toEqual(effect)
      expect(() => effects.prepare(plan.run, { ...request, inputDigest: 'c'.repeat(64) })).toThrow(
        'changed-effect-intent',
      )
      let writes = 0
      const lost = host(async () => {
        writes++
        throw new Error('A synthetic service applied the effect, then lost its response.')
      })
      const result = await effects.execute(plan.run, effect.intent.id, lost)
      expect(writes).toBe(1)
      expect(result.status).toBe('unknown')
      expect(result.observations[0]).toMatchObject({
        reason: 'lost-response',
        provenance: 'controller-observed',
      })
      const recovered = new DeliveryEffects(planning.sources.files.root, () => at)
      const observed = await recovered.reconcile(plan.run, effect.intent.id, host())
      expect(observed.status).toBe('applied')
      expect(observed.observations).toHaveLength(2)
      await expect(recovered.execute(plan.run, effect.intent.id, lost)).rejects.toThrow(
        'effect-already-issued',
      )
      expect(writes).toBe(1)
      expect(queue.lifecycle.journal.get(plan.run).state).toBe('waiting-external')
    }))

  it('retains pending ownership while another controller sees absence during invocation', () =>
    prepared(async ({ planning, plan }) => {
      const receipt = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      queue.lifecycle.authority.authorize(authorization(plan, receipt.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: 'authorization-0123456789abcdef' })
      queue.enqueue(plan.run, { unit: 'contract' })
      const effects = new DeliveryEffects(planning.sources.files.root, () => at)
      const effect = effects.prepare(plan.run, {
        key: 'report',
        operation: 'report.write',
        ref: 'artifacts/report.md',
        inputDigest: 'b'.repeat(64),
      })
      let release: () => void = () => {}
      const waiting = new Promise<void>((resolve) => {
        release = resolve
      })
      const execution = effects.execute(
        plan.run,
        effect.intent.id,
        host(async () => waiting),
      )
      const recovered = new DeliveryEffects(planning.sources.files.root, () => at)
      const absent = await recovered.reconcile(plan.run, effect.intent.id, {
        observe: async (intent) => ({
          available: true,
          value: { ...observation(intent, 'not-applied'), invocationState: 'unknown' },
        }),
      })
      expect(absent.status).toBe('unknown')
      expect(() =>
        recovered.prepare(plan.run, {
          key: 'another-report',
          operation: 'report.write',
          ref: 'artifacts/report.md',
          inputDigest: 'c'.repeat(64),
        }),
      ).toThrow('effect-conflict')
      await expect(recovered.execute(plan.run, effect.intent.id, host())).rejects.toThrow(
        'effect-already-issued',
      )
      release()
      expect((await execution).status).toBe('applied')
    }))

  it.each([
    'wrong-binding',
    'fixture-promotion',
    'no-resource',
    'wrong-target',
    'unavailable',
  ] as const)('preserves ambiguity for %s', (kind) =>
    prepared(async ({ planning, plan }) => {
      const receipt = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      queue.lifecycle.authority.authorize(authorization(plan, receipt.digest))
      queue.lifecycle.track({
        run: plan.run,
        revision: 1,
        grant: 'authorization-0123456789abcdef',
      })
      queue.enqueue(plan.run, { unit: 'contract' })
      const effects = new DeliveryEffects(planning.sources.files.root, () => at)
      const effect = effects.prepare(plan.run, {
        key: 'report',
        operation: 'report.write',
        ref: 'artifacts/report.md',
        inputDigest: 'b'.repeat(64),
      })
      const transport = host()
      transport.observe = async (intent) => {
        if (kind === 'unavailable') return { available: false, reason: 'denied-access' }
        const value = observation(intent)
        if (kind === 'wrong-binding') value.binding = 'c'.repeat(64)
        if (kind === 'fixture-promotion') value.provenance = 'host-observed'
        if (kind === 'no-resource') delete value.resource
        if (kind === 'wrong-target')
          value.resource = { ref: 'artifacts/another-target.md', revision: 'fixture-revision' }
        return { available: true, value }
      }
      expect((await effects.execute(plan.run, effect.intent.id, transport)).status).toBe('unknown')
      expect(effects.inspect(plan.run)[0]?.admission?.provenance).toBe('fixture')
      expect(() =>
        effects.lifecycle.transition(plan.run, {
          to: 'completed',
          reason: 'A forbidden premature completion.',
          outcome: 'code-ready',
          evidence: 'd'.repeat(64),
        }),
      ).toThrow('unreconciled-effects')
    }),
  )

  it('retains the grant effect limit across fresh controllers', () =>
    prepared(async ({ planning, plan }) => {
      const prepared = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      const request = authorization(plan, prepared.digest)
      request.effectLimit = 1
      queue.lifecycle.authority.authorize(request)
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: request.id })
      queue.enqueue(plan.run, { unit: 'contract' })
      const effects = new DeliveryEffects(planning.sources.files.root, () => at)
      const one = effects.prepare(plan.run, {
        key: 'one',
        operation: 'report.write',
        ref: 'artifacts/one.md',
        inputDigest: 'a'.repeat(64),
      })
      const two = effects.prepare(plan.run, {
        key: 'two',
        operation: 'report.write',
        ref: 'artifacts/two.md',
        inputDigest: 'a'.repeat(64),
      })
      await effects.execute(plan.run, one.intent.id, host())
      queue.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Continue after the exact observed fixture action.',
      })
      const recovered = new DeliveryEffects(planning.sources.files.root, () => at)
      await expect(recovered.execute(plan.run, two.intent.id, host())).rejects.toThrow(
        'effect-limit',
      )
      expect(recovered.get(plan.run, two.intent.id).status).toBe('prepared')
    }))

  it('bounds a lost invocation at its retained deadline without treating timeout as absence', () =>
    prepared(async ({ planning, plan }) => {
      plan.budgets.attemptMs = 1
      const prepared = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: 'authorization-0123456789abcdef' })
      queue.enqueue(plan.run, { unit: 'contract' })
      const effects = new DeliveryEffects(
        planning.sources.files.root,
        () => at,
        () => ({ wall: at, monotonicMs: 0, epoch: 'fixture-admission-clock' }),
      )
      const effect = effects.prepare(plan.run, {
        key: 'report',
        operation: 'report.write',
        ref: 'artifacts/report.md',
        inputDigest: 'a'.repeat(64),
      })
      let aborted = false
      const transport = host(async (_intent, _invocation, signal) => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        await new Promise<never>(() => {})
      })
      const result = await effects.execute(plan.run, effect.intent.id, transport)
      expect(result.status).toBe('unknown')
      expect(result.deadline).toBe('2026-10-24T10:00:00.001Z')
      expect(result.observations.at(-1)?.reason).toBe('deadline')
      expect(aborted).toBe(true)
    }))

  it('abandons only an unissued intent and never restores execution through reconciliation', () =>
    prepared(async ({ planning, plan }) => {
      const receipt = planning.preparePlan(plan)
      const queue = new DeliveryQueue(planning.sources.files.root, () => at)
      queue.lifecycle.authority.authorize(authorization(plan, receipt.digest))
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: 'authorization-0123456789abcdef' })
      queue.enqueue(plan.run, { unit: 'contract' })
      const effects = new DeliveryEffects(planning.sources.files.root, () => at)
      const one = effects.prepare(plan.run, {
        key: 'one',
        operation: 'report.write',
        ref: 'artifacts/one.md',
        inputDigest: 'b'.repeat(64),
      })
      expect(effects.abandon(plan.run, one.intent.id).status).toBe('abandoned')
      const two = effects.prepare(plan.run, {
        key: 'two',
        operation: 'report.write',
        ref: 'artifacts/two.md',
        inputDigest: 'b'.repeat(64),
      })
      await effects.execute(
        plan.run,
        two.intent.id,
        host(async () => {
          throw new Error('Lost response')
        }),
      )
      expect(() => effects.abandon(plan.run, two.intent.id)).toThrow('cannot-abandon-issued-effect')
      effects.lifecycle.authority.revoke({
        schema: 'wholeloop/delivery-revocation-request@1',
        grant: 'authorization-0123456789abcdef',
        operator: 'Fixture Operator',
        reason: 'Revoke after an ambiguous fixture action.',
      })
      expect((await effects.reconcile(plan.run, two.intent.id, host())).status).toBe('applied')
      expect(effects.lifecycle.authority.inspect('authorization-0123456789abcdef').status).toBe(
        'revoked',
      )
      expect(effects.lifecycle.journal.get(plan.run).state).toBe('waiting-external')
    }))
})

describe('finite read-only recovery retries', () => {
  it('bounds an unresponsive host and aborts its observation without authorizing a retry', async () => {
    let observed: AbortSignal | undefined
    const result = await boundedRecoveryCall((signal) => {
      observed = signal
      return new Promise<never>(() => {})
    }, 2)
    expect(result).toEqual({ available: false, reason: 'deadline' })
    expect(observed?.aborted).toBe(true)
  })
  it('uses only the three bounded transient backoffs and stops on observed success', async () => {
    let now = 0,
      calls = 0
    const waits: number[] = []
    const clock: RecoveryClock = {
      now: () => now,
      wait: async (ms) => {
        waits.push(ms)
        now += ms
      },
    }
    const result = await recoveryRead(
      async () => {
        calls++
        return calls === 4
          ? { available: true, value: 'observed' }
          : { available: false, reason: 'transient-provider' }
      },
      90000,
      clock,
    )
    expect(result).toEqual({ available: true, value: 'observed' })
    expect(waits).toEqual([5000, 15000, 45000])
    expect(calls).toBe(4)
  })
  it.each(['denied-access', 'invalid-output', 'unavailable-read'] as const)(
    'never retries %s',
    async (reason) => {
      let calls = 0
      const result = await recoveryRead(
        async () => {
          calls++
          return { available: false, reason }
        },
        90000,
        {
          now: () => 0,
          wait: async () => {
            throw new Error('No wait permitted')
          },
        },
      )
      expect(result).toEqual({ available: false, reason })
      expect(calls).toBe(1)
    },
  )
  it('refuses rollback and deadline extension instead of granting more read time', async () => {
    let now = 10,
      calls = 0
    const result = await recoveryRead(
      async () => {
        calls++
        now = 5
        return { available: false, reason: 'transient-provider' }
      },
      90000,
      { now: () => now, wait: async () => {} },
    )
    expect(result).toEqual({ available: false, reason: 'clock-invalid' })
    expect(calls).toBe(1)
    expect(
      await recoveryRead(async () => ({ available: false, reason: 'transient-provider' }), 1000, {
        now: () => 0,
        wait: async () => {},
      }),
    ).toEqual({ available: false, reason: 'deadline' })
  })
})
