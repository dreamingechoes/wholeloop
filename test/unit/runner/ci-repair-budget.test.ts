import { expect, it } from 'vitest'
import { ciRepairAdmission } from '../../../src/runner/ci-repair.js'
import { authorization } from '../../support/delivery.js'
import { publicationFixture } from '../../support/runner-publication.js'

it.each([1, 9])(
  'keeps the original CI push ceiling across a %i-push plan revision',
  async (ciPushes) => {
    await publicationFixture(async ({ store, plan, publication }) => {
      store.budgets.start(plan.run)
      const next = store.planning.preparePlan({
          ...plan,
          revision: 2,
          previous: publication.plan,
          budgets: { ...plan.budgets, ciPushes },
        }),
        grant = store.lifecycle.authority.authorize({
          ...authorization(next.plan, next.digest),
          id: 'authorization-fedcba9876543210',
        })
      store.lifecycle.track({ run: plan.run, revision: 2, grant: grant.grant.id })
      expect(ciRepairAdmission(store, plan.run)).toEqual({
        pushes: 0,
        limit: Math.min(2, ciPushes),
        allowed: true,
      })
    })
  },
)
