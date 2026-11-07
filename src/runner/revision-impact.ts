// Computes which stages a delivery revision can reuse from their declared inputs.
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { deliveryEffects } from '../delivery/effect-events.js'
import type { DeliveryProjection } from '../delivery/events.js'
import { safeSourceText } from '../delivery/input.js'
import type { DeliveryLifecycle } from '../delivery/lifecycle.js'
import {
  checkPlanEnvelope,
  type DeliveryEnvelope,
  type DeliveryPlan,
  validateDeliveryPlan,
} from '../delivery/plan.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import { deliveryRunner } from './events.js'
import { DeliveryRunnerError, type RunnerStage, runnerRoute } from './route.js'

const ACTIVE = new Set(['claimed', 'started', 'stopping'])
export interface RevisionImpact {
  schema: 'wholeloop/delivery-revision-impact@1'
  run: string
  current: { revision: number; digest: string }
  proposed: { revision: number; digest: string }
  criteria: { added: string[]; removed: string[]; changed: string[] }
  outcomes: { removed: string[] }
  authority: 'unchanged' | 'requires-new-grant'
  envelope: 'within' | 'outside' | 'not-applicable'
  stages: { id: string; decision: 'reuse' | 'invalidate' | 'new'; reason: string }[]
  workers: { attempt: string; action: 'fence-required' }[]
  effects: { id: string; operation: string; action: 'reconcile-required' }[]
  adoption: 'automatic-in-envelope' | 'operator-required' | 'blocked'
  reasons: string[]
}
const keyed = <T extends { id: string }>(items: readonly T[]) =>
  new Map(items.map((item) => [item.id, contractDigest(item)]))

/**
 * Pure. Reuse is a dependency calculation over complete declared inputs: a stage
 * is reused only when its own definition and every predecessor are unchanged;
 * anything else, including unknown dependencies, is invalidated with a reason.
 */
