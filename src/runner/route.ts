import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { deliveryPlanRoute, planWaves } from '../delivery/plan.js'

export type RunnerStageKind =
  | 'definition'
  | 'plan'
  | 'acceptance-definition'
  | 'workspace'
  | 'build-plan'
  | 'implementation'
  | 'verification'
  | 'review'
  | 'commit'
  | 'integration'
  | 'acceptance'
  | 'publication'
  | 'research'
  | 'handoff'
export interface RunnerStage {
  id: string
  kind: RunnerStageKind
  after: string[]
  unit?: string
  milestone?: string
  criteria: string[]
}
export class DeliveryRunnerError extends Error {
  constructor(readonly problem: string) {
    super(`Delivery runner refused: ${problem}; contents omitted`)
  }
}
/** Pin the topic commit before QA because the existing gate snapshot includes HEAD. */
export function runnerRoute(plan: DeliveryPlan): RunnerStage[] {
  const route = deliveryPlanRoute(plan)
  if (route.next === 'blocked') throw new DeliveryRunnerError(route.reason)
  const stages: RunnerStage[] = []
  const add = (
    id: string,
    kind: RunnerStageKind,
    after: string[],
    criteria: string[],
    extra: Pick<RunnerStage, 'unit' | 'milestone'> = {},
  ) => {
    stages.push({ id, kind, after, criteria: [...criteria].sort(), ...extra })
  }
  if (!plan.definition.ready) {
    add('definition', 'definition', [], [])
    // A definition result must adopt a new immutable plan; it cannot silently make this plan ready.
    return stages
  }
  add('plan', 'plan', [], [])
  if (plan.policy.endpoint === 'research-report') {
    add(
      'research',
      'research',
      ['plan'],
      plan.criteria.map((c) => c.id),
    )
    add(
      'handoff',
      'handoff',
      ['research'],
      plan.criteria.map((c) => c.id),
    )
    return stages
  }
  add(
    'acceptance-definition',
    'acceptance-definition',
    ['plan'],
    plan.criteria.map((c) => c.id),
  )
  const terminal = (id: string) =>
    `${plan.work.find((w) => w.id === id)?.role === 'research' ? 'research' : 'review'}:${id}`
  for (const wave of planWaves(plan)) {
    for (const id of wave) {
      const work = plan.work.find((w) => w.id === id)
      if (!work) throw new DeliveryRunnerError('missing-route-work')
      let previous = work.after.length ? work.after.map(terminal) : ['acceptance-definition']
      if (work.role === 'research') {
        add(
          `research:${id}`,
          'research',
          [...new Set(['acceptance-definition', ...previous])],
          work.criteria,
          { unit: id },
        )
        continue
      }
      for (const kind of [
        'workspace',
        'build-plan',
        'implementation',
        'commit',
        'verification',
        'review',
      ] as const) {
        const stage = `${kind}:${id}`
        add(stage, kind, [...new Set(['acceptance-definition', ...previous])], work.criteria, {
          unit: id,
        })
        previous = [stage]
      }
    }
  }
  for (const milestone of plan.milestones) {
    add(
      `integration:${milestone.id}`,
      'integration',
      [...milestone.work.map(terminal), ...milestone.after.map((id) => `integration:${id}`)],
      milestone.criteria,
      { milestone: milestone.id },
    )
  }
  add(
    'acceptance',
    'acceptance',
    plan.milestones.map((m) => `integration:${m.id}`),
    plan.criteria.map((c) => c.id),
  )
  if (['to-pr', 'to-merge'].includes(plan.policy.endpoint))
    add(
      'publication',
      'publication',
      ['acceptance'],
      plan.criteria.map((c) => c.id),
    )
  add(
    'handoff',
    'handoff',
    [plan.policy.endpoint === 'local-handoff' ? 'acceptance' : 'publication'],
    plan.criteria.map((c) => c.id),
  )
  return stages
}

export function runnerStageDigest(plan: string, stage: RunnerStage): string {
  return contractDigest({ plan, stage })
}
