import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  type BudgetPayload,
  type BudgetUsage,
  findBudget,
  reduceDeliveryBudget,
} from '../../../src/delivery/budget-events.js'
import { deliveryEvent, validateDeliveryProjection } from '../../../src/delivery/events.js'
import { DEFAULT_DELIVERY_BUDGETS } from '../../../src/delivery/plan.js'
import { replayDelivery } from '../../../src/delivery/reducer.js'

const run = 'delivery-0000000000000000',
  actor = { kind: 'controller' as const, name: 'Fixture' },
  at = '2026-11-06T00:00:00.000Z',
  basis = 'a'.repeat(64),
  target = 'attempt-0000000000000000',
  other = 'attempt-0000000000000001'
function report(index: number, mode: BudgetUsage['mode'], reservation = target): BudgetUsage {
  return {
    key: `report-${index}-${reservation === target ? 'target' : 'other'}`,
    reservation,
    meter: 'fixture',
    mode,
    tokens: index + 1,
    currency: { currency: 'USD', micros: 2 * (index + 1) },
    final: false,
    evidence: 'e'.repeat(64),
    provenance: 'host-observed',
  }
}
function fixture(count: number, mode: BudgetUsage['mode']) {
  const registration = deliveryEvent(
      run,
      actor,
      {
        schema: 'wholeloop/delivery-registration-event@1',
        basis: { kind: 'plan', digest: basis, revision: 1 },
        source: 'b'.repeat(64),
        policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
        units: [{ id: 'search', role: 'implementation', repository: 'app' }],
      },
      undefined,
      at,
    ),
    grant = deliveryEvent(
      run,
      actor,
      {
        schema: 'wholeloop/delivery-grant-event@1',
        id: 'authorization-0000000000000000',
        digest: 'd'.repeat(64),
        basis,
        status: 'active',
      },
      registration,
      at,
    ),
    state = replayDelivery([registration, grant]).get(run)
  if (!state) throw new Error('Missing fixture state')
  const start: BudgetPayload = {
      schema: 'wholeloop/delivery-budget-event@1',
      basis,
      action: 'started',
      grantDigest: 'd'.repeat(64),
      limits: DEFAULT_DELIVERY_BUDGETS,
      clock: { wall: at, monotonicMs: 0, epoch: 'fixture' },
      startedAt: at,
      deadline: new Date(Date.parse(at) + DEFAULT_DELIVERY_BUDGETS.wallTimeMs).toISOString(),
    },
    started = deliveryEvent(run, actor, start, grant, at)
  reduceDeliveryBudget(state, started, start)
  const facet = findBudget(state)
  if (!facet) throw new Error('Missing fixture budget')
  facet.reservations = [target, other].map((id) => ({
    id,
    kind: 'attempt',
    unit: 'search',
    role: 'builder',
    generation: 1,
    clock: { wall: at, monotonicMs: 0, epoch: 'fixture' },
    deadline: facet.deadline as string,
    metering: {
      hardTokens: true,
      hardCurrency: true,
      tokensMaximum: 1000000,
      currencyMaximum: { currency: 'USD', micros: 2000000 },
      meter: 'fixture',
      evidence: 'f'.repeat(64),
      provenance: 'host-observed',
    },
  }))
  for (let index = 0; index < count; index++)
    facet.usage.push(report(index, mode), report(index, mode, other))
  validateDeliveryProjection(state)
  const prepare = (usage: BudgetUsage | undefined) => {
    const payload: BudgetPayload = {
        schema: 'wholeloop/delivery-budget-event@1',
        basis,
        action: 'usage',
        ...(usage ? { usage } : {}),
      },
      event = deliveryEvent(run, actor, payload, started, at)
    return () => reduceDeliveryBudget(state, event, payload)
  }
  return {
    state,
    facet,
    previous: started,
    prepare,
    apply: (usage: BudgetUsage | undefined) => prepare(usage)(),
  }
}

