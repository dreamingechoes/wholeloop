import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import { DeliveryEffects } from '../../../src/delivery/effects.js'
import { DeliveryLifecycle } from '../../../src/delivery/lifecycle.js'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import { reviseDelivery, revisionImpact } from '../../../src/runner/revision-impact.js'
import { authorization, envelope, fixture } from '../../support/delivery.js'

async function setup(
  run: (input: {
    lifecycle: DeliveryLifecycle
    current: DeliveryPlan
    next: () => DeliveryPlan
    store: string
  }) => void | Promise<void>,
  options: { intervention?: 'none' | 'supervised'; envelope?: boolean } = {},
) {
  await fixture(async ({ planning, plan }) => {
    plan.policy.intervention = options.intervention ?? 'supervised'
    if (options.envelope) plan.envelope = planning.prepareEnvelope(envelope(plan)).digest
    const prepared = planning.preparePlan(plan),
      lifecycle = new DeliveryLifecycle(planning.sources.files.root),
      grant = lifecycle.authority.authorize({
        ...authorization(plan, prepared.digest),
        ...(options.envelope
          ? { basis: { kind: 'envelope' as const, digest: plan.envelope ?? '' } }
          : {}),
      })
    lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    const current = planning.getPlan(plan.run, 1).plan
    await run({
      lifecycle,
      current,
      store: planning.sources.files.root,
      next: () => ({ ...structuredClone(current), revision: 2, previous: prepared.digest }),
    })
  })
}
const impact = (lifecycle: DeliveryLifecycle, current: DeliveryPlan, proposed: DeliveryPlan) =>
  revisionImpact({ state: lifecycle.journal.get(current.run), current, proposed, grant: 'plan' })

describe('revision impact (INT-03, INT-04)', () => {
  it('reuses every stage whose complete inputs are unchanged and re-authorizes the plan', () =>
    setup(({ lifecycle, current, next }) => {
      const result = impact(lifecycle, current, next())
      expect(result.criteria).toEqual({ added: [], removed: [], changed: [] })
      expect(result.authority).toBe('unchanged')
      expect(result.stages.find((stage) => stage.id === 'plan')).toMatchObject({
        decision: 'invalidate',
        reason: 'new-plan-bytes',
      })
      expect(
        result.stages
          .filter((stage) => stage.id !== 'plan')
          .every((stage) => stage.decision === 'reuse'),
      ).toBe(true)
      expect(result.adoption).toBe('operator-required')
    }))
  it('invalidates a changed criterion and everything downstream of its acceptance definitions', () =>
    setup(({ lifecycle, current, next }) => {
      const proposed = next(),
        criterion = proposed.criteria[0]
      if (!criterion) throw new Error('Criterion required')
      criterion.test = 'Seed three tasks and compare ranked IDs.'
      const result = impact(lifecycle, current, proposed),
        decision = (id: string) => result.stages.find((stage) => stage.id === id)
      expect(result.criteria.changed).toEqual(['search'])
      expect(decision('acceptance-definition')).toMatchObject({
        decision: 'invalidate',
        reason: 'criteria-changed',
      })
      // Builders consume the pinned acceptance definitions, so dependent work is not reused.
      expect(decision('implementation:contract')).toMatchObject({
        decision: 'invalidate',
        reason: 'predecessor-invalidated',
      })
      expect(decision('implementation:search')?.decision).toBe('invalidate')
      expect(decision('acceptance')?.decision).toBe('invalidate')
    }))
  it('keeps unit evidence when only a milestone procedure changes', () =>
    setup(({ lifecycle, current, next }) => {
      const proposed = next(),
        milestone = proposed.milestones[0]
      if (!milestone) throw new Error('Milestone required')
      milestone.procedure = 'Run the application and search archived and live task titles.'
      const result = impact(lifecycle, current, proposed),
        decision = (id: string) => result.stages.find((stage) => stage.id === id)
      expect(decision('implementation:search')).toMatchObject({ decision: 'reuse' })
      expect(decision('reverification:search')).toMatchObject({ decision: 'reuse' })
      expect(decision('integration:feature')).toMatchObject({
        decision: 'invalidate',
        reason: 'milestone-changed',
      })
      expect(decision('acceptance')).toMatchObject({
        decision: 'invalidate',
        reason: 'predecessor-invalidated',
      })
    }))
  it('flags removed outcomes and widened authority and never adopts them automatically', () =>
    setup(({ lifecycle, current, next }) => {
      const narrowed = next()
      narrowed.scope.outcomes = []
      expect(impact(lifecycle, current, narrowed)).toMatchObject({
        outcomes: { removed: ['locate'] },
        adoption: 'operator-required',
        reasons: expect.arrayContaining(['outcomes-removed']),
      })
      const widened = next()
      widened.policy = { ...widened.policy, endpoint: 'to-pr' }
      const result = impact(lifecycle, current, widened)
      expect(result.authority).toBe('requires-new-grant')
      expect(result.stages.every((stage) => stage.decision !== 'reuse')).toBe(true)
    }))
  it('lists pending effects for reconciliation and refuses a skipped revision', () =>
    setup(({ lifecycle, current, next }) => {
      new DeliveryEffects(lifecycle.journal.files.root).prepare(current.run, {
        key: 'pending-commit',
        operation: 'git.commit',
        repository: 'app',
        ref: 'wl/contract',
        expectedHead: current.repositories[0]?.base ?? '',
        inputDigest: 'c'.repeat(64),
      })
      const skipped = { ...next(), revision: 3 },
        result = impact(lifecycle, current, skipped)
      expect(result.effects).toEqual([
        expect.objectContaining({ operation: 'git.commit', action: 'reconcile-required' }),
      ])
      expect(result.reasons).toContain('not-the-next-revision')
    }))
  it('adopts automatically only within an envelope grant, and ends none-policy work outside it blocked', async () => {
    await setup(
      ({ lifecycle, current, next }) => {
        const proposed = next(),
          criterion = proposed.criteria[0]
        if (criterion) criterion.test = 'Seed three tasks and compare ranked IDs.'
        const state = lifecycle.journal.get(current.run),
          envelopeValue = lifecycle.authority.planning.getEnvelope(current.envelope ?? '').envelope
        expect(
          revisionImpact({ state, current, proposed, envelope: envelopeValue, grant: 'envelope' })
            .adoption,
        ).toBe('automatic-in-envelope')
        const outside = next()
        outside.scope = { ...outside.scope, exclusions: [] }
        expect(
          revisionImpact({
            state,
            current,
            proposed: outside,
            envelope: envelopeValue,
            grant: 'envelope',
          }),
        ).toMatchObject({ envelope: 'outside', adoption: 'blocked' })
      },
      { intervention: 'none', envelope: true },
    )
  })
})

