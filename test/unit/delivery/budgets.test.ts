import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type {
  BudgetClock,
  BudgetMetering,
  BudgetRequirements,
} from '../../../src/delivery/budget-events.js'
import { DeliveryBudgets } from '../../../src/delivery/budgets.js'
import { DeliveryEffects, type EffectHost } from '../../../src/delivery/effects.js'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { DeliveryQueue, type QueueAssignment } from '../../../src/delivery/queue.js'
import { DeliveryRecovery } from '../../../src/delivery/recovery.js'
import { authorization, entry, envelope, fixture, git } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
const owner = 'controller-0123456789abcdef0123456789abcdef'
const runtime = { backend: 'fixture', instance: 'fixture-instance', worker: 'fixture-worker' }
const provenance = { provenance: 'fixture' as const, evidence: 'a'.repeat(64) }
function clocks() {
  const time = { wall: 0, monotonic: 0, epoch: 'fixture-host-clock' }
  const clock = (): BudgetClock => ({
    wall: new Date(Date.parse(at) + time.wall).toISOString(),
    monotonicMs: time.monotonic,
    epoch: time.epoch,
  })
  return { time, clock, now: () => clock().wall }
}
function register(queue: DeliveryQueue, plan: DeliveryPlan) {
  const prepared = queue.lifecycle.authority.planning.preparePlan(plan)
  const grant = queue.lifecycle.authority.authorize(authorization(plan, prepared.digest))
  queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
  return { prepared, grant }
}
function claim(queue: DeliveryQueue, metering?: BudgetMetering): QueueAssignment {
  const receipt = queue.claim(owner, () => ({
    ready: true,
    ...provenance,
    ...(metering ? { metering } : {}),
  }))
  if (!receipt.assignment) throw new Error(JSON.stringify(receipt.deferred))
  return receipt.assignment
}
function constraints(budgets: DeliveryBudgets, run: string, requirements: BudgetRequirements) {
  const state = budgets.lifecycle.journal.get(run)
  budgets.configure({
    schema: 'wholeloop/delivery-budget-constraints@1',
    operator: 'Fixture Operator',
    run,
    basis: state.basis.digest,
    grantDigest: state.grant?.digest,
    requirements,
  })
}
const tokens = (maximum: number): BudgetMetering => ({
  hardTokens: true,
  hardCurrency: false,
  tokensMaximum: maximum,
  meter: 'fixture-meter',
  ...provenance,
})

