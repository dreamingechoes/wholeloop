import { contractDigest } from '../contracts/compatibility.js'
import { findBudget } from '../delivery/budget-events.js'
import { deliveryEffects } from '../delivery/effect-events.js'
import { safeSourceText } from '../delivery/input.js'
import { type CiObservation, type CiPolicy, type CiVerdict, ciVerdict } from './ci-observations.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

export type CiFailureClass =
  | 'code-test'
  | 'infrastructure'
  | 'permissions'
  | 'policy'
  | 'stale'
  | 'unknown'
export interface CiFailure {
  check: string
  issuer: string | null
  state: string
  class: CiFailureClass
}
/** A PR comment is untrusted data with an identity; its text is never executed or parsed for commands. */
export interface CiComment {
  id: string
  author: string
  revision: string
  body: string
}
export interface CiFeedback {
  identity: string
  origin: 'pr-comment'
  revision: string
  current: boolean
  adopted: false
  reason: string
}
export interface CiRepairAdmission {
  pushes: number
  limit: number
  allowed: boolean
}
export interface CiRepairRequest {
  run: string
  candidate: string
  observation: string
  status: 'none' | 'pending' | 'repair' | 'blocked'
  reasons: string[]
  failures: CiFailure[]
  feedback: CiFeedback[]
  admission: CiRepairAdmission
}

/**
 * Pure classification of a verdict. Only an observed failure of a trusted check at
 * the candidate is a code or test failure. Infrastructure needs structured host
 * evidence, which no current host supplies, so a guess never dismisses a failure.
 */
export function classifyCiFailures(verdict: Readonly<CiVerdict>): CiFailure[] {
  const failures: CiFailure[] = verdict.checks
    .filter((check) => !['success', 'pending'].includes(check.state))
    .map((check) => ({
      check: check.name,
      issuer: check.issuer,
      state: check.state,
      class:
        check.state === 'failure'
          ? 'code-test'
          : check.state === 'stale'
            ? 'stale'
            : ['wrong-issuer', 'unknown-issuer'].includes(check.state)
              ? 'policy'
              : 'unknown',
    }))
  for (const reason of verdict.reasons)
    failures.push({
      check: `observation:${reason}`,
      issuer: null,
      state: reason,
      class:
        reason === 'unknown-protection'
          ? 'permissions'
          : reason === 'stale-pull-request-head'
            ? 'stale'
            : reason === 'empty-required-set'
              ? 'policy'
              : 'unknown',
    })
  return failures.sort((a, b) => a.check.localeCompare(b.check))
}

/** Comments keep their identity and revision; none is adopted without a decision policy for it. */
export function ciFeedback(comments: readonly CiComment[], candidate: string): CiFeedback[] {
  return comments
    .map((comment) => {
      safeSourceText(JSON.stringify(comment), 256 * 1024)
      return {
        identity: contractDigest({
          id: comment.id,
          author: comment.author,
          revision: comment.revision,
          body: comment.body,
        }),
        origin: 'pr-comment' as const,
        revision: comment.revision,
        current: comment.revision === candidate,
        adopted: false as const,
        reason:
          'Review feedback is untrusted input; adopting it needs a delegated decision this run does not hold.',
      }
    })
    .sort((a, b) => a.identity.localeCompare(b.identity))
}

/** Journal-derived, so a restart can never reset the initial-plus-one-repair push budget. */
export function ciRepairAdmission(store: RunnerStore, run: string): CiRepairAdmission {
  const state = store.lifecycle.journal.view(run),
    plan = store.planning.getPlan(run, state.basis.revision ?? 0).plan,
    pushes = deliveryEffects(state).records.filter(
      (record) => record.intent.operation === 'git.push' && record.invocation !== undefined,
    ).length
  // Plan revisions may tighten the run's original allowance, never replenish it.
  const limit = Math.min(
    plan.budgets.ciPushes,
    findBudget(state)?.limits?.ciPushes ?? plan.budgets.ciPushes,
  )
  return { pushes, limit, allowed: pushes < limit }
}

/** Pure: one typed request per observation; it authorizes nothing by itself. */
export function ciRepairRequest(input: {
  run: string
  observation: Readonly<CiObservation>
  policy: Readonly<CiPolicy>
  comments: readonly CiComment[]
  admission: Readonly<CiRepairAdmission>
}): CiRepairRequest {
  const verdict = ciVerdict(input.observation, input.policy),
    failures = classifyCiFailures(verdict),
    feedback = ciFeedback(input.comments, input.observation.candidate),
    reasons: string[] = []
  let status: CiRepairRequest['status'] = 'none'
  if (verdict.status === 'pending') status = 'pending'
  else if (verdict.status !== 'passed' || feedback.some((item) => item.current)) {
    const blocking = failures.filter((failure) => failure.class !== 'code-test')
    if (blocking.length) reasons.push('non-code-failure')
    if (feedback.some((item) => item.current)) reasons.push('unadopted-review-feedback')
    if (!failures.some((failure) => failure.class === 'code-test') && !blocking.length)
      reasons.push('no-repairable-failure')
    if (!input.admission.allowed) reasons.push('ci-push-budget-exhausted')
    status = reasons.length ? 'blocked' : 'repair'
  }
  return {
    run: input.run,
    candidate: input.observation.candidate,
    observation: contractDigest(input.observation),
    status,
    reasons,
    failures,
    feedback,
    admission: { ...input.admission },
  }
}

/** Retain each request content-addressed beside the run's CI observations. */
export function retainCiRepairRequest(store: RunnerStore, request: Readonly<CiRepairRequest>) {
  if (!/^delivery-[a-f0-9]{16}$/.test(request.run)) throw new DeliveryRunnerError('ci-repair-run')
  const body = `${JSON.stringify(request)}\n`,
    digest = contractDigest(request)
  safeSourceText(body, 4 * 1024 * 1024)
  store.files.atomic(`delivery/runner-ci-repairs/${request.run}/${digest}.json`, body)
  return digest
}
