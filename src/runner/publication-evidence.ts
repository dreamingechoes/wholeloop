// Marks a pull request as this run's own so another one is never edited.
import { contractDigest } from '../contracts/compatibility.js'
import { deliveryEffects, type EffectRecord } from '../delivery/effect-events.js'
import type { RunnerPublication } from './publication-stages.js'
import type { RunnerStore } from './store.js'

type Step = 'push' | 'create' | 'ready'
const ORDER: Step[] = ['push', 'create', 'ready']

/** The marker that makes a pull request this run's own; another one is never edited. */
export function publicationMarker(run: string, repository: string) {
  return `<!-- wholeloop-delivery: ${run} ${repository} -->`
}

export const publicationKey = (step: Step, repository: string) =>
  `publish-${step}-${contractDigest(repository).slice(0, 16)}`
export function publicationRecords(
  store: RunnerStore,
  run: string,
  binding: Readonly<RunnerPublication>,
) {
  const all = deliveryEffects(store.lifecycle.journal.view(run)).records
  return binding.targets.map((target) =>
    Object.fromEntries(
      ORDER.map((step) => [
        step,
        all.find(
          (record) =>
            record.intent.key === publicationKey(step, target.repository) &&
            record.intent.basis === binding.plan,
        ),
      ]),
    ),
  ) as Partial<Record<Step, EffectRecord>>[]
}