describe('persistent delivery budgets', () => {
  it('keeps historical unmetered work unknown and refuses retroactive hard constraints', () =>
    fixture(({ planning, plan }) => {
      const { clock, now, time } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock),
        budgets = new DeliveryBudgets(store, now, clock)
      register(queue, plan)
      const legacy = {
        schema: 'wholeloop/delivery-attempt-event@1' as const,
        basis: queue.lifecycle.journal.get(plan.run).basis.digest,
        id: 'attempt-aaaaaaaaaaaaaaaa',
        unit: 'contract',
        role: 'builder' as const,
        generation: 1,
      }
      queue.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Retain historical admission without usage observations.',
      })
      queue.lifecycle.append(plan.run, { ...legacy, action: 'claimed' })
      expect(() =>
        constraints(budgets, plan.run, { tokens: { limit: 100, mode: 'hard' } }),
      ).toThrow('budget-already-started')
      queue.lifecycle.append(plan.run, {
        ...legacy,
        action: 'stopped',
        evidence: provenance.evidence,
      })
      queue.lifecycle.append(plan.run, {
        ...legacy,
        action: 'fenced',
        evidence: provenance.evidence,
      })
      time.wall = time.monotonic = 500
      expect(budgets.start(plan.run).startedAt).toBe(at)
      queue.enqueue(plan.run, { unit: 'contract' })
      const current = claim(queue)
      expect(
        budgets.usage(plan.run, {
          key: 'new-known',
          reservation: current.attempt,
          meter: 'fixture-meter',
          mode: 'cumulative',
          tokens: 10,
          final: true,
          ...provenance,
        }).usage,
      ).toMatchObject({
        tokens: { value: 10, completeness: 'partial' },
        unmeteredInvocations: 1,
      })
    }))

  it.each([
    ['2026-10-24T10:00:00.050Z', '2026-10-24T10:00:00.050Z'],
    ['2026-10-24T10:00:00.900Z', '2026-10-24T10:00:00.100Z'],
    [undefined, '2026-10-24T10:00:00.100Z'],
  ])('caps a child reservation at the earlier parent or attempt bound: %s', (deadline, expected) =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      plan.budgets.wallTimeMs = 1000
      plan.budgets.attemptMs = 100
      const queue = new DeliveryQueue(store, now, undefined, clock)
      register(queue, plan)
      const entry = queue.enqueue(plan.run, { unit: 'contract' })
      const result = queue.claim(owner, () => ({ ready: true, ...provenance }), {
        run: plan.run,
        queue: entry.id,
        ...(deadline ? { deadline } : {}),
      })
      expect(result.assignment).not.toBeNull()
      const budget = new DeliveryBudgets(store, now, clock).inspect(plan.run)
      expect(budget.reservations).toHaveLength(1)
      expect(budget.reservations[0]?.deadline).toBe(expected)
      expect(budget.deadline).toBe('2026-10-24T10:00:01.000Z')
    }),
  )

  it.each([
    ['invalid', 'invalid-parent-deadline'],
    ['2026-10-24T10:00:01Z', 'invalid-parent-deadline'],
    ['2026-10-24T09:59:59.999Z', 'parent-deadline'],
    ['2026-10-24T10:00:00.000Z', 'parent-deadline'],
  ])('refuses invalid or expired parent bounds without reserving: %s', (deadline, reason) =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock)
      register(queue, plan)
      const entry = queue.enqueue(plan.run, { unit: 'contract' })
      expect(
        queue.claim(owner, () => ({ ready: true, ...provenance }), {
          run: plan.run,
          queue: entry.id,
          deadline,
        }),
      ).toMatchObject({ assignment: null, deferred: [{ reason }] })
      expect(new DeliveryBudgets(store, now, clock).inspect(plan.run).reservations).toEqual([])
      expect(queue.inspect(plan.run)[0]).toMatchObject({ status: 'pending' })
      expect(queue.inspect(plan.run)[0]).not.toHaveProperty('attempt')
    }),
  )

  it('uses stricter derived-plan budgets under an initial-envelope grant', () =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const initial = planning.prepareEnvelope(envelope(plan))
      const queue = new DeliveryQueue(store, now, undefined, clock)
      const request = authorization(plan, 'a'.repeat(64))
      request.basis = { kind: 'envelope', digest: initial.digest }
      const grant = queue.lifecycle.authority.authorize(request)
      plan.envelope = initial.digest
      plan.budgets.wallTimeMs = 1000
      plan.budgets.attemptMs = 100
      planning.preparePlan(plan)
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      expect(new DeliveryBudgets(store, now, clock).start(plan.run)).toMatchObject({
        limits: { wallTimeMs: 1000 },
        deadline: '2026-10-24T10:00:01.000Z',
      })
    }))

  it('binds hard currency reservations to the configured currency and finite maximum', () =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock),
        budgets = new DeliveryBudgets(store, now, clock)
      register(queue, plan)
      constraints(budgets, plan.run, { currency: { currency: 'EUR', micros: 100, mode: 'hard' } })
      queue.enqueue(plan.run, { unit: 'contract' })
      queue.enqueue(plan.run, { unit: 'contract', role: 'reviewer', cell: 'independent' })
      const meter = {
        ...tokens(0),
        hardTokens: false,
        hardCurrency: true,
        currencyMaximum: { currency: 'USD', micros: 60 },
      }
      expect(
        queue.claim(owner, () => ({ ready: true, ...provenance, metering: meter })),
      ).toMatchObject({
        assignment: null,
        deferred: [
          { reason: 'unsupported-hard-currency-limit' },
          { reason: 'unsupported-hard-currency-limit' },
        ],
      })
      meter.currencyMaximum.currency = 'EUR'
      claim(queue, meter)
      expect(
        queue.claim(owner, () => ({ ready: true, ...provenance, metering: meter })),
      ).toMatchObject({ assignment: null, deferred: [{ reason: 'currency-reservation-limit' }] })
      expect(budgets.inspect(plan.run).usage.currencies).toMatchObject([
        { currency: 'EUR', micros: null, completeness: 'unknown' },
      ])
    }))

  it('pins stricter revisions even when another plan and grant later increase the allowance', () =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      plan.budgets.wallTimeMs = 1000
      plan.budgets.attemptMs = 100
      const queue = new DeliveryQueue(store, now, undefined, clock)
      let previous = register(queue, plan).prepared.digest
      const budgets = new DeliveryBudgets(store, now, clock)
      budgets.start(plan.run)
      for (const [revision, limit] of [
        [2, 500],
        [3, 2000],
      ] as const) {
        const next = structuredClone(plan)
        next.revision = revision
        next.previous = previous
        next.budgets.wallTimeMs = limit
        const prepared = planning.preparePlan(next),
          request = authorization(next, prepared.digest)
        request.id = `authorization-${String(revision).repeat(16)}`
        queue.lifecycle.authority.authorize(request)
        queue.lifecycle.track({ run: plan.run, revision, grant: request.id })
        previous = prepared.digest
        expect(budgets.inspect(plan.run)).toMatchObject({
          limits: { wallTimeMs: 500 },
          deadline: '2026-10-24T10:00:00.500Z',
        })
      }
      expect(new DeliveryBudgets(store, now, clock).tick(plan.run).limits?.wallTimeMs).toBe(500)
    }))

  it('refuses recovery after elapsed time without resetting the original allowance', () =>
    fixture(async ({ planning, plan }) => {
      const { clock, now, time } = clocks(),
        store = planning.sources.files.root
      plan.budgets.wallTimeMs = 1000
      plan.budgets.attemptMs = 100
      register(new DeliveryQueue(store, now, undefined, clock), plan)
      const budgets = new DeliveryBudgets(store, now, clock)
      budgets.start(plan.run)
      time.wall = time.monotonic = 1001
      const result = await new DeliveryRecovery(store, now, clock).recover(plan.run, {
        resume: true,
      })
      expect(result).toMatchObject({ ready: false, state: { state: 'exhausted' } })
      expect(result.problems).toContain('budget-deadline')
      expect(budgets.inspect(plan.run).deadline).toBe('2026-10-24T10:00:01.000Z')
    }))

  it('records a guaranteed-meter overrun as evidence and exhausts the run', () =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock),
        budgets = new DeliveryBudgets(store, now, clock)
      register(queue, plan)
      constraints(budgets, plan.run, { tokens: { limit: 100, mode: 'hard' } })
      queue.enqueue(plan.run, { unit: 'contract' })
      const assignment = claim(queue, tokens(50))
      expect(
        budgets.usage(plan.run, {
          key: 'actual-overrun',
          reservation: assignment.attempt,
          meter: 'fixture-meter',
          mode: 'cumulative',
          tokens: 51,
          final: true,
          ...provenance,
        }),
      ).toMatchObject({
        state: 'exhausted',
        problem: 'metering-violation',
        usage: { tokens: { value: 51 } },
      })
    }))

  it('counts integration repairs once per stable observation and retains the exhaustion boundary', () =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      plan.budgets.integrationRepairs = 1
      register(new DeliveryQueue(store, now, undefined, clock), plan)
      const budgets = new DeliveryBudgets(store, now, clock)
      const repair = { key: 'repair-1', kind: 'integration-repair' as const, ...provenance }
      expect(budgets.repair(plan.run, repair).counters.integrationRepairs).toBe(1)
      expect(budgets.repair(plan.run, repair).counters.integrationRepairs).toBe(1)
      expect(budgets.repair(plan.run, { ...repair, key: 'repair-2' })).toMatchObject({
        state: 'exhausted',
        counters: { integrationRepairs: 1 },
      })
    }))

  it('keeps the original deadline and observed elapsed time across fresh controllers and read-only reports', () =>
    fixture(({ planning, plan }) => {
      plan.budgets.wallTimeMs = 1000
      plan.budgets.attemptMs = 100
      const { time, clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock)
      register(queue, plan)
      const budgets = new DeliveryBudgets(store, now, clock)
      expect(budgets.inspect(plan.run)).toMatchObject({
        started: false,
        deadline: null,
        usage: { tokens: { value: null, completeness: 'unknown' } },
      })
      budgets.start(plan.run)
      time.wall = 400
      time.monotonic = 400
      expect(budgets.tick(plan.run)).toMatchObject({
        deadline: '2026-10-24T10:00:01.000Z',
        elapsedMs: 400,
        remainingMs: 600,
      })
      time.wall = 500
      time.monotonic = 600
      const recovered = new DeliveryBudgets(store, now, clock)
      recovered.start(plan.run)
      const before = budgets.lifecycle.journal.events()
      expect(recovered.inspect(plan.run)).toMatchObject({
        deadline: '2026-10-24T10:00:01.000Z',
        elapsedMs: 600,
        remainingMs: 400,
      })
      expect(budgets.lifecycle.journal.events()).toEqual(before)
      time.wall = 1000
      time.monotonic = 1100
      expect(recovered.tick(plan.run).state).toBe('exhausted')
      expect(recovered.start(plan.run).deadline).toBe('2026-10-24T10:00:01.000Z')
    }))

  it.each(['wall', 'monotonic', 'epoch'] as const)(
    'retains a detected %s clock fault instead of granting time',
    (fault) =>
      fixture(({ planning, plan }) => {
        const { time, clock, now } = clocks(),
          store = planning.sources.files.root
        const queue = new DeliveryQueue(store, now, undefined, clock)
        register(queue, plan)
        const budgets = new DeliveryBudgets(store, now, clock)
        budgets.start(plan.run)
        time.wall = 500
        time.monotonic = 500
        budgets.tick(plan.run)
        if (fault === 'wall') time.wall = 100
        if (fault === 'monotonic') time.monotonic = 100
        if (fault === 'epoch') time.epoch = 'another-execution-host'
        expect(budgets.tick(plan.run)).toMatchObject({ state: 'paused', problem: 'clock-invalid' })
        time.wall = 1000
        time.monotonic = 1000
        time.epoch = 'fixture-host-clock'
        expect(new DeliveryBudgets(store, now, clock).tick(plan.run)).toMatchObject({
          state: 'paused',
          problem: 'clock-invalid',
        })
      }),
  )

  it('expires current worker messages and bounds restarts without releasing an unobserved attempt', () =>
    fixture(({ planning, plan }) => {
      plan.budgets.wallTimeMs = 1000
      plan.budgets.attemptMs = 100
      plan.budgets.restarts = 1
      const { time, clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock)
      register(queue, plan)
      queue.enqueue(plan.run, { unit: 'contract' })
      const first = claim(queue)
      queue.start(first, runtime)
      const scope = {
        grant: first.grant,
        run: first.run,
        revision: first.revision,
        plan: first.plan,
        unit: first.unit,
        attempt: first.attempt,
        generation: first.generation,
        role: first.role,
        runtime: runtime.instance,
        criteria: [],
        contracts: [],
        findings: [],
      }
      expect(queue.current(scope)).toBe(true)
      time.wall = 100
      time.monotonic = 100
      expect(queue.current(scope)).toBe(false)
      expect(() => queue.finish(first, 'completed', 'b'.repeat(64))).toThrow(
        'expired-attempt-budget',
      )
      expect(queue.claim(owner, () => ({ ready: true, ...provenance })).assignment).toBeNull()
      queue.finish(first, 'stopped', 'b'.repeat(64))
      queue.fence(first)
      queue.requeue(first, 'c'.repeat(64))
      const second = claim(new DeliveryQueue(store, now, undefined, clock))
      expect(second.generation).toBe(2)
      queue.finish(second, 'stopped', 'b'.repeat(64))
      queue.fence(second)
      queue.requeue(second, 'c'.repeat(64))
      expect(queue.claim(owner, () => ({ ready: true, ...provenance }))).toMatchObject({
        assignment: null,
        deferred: [{ reason: 'restart-limit' }],
      })
    }))

  it.each([
    {
      requirements: { tokens: { limit: 100, mode: 'hard' as const } },
      reason: 'unsupported-hard-token-limit',
    },
    {
      requirements: { currency: { currency: 'USD', micros: 100, mode: 'hard' as const } },
      reason: 'unsupported-hard-currency-limit',
    },
  ])('refuses $reason and never reports unknown spend as zero', ({ requirements, reason }) =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock),
        budgets = new DeliveryBudgets(store, now, clock)
      register(queue, plan)
      constraints(budgets, plan.run, requirements)
      queue.enqueue(plan.run, { unit: 'contract' })
      expect(queue.claim(owner, () => ({ ready: true, ...provenance }))).toMatchObject({
        assignment: null,
        deferred: [{ reason }],
      })
      expect(budgets.inspect(plan.run).started).toBe(false)
      expect(budgets.inspect(plan.run).usage.tokens.value).toBeNull()
      if (requirements.currency)
        expect(budgets.inspect(plan.run).usage.currencies[0]?.micros).toBeNull()
    }),
  )

  it('charges hard upper-bound reservations for the run lifetime and keeps fixture provenance', () =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock),
        budgets = new DeliveryBudgets(store, now, clock)
      register(queue, plan)
      constraints(budgets, plan.run, { tokens: { limit: 100, mode: 'hard' } })
      queue.enqueue(plan.run, { unit: 'contract' })
      queue.enqueue(plan.run, { unit: 'contract', role: 'reviewer', cell: 'independent' })
      const first = claim(queue, tokens(70))
      queue.start(first, runtime)
      budgets.usage(plan.run, {
        key: 'reported',
        reservation: first.attempt,
        meter: 'fixture-meter',
        mode: 'cumulative',
        tokens: 30,
        final: true,
        ...provenance,
      })
      expect(
        queue.claim(owner, () => ({ ready: true, ...provenance, metering: tokens(40) })),
      ).toMatchObject({ assignment: null, deferred: [{ reason: 'token-reservation-limit' }] })
      const second = claim(queue, tokens(30))
      expect(second.role).toBe('reviewer')
      expect(
        budgets
          .inspect(plan.run)
          .reservations.reduce(
            (sum, reservation) => sum + (reservation.metering?.tokensMaximum ?? 0),
            0,
          ),
      ).toBe(100)
      expect(
        budgets
          .inspect(plan.run)
          .reservations.every((reservation) => reservation.metering?.provenance === 'fixture'),
      ).toBe(true)
    }))

  it('allows advisory caps with unknown metering while retaining the requirement explicitly', () =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock),
        budgets = new DeliveryBudgets(store, now, clock)
      register(queue, plan)
      constraints(budgets, plan.run, { tokens: { limit: 1, mode: 'advisory' } })
      queue.enqueue(plan.run, { unit: 'contract' })
      claim(queue)
      expect(budgets.inspect(plan.run)).toMatchObject({
        requirements: { tokens: { limit: 1, mode: 'advisory' } },
        usage: { tokens: { value: null, completeness: 'unknown' } },
      })
      expect(() =>
        constraints(budgets, plan.run, { tokens: { limit: 10, mode: 'advisory' } }),
      ).toThrow('budget-constraints-conflict')
    }))

  it.each(['cumulative', 'delta'] as const)(
    'deduplicates %s native reports and preserves honest usage totals',
    (mode) =>
      fixture(({ planning, plan }) => {
        const { clock, now } = clocks(),
          store = planning.sources.files.root
        const queue = new DeliveryQueue(store, now, undefined, clock),
          budgets = new DeliveryBudgets(store, now, clock)
        register(queue, plan)
        queue.enqueue(plan.run, { unit: 'contract' })
        const assignment = claim(queue)
        const first = {
          key: 'first',
          reservation: assignment.attempt,
          meter: 'fixture-meter',
          mode,
          tokens: 100,
          currency: { currency: 'USD', micros: 1000 },
          final: false,
          ...provenance,
        }
        budgets.usage(plan.run, first)
        const events = budgets.lifecycle.journal.events()
        budgets.usage(plan.run, first)
        expect(budgets.lifecycle.journal.events()).toEqual(events)
        expect(() => budgets.usage(plan.run, { ...first, tokens: 101 })).toThrow(
          'budget-observation-conflict',
        )
        budgets.usage(plan.run, {
          ...first,
          key: 'second',
          tokens: mode === 'cumulative' ? 150 : 50,
          currency: { currency: 'USD', micros: mode === 'cumulative' ? 1200 : 200 },
          final: true,
        })
        const report = new DeliveryBudgets(store, now, clock).inspect(plan.run)
        expect(report.usage).toEqual({
          unmeteredInvocations: 0,
          provenance: 'fixture',
          tokens: { value: 150, completeness: 'complete' },
          currencies: [{ currency: 'USD', micros: 1200, completeness: 'complete' }],
        })
        expect(() => budgets.usage(plan.run, { ...first, key: 'after-final' })).toThrow(
          'budget-usage-stream',
        )
      }),
  )

  it('terminates repeated identical failures, retains findings and ignores repeated artifact progress', () =>
    fixture(({ planning, plan }) => {
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock),
        budgets = new DeliveryBudgets(store, now, clock)
      register(queue, plan)
      const artifact = budgets.captureArtifact(plan.run, Buffer.from('Validated fixture artifact.'))
      budgets.progress(plan.run, {
        key: 'seed',
        kind: 'validated-artifact',
        digest: artifact.artifact.digest,
        ...provenance,
      })
      const failure = {
        key: 'one',
        role: 'builder',
        category: 'failed-behavior',
        candidate: 'b'.repeat(64),
        findings: ['review:z', 'review:a'],
        ...provenance,
      }
      budgets.failure(plan.run, failure)
      budgets.failure(plan.run, failure)
      expect(budgets.inspect(plan.run).noProgress.streak).toBe(1)
      budgets.failure(plan.run, {
        ...failure,
        key: 'two',
        findings: [...failure.findings].reverse(),
      })
      budgets.progress(plan.run, {
        key: 'same-bytes',
        kind: 'validated-artifact',
        digest: artifact.artifact.digest,
        ...provenance,
      })
      expect(budgets.inspect(plan.run).noProgress.streak).toBe(2)
      const report = budgets.failure(plan.run, { ...failure, key: 'three' })
      expect(report.state).toBe('exhausted')
      expect(report.noProgress).toMatchObject({ streak: 3, findings: ['review:a', 'review:z'] })
      expect(new DeliveryBudgets(store, now, clock).start(plan.run).state).toBe('exhausted')
    }))

  it('reserves unique artifact bytes before capture, retains omissions and never writes recognized credentials', () =>
    fixture(({ planning, plan }) => {
      plan.budgets.artifactBytes = 5
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock),
        budgets = new DeliveryBudgets(store, now, clock)
      register(queue, plan)
      const first = budgets.captureArtifact(plan.run, Buffer.from([1, 2, 3]))
      expect(first.stored).toBe(true)
      expect(readFileSync(budgets.lifecycle.journal.files.path(first.artifact.ref))).toEqual(
        Buffer.from([1, 2, 3]),
      )
      const events = budgets.lifecycle.journal.events()
      expect(budgets.captureArtifact(plan.run, Buffer.from([1, 2, 3]))).toEqual(first)
      expect(budgets.lifecycle.journal.events()).toEqual(events)
      const omitted = budgets.captureArtifact(plan.run, Buffer.from([4, 5, 6]))
      expect(omitted).toMatchObject({ stored: false, reason: 'artifact-byte-limit' })
      expect(existsSync(budgets.lifecycle.journal.files.path(omitted.artifact.ref))).toBe(false)
      const marker = `ghp_${'a'.repeat(36)}`
      const secret = budgets.captureArtifact(
        plan.run,
        Buffer.concat([Buffer.from([255, 0]), Buffer.from(marker)]),
      )
      expect(secret).toMatchObject({ stored: false, reason: 'credential-bearing' })
      expect(existsSync(budgets.lifecycle.journal.files.path(secret.artifact.ref))).toBe(false)
      const report = budgets.inspect(plan.run)
      expect(report.counters.artifactBytes).toBe(3)
      expect(report.omissions).toHaveLength(2)
      expect(JSON.stringify(report)).not.toContain(marker)
    }))

  it('retains CI pushes across controller and plan revisions without an implicit allowance extension', () =>
    fixture(async ({ planning, plan, root }) => {
      git(root, ['remote', 'add', 'origin', 'https://github.com/example/tasks.git'])
      entry(plan.repositories, 0).remote = {
        name: 'origin',
        url: 'https://github.com/example/tasks',
      }
      plan.policy.endpoint = 'to-pr'
      plan.budgets.ciPushes = 1
      const { clock, now } = clocks(),
        store = planning.sources.files.root
      const queue = new DeliveryQueue(store, now, undefined, clock)
      const prepared = planning.preparePlan(plan),
        request = authorization(plan, prepared.digest)
      request.effects.push('git.push')
      queue.lifecycle.authority.authorize(request)
      queue.lifecycle.track({ run: plan.run, revision: 1, grant: request.id })
      queue.enqueue(plan.run, { unit: 'contract' })
      const effects = new DeliveryEffects(store, now, clock)
      const host: EffectHost = {
        eligible: () => ({ allowed: true, ...provenance }),
        invoke: async () => {},
        observe: async (intent) => ({
          available: true,
          value: {
            binding: contractDigest(intent),
            status: 'applied',
            invocationState: 'stopped',
            reason: 'observed',
            ...provenance,
            resource: { ref: intent.ref, revision: entry(plan.repositories, 0).base },
          },
        }),
      }
      const input = {
        key: 'first',
        operation: 'git.push' as const,
        repository: 'app',
        ref: 'wl/contract',
        expectedHead: entry(plan.repositories, 0).base,
        inputDigest: 'b'.repeat(64),
      }
      const one = effects.prepare(plan.run, input)
      await effects.execute(plan.run, one.intent.id, host)
      queue.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'Continue after the scoped fixture observation.',
      })
      const revised = structuredClone(plan)
      revised.revision = 2
      revised.previous = prepared.digest
      revised.budgets.ciPushes = 2
      const next = planning.preparePlan(revised),
        nextRequest = authorization(revised, next.digest)
      nextRequest.id = 'authorization-aaaaaaaaaaaaaaaa'
      nextRequest.effects.push('git.push')
      queue.lifecycle.authority.authorize(nextRequest)
      queue.lifecycle.track({ run: plan.run, revision: 2, grant: nextRequest.id })
      queue.lifecycle.transition(plan.run, {
        to: 'queued',
        reason: 'An explicit revised plan still retains run counters.',
      })
      const two = effects.prepare(plan.run, { ...input, key: 'second' })
      await expect(effects.execute(plan.run, two.intent.id, host)).rejects.toThrow('ci-push-limit')
      expect(new DeliveryBudgets(store, now, clock).inspect(plan.run).counters.ciPushes).toBe(1)
    }))
})
