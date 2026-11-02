import { contractDigest } from '../contracts/compatibility.js'
import type { DecisionId, DecisionOutcome } from '../decisions/policy.js'
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
  | 'correction'
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
/** Required judgments follow the selected route; they never create delegated authority. */
export function runnerDecisionRequirements(
  plan: DeliveryPlan,
  stage: Pick<RunnerStage, 'kind'>,
  basis: 'plan' | 'envelope',
): { id: DecisionId; outcome: DecisionOutcome }[] {
  const required: { id: DecisionId; outcome: DecisionOutcome }[] = []
  if (stage.kind === 'plan' && basis === 'envelope')
    required.push({ id: 'delivery-plan', outcome: 'accept' })
  if (plan.policy.intervention === 'none') {
    if (stage.kind === 'definition') {
      // Research defines angles and sources under its own delegated decision scope.
      // Source acceptance remains attached to the later actual research stage.
      if (plan.policy.endpoint === 'research-report')
        required.push({ id: 'research-plan', outcome: 'accept' })
      else
        required.push(
          { id: 'frame-outcome', outcome: 'go' },
          { id: 'approve-spec', outcome: 'accept' },
          { id: 'approve-scopes', outcome: 'accept' },
        )
    }
    if (stage.kind === 'build-plan') required.push({ id: 'approve-build-plan', outcome: 'accept' })
    if (stage.kind === 'acceptance') required.push({ id: 'acceptance', outcome: 'accept' })
    if (stage.kind === 'plan' && plan.policy.endpoint === 'research-report')
      required.push({ id: 'research-plan', outcome: 'accept' })
    if (stage.kind === 'research' && plan.policy.endpoint === 'research-report')
      required.push({ id: 'research-sources', outcome: 'accept' })
  }
  return required
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
  // Implementation work ends after review and its re-entry verification of the reviewed head.
  const terminal = (id: string) =>
    plan.work.find((w) => w.id === id)?.role === 'research'
      ? [`research:${id}`]
      : [`review:${id}`, `reverification:${id}`]
  for (const wave of planWaves(plan)) {
    for (const id of wave) {
      const work = plan.work.find((w) => w.id === id)
      if (!work) throw new DeliveryRunnerError('missing-route-work')
      let previous = work.after.length ? work.after.flatMap(terminal) : ['acceptance-definition']
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
      // ADR-0197: each recorded correction re-enters the unit after its original
      // commit, so every stage that consumes the changed head has new inputs.
      const corrections = (plan.corrections ?? []).filter((entry) => entry.unit === id)
      const chain: [string, RunnerStageKind][] = [
        ['workspace', 'workspace'],
        ['build-plan', 'build-plan'],
        ['implementation', 'implementation'],
        ['commit', 'commit'],
        ...corrections.map((_, index): [string, RunnerStageKind] => [
          `correction-${index + 1}`,
          'correction',
        ]),
        ['verification', 'verification'],
        ['review', 'review'],
      ]
      for (const [name, kind] of chain) {
        const stage = `${name}:${id}`
        add(stage, kind, [...new Set(['acceptance-definition', ...previous])], work.criteria, {
          unit: id,
        })
        previous = [stage]
      }
      add(
        `reverification:${id}`,
        'verification',
        [...new Set(['acceptance-definition', ...previous])],
        work.criteria,
        { unit: id },
      )
    }
  }
  for (const milestone of plan.milestones) {
    add(
      `integration:${milestone.id}`,
      'integration',
      [...milestone.work.flatMap(terminal), ...milestone.after.map((id) => `integration:${id}`)],
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