export function revisionImpact(input: {
  state: Readonly<DeliveryProjection>
  current: Readonly<DeliveryPlan>
  proposed: Readonly<DeliveryPlan>
  envelope?: Readonly<DeliveryEnvelope>
  grant: 'plan' | 'envelope'
}): RevisionImpact {
  const { current, proposed } = input,
    reasons: string[] = []
  if (proposed.run !== current.run || proposed.revision !== current.revision + 1)
    reasons.push('not-the-next-revision')
  if (proposed.previous !== contractDigest(current)) reasons.push('previous-digest-mismatch')
  const before = keyed(current.criteria),
    after = keyed(proposed.criteria),
    criteria = {
      added: [...after.keys()].filter((id) => !before.has(id)).sort(),
      removed: [...before.keys()].filter((id) => !after.has(id)).sort(),
      changed: [...after.keys()]
        .filter((id) => before.has(id) && before.get(id) !== after.get(id))
        .sort(),
    },
    outcomes = {
      removed: current.scope.outcomes
        .map((outcome) => outcome.id)
        .filter((id) => !proposed.scope.outcomes.some((outcome) => outcome.id === id))
        .sort(),
    }
  // Wider or different repositories, policy, budgets or capabilities need new authority.
  const authority = [
    'repositories',
    'policy',
    'budgets',
    'capabilities',
    'guidance',
    'source',
    'owner',
  ].some(
    (key) =>
      contractDigest(current[key as keyof DeliveryPlan] ?? null) !==
      contractDigest(proposed[key as keyof DeliveryPlan] ?? null),
  )
    ? ('requires-new-grant' as const)
    : ('unchanged' as const)
  let envelope: RevisionImpact['envelope'] = 'not-applicable'
  if (input.envelope)
    try {
      checkPlanEnvelope(proposed as DeliveryPlan, input.envelope as DeliveryEnvelope)
      envelope = 'within'
    } catch {
      envelope = 'outside'
    }
  const oldRoute = new Map(runnerRoute(current as DeliveryPlan).map((stage) => [stage.id, stage])),
    newRoute = runnerRoute(proposed as DeliveryPlan),
    work = (plan: Readonly<DeliveryPlan>, unit?: string) =>
      contractDigest(plan.work.find((entry) => entry.id === unit) ?? null),
    criterion = (plan: Readonly<DeliveryPlan>, ids: readonly string[]) =>
      contractDigest(ids.map((id) => plan.criteria.find((entry) => entry.id === id) ?? null)),
    milestone = (plan: Readonly<DeliveryPlan>, id?: string) =>
      contractDigest(plan.milestones.find((entry) => entry.id === id) ?? null),
    decided = new Map<string, RevisionImpact['stages'][number]>()
  const decide = (stage: RunnerStage): RevisionImpact['stages'][number] => {
    const known = decided.get(stage.id)
    if (known) return known
    const old = oldRoute.get(stage.id)
    let entry: RevisionImpact['stages'][number]
    if (!old) entry = { id: stage.id, decision: 'new', reason: 'stage-added' }
    else if (authority === 'requires-new-grant')
      entry = { id: stage.id, decision: 'invalidate', reason: 'authority-changed' }
    else if (contractDigest(old) !== contractDigest(stage))
      entry = { id: stage.id, decision: 'invalidate', reason: 'stage-definition-changed' }
    else if (stage.unit && work(current, stage.unit) !== work(proposed, stage.unit))
      entry = { id: stage.id, decision: 'invalidate', reason: 'work-changed' }
    else if (criterion(current, stage.criteria) !== criterion(proposed, stage.criteria))
      entry = { id: stage.id, decision: 'invalidate', reason: 'criteria-changed' }
    else if (
      stage.milestone &&
      milestone(current, stage.milestone) !== milestone(proposed, stage.milestone)
    )
      entry = { id: stage.id, decision: 'invalidate', reason: 'milestone-changed' }
    else if (
      !stage.unit &&
      !stage.milestone &&
      [
        'plan',
        'definition',
        'acceptance-definition',
        'acceptance',
        'publication',
        'ci',
        'merge',
        'handoff',
        'research',
        'observation',
      ].includes(stage.kind) &&
      contractDigest(current.criteria) !== contractDigest(proposed.criteria)
    )
      entry = { id: stage.id, decision: 'invalidate', reason: 'plan-criteria-changed' }
    else {
      const upstream = stage.after.map((id) => newRoute.find((item) => item.id === id))
      entry = upstream.some((item) => !item)
        ? { id: stage.id, decision: 'invalidate', reason: 'unknown-dependency' }
        : // Re-authorizing new plan bytes changes no other stage's declared inputs.
          upstream.some((item) => item && item.kind !== 'plan' && decide(item).decision !== 'reuse')
          ? { id: stage.id, decision: 'invalidate', reason: 'predecessor-invalidated' }
          : { id: stage.id, decision: 'reuse', reason: 'complete-inputs-unchanged' }
    }
    decided.set(stage.id, entry)
    return entry
  }
  // The plan stage always re-authorizes the new immutable bytes.
  for (const stage of newRoute)
    if (stage.kind === 'plan')
      decided.set(stage.id, { id: stage.id, decision: 'invalidate', reason: 'new-plan-bytes' })
  const stages = newRoute.map((stage) => decide(stage))
  const workers =
      input.state.run === current.run
        ? deliveryAttempts(input.state as DeliveryProjection)
            .records.filter((attempt) => ACTIVE.has(attempt.state))
            .map((attempt) => ({ attempt: attempt.id, action: 'fence-required' as const }))
        : [],
    effects = deliveryEffects(input.state as DeliveryProjection)
      .records.filter((effect) => ['prepared', 'pending', 'unknown'].includes(effect.status))
      .map((effect) => ({
        id: effect.intent.id,
        operation: effect.intent.operation,
        action: 'reconcile-required' as const,
      }))
  if (criteria.removed.length) reasons.push('criteria-removed')
  if (outcomes.removed.length) reasons.push('outcomes-removed')
  if (authority === 'requires-new-grant') reasons.push('authority-changed')
  if (envelope === 'outside') reasons.push('outside-envelope')
  if (
    deliveryRunner(input.state as DeliveryProjection).records.some((record) =>
      record.stages.some((stage) =>
        ['prepared', 'running', 'pending', 'unknown'].includes(stage.status),
      ),
    )
  )
    reasons.push('unresolved-stage')
  // Removing required outcomes or criteria is never automatic, even inside an envelope.
  const automatic =
    input.grant === 'envelope' &&
    envelope === 'within' &&
    !criteria.removed.length &&
    !outcomes.removed.length &&
    authority === 'unchanged' &&
    !reasons.some((reason) =>
      ['not-the-next-revision', 'previous-digest-mismatch', 'unresolved-stage'].includes(reason),
    )
  const adoption: RevisionImpact['adoption'] = automatic
    ? 'automatic-in-envelope'
    : current.policy.intervention === 'none'
      ? 'blocked'
      : 'operator-required'
  return {
    schema: 'wholeloop/delivery-revision-impact@1',
    run: current.run,
    current: { revision: current.revision, digest: contractDigest(current) },
    proposed: { revision: proposed.revision, digest: contractDigest(proposed) },
    criteria,
    outcomes,
    authority,
    envelope,
    stages,
    workers,
    effects,
    adoption,
    reasons,
  }
}

