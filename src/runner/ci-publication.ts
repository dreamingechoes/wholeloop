import type { DeliveryPlan } from '../delivery/plan.js'
import { ancestor } from '../worktrees/git.js'
import { ciCorrectionOrigin } from './ci-correction-origin.js'
import { publicationMarker } from './publication-evidence.js'
import type {
  RunnerPublication,
  RunnerPublicationTarget,
  RunnerPullRequest,
} from './publication-stages.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

/** Preserve every original topic and PR; only fresh accepted candidate heads change. */
export function ciPublicationTargets(
  store: RunnerStore,
  plan: Readonly<DeliveryPlan>,
  targets: RunnerPublicationTarget[],
) {
  if (plan.schema !== 'wholeloop/delivery-plan@2') return targets
  const origin = ciCorrectionOrigin(store, plan)
  if (!origin || targets.length !== origin.proof.targets.length)
    throw new DeliveryRunnerError('ci-publication-original-targets')
  return targets.map((target) => {
    const original = origin.proof.targets.find((value) => value.repository === target.repository)
    if (
      !original ||
      original.remote !== target.remote ||
      original.base !== target.base ||
      original.head === target.head ||
      !ancestor(target.path, original.head, target.head)
    )
      throw new DeliveryRunnerError('ci-publication-original-targets')
    return { ...target, branch: original.branch }
  })
}

export function ciPublicationOrigin(
  store: RunnerStore,
  run: string,
  publication: Readonly<RunnerPublication>,
  target: RunnerPublicationTarget,
) {
  const state = store.lifecycle.journal.get(run),
    basis = store.planning.getPlan(run, state.basis.revision ?? 0)
  if (basis.plan.schema !== 'wholeloop/delivery-plan@2') return undefined
  if (basis.digest !== publication.plan)
    throw new DeliveryRunnerError('ci-publication-current-basis')
  const expected = ciPublicationTargets(store, basis.plan, [...publication.targets]),
    bound = expected.find((value) => value.repository === target.repository),
    origin = ciCorrectionOrigin(store, basis.plan),
    original = origin?.proof.targets.find((value) => value.repository === target.repository)
  if (
    !bound ||
    !original ||
    bound.branch !== target.branch ||
    bound.base !== target.base ||
    bound.remote !== target.remote ||
    bound.head !== target.head ||
    bound.path !== target.path
  )
    throw new DeliveryRunnerError('ci-publication-original-targets')
  return { basis, origin, original }
}

/** The fixed publication reader shares the writer's original-topic selector. */
export function ciPublishedTarget(
  store: RunnerStore,
  run: string,
  publication: Readonly<RunnerPublication>,
  target: RunnerPublicationTarget,
  listed: RunnerPullRequest[],
) {
  const origin = ciPublicationOrigin(store, run, publication, target),
    mine = listed.filter(
      (pr) =>
        pr.branch === target.branch &&
        pr.base === target.base &&
        pr.body.includes(publicationMarker(run, target.repository)) &&
        pr.state === 'open',
    ),
    [pr] = mine
  if (
    mine.length !== 1 ||
    !pr ||
    pr.sha !== target.head ||
    (origin && (pr.url !== origin.original.pr || (publication.ready && pr.draft)))
  )
    return undefined
  // A copied marker or replacement PR is not the original resource whose
  // publication and CI failure licensed this correction.
  return { ...target, pr: pr.url }
}
