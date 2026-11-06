import { describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { type DeliveryPlan, validateDeliveryPlan } from '../../../src/delivery/plan.js'
import type { SourceSnapshot } from '../../../src/delivery/source.js'
import { fixture } from '../../support/delivery.js'

// These variants exercise pure validation, never accepted plans or authority.
function linked(count: number, base: DeliveryPlan, input: SourceSnapshot) {
  const plan = structuredClone(base),
    source = structuredClone(input),
    first = plan.criteria[0],
    milestone = plan.milestones[0],
    workers = Math.min(count, 100)
  if (!first || !milestone) throw new Error('Missing plan reference fixture structure')
  source.mapping = []
  source.scope = '/fixture/app'
  const { id: _id, fetchedAt: _fetchedAt, ...binding } = source
  source.id = contractDigest(binding)
  plan.source = source.id
  plan.repositories = [
    { id: 'app', root: '/fixture/app', target: 'refs/heads/main', base: 'a'.repeat(40) },
  ]
  plan.scope.outcomes = Array.from({ length: count }, (_, index) => ({
    id: `outcome-${index}`,
    text: `Locate the requested task ${index}.`,
  }))
  plan.criteria = Array.from({ length: count }, (_, index) => ({
    ...first,
    id: `criterion-${index}`,
    text: `Find task ${index} by its title.`,
    outcomes: [`outcome-${index}`],
  }))
  plan.work = Array.from({ length: workers }, (_, index) => ({
    id: `unit-${index}`,
    repository: 'app',
    role: 'implementation',
    criteria: plan.criteria
      .filter((_, criterion) => criterion % workers === index)
      .map((c) => c.id),
    after: [],
    produces: [],
    consumes: [],
  }))
  plan.milestones = [
    {
      ...milestone,
      work: plan.work.map((unit) => unit.id),
      criteria: plan.criteria.map((criterion) => criterion.id),
      after: [],
    },
  ]
  return { plan, source }
}

describe('current-call plan reference membership', () => {
  it.each([100, 400])('avoids declaration rescans for %i criteria', (count) =>
    fixture(({ plan: base, source: input }) => {
      const { plan, source } = linked(count, base, input),
        before = structuredClone([plan, source]),
        includes = Array.prototype.includes,
        indexOf = Array.prototype.indexOf
      let slots = 0
      const search = vi.spyOn(Array.prototype, 'includes').mockImplementation(function (
        this: unknown[],
        value,
        fromIndex,
      ) {
        if (typeof value === 'string' && /^(outcome|criterion|unit)-/.test(value)) {
          const position = Reflect.apply(indexOf, this, [value, fromIndex])
          slots += position < 0 ? this.length : position + 1
        }
        return Reflect.apply(includes, this, [value, fromIndex])
      })
      let result: DeliveryPlan
      try {
        result = validateDeliveryPlan(plan, source)
      } finally {
        search.mockRestore()
      }
      console.info(
        'Plan reference slots:',
        JSON.stringify({ count, slots, digest: contractDigest(result) }),
      )
      expect(slots).toBe(0)
      expect(contractDigest(result)).toBe(
        count === 100
          ? 'c734ae1f7be5f3a614c252245b51cbb4ef7a00d23889f74312af6bd565743ebb'
          : '6c3128a57aebf6585c74e3f8653d595c30d84500123001dff4a10260a3989318',
      )
      expect(result).toEqual(plan)
      expect([plan, source]).toEqual(before)
    }),
  )
  it('retains reference, ownership and coverage refusal order', () =>
    fixture(({ plan: base, source: input }) => {
      const { plan, source } = linked(4, base, input),
        first = plan.criteria[0],
        work = plan.work[0],
        other = plan.work[1],
        milestone = plan.milestones[0]
      if (!first || !work || !other || !milestone) throw new Error('Missing reference boundary')
      first.outcomes = ['absent']
      work.criteria = ['absent']
      expect(() => validateDeliveryPlan(plan, source)).toThrow('unknown-outcome')
      first.outcomes = ['outcome-1']
      expect(() => validateDeliveryPlan(plan, source)).toThrow('uncovered-outcome')
      first.outcomes = ['outcome-0']
      expect(() => validateDeliveryPlan(plan, source)).toThrow('unknown-criterion')
      work.criteria = ['criterion-0']
      other.criteria.push('criterion-0')
      milestone.after = ['absent']
      expect(() => validateDeliveryPlan(plan, source)).toThrow('criterion-ownership')
      other.criteria.pop()
      expect(() => validateDeliveryPlan(plan, source)).toThrow('unknown-milestone-dependency')
      milestone.after = []
      milestone.work.shift()
      expect(() => validateDeliveryPlan(plan, source)).toThrow('milestone-ownership')
      milestone.criteria.shift()
      expect(() => validateDeliveryPlan(plan, source)).toThrow('uncovered-milestone')
    }))
  it('rejects duplicate references before indexing and refreshes later calls', () =>
    fixture(({ plan: base, source: input }) => {
      const { plan, source } = linked(4, base, input),
        first = plan.criteria[0],
        work = plan.work[0],
        milestone = plan.milestones[0]
      if (!first || !work || !milestone) throw new Error('Missing duplicate boundary')
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
      first.outcomes.push('outcome-0')
      expect(() => validateDeliveryPlan(plan, source)).toThrow('unknown-outcome')
      first.outcomes.pop()
      work.criteria.push('criterion-0')
      expect(() => validateDeliveryPlan(plan, source)).toThrow('unknown-criterion')
      work.criteria.pop()
      milestone.criteria.push('criterion-0')
      expect(() => validateDeliveryPlan(plan, source)).toThrow('unknown-milestone-criterion')
      milestone.criteria.pop()
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
    }))
})