/**
 * Preview by default. Acceptance needs an operator and reason, separate approval
 * for removed outcomes or criteria, and never applies a blocked revision. It
 * writes only the immutable next revision and its adoption record; tracking the
 * revision still needs authority that covers it.
 */
export function reviseDelivery(
  lifecycle: DeliveryLifecycle,
  run: string,
  proposedValue: unknown,
  accept?: { operator: string; reason: string; approveRemovals: boolean },
) {
  const state = lifecycle.journal.view(run),
    planning = lifecycle.authority.planning
  if (state.basis.kind !== 'plan' && state.basis.kind !== 'envelope')
    throw new DeliveryRunnerError('revision-basis')
  const revision = state.basis.revision
  if (!revision) throw new DeliveryRunnerError('revision-current-plan-required')
  const current = planning.getPlan(run, revision).plan,
    source = planning.sources.get((proposedValue as { source?: string }).source ?? '')
  const proposed = validateDeliveryPlan(proposedValue, source),
    grant = state.grant ? lifecycle.authority.inspect(state.grant.id).grant : undefined,
    basis = grant?.basis.kind === 'envelope' ? 'envelope' : 'plan',
    impact = revisionImpact({
      state,
      current,
      proposed,
      ...(grant?.basis.kind === 'envelope'
        ? { envelope: planning.getEnvelope(grant.basis.digest).envelope }
        : {}),
      grant: basis,
    })
  if (!accept) return { impact, accepted: false as const }
  if (!accept.operator.trim() || !accept.reason.trim())
    throw new DeliveryRunnerError('revision-operator-and-reason')
  if (
    impact.reasons.some((reason) =>
      ['not-the-next-revision', 'previous-digest-mismatch', 'unresolved-stage'].includes(reason),
    )
  )
    throw new DeliveryRunnerError('revision-not-adoptable')
  if (impact.adoption === 'blocked')
    throw new DeliveryRunnerError('revision-blocked-outside-envelope')
  if ((impact.criteria.removed.length || impact.outcomes.removed.length) && !accept.approveRemovals)
    throw new DeliveryRunnerError('revision-removals-need-approval')
  const prepared = planning.preparePlan(proposed),
    record = {
      schema: 'wholeloop/delivery-revision@1' as const,
      run,
      revision: proposed.revision,
      digest: prepared.digest,
      previous: impact.current.digest,
      operator: accept.operator,
      reason: accept.reason,
      removalsApproved: accept.approveRemovals,
      impact: contractDigest(impact),
      authority: 'not-implied' as const,
    }
  safeSourceText(JSON.stringify(record), 65536)
  planning.sources.files.locked(() => {
    const path = `delivery/revisions/${run}/${proposed.revision}.json`
    if (existsSync(planning.sources.files.path(path)))
      throw new DeliveryRunnerError('revision-already-recorded')
    planning.sources.files.atomic(path, `${JSON.stringify(record)}\n`)
  })
  return { impact, accepted: true as const, record }
}
