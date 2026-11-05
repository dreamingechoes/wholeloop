import type { DeliveryCorrection } from '../delivery/plan.js'
import { originalCiFailure } from './ci-failure.js'
import type { RunnerCorrectionFeedback } from './correction-stages.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

/** Only fixed historical check facts enter a repair task, never raw PR text or private paths. */
export function ciCorrectionFeedback(
  store: RunnerStore,
  entry: DeliveryCorrection,
): RunnerCorrectionFeedback {
  const request = store.get(entry.request),
    basis = store.planning.getPlan(request.run, request.revision),
    repository = basis.plan.work.find((value) => value.id === entry.unit)?.repository
  if (entry.origin !== 'ci' || entry.stage !== 'ci' || !repository)
    throw new DeliveryRunnerError('correction-ci-feedback-binding')
  const proof = originalCiFailure(store, {
    request: entry.request,
    failure: entry.failure,
    repository,
  })
  return {
    origin: 'ci',
    stage: entry.stage,
    failure: entry.failure,
    reason:
      'Correct the original retained required code-test failures; historical feedback supplies no current approval.',
    cases: [],
    ci: {
      historical: true,
      observation: proof.observation,
      repair: proof.repair,
      publication: proof.publication,
      head: proof.target.head,
      failures: structuredClone(proof.failures),
    },
  }
}
