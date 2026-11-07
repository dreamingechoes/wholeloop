// Continues a delivery after a retained failure through a correction revision (ADR-0197).
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { safeSourceText } from '../delivery/input.js'
import type { DeliveryLifecycle } from '../delivery/lifecycle.js'
import { type DeliveryPlan, validateDeliveryPlan } from '../delivery/plan.js'
import { continuationContext } from './continuation-context.js'
import { revisionImpact } from './revision-impact.js'
import { DeliveryRunnerError } from './route.js'

export interface ContinuationInput {
  request: string
  stage: string
  unit: string
}

/**
 * Preview by default (ADR-0197). A correction revision names one retained failed
 * or blocked integration or acceptance observation and the unit that owns the
 * repair. Accepting it records the immutable next revision only: the run is
 * reopened by tracking that revision under a new exact-plan grant, and the
 * reducer refuses any older or envelope grant.
 */
export function continueDelivery(
  lifecycle: DeliveryLifecycle,
  run: string,
  input: ContinuationInput,
  accept?: { operator: string; reason: string },
) {
  const origin =
    input.stage === 'acceptance'
      ? ('acceptance' as const)
      : input.stage.startsWith('integration:')
        ? ('integration' as const)
        : undefined
  const { state, planning, revision, current, stage, reasons, budget, used } = continuationContext(
    lifecycle,
    run,
    input,
    origin !== undefined,
  )
  const correction = {
      unit: input.unit,
      origin: origin ?? ('integration' as const),
      ...(current.plan.schema === 'wholeloop/delivery-plan@2' ? { revision: revision + 1 } : {}),
      request: input.request,
      stage: input.stage,
      failure: stage?.evidence ?? '0'.repeat(64),
    },
    proposed: DeliveryPlan = {
      ...structuredClone(current.plan),
      revision: revision + 1,
      previous: current.digest,
      corrections: [...(current.plan.corrections ?? []), correction],
    }
  let impact: ReturnType<typeof revisionImpact> | undefined
  try {
    validateDeliveryPlan(proposed, planning.sources.get(current.plan.source))
    impact = revisionImpact({ state, current: current.plan, proposed, grant: 'plan' })
  } catch {
    reasons.push('invalid-correction')
  }
  const admission = {
    schema: 'wholeloop/delivery-continuation-admission@1' as const,
    run,
    predecessor: input.request,
    stage: input.stage,
    unit: input.unit,
    origin: origin ?? null,
    failure: stage?.evidence ?? null,
    repairs: { used, limit: budget?.limits?.integrationRepairs ?? 0 },
    status: reasons.length ? ('refused' as const) : ('admissible' as const),
    reasons,
    authority: 'new-exact-plan-grant-required' as const,
  }
  if (!accept) return { admission, impact: impact ?? null, accepted: false as const }
  if (!accept.operator.trim() || !accept.reason.trim())
    throw new DeliveryRunnerError('continuation-operator-and-reason')
  if (reasons.length || !impact) throw new DeliveryRunnerError('continuation-not-admissible')
  const prepared = planning.preparePlan(proposed),
    receipt = {
      schema:
        current.plan.schema === 'wholeloop/delivery-plan@2'
          ? ('wholeloop/delivery-continuation@2' as const)
          : ('wholeloop/delivery-continuation@1' as const),
      run,
      revision: proposed.revision,
      digest: prepared.digest,
      previous: current.digest,
      correction,
      operator: accept.operator,
      reason: accept.reason,
      impact: contractDigest(impact),
      authority: 'new-exact-plan-grant-required' as const,
    }
  safeSourceText(JSON.stringify(receipt), 65536)
  planning.sources.files.locked(() => {
    const path = `delivery/continuations/${run}/${proposed.revision}.json`
    if (existsSync(planning.sources.files.path(path)))
      throw new DeliveryRunnerError('continuation-already-recorded')
    planning.sources.files.atomic(path, `${JSON.stringify(receipt)}\n`)
  })
  return { admission, impact, accepted: true as const, record: receipt }
}