describe('fresh budget usage replay without repeated subsets', () => {
  it.each([
    ['delta', 100, 'd93c894c0d678e3da2dbdf7e7dca3502817a0479bf8e0c8ac8ab2c37f506a362'],
    ['delta', 400, 'e12d95eec96bcfe51ce5b4f0ad69eb1a9070fc24b7d4d3db24e9dd9e15f34474'],
    ['cumulative', 100, '3f5b90af4e6392f5f4645a572bae00b4e4241257b5670d001a25741abec150f8'],
    ['cumulative', 400, '893b98643cae1c7e4748d76e5e083bb8a2389abe8293d0acc644e8aaadf40f54'],
  ] as const)('selects %s usage once with %i prior stream samples', (mode, count, expected) => {
    const { state, facet, prepare } = fixture(count, mode),
      append = prepare(report(count, mode))
    let reads = 0
    facet.usage = facet.usage.map(
      (entry) =>
        new Proxy(entry, {
          get(target, key, receiver) {
            if (
              ['key', 'reservation', 'meter', 'mode', 'final', 'tokens', 'currency'].includes(
                String(key),
              )
            )
              reads++
            return Reflect.get(target, key, receiver)
          },
        }),
    )
    const filter = vi.spyOn(Array.prototype, 'filter')
    let subsets: number
    try {
      append()
      subsets = filter.mock.calls.length
    } finally {
      filter.mockRestore()
    }
    const measured = reads
    const digest = createHash('sha256').update(JSON.stringify(facet)).digest('hex')
    console.info(
      'Budget usage replay:',
      JSON.stringify({
        mode,
        count,
        reads: measured,
        subsets,
        digest,
      }),
    )
    expect(subsets).toBe(0)
    expect(measured).toBeLessThanOrEqual(12 * count)
    expect(digest).toBe(expected)
    expect(facet.usage).toHaveLength(2 * count + 1)
    validateDeliveryProjection(state)
  })
  it('keeps duplicate-key refusal ahead of a damaged stream and leaves usage unchanged', () => {
    const { facet, apply } = fixture(2, 'cumulative'),
      usage = report(2, 'cumulative')
    const first = facet.usage[0],
      last = facet.usage.at(-1)
    if (!first || !last) throw new Error('Missing fixture usage')
    first.meter = 'changed'
    last.key = usage.key
    const before = structuredClone(facet)
    expect(() => apply(usage)).toThrow('budget-usage-binding')
    expect(facet).toEqual(before)
    expect(() => apply(undefined)).toThrow('budget-usage-binding')
  })
  it('retains latest-known cumulative values, delta gaps and hard-meter violations', () => {
    for (const mode of ['delta', 'cumulative'] as const) {
      const { facet, apply } = fixture(2, mode),
        reservation = facet.reservations[0]
      if (!reservation?.metering) throw new Error('Missing fixture metering')
      reservation.metering.tokensMaximum = 2
      const gap = report(2, mode)
      delete gap.tokens
      delete gap.currency
      apply(gap)
      expect(facet.meterViolation).toBe(mode === 'delta')
      const next = report(3, mode)
      apply(next)
      expect(facet.meterViolation).toBe(true)
    }
  })
  it('retains stream finality/mode/meter, provenance, regression and currency guards', () => {
    for (const kind of ['final', 'mode', 'meter', 'provenance', 'tokens', 'currency'] as const) {
      const { facet, apply } = fixture(2, 'cumulative'),
        usage = report(2, 'cumulative'),
        prior = facet.usage[0],
        reservation = facet.reservations[0]
      if (!prior || !reservation?.metering) throw new Error('Missing fixture history')
      if (kind === 'final') prior.final = true
      if (kind === 'mode') usage.mode = 'delta'
      if (kind === 'meter') usage.meter = 'changed'
      if (kind === 'provenance') reservation.metering.provenance = 'fixture'
      if (kind === 'tokens') usage.tokens = 0
      if (kind === 'currency') usage.currency = { currency: 'EUR', micros: 1 }
      const before = structuredClone(facet)
      expect(() => apply(usage)).toThrow(
        ['tokens', 'currency'].includes(kind) ? 'budget-usage-regression' : 'budget-usage-stream',
      )
      expect(facet).toEqual(before)
    }
  })
})
