import { contractDigest } from '../contracts/compatibility.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import type { RunnerStageObservation } from './engine.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerReviewStages } from './review-stages.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'
import { RunnerVerificationStages } from './verification-stages.js'

export interface RunnerUnitReadinessResult {
  status: 'ready' | 'blocked' | 'unknown'
  unit?: string
  candidate?: { commit: string; head: string; workspace: string }
  evidence: string
  provenance: 'fixture' | 'host-observed'
  acceptance: 'not-established'
  reason: string
}

/** Unit QA is current only when both original gates still attest the same owned head. */
export class RunnerUnitReadiness {
  readonly store: RunnerStore
  constructor(
    readonly verification: RunnerVerificationStages,
    readonly review: RunnerReviewStages,
  ) {
    if (
      !(verification instanceof RunnerVerificationStages) ||
      !(review instanceof RunnerReviewStages) ||
      verification.store.files.root !== review.store.files.root ||
      contractDigest(verification.options.identity) !== contractDigest(review.options.identity)
    )
      throw new DeliveryRunnerError('unit-readiness-fixed-readers-required')
    this.store = verification.store
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    unit: string,
  ): Promise<RunnerUnitReadinessResult> {
    const digest = contractDigest(request),
      proofs: unknown[] = [],
      unavailable = (status: 'blocked' | 'unknown', reason: string): RunnerUnitReadinessResult => ({
        status,
        evidence: contractDigest({ request: digest, unit, proofs, reason }),
        provenance: 'fixture',
        acceptance: 'not-established',
        reason,
      })
    try {
      this.store.get(digest)
      const basis = this.store.basis(request),
        route = runnerRoute(basis.plan),
        verifyStage = route.find((stage) => stage.id === `verification:${unit}`),
        reviewStage = route.find((stage) => stage.id === `review:${unit}`),
        reentryStage = route.find((stage) => stage.id === `reverification:${unit}`),
        reentry = this.store.stage(digest, `reverification:${unit}`),
        reviewed = this.store.stage(digest, `review:${unit}`),
        // After a passed re-entry, only it may attest the reviewed head.
        verified =
          reentry?.status === 'passed' &&
          reentry.basis === basis.digest &&
          reentryStage?.kind === 'verification' &&
          reviewStage &&
          reentryStage.after.includes(reviewStage.id)
            ? reentry
            : this.store.stage(digest, `verification:${unit}`)
      if (
        !basis.plan.work.some((work) => work.id === unit && work.role !== 'research') ||
        verifyStage?.kind !== 'verification' ||
        reviewStage?.kind !== 'review' ||
        !reviewStage.after.includes(verifyStage.id) ||
        verified?.basis !== basis.digest ||
        reviewed?.basis !== basis.digest ||
        verified.status !== 'passed' ||
        reviewed.status !== 'passed'
      )
        return unavailable('blocked', 'original-unit-stages-not-complete')
      const correction = this.review.options.correction ?? this.verification.options.correction,
        current = () => {
          const candidate = new RunnerGitStages(this.store).candidate(request, unit, correction)
          return {
            commit: candidate.receipt.digest,
            head: candidate.receipt.head,
            workspace: candidate.allocation.digest,
            snapshot: workspaceSnapshot(candidate.allocation.repository.path).digest,
          }
        },
        before = current(),
        observations = [
          await this.verification.inspect(request, verified),
          await this.review.inspect(request, reviewed),
        ]
      proofs.push({ basis: basis.digest, verified, reviewed, candidate: before, observations })
      // Each reader reopens its captured outputs. Recheck the candidate and
      // root records after those awaits; old stage flags cannot bless a new head.
      if (
        contractDigest(current()) !== contractDigest(before) ||
        this.store.basis(request).digest !== basis.digest ||
        contractDigest(this.store.stage(digest, verified.id)) !== contractDigest(verified) ||
        contractDigest(this.store.stage(digest, reviewed.id)) !== contractDigest(reviewed)
      )
        return unavailable('unknown', 'unit-readiness-changed-during-observation')
      const passed = (observation: RunnerStageObservation) =>
        observation.status === 'passed' &&
        observation.invocationState === 'stopped' &&
        observation.provenance === 'host-observed'
      if (!observations.every(passed))
        return unavailable(
          observations.some((observation) => ['failed', 'blocked'].includes(observation.status))
            ? 'blocked'
            : 'unknown',
          'original-current-unit-qa-not-established',
        )
      return {
        status: 'ready',
        unit,
        candidate: { commit: before.commit, head: before.head, workspace: before.workspace },
        evidence: contractDigest({ request: digest, unit, proofs }),
        provenance: 'host-observed',
        acceptance: 'not-established',
        reason:
          'The exact current owned unit passed original verification and independent review; feature acceptance remains separate.',
      }
    } catch {
      // Raw filesystem, provider or worker text is not an operator-safe reason.
      return unavailable('unknown', 'original-unit-qa-observation-unavailable')
    }
  }
}
