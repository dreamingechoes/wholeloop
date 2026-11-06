import { describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { sourceHash, validateSourceMapping } from '../../../src/delivery/input.js'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { validateDeliveryPlan } from '../../../src/delivery/plan.js'
import type { SourceSnapshot } from '../../../src/delivery/source.js'
import { fixture } from '../../support/delivery.js'

// Variants are pure validator inputs, never prepared plans or authority receipts.
function bindSource(plan: DeliveryPlan, source: SourceSnapshot) {
  validateSourceMapping(source.body, source.mapping)
  const { id: _id, fetchedAt: _fetchedAt, ...binding } = source
  source.id = contractDigest(binding)
  plan.source = source.id
}
function mapped(count: number, originalPlan: DeliveryPlan, originalSource: SourceSnapshot) {
  const plan = structuredClone(originalPlan),
    source = structuredClone(originalSource),
    lines = Array.from(
      { length: count },
      (_, index) =>
        `Find tasks by title ${index}. ${'Fixture context. '.repeat(100)}Return the matching task IDs.`,
    ),
    ids = lines.map((_, index) => `criterion-${index}`),
    first = originalPlan.criteria[0],
    milestone = plan.milestones[0]
  if (!first || !milestone) throw new Error('Missing validator fixture structure')
  source.body = lines.join('\n')
  source.sha256 = sourceHash(source.body)
  source.revision = source.sha256
  source.scope = '/fixture/app'
  source.mapping = ids.map((id, index) => ({
    id,
    role: 'criterion',
    startLine: index + 1,
    endLine: index + 1,
  }))
  bindSource(plan, source)
  plan.criteria = lines.map((text, index) => ({ ...first, id: ids[index] ?? '', text }))
  plan.repositories = [
    { id: 'app', root: '/fixture/app', target: 'refs/heads/main', base: 'a'.repeat(40) },
  ]
  plan.work = [
    {
      id: 'implementation',
      repository: 'app',
      role: 'implementation',
      criteria: ids,
      after: [],
      consumes: [],
      produces: [],
    },
  ]
  plan.milestones = [
    { ...milestone, work: plan.work.map((unit) => unit.id), criteria: ids, after: [] },
  ]
  return { plan, source }
}

describe('current-call source criterion mapping', () => {
  it.each([100, 400])('splits the complete source once for %i mapped criteria', (count) =>
    fixture(({ plan: base, source: input }) => {
      const { plan, source } = mapped(count, base, input),
        before = structuredClone([plan, source]),
        split = vi.spyOn(String.prototype, 'split'),
        visits = new WeakMap<object, number>(),
        originalSome = Array.prototype.some,
        search = vi.spyOn(Array.prototype, 'some').mockImplementation(function (
          this: unknown[],
          predicate,
          thisArg,
        ) {
          return Reflect.apply(originalSome, this, [
            (value: unknown, index: number, values: unknown[]) => {
              visits.set(this, (visits.get(this) ?? 0) + 1)
              return Reflect.apply(predicate, thisArg, [value, index, values])
            },
          ])
        })
      let calls: number, selections: number, result: DeliveryPlan
      try {
        result = validateDeliveryPlan(plan, source)
        calls = split.mock.calls.filter((args, index) => {
          const separator: unknown = args[0]
          return separator === '\n' && String(split.mock.contexts[index]) === source.body
        }).length
        selections = visits.get(result.criteria) ?? 0
      } finally {
        split.mockRestore()
        search.mockRestore()
      }
      console.info(
        'Source mapping splits:',
        JSON.stringify({
          count,
          calls,
          selections,
          requestedUnits: calls * source.body.length,
          digest: contractDigest(result),
        }),
      )
      expect(calls).toBe(1)
      expect(selections).toBeLessThanOrEqual(count * 2)
      expect(contractDigest(result)).toBe(
        count === 100
          ? '62b3fcc5a0ca25dce44a3210c9925c4423f8e9cd242db1caa75960888e73dc4e'
          : '1ddbdba68e7b95a5c41370faf06d9c5b99dacd34d5c6e0c5cca91860fb56db12',
      )
      expect(result).toEqual(plan)
      expect([plan, source]).toEqual(before)
    }),
  )
  it('keeps exact line ranges, source order and refusal priority', () =>
    fixture(({ plan: base, source: input }) => {
      const { plan, source } = mapped(2, base, input),
        first = source.mapping[0],
        criterion = plan.criteria[0],
        second = plan.criteria[1]
      if (!first || !criterion || !second) throw new Error('Missing mapped criteria')
      source.mapping = [first]
      first.endLine = 2
      bindSource(plan, source)
      expect(() => validateDeliveryPlan(plan, source)).toThrow('changed-source-criterion')
      criterion.text = source.body
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
      second.id = criterion.id
      expect(() => validateDeliveryPlan(plan, source)).toThrow('invalid-criteria')
    }))
  it.each([0, 1, 2])(
    'indexes only required criteria for %i mappings among 400 declarations',
    (count) =>
      fixture(({ plan: base, source: input }) => {
        const { plan, source } = mapped(400, base, input),
          original = Map.prototype.set
        source.mapping = source.mapping.slice(0, count)
        bindSource(plan, source)
        let bindings = 0,
          result: DeliveryPlan
        Map.prototype.set = function <K, V>(this: Map<K, V>, key: K, value: V): Map<K, V> {
          if (
            typeof key === 'string' &&
            key.startsWith('criterion-') &&
            typeof value === 'object' &&
            value !== null &&
            'text' in value
          )
            bindings++
          return original.call(this, key, value)
        }
        try {
          result = validateDeliveryPlan(plan, source)
        } finally {
          Map.prototype.set = original
        }
        expect(result).toEqual(plan)
        expect(bindings).toBe(count > 1 ? count : 0)
      }),
  )
  it('accepts mapping order independent of the declaration order and refreshes the next call', () =>
    fixture(({ plan: base, source: input }) => {
      const { plan, source } = mapped(8, base, input)
      plan.criteria.reverse()
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
      const first = source.mapping[0],
        work = plan.work[0]
      if (!first || !work) throw new Error('Missing mapping freshness fixture')
      first.id = 'missing'
      bindSource(plan, source)
      work.after = ['absent']
      expect(() => validateDeliveryPlan(plan, source)).toThrow('changed-source-criterion')
    }))
})
