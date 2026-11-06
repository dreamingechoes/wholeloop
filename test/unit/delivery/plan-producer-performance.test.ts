import { describe, expect, it, vi } from 'vitest'
import { type DeliveryPlan, validateDeliveryPlan } from '../../../src/delivery/plan.js'
import { fixture } from '../../support/delivery.js'

function contracts(plan: DeliveryPlan, count: number) {
  const milestone = plan.milestones[0]
  if (!milestone) throw new Error('Missing contract milestone')
  plan.work = Array.from({ length: count }, (_, index) => ({
    id: `unit-${index}`,
    repository: 'app',
    role: index === count - 1 ? 'implementation' : 'contract',
    criteria: index === count - 1 ? plan.criteria.map((criterion) => criterion.id) : [],
    after: index === count - 1 ? Array.from({ length: count - 1 }, (_, dep) => `unit-${dep}`) : [],
    consumes:
      index === count - 1 ? Array.from({ length: count - 1 }, (_, dep) => `api-${dep}`) : [],
    produces:
      index === count - 1
        ? []
        : [
            {
              id: `api-${index}`,
              revision: 'v1',
              sha256: 'b'.repeat(64),
              description: 'Fixture contract.',
            },
          ],
  }))
  milestone.work = plan.work.map((unit) => unit.id)
  const consumer = plan.work.at(-1)
  if (!consumer) throw new Error('Missing contract consumer')
  return consumer
}

describe('current-call contract producer selection', () => {
  it.each([25, 99])('avoids repeated work searches across %i units', (count) =>
    fixture(({ plan, source }) => {
      contracts(plan, count)
      const original = Array.prototype.find,
        visits = new WeakMap<object, number>(),
        search = vi.spyOn(Array.prototype, 'find').mockImplementation(function (
          this: unknown[],
          predicate,
          thisArg,
        ) {
          return Reflect.apply(original, this, [
            (value: unknown, index: number, values: unknown[]) => {
              visits.set(this, (visits.get(this) ?? 0) + 1)
              return Reflect.apply(predicate, thisArg, [value, index, values])
            },
          ])
        })
      let result: DeliveryPlan
      try {
        result = validateDeliveryPlan(plan, source)
      } finally {
        search.mockRestore()
      }
      const selections = visits.get(result.work) ?? 0
      console.info('Contract producer selections:', JSON.stringify({ count, selections }))
      expect(selections).toBe(0)
      expect(result).toEqual(plan)
    }),
  )
  it.each([0, 1, 2])('indexes only the required prefix for %i consumed contracts', (count) =>
    fixture(({ plan, source }) => {
      const consumer = contracts(plan, 99),
        original = Map.prototype.set
      consumer.consumes = consumer.consumes.slice(0, count)
      let bindings = 0
      Map.prototype.set = function <K, V>(this: Map<K, V>, key: K, value: V): Map<K, V> {
        if (typeof key === 'string' && key.startsWith('api-') && typeof value === 'string')
          bindings++
        return original.call(this, key, value)
      }
      try {
        expect(validateDeliveryPlan(plan, source)).toEqual(plan)
      } finally {
        Map.prototype.set = original
      }
      expect(bindings).toBe(count > 1 ? count : 0)
    }),
  )
  it('retains unknown/duplicate/order refusal precedence and refreshes each call', () =>
    fixture(({ plan, source }) => {
      const consumer = contracts(plan, 4),
        first = plan.work[0],
        second = plan.work[1]
      if (!first || !second) throw new Error('Missing contract producers')
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
      consumer.after = []
      expect(() => validateDeliveryPlan(plan, source)).toThrow('contract-order')
      consumer.consumes.push('unknown')
      expect(() => validateDeliveryPlan(plan, source)).toThrow('unknown-contract')
      second.produces = structuredClone(first.produces)
      expect(() => validateDeliveryPlan(plan, source)).toThrow('duplicate-contract')
    }))
  it('stops inside a producer and reuses earlier bindings for later consumers', () =>
    fixture(({ plan, source }) => {
      const consumer = contracts(plan, 4),
        first = plan.work[0],
        later = plan.work[2],
        declaration = first?.produces[0]
      if (!first || !later || !declaration) throw new Error('Missing partial producer fixture')
      first.produces.push({ ...declaration, id: 'api-extra' }, { ...declaration, id: 'api-unused' })
      consumer.consumes = ['api-extra', 'api-0']
      const original = Map.prototype.set
      let bindings = 0
      Map.prototype.set = function <K, V>(this: Map<K, V>, key: K, value: V): Map<K, V> {
        if (typeof key === 'string' && key.startsWith('api-') && typeof value === 'string')
          bindings++
        return original.call(this, key, value)
      }
      try {
        expect(validateDeliveryPlan(plan, source)).toEqual(plan)
      } finally {
        Map.prototype.set = original
      }
      expect(bindings).toBe(2)
      later.after = [first.id]
      later.consumes = ['api-0']
      consumer.consumes = ['api-1', 'api-extra']
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
      consumer.consumes.reverse()
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
    }))
})
