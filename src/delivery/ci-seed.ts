import { ciCorrectionOrigin } from '../runner/ci-correction-origin.js'
import { RunnerStore } from '../runner/store.js'
import { ancestor } from '../worktrees/git.js'
import type { DeliveryLifecycle } from './lifecycle.js'
import type { DeliveryPlan } from './plan.js'

/**
 * A CI repair starts at the published whole-product head, which may include
 * integration commits beyond the unit's original topic. Local QA successors
 * retain the ordinary previous-unit seed, which already contains this root.
 * The caller must first audit that unit's original owned commit receipt.
 */
export function ciCorrectionSeed(
  lifecycle: DeliveryLifecycle,
  plan: Readonly<DeliveryPlan>,
  repository: DeliveryPlan['repositories'][number],
  originalUnitHead: string,
) {
  if (
    plan.schema !== 'wholeloop/delivery-plan@2' ||
    !plan.corrections?.some((entry) => entry.origin === 'ci' && entry.revision === plan.revision)
  )
    return undefined
  const origin = ciCorrectionOrigin(new RunnerStore(lifecycle.journal.files.root), plan),
    target = origin?.proof.targets.find((value) => value.repository === repository.id)
  if (
    !origin ||
    origin.proof.plan !== plan.previous ||
    !target ||
    !ancestor(repository.root, originalUnitHead, target.head)
  )
    throw new Error('workspace-ci-seed-original-publication')
  return target.head
}
