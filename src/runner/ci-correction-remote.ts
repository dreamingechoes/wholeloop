import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { type CiFeedbackRead, validateCiFeedback } from './ci-feedback.js'
import { publicationMarker } from './publication-evidence.js'
import type { RunnerCodeHost, RunnerPublicationTarget } from './publication-stages.js'
import { DeliveryRunnerError } from './route.js'

export interface CiCorrectionSnapshot {
  repository: string
  head: string
  pr: { url: string; branch: string; base: string; sha: string; draft: boolean; state: string }
  feedback: CiFeedbackRead
}
export const ciCorrectionSnapshotDigest = (values: CiCorrectionSnapshot[]) =>
  contractDigest(
    values.map(({ feedback, ...facts }) => ({ ...facts, feedback: feedback.evidence })),
  )

/** One bounded exact-head read. The caller needs consecutive stable snapshots. */
export async function readCiCorrectionTarget(input: {
  run: string
  repository: DeliveryPlan['repositories'][number]
  target: Readonly<RunnerPublicationTarget>
  pr: string
  host: RunnerCodeHost
  signal: AbortSignal
  since: string
  now(): string
  current(): void
}): Promise<CiCorrectionSnapshot> {
  const { run, repository, target, host, signal, current } = input
  current()
  if (!host.readFeedback || host.provenance !== 'host-observed')
    throw new DeliveryRunnerError('ci-admission-host-required')
  const head = await host.remoteHead(target, signal)
  current()
  if (head !== target.head) throw new DeliveryRunnerError('ci-admission-remote-head-changed')
  const open = (await host.pullRequests(target, signal)).filter((value) => value.state === 'open'),
    [pr] = open
  current()
  if (
    open.length !== 1 ||
    !pr ||
    pr.url !== input.pr ||
    pr.branch !== target.branch ||
    pr.base !== target.base ||
    pr.sha !== target.head ||
    pr.draft ||
    !pr.body.includes(publicationMarker(run, target.repository))
  )
    throw new DeliveryRunnerError('ci-admission-owned-pr-required')
  const observedPr = {
      url: pr.url,
      branch: pr.branch,
      base: pr.base,
      sha: pr.sha,
      draft: pr.draft,
      state: pr.state,
    },
    feedback = structuredClone(await host.readFeedback(target, input.pr, signal))
  current()
  validateCiFeedback(feedback)
  const at = Date.parse(feedback.observedAt),
    now = Date.parse(input.now())
  if (
    feedback.provenance !== 'host-observed' ||
    feedback.repository !== repository.remote?.url ||
    feedback.pr !== input.pr ||
    feedback.head !== target.head ||
    feedback.base !== target.base ||
    feedback.observedAt < input.since ||
    at > now ||
    now - at > 60000
  )
    throw new DeliveryRunnerError('ci-admission-feedback-binding')
  return { repository: target.repository, head, pr: observedPr, feedback }
}

/** No feedback item is adopted by this read; changed or incomplete facts block a push. */
export async function stableCiCorrectionTarget(
  input: Parameters<typeof readCiCorrectionTarget>[0],
) {
  let previous: CiCorrectionSnapshot | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    const value = await readCiCorrectionTarget(input)
    if (value.feedback.items.some((item) => item.current))
      throw new DeliveryRunnerError('ci-admission-unadopted-feedback')
    if (previous && ciCorrectionSnapshotDigest([previous]) === ciCorrectionSnapshotDigest([value]))
      return value
    previous = value
  }
  throw new DeliveryRunnerError('ci-admission-observation-changed')
}
