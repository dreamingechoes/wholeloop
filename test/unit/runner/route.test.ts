import { describe, expect, it } from 'vitest'
import { runnerRoute, runnerStageDigest } from '../../../src/runner/route.js'
import { entry, fixture } from '../../support/delivery.js'

describe('deterministic complete delivery routes', () => {
  it('keeps pre-builder acceptance and dependency-ordered full verify/review/commit stages', async () => {
    await fixture(({ plan }) => {
      const stages = runnerRoute(plan),
        ids = stages.map((s) => s.id)
      expect(ids).toEqual([
        'plan',
        'acceptance-definition',
        'workspace:contract',
        'build-plan:contract',
        'implementation:contract',
        'commit:contract',
        'verification:contract',
        'review:contract',
        'workspace:search',
        'build-plan:search',
        'implementation:search',
        'commit:search',
        'verification:search',
        'review:search',
        'integration:feature',
        'acceptance',
        'handoff',
      ])
      expect(stages.find((s) => s.id === 'workspace:search')?.after).toContain('review:contract')
      expect(stages.find((s) => s.id === 'verification:search')?.after).toContain('commit:search')
      expect(stages.find((s) => s.id === 'integration:feature')?.after).toContain('review:search')
      for (const kind of ['verification', 'review', 'commit'])
        expect(stages.find((s) => s.id === `${kind}:search`)?.criteria).toEqual(['search'])
      expect(stages.find((s) => s.id === 'handoff')?.after).toEqual(['acceptance'])
      expect(runnerStageDigest('a'.repeat(64), entry(stages, 0))).not.toBe(
        runnerStageDigest('b'.repeat(64), entry(stages, 0)),
      )
    })
  })
  it.each(['to-pr', 'to-merge'] as const)(
    'requires publication after full acceptance for %s',
    async (endpoint) => {
      await fixture(({ plan }) => {
        plan.policy.endpoint = endpoint
        const route = runnerRoute(plan)
        expect(route.find((s) => s.id === 'publication')?.after).toEqual(['acceptance'])
        expect(route.find((s) => s.id === 'handoff')?.after).toEqual(['publication'])
      })
    },
  )
  it('keeps research separate and cannot silently make an incomplete definition ready', async () => {
    await fixture(({ plan }) => {
      plan.policy.endpoint = 'research-report'
      expect(runnerRoute(plan).map((s) => s.kind)).toEqual(['plan', 'research', 'handoff'])
      plan.definition = { ready: false, missing: ['Required factual context.'] }
      expect(runnerRoute(plan).map((s) => s.kind)).toEqual(['definition'])
      expect(plan.definition.ready).toBe(false)
    })
  })
  it('blocks human-only none routes and retains research prerequisites in implementation', async () => {
    await fixture(({ plan }) => {
      plan.policy.intervention = 'none'
      entry(plan.criteria, 0).acceptance = 'human'
      expect(() => runnerRoute(plan)).toThrow('human-only-acceptance')
      plan.policy.intervention = 'supervised'
      entry(plan.criteria, 0).acceptance = 'machine'
      entry(plan.work, 0).role = 'research'
      const route = runnerRoute(plan)
      expect(route.find((s) => s.id === 'workspace:search')?.after).toContain('research:contract')
      expect(route.find((s) => s.id === 'commit:contract')).toBeUndefined()
    })
  })
})
