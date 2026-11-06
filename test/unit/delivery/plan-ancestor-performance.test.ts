import { describe, expect, it, vi } from 'vitest'
import { type DeliveryPlan, validateDeliveryPlan } from '../../../src/delivery/plan.js'
import { fixture } from '../../support/delivery.js'

function chained(plan: DeliveryPlan, count: number) {
  const first = plan.work[0],
    milestone = plan.milestones[0]
  if (!first || !milestone) throw new Error('Missing ancestor fixture structure')
  plan.work = Array.from({ length: count }, (_, index) => ({
    id: `unit-${index}`,
    repository: 'app',
    role: index === 0 ? 'implementation' : 'contract',
    criteria: index === 0 ? plan.criteria.map((criterion) => criterion.id) : [],
    after: index + 1 < count ? [`unit-${index + 1}`] : [],
    consumes: [],
    produces:
      index === 0
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
  return milestone
}

describe('complete known milestone coverage proof', () => {
  it.each([25, 100])('needs no transitive closure for %i already available units', (count) =>
    fixture(({ plan, source }) => {
      chained(plan, count)
      const before = structuredClone(plan),
        original = Array.prototype.flatMap
      let closures = 0,
        expanded = 0
      const traversal = vi.spyOn(Array.prototype, 'flatMap').mockImplementation(function (
        this: unknown[],
        callback,
        thisArg,
      ) {
        const result = Reflect.apply(original, this, [callback, thisArg])
        if (
          this.length &&
          this.every((value) => typeof value === 'string' && value.startsWith('unit-'))
        ) {
          closures++
          expanded += result.length
        }
        return result
      })
      let result: DeliveryPlan
      try {
        result = validateDeliveryPlan(plan, source)
      } finally {
        traversal.mockRestore()
      }
      console.info('Available work closures:', JSON.stringify({ count, closures, expanded }))
      expect(closures).toBe(0)
      expect(expanded).toBe(0)
      expect(result).toEqual(before)
      expect(plan).toEqual(before)
    }),
  )
  it('uses previous milestone coverage and refuses missing predecessor coverage', () =>
    fixture(({ plan, source }) => {
      const milestone = chained(plan, 4),
        criterion = plan.criteria[0],
        last = plan.work.at(-1),
        prior = {
          ...structuredClone(milestone),
          id: 'prior',
          work: ['unit-1', 'unit-2', 'unit-3'],
          criteria: ['prior-criterion'],
        }
      if (!criterion || !last) throw new Error('Missing previous milestone fixture')
      plan.criteria.push({ ...criterion, id: 'prior-criterion', text: 'Find the previous task.' })
      last.criteria.push('prior-criterion')
      milestone.work = ['unit-0']
      milestone.after = ['prior']
      plan.milestones.push(prior)
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
      milestone.after = []
      expect(() => validateDeliveryPlan(plan, source)).toThrow('milestone-order')
    }))
  it('still checks work cycles, milestone cycles and contract precedence first', () =>
    fixture(({ plan, source }) => {
      const milestone = chained(plan, 4),
        first = plan.work[0],
        last = plan.work.at(-1)
      if (!first || !last) throw new Error('Missing cycle fixture')
      last.after = [first.id]
      milestone.after = [milestone.id]
      expect(() => validateDeliveryPlan(plan, source)).toThrow('dependency-cycle')
      last.after = []
      last.consumes = ['api-1']
      expect(() => validateDeliveryPlan(plan, source)).toThrow('contract-order')
      last.consumes = []
      expect(() => validateDeliveryPlan(plan, source)).toThrow('milestone-cycle')
      milestone.after = []
      expect(validateDeliveryPlan(plan, source)).toEqual(plan)
    }))
})
