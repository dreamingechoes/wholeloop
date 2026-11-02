import { describe, expect, it } from 'vitest'
import type { DeliveryPlan } from '../../../src/delivery/plan.js'
import type { DeliveryPlanning } from '../../../src/delivery/planning-store.js'
import { ObservationSchedule } from '../../../src/learning/scheduler.js'
import { runnerDecisionRequirements, runnerRoute } from '../../../src/runner/route.js'
import { RunnerStageDispatcher } from '../../../src/runner/stage-dispatcher.js'
import { RunnerStore } from '../../../src/runner/store.js'
import { authorization, fixture } from '../../support/delivery.js'

const KEY = 'a'.repeat(64)
/** A read-only observation plan: one research-role unit and the scheduled link. */
function observationPlan(plan: DeliveryPlan) {
  plan.policy.endpoint = 'learning-observation'
  plan.observation = { key: KEY, subject: 'search', checkpoint: 'd7' }
  plan.repositories = []
  plan.work = [
    {
      id: 'measure',
      role: 'research',
      criteria: ['search'],
      after: [],
      consumes: [],
      produces: [],
    },
  ]
  plan.milestones = [
    {
      id: 'observation',
      work: ['measure'],
      criteria: ['search'],
      after: [],
      procedure: 'Read the pinned measurement sources for the due checkpoint.',
    },
  ]
  return plan
}
const schedule = (planning: DeliveryPlanning, subject = 'search', checkpoint = 'd7') =>
  new ObservationSchedule(planning.sources.files).tick([
    {
      key: KEY,
      subject,
      checkpoint,
      due: '2026-10-08T00:00:00.000Z',
      launchedAt: '2026-10-01T00:00:00.000Z',
      source: 'b'.repeat(64),
      policy: 'c'.repeat(64),
    },
  ])

describe('learning observation routes (ADR-0200)', () => {
  it('routes one read-only observation to its report and needs a learning decision unattended', () =>
    fixture(({ plan }) => {
      observationPlan(plan)
      const route = runnerRoute(plan)
      expect(route.map((stage) => [stage.id, stage.after])).toEqual([
        ['plan', []],
        ['observation', ['plan']],
        ['handoff', ['observation']],
      ])
      const observation = route.find((stage) => stage.kind === 'observation')
      if (!observation) throw new Error('Observation stage required')
      expect(runnerDecisionRequirements(plan, observation, 'plan')).toEqual([])
      plan.policy.intervention = 'none'
      // Any of keep, iterate, kill or unflag may satisfy the requirement.
      expect(runnerDecisionRequirements(plan, observation, 'plan')).toEqual([
        { id: 'learning-outcome' },
      ])
    }))
  it.each([
    ['an observation plan without its link', (plan: DeliveryPlan) => delete plan.observation],
    [
      'a link on another endpoint',
      (plan: DeliveryPlan) => {
        plan.policy.endpoint = 'research-report'
      },
    ],
    [
      'code-bearing work',
      (plan: DeliveryPlan) => {
        const unit = plan.work[0]
        if (unit) unit.role = 'implementation'
      },
    ],
    [
      'an undefined plan',
      (plan: DeliveryPlan) => {
        plan.definition = { ready: false, missing: ['Pick the checkpoint.'] }
      },
    ],
  ])('refuses %s', (_name, change) =>
    fixture(({ planning, plan }) => {
      schedule(planning)
      observationPlan(plan)
      change(plan)
      expect(() => planning.preparePlan(plan)).toThrow()
    }),
  )
  it('admits only an observation that was actually scheduled and is not settled', () =>
    fixture(({ planning, plan }) => {
      observationPlan(plan)
      expect(() => planning.preparePlan(plan)).toThrow('unscheduled-observation')
      schedule(planning, 'search', 'd30')
      expect(() => planning.preparePlan(plan)).toThrow('unscheduled-observation')
    }))
  it('refuses a settled observation', () =>
    fixture(({ planning, plan }) => {
      schedule(planning)
      new ObservationSchedule(planning.sources.files).settle(KEY, [], 'supervised', 'blocked')
      observationPlan(plan)
      expect(() => planning.preparePlan(plan)).toThrow('unscheduled-observation')
    }))
  it('grants reads and a report only, and reports the route unsupported until a host exists', () =>
    fixture(({ planning, plan }) => {
      schedule(planning)
      observationPlan(plan)
      const prepared = planning.preparePlan(plan),
        store = new RunnerStore(planning.sources.files.root),
        request = authorization(plan, prepared.digest)
      // The default fixture grant includes workspace and code effects.
      expect(() => store.lifecycle.authority.authorize(request)).toThrow('endpoint-effect-ceiling')
      const grant = store.lifecycle.authority.authorize({
        ...request,
        effects: ['source.read', 'report.write'],
      })
      expect(grant.grant.effects).toEqual(['source.read', 'report.write'])
      const dispatcher = new RunnerStageDispatcher(
        store,
        { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
        {},
      )
      expect(dispatcher.coverage(prepared.plan).unsupported).toEqual(
        expect.arrayContaining(['observation', 'handoff']),
      )
    }))
})
