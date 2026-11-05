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
  | 'ci'
  | 'merge'
  | 'research'
  | 'observation'
  | 'handoff'
export interface RunnerStage {
  id: string
  kind: RunnerStageKind
  after: string[]
  unit?: string
  milestone?: string
  criteria: string[]
}
/**
 * Required judgments follow the selected route; they never create delegated
 * authority. A requirement without an outcome accepts any outcome its decision
 * allows: a learning recommendation may keep, iterate, kill or unflag.
 */
export function runnerDecisionRequirements(
  plan: DeliveryPlan,
  stage: Pick<RunnerStage, 'kind'>,
  basis: 'plan' | 'envelope',
): { id: DecisionId; outcome?: DecisionOutcome }[] {
  const required: { id: DecisionId; outcome?: DecisionOutcome }[] = []
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
    if (stage.kind === 'observation') required.push({ id: 'learning-outcome' })
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
  // ADR-0200: one scheduled observation, read-only, then its local report.
  if (plan.policy.endpoint === 'learning-observation') {
    add(
      'observation',
      'observation',
      ['plan'],
      plan.criteria.map((c) => c.id),
    )
    add(
      'handoff',
      'handoff',
      ['observation'],
      plan.criteria.map((c) => c.id),
    )
    return stages
  }
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
  const ciOrigin =
    plan.schema === 'wholeloop/delivery-plan@2'
      ? plan.corrections?.findLast((entry) => entry.origin === 'ci')
      : undefined
  if (ciOrigin) add('ci-correction-admission', 'correction', ['plan'], [], { unit: ciOrigin.unit })
  add(
    'acceptance-definition',
    'acceptance-definition',
    [ciOrigin ? 'ci-correction-admission' : 'plan'],
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
        ...corrections.flatMap((entry, index): [string, RunnerStageKind][] =>
          // Version two keeps old failures as history, never as another worker.
          // Preserve the original index so the fixed entry reader cannot borrow
          // a different failure when only the current producer is scheduled.
          plan.schema === 'wholeloop/delivery-plan@2' && entry.revision !== plan.revision
            ? []
            : [[`correction-${index + 1}`, 'correction']],
        ),
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
  // ADR-0199: a merge waits for revision-bound CI at the published head, then
  // re-evaluates eligibility immediately before its single expected-head merge.
  if (plan.policy.endpoint === 'to-merge') {
    add(
      'ci',
      'ci',
      ['publication'],
      plan.criteria.map((c) => c.id),
    )
    add(
      'merge',
      'merge',
      ['ci'],
      plan.criteria.map((c) => c.id),
    )
  }
  add(
    'handoff',
    'handoff',
    [
      plan.policy.endpoint === 'local-handoff'
        ? 'acceptance'
        : plan.policy.endpoint === 'to-merge'
          ? 'merge'
          : 'publication',
    ],
    plan.criteria.map((c) => c.id),
  )
  return stages
}

export function runnerStageDigest(plan: string, stage: RunnerStage): string {
  return contractDigest({ plan, stage })
}
