import { findBudget } from '../delivery/budget-events.js'
import { deliveryEffects } from '../delivery/effect-events.js'
import type { DeliveryLifecycle } from '../delivery/lifecycle.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import { deliveryRunner } from './events.js'
import { DeliveryRunnerError } from './route.js'

const UNRESOLVED = ['prepared', 'running', 'pending', 'unknown']
/** Shared finite admission only; observing a failure never records a grant or dispatch. */
export function continuationContext(
  lifecycle: DeliveryLifecycle,
  run: string,
  input: { request: string; stage: string; unit: string },
  supported: boolean,
) {
  const state = lifecycle.journal.get(run),
    planning = lifecycle.authority.planning,
    revision = state.basis.revision
  if (state.basis.kind !== 'plan' || !revision)
    throw new DeliveryRunnerError('continuation-plan-basis')
  const current = planning.getPlan(run, revision),
    facet = deliveryRunner(state),
    record = facet.records.find((entry) => entry.request === input.request),
    stage = record?.stages.findLast(
      (entry) => entry.id === input.stage && entry.basis === current.digest,
    ),
    reasons: string[] = []
  if (!['failed', 'blocked'].includes(state.state)) reasons.push('run-not-failed-or-blocked')
  if (!record || !stage || !['failed', 'blocked'].includes(stage.status) || !stage.evidence)
    reasons.push('no-retained-failure')
  if (!supported) reasons.push('unsupported-failure-origin')
  if (record && ['active', 'unknown'].includes(record.ownership))
    reasons.push('predecessor-controller-not-released')
  if (facet.records.some((entry) => entry.stages.some((item) => UNRESOLVED.includes(item.status))))
    reasons.push('unresolved-stage')
  if (
    deliveryAttempts(state).records.some((attempt) =>
      ['claimed', 'started', 'stopping'].includes(attempt.state),
    )
  )
    reasons.push('active-attempt')
  if (
    deliveryEffects(state).records.some((effect) =>
      ['prepared', 'pending', 'unknown'].includes(effect.status),
    )
  )
    reasons.push('effects-need-reconciliation')
  const budget = findBudget(state),
    used = (budget?.counters.length ?? 0) + (facet.continuations?.length ?? 0)
  if (!budget?.limits || used >= budget.limits.integrationRepairs)
    reasons.push('repair-budget-exhausted')
  return { state, planning, revision, current, stage, reasons, budget, used }
}
