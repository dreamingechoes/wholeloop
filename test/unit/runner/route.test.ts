import { describe, expect, it } from 'vitest'
import { DelegatedDecisions } from '../../../src/decisions/store.js'
import { sourceHash } from '../../../src/delivery/input.js'
import {
  runnerDecisionRequirements,
  runnerRoute,
  runnerStageDigest,
} from '../../../src/runner/route.js'
import { authorization, entry, envelope, fixture } from '../../support/delivery.js'

describe('deterministic complete delivery routes', () => {
  it('matches initial research requirements to a real pinned research-only envelope grant', async () => {
    await fixture(({ plan, planning }) => {
      plan.policy.endpoint = 'research-report'
      plan.policy.intervention = 'none'
      plan.definition = { ready: false, missing: ['Choose bounded independent research angles.'] }
      plan.work = [
        {
          id: 'research',
          role: 'research',
          criteria: ['search'],
          after: [],
          consumes: [],
          produces: [],
        },
      ]
      plan.milestones = plan.milestones.map((milestone) => ({ ...milestone, work: ['research'] }))
      plan.policy.delegations = (
        ['delivery-plan', 'research-plan', 'research-sources'] as const
      ).map((id) => {
        const ref = `rubrics/${id}.json`,
          body = JSON.stringify({
            schema: 'wholeloop/delegated-decision-rubric@1',
            decision: id,
            purpose: 'Preserve the original research question and bounded source policy.',
            rules: [{ id: 'scope', text: 'No implementation work or unsupported source claim.' }],
            outcomes: ['accept', 'reject'],
            unknowns: { allowed: [], defaults: [] },
            timeoutMs: 1000,
          })
        planning.sources.files.atomic(ref, body)
        return {
          id,
          rubric: { ref, sha256: sourceHash(body) },
          evidence: ['scope'],
          fallback: 'blocked',
        }
      })
      plan.envelope = planning.prepareEnvelope(envelope(plan)).digest
      const prepared = planning.preparePlan(plan),
        decisions = new DelegatedDecisions(planning.sources.files.root),
        request = authorization(plan, prepared.digest)
      request.basis = { kind: 'envelope', digest: plan.envelope }
      request.effects = ['source.read', 'report.write']
      request.decisions = ['delivery-plan', 'research-plan', 'research-sources']
      const grant = decisions.budgets.lifecycle.authority.authorize(request)
      decisions.budgets.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      decisions.pin(grant.grant.id)
      expect(
        decisions.preflight({ run: plan.run, revision: 1, grant: grant.grant.id }),
      ).toMatchObject({
        status: 'ready',
        problems: [],
        interactive: 'disabled',
        runtime: 'not-observed',
      })
      const required = runnerDecisionRequirements(plan, entry(runnerRoute(plan), 0), 'envelope')
      expect(required.map((decision) => decision.id)).toEqual(['research-plan'])
      expect(required.every((decision) => grant.grant.decisions.includes(decision.id))).toBe(true)
      expect(decisions.budgets.inspect(plan.run).started).toBe(false)
    })
  })
  it('retains implementation decisions and independent research/source judgments at their own stages', async () => {
    await fixture(({ plan }) => {
      plan.policy.intervention = 'none'
      expect(runnerDecisionRequirements(plan, { kind: 'definition' }, 'envelope')).toEqual([
        { id: 'frame-outcome', outcome: 'go' },
        { id: 'approve-spec', outcome: 'accept' },
        { id: 'approve-scopes', outcome: 'accept' },
      ])
      expect(runnerDecisionRequirements(plan, { kind: 'build-plan' }, 'plan')).toEqual([
        { id: 'approve-build-plan', outcome: 'accept' },
      ])
      expect(runnerDecisionRequirements(plan, { kind: 'acceptance' }, 'plan')).toEqual([
        { id: 'acceptance', outcome: 'accept' },
      ])
      expect(runnerDecisionRequirements(plan, { kind: 'plan' }, 'envelope')).toEqual([
        { id: 'delivery-plan', outcome: 'accept' },
      ])
      plan.policy.endpoint = 'research-report'
      expect(runnerDecisionRequirements(plan, { kind: 'plan' }, 'envelope')).toEqual([
        { id: 'delivery-plan', outcome: 'accept' },
        { id: 'research-plan', outcome: 'accept' },
      ])
      expect(runnerDecisionRequirements(plan, { kind: 'research' }, 'plan')).toEqual([
        { id: 'research-sources', outcome: 'accept' },
      ])
      expect(runnerDecisionRequirements(plan, { kind: 'handoff' }, 'plan')).toEqual([])
    })
  })
  it.each(['supervised', 'on-exception'] as const)(
    'preserves %s decision behavior without fabricating machine or human approval',
    async (intervention) => {
      await fixture(({ plan }) => {
        plan.policy.intervention = intervention
        for (const kind of ['definition', 'build-plan', 'acceptance', 'research'] as const)
          expect(runnerDecisionRequirements(plan, { kind }, 'plan')).toEqual([])
        expect(runnerDecisionRequirements(plan, { kind: 'plan' }, 'envelope')).toEqual([
          { id: 'delivery-plan', outcome: 'accept' },
        ])
      })
    },
  )
  it('keeps an initial unattended research definition inside research decision authority', async () => {
    await fixture(({ plan }) => {
      plan.policy.endpoint = 'research-report'
      plan.policy.intervention = 'none'
      plan.policy.delegations = (['research-plan', 'research-sources'] as const).map((id) => ({
        id,
        rubric: { ref: `rubrics/${id}.json`, sha256: 'a'.repeat(64) },
        evidence: ['scope'],
        fallback: 'blocked',
      }))
      plan.definition = { ready: false, missing: ['Select bounded research angles.'] }
      const stage = entry(runnerRoute(plan), 0)
      expect(runnerDecisionRequirements(plan, stage, 'envelope')).toEqual([
        { id: 'research-plan', outcome: 'accept' },
      ])
    })
  })
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
