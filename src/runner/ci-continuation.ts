// Previews or records a continuation from one original CI failure.
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { safeSourceText } from '../delivery/input.js'
import type { DeliveryLifecycle } from '../delivery/lifecycle.js'
import { type DeliveryPlan, validateDeliveryPlan } from '../delivery/plan.js'
import { originalCiFailure } from './ci-failure.js'
import { ciRepairAdmission } from './ci-repair.js'
import { continuationContext } from './continuation-context.js'
import { revisionImpact } from './revision-impact.js'
import { DeliveryRunnerError } from './route.js'
import { RunnerStore } from './store.js'

/**
 * Preview/record a new exact-plan proposal from one original CI failure.
 * Historical feedback is not current host admission: execution must separately
 * verify fresh feedback, the original owned remote head and the new grant.
 */
export function continueCiDelivery(
  lifecycle: DeliveryLifecycle,
  run: string,
  input: { request: string; unit: string },
  accept?: { operator: string; reason: string; authority?: 'envelope-grant' },
) {
  const { state, planning, revision, current, stage, reasons, budget, used } = continuationContext(
      lifecycle,
      run,
      { ...input, stage: 'ci' },
      true,
    ),
    store = new RunnerStore(lifecycle.journal.files.root, lifecycle.journal.now),
    unit = current.plan.work.find((entry) => entry.id === input.unit),
    pushes = ciRepairAdmission(store, run)
  let proof: ReturnType<typeof originalCiFailure> | undefined
  try {
    if (!unit?.repository || unit.role === 'research') throw new Error('Original CI unit required')
    proof = originalCiFailure(store, {
      request: input.request,
      failure: stage?.evidence ?? '',
      repository: unit.repository,
    })
    if (proof.plan !== current.digest) throw new Error('Current original CI plan required')
  } catch {
    reasons.push('original-ci-failure-unavailable')
  }
  if (!pushes.allowed) reasons.push('ci-push-budget-exhausted')
  const correction = {
      unit: input.unit,
      origin: 'ci' as const,
      revision: revision + 1,
      request: input.request,
      stage: 'ci',
      failure: stage?.evidence ?? '0'.repeat(64),
    },
    proposed: DeliveryPlan = {
      ...structuredClone(current.plan),
      schema: 'wholeloop/delivery-plan@2',
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
    schema: 'wholeloop/delivery-ci-continuation-admission@1' as const,
    run,
    predecessor: input.request,
    stage: 'ci' as const,
    unit: input.unit,
    origin: 'ci' as const,
    failure: stage?.evidence ?? null,
    repairs: { used, limit: budget?.limits?.integrationRepairs ?? 0 },
    pushes,
    proof: proof
      ? {
          publication: proof.publication,
          observation: proof.observation,
          repair: proof.repair,
          candidate: proof.target.head,
        }
      : null,
    status: reasons.length ? ('refused' as const) : ('admissible' as const),
    reasons,
    authority: 'new-exact-plan-grant-required' as const,
    execution: 'fresh-feedback-and-remote-head-preflight-required' as const,
    composition: 'installed-sdk-controller-required' as const,
  }
  if (!accept) return { admission, impact: impact ?? null, accepted: false as const }
  if (!accept.operator.trim() || !accept.reason.trim())
    throw new DeliveryRunnerError('continuation-operator-and-reason')
  if (reasons.length || !impact || !proof)
    throw new DeliveryRunnerError('continuation-not-admissible')
  const prepared = planning.preparePlan(proposed),
    receipt = {
      schema: 'wholeloop/delivery-ci-continuation@1' as const,
      run,
      revision: proposed.revision,
      digest: prepared.digest,
      previous: current.digest,
      correction,
      operator: accept.operator,
      reason: accept.reason,
      impact: contractDigest(impact),
      // ADR-0248: the controller itself continues a none run under its own envelope grant;
      // DeliveryLifecycle.track admits that grant only with this mark.
      authority:
        accept.authority === 'envelope-grant'
          ? ('envelope-grant-continuation' as const)
          : admission.authority,
      execution: admission.execution,
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
