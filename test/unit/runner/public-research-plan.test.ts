import { describe, expect, it } from 'vitest'
import { PublicResearchPlan } from '../../../src/runner/public-research-plan.js'
import { runnerResearchFixture } from '../../support/runner-research.js'

describe('the public research plan reviewed before source work', () => {
  it('pins once and reads exactly the same question, angle and verifier configuration', async () => {
    await runnerResearchFixture(async ({ store, request, plan }) => {
      const plans = new PublicResearchPlan(store),
        context = { request, plan }
      expect(() => plans.read(context)).toThrow()
      const artifact = plans.prepare(context),
        selected = plans.read(context)
      expect(plans.prepare(context)).toEqual(artifact)
      expect(selected).toMatchObject({
        schema: 'wholeloop/research-plan@1',
        run: request.run,
        owner: plan.owner,
        verifiers: 3,
        refutations: 2,
        angles: [{ provider: 'native-web', operation: 'source.web.query' }],
      })
      expect(JSON.stringify(selected)).toBe(store.files.read(artifact.ref))
      expect(selected.question).toBe(store.planning.sources.get(plan.source).body)
    })
  })
  it('refuses changed bytes without replacing them or silently selecting another plan', async () => {
    await runnerResearchFixture(async ({ store, request, plan }) => {
      const plans = new PublicResearchPlan(store),
        context = { request, plan },
        artifact = plans.prepare(context),
        changed = JSON.stringify({ ...plans.read(context), verifiers: 5, refutations: 3 })
      store.files.atomic(artifact.ref, changed)
      expect(() => plans.read(context)).toThrow('public-research-plan-changed')
      expect(() => plans.prepare(context)).toThrow('public-research-plan-changed')
      expect(store.files.read(artifact.ref)).toBe(changed)
    })
  })
  it('refuses a foreign run, revision, plan digest or endpoint before pinning', async () => {
    await runnerResearchFixture(async ({ store, request, plan }) => {
      const plans = new PublicResearchPlan(store)
      for (const changed of [
        { ...request, run: 'delivery-ffffffffffffffff' },
        { ...request, revision: request.revision + 1 },
        { ...request, plan: 'a'.repeat(64) },
      ])
        expect(() => plans.prepare({ request: changed, plan })).toThrow(
          'public-research-plan-scope',
        )
      expect(() =>
        plans.prepare({
          request,
          plan: { ...plan, policy: { ...plan.policy, endpoint: 'to-pr' } },
        }),
      ).toThrow('public-research-plan-scope')
    })
  })
})