describe('explicit revision adoption (INT-07)', () => {
  it('previews without writing, then records only an explicitly accepted revision', () =>
    setup(({ lifecycle, current, next, store }) => {
      const journal = contractDigest(lifecycle.journal.events()),
        proposed = next()
      proposed.scope.outcomes = [...proposed.scope.outcomes]
      const criterion = proposed.criteria[0]
      if (criterion) criterion.test = 'Seed live and archived tasks and compare returned IDs.'
      const preview = reviseDelivery(lifecycle, current.run, proposed)
      expect(preview.accepted).toBe(false)
      expect(existsSync(`${store}/delivery/plans/${current.run}/2.json`)).toBe(false)
      expect(contractDigest(lifecycle.journal.events())).toBe(journal)
      expect(() =>
        reviseDelivery(lifecycle, current.run, proposed, {
          operator: '',
          reason: 'x',
          approveRemovals: false,
        }),
      ).toThrow('revision-operator-and-reason')
      const accepted = reviseDelivery(lifecycle, current.run, proposed, {
        operator: 'Fixture Operator',
        reason: 'The owner widened search to archived tasks.',
        approveRemovals: false,
      })
      expect(accepted).toMatchObject({
        accepted: true,
        record: { revision: 2, previous: preview.impact.current.digest, authority: 'not-implied' },
      })
      // The approved basis is unchanged until authority covering revision 2 is tracked.
      expect(lifecycle.journal.get(current.run).basis.revision).toBe(1)
      expect(contractDigest(lifecycle.journal.events())).toBe(journal)
      expect(lifecycle.authority.planning.getPlan(current.run, 1).plan).toEqual(current)
      expect(() =>
        reviseDelivery(lifecycle, current.run, proposed, {
          operator: 'Fixture Operator',
          reason: 'Again.',
          approveRemovals: false,
        }),
      ).toThrow('revision-already-recorded')
    }))
  it('requires separate approval for removed outcomes', () =>
    setup(({ lifecycle, current, next }) => {
      const proposed = next()
      proposed.scope.outcomes = []
      const accept = (approveRemovals: boolean) =>
        reviseDelivery(lifecycle, current.run, proposed, {
          operator: 'Fixture Operator',
          reason: 'Drop the outcome.',
          approveRemovals,
        })
      expect(() => accept(false)).toThrow()
    }))
  it('refuses a none-policy revision outside the envelope', () =>
    setup(
      ({ lifecycle, current, next }) => {
        const outside = next()
        outside.scope = { ...outside.scope, exclusions: [] }
        expect(() =>
          reviseDelivery(lifecycle, current.run, outside, {
            operator: 'Fixture Operator',
            reason: 'Widen scope.',
            approveRemovals: true,
          }),
        ).toThrow()
      },
      { intervention: 'none', envelope: true },
    ))
})
