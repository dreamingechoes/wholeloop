import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliveryEffects } from '../../../src/delivery/effect-events.js'
import { DeliveryLifecycle } from '../../../src/delivery/lifecycle.js'
import { deliveryRunner } from '../../../src/runner/events.js'
import { authorization, fixture } from '../../support/delivery.js'

const at = '2026-10-24T10:00:00.000Z'
afterEach(() => vi.restoreAllMocks())

function deeplyFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true
  return Object.isFrozen(value) && Object.values(value).every(deeplyFrozen)
}

describe('borrowed frozen journal views (ADR-0239)', () => {
  it('lends the validated projection without copies and keeps get independent', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan),
        lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at),
        issued = lifecycle.authority.authorize(authorization(plan, prepared.digest)),
        original = lifecycle.track({ run: plan.run, revision: 1, grant: issued.grant.id }),
        journal = lifecycle.journal
      const view = journal.view(plan.run)
      expect(view).toEqual(original)
      expect(deeplyFrozen(view)).toBe(true)
      expect(() => {
        ;(view as { state: string }).state = 'changed'
      }).toThrow(TypeError)
      expect(() => view.facets.push(view.facets[0] as never)).toThrow(TypeError)
      // Read-only facet accessors leave the shared projection unchanged.
      expect(deliveryEffects(view).records).toEqual([])
      expect(deliveryRunner(view).records).toEqual([])
      expect(journal.view(plan.run)).toEqual(original)
      const copy = journal.get(plan.run)
      copy.state = 'paused'
      expect(Object.isFrozen(copy)).toBe(false)
      expect(journal.view(plan.run).state).toBe(original.state)
      const clone = vi.spyOn(globalThis, 'structuredClone')
      for (let index = 0; index < 100; index++) journal.view(plan.run)
      expect(journal.views()).toHaveLength(1)
      expect(clone).not.toHaveBeenCalled()
    }))

  it('serves a new frozen projection after a transaction and leaves the earlier view intact', () =>
    fixture(({ plan, planning }) => {
      const prepared = planning.preparePlan(plan),
        lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at),
        issued = lifecycle.authority.authorize(authorization(plan, prepared.digest))
      lifecycle.track({ run: plan.run, revision: 1, grant: issued.grant.id })
      const before = lifecycle.journal.view(plan.run),
        state = before.state
      lifecycle.transition(plan.run, { to: 'queued', reason: 'Fixture queue.' })
      const after = lifecycle.journal.view(plan.run)
      expect(after).not.toBe(before)
      expect(after.state).toBe('queued')
      expect(before.state).toBe(state)
      expect(deeplyFrozen(after)).toBe(true)
    }))
})
