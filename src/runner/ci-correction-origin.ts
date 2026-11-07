// Keeps the last published CI origin across local corrections as historical ownership.
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { originalCiFailure } from './ci-failure.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

const stable = (plan: Readonly<DeliveryPlan>) => {
  const {
    schema: _schema,
    revision: _revision,
    previous: _previous,
    corrections: _corrections,
    ...basis
  } = plan
  return contractDigest(basis)
}
/**
 * Keep the last published CI origin across intermediate local QA corrections.
 * It is historical ownership, never a live remote head or current approval.
 * Requirements, repositories and policy cannot drift inside this repair lane.
 */
export function ciCorrectionOrigin(store: RunnerStore, plan: Readonly<DeliveryPlan>) {
  if (plan.schema !== 'wholeloop/delivery-plan@2') return undefined
  try {
    const entry = plan.corrections?.findLast((entry) => entry.origin === 'ci'),
      unit = plan.work.find((unit) => unit.id === entry?.unit)
    if (!entry || !unit?.repository) throw new Error('Original CI owner required')
    const proof = originalCiFailure(store, {
        request: entry.request,
        failure: entry.failure,
        repository: unit.repository,
      }),
      revision = store.lifecycle.journal
        .get(plan.run)
        .plans.find((value) => value.digest === proof.plan)?.revision,
      original = store.planning.getPlan(plan.run, revision ?? 0)
    if (original.digest !== proof.plan || stable(original.plan) !== stable(plan))
      throw new Error('Unchanged CI repair basis required')
    return { entry, proof, original }
  } catch {
    throw new DeliveryRunnerError('ci-correction-original-basis-unavailable')
  }
}
