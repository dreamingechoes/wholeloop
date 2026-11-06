import { describe, expect, it } from 'vitest'
import {
  type BudgetFacet,
  type BudgetUsage,
  budgetFacetSchema,
  emptyBudget,
} from '../../../src/delivery/budget-events.js'
import { budgetUsage } from '../../../src/delivery/budget-policy.js'
import { validateDeliveryShape } from '../../../src/delivery/plan.js'

function first<T>(values: T[]): T {
  const value = values[0]
  if (value === undefined) throw new Error('Missing fixture entry')
  return value
}

function fixture(count: number): BudgetFacet {
  const facet = emptyBudget()
  for (let index = 0; index < count; index++) {
    const id = `attempt-${index.toString(16).padStart(16, '0')}`
    facet.reservations.push({
      id,
      kind: 'attempt',
      deadline: '2026-11-06T01:00:00.000Z',
      clock: { wall: '2026-11-06T00:00:00.000Z', monotonicMs: 0, epoch: 'fixture' },
    })
    facet.usage.push({
      key: `report-${index}`,
      reservation: id,
      meter: 'fixture',
      mode: 'delta',
      tokens: index + 1,
      currency: { currency: 'USD', micros: 2 * (index + 1) },
      final: true,
      evidence: 'a'.repeat(64),
      provenance: 'host-observed',
    })
  }
  return facet
}

describe('fresh budget usage selection', () => {
  it.each([100, 400])(
    'does not rescan %i distinct currencies across unrelated streams',
    (count) => {
      const facet = fixture(count)
      let currencyReads = 0
      const codes = facet.usage.map((_, index) =>
        String.fromCharCode(
          65 + Math.floor(index / 676),
          65 + (Math.floor(index / 26) % 26),
          65 + (index % 26),
        ),
      )
      facet.usage = facet.usage.map(
        (entry, index) =>
          new Proxy(
            {
              ...entry,
              currency: { currency: codes[index] as string, micros: index + 1 },
            },
            {
              get(target, key, receiver) {
                if (key === 'currency') currencyReads++
                return Reflect.get(target, key, receiver)
              },
            },
          ),
      )
      validateDeliveryShape(facet, budgetFacetSchema)
      currencyReads = 0
      expect(budgetUsage(facet).currencies).toEqual(
        codes.map((currency, index) => ({
          currency,
          micros: index + 1,
          completeness: 'partial',
        })),
      )
      expect(currencyReads).toBeLessThanOrEqual(12 * count)
    },
  )
  it.each([100, 400])('groups %i receipts without a reservation cross product', (count) => {
    const facet = fixture(count)
    validateDeliveryShape(facet, budgetFacetSchema)
    let keys = 0
    facet.reservations = facet.reservations.map(
      (entry) =>
        new Proxy(entry, {
          get(target, key, receiver) {
            if (key === 'id') keys++
            return Reflect.get(target, key, receiver)
          },
        }),
    )
    facet.usage = facet.usage.map(
      (entry) =>
        new Proxy(entry, {
          get(target, key, receiver) {
            if (key === 'reservation') keys++
            return Reflect.get(target, key, receiver)
          },
        }),
    )
    expect(budgetUsage(facet)).toEqual({
      tokens: { value: (count * (count + 1)) / 2, completeness: 'complete' },
      currencies: [{ currency: 'USD', micros: count * (count + 1), completeness: 'complete' }],
      unmeteredInvocations: 0,
      provenance: 'host-observed',
    })
    expect(keys).toBe(2 * count)
  })

  it('preserves delta gaps, cumulative latest-known values and missing final values', () => {
    const facet = fixture(2)
    const [delta, cumulative] = facet.usage as [BudgetUsage, BudgetUsage]
    const gap = { ...delta, key: 'gap', final: false }
    delete gap.tokens
    delete gap.currency
    facet.usage = [
      { ...delta, final: false, tokens: 3 },
      { ...cumulative, mode: 'cumulative', tokens: 20, final: false },
      gap,
      { ...cumulative, key: 'latest', mode: 'cumulative', tokens: 25, final: true },
      { ...delta, key: 'delta-final', tokens: 7, final: true },
    ]
    expect(budgetUsage(facet).tokens).toEqual({ value: 35, completeness: 'partial' })
    const unknownFinal = { ...cumulative, key: 'unknown-final', mode: 'cumulative' as const }
    delete unknownFinal.tokens
    facet.usage.push(unknownFinal)
    validateDeliveryShape(facet, budgetFacetSchema)
    expect(budgetUsage(facet).tokens).toEqual({ value: 35, completeness: 'partial' })
    expect(budgetUsage(fixture(1), 1).tokens.completeness).toBe('partial')
  })

  it('retains unknown-reservation currency inventory and provenance without counting its usage', () => {
    const facet = fixture(1)
    facet.requirements.currency = { currency: 'AAA', micros: 100, mode: 'advisory' }
    facet.usage.push({
      ...first(facet.usage),
      key: 'orphan',
      reservation: 'attempt-ffffffffffffffff',
      tokens: Number.MAX_SAFE_INTEGER,
      currency: { currency: 'EUR', micros: 50 },
      provenance: 'fixture',
    })
    expect(budgetUsage(facet)).toEqual({
      tokens: { value: 1, completeness: 'complete' },
      currencies: [
        { currency: 'EUR', micros: null, completeness: 'unknown' },
        { currency: 'USD', micros: 2, completeness: 'complete' },
        { currency: 'AAA', micros: null, completeness: 'unknown' },
      ],
      unmeteredInvocations: 0,
      provenance: 'fixture',
    })
    facet.reservations = []
    expect(budgetUsage(facet).tokens).toEqual({ value: null, completeness: 'unknown' })
    expect(budgetUsage(emptyBudget())).toEqual({
      tokens: { value: null, completeness: 'unknown' },
      currencies: [],
      unmeteredInvocations: 0,
      provenance: 'unknown',
    })
  })

  it('preserves duplicate reservation entries and refreshes on the next invocation', () => {
    const facet = fixture(1)
    facet.reservations.push({ ...first(facet.reservations) })
    expect(budgetUsage(facet).tokens.value).toBe(2)
    first(facet.usage).tokens = 4
    expect(budgetUsage(facet).tokens.value).toBe(8)
  })

  it.each(['tokens', 'currency'] as const)(
    'refuses unsafe %s sums within and across streams',
    (field) => {
      for (const count of [1, 2]) {
        const facet = fixture(count)
        const receipt = first(facet.usage)
        if (field === 'tokens') receipt.tokens = Number.MAX_SAFE_INTEGER
        else receipt.currency = { currency: 'USD', micros: Number.MAX_SAFE_INTEGER }
        if (count === 1) facet.usage.push({ ...receipt, key: 'overflow' })
        expect(() => budgetUsage(facet)).toThrow('Observed usage exceeds safe integer accounting')
      }
      const facet = fixture(1)
      first(facet.usage).mode = 'cumulative'
      first(facet.usage).tokens = Number.MAX_SAFE_INTEGER
      first(facet.usage).currency = { currency: 'USD', micros: Number.MAX_SAFE_INTEGER }
      facet.usage.push({ ...first(facet.usage), key: 'latest' })
      expect(budgetUsage(facet).tokens.value).toBe(Number.MAX_SAFE_INTEGER)
      expect(budgetUsage(facet).currencies[0]?.micros).toBe(Number.MAX_SAFE_INTEGER)
    },
  )
})
