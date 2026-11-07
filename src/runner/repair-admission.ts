// Journals a repair's failure admission before a separate correction dispatch.
import { contractDigest } from '../contracts/compatibility.js'
import type { BudgetFailure } from '../delivery/budget-events.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerNativeScope } from './native-scope.js'
import { runnerRepairFeedback } from './repair-feedback.js'
import { exhaustRepeatedRunnerRepair } from './repair-progress.js'
import { RunnerReviewStages } from './review-stages.js'
import { runnerRoute } from './route.js'
import { RunnerVerificationStages } from './verification-stages.js'

const REPAIR_EFFECTS = ['report.write', 'code.write', 'git.commit', 'test.run'] as const
type Reader = RunnerVerificationStages | RunnerReviewStages
const blocked = (reason: string) => ({
  status: 'blocked' as const,
  reason,
  repairDispatch: 'not-performed' as const,
})

/** Journal original failure admission before a separate one-shot correction dispatch. */
export async function admitRunnerRepair(reader: Reader, context: RunnerStageContext) {
  if (!(reader instanceof RunnerVerificationStages || reader instanceof RunnerReviewStages))
    return blocked('fixed-qa-reader-required')
  try {
    const store = reader.store,
      request = contractDigest(context.request),
      basis = store.basis(context.request),
      record = store.stage(request, context.stage.id),
      selected = runnerRoute(basis.plan).find((stage) => stage.id === context.stage.id),
      grant = store.lifecycle.authority.inspect(context.request.grant)
    if (
      !record ||
      record.invocation !== context.invocation ||
      record.basis !== basis.digest ||
      contractDigest(context.plan) !== basis.digest ||
      contractDigest(context.stage) !== contractDigest(selected) ||
      !['verification', 'review'].includes(context.stage.kind) ||
      !['prepared', 'running'].includes(record.status)
    )
      return blocked('original-active-qa-stage-required')
    if (
      basis.plan.policy.intervention !== 'none' ||
      grant.status !== 'active' ||
      !REPAIR_EFFECTS.every((effect) => grant.grant.effects.includes(effect))
    )
      return blocked('explicit-unattended-repair-authority-required')
    const current = () =>
      !context.signal.aborted &&
      context.current() &&
      Number.isFinite(Date.parse(context.deadline)) &&
      Date.parse(context.deadline) > Date.now()
    if (!current()) return blocked('original-repair-window-unavailable')
    const feedback = await runnerRepairFeedback(reader, context.request, record)
    if (feedback.status !== 'actionable')
      return blocked(
        feedback.status === 'exhausted'
          ? 'original-gate-budget-exhausted'
          : 'original-actionable-failure-required',
      )
    if (Date.parse(context.deadline) > Date.parse(feedback.origin.deadline))
      return blocked('original-repair-deadline-cannot-extend')
    if (!current()) return blocked('original-repair-window-unavailable')
    const failure: BudgetFailure = {
      key: `repair-${contractDigest({ invocation: record.invocation, gate: feedback.origin.gate, candidate: feedback.origin.candidate })}`,
      role: context.stage.kind,
      category: 'failed-behavior',
      candidate: feedback.origin.commit,
      findings: [feedback.fingerprint],
      evidence: feedback.origin.observation,
      provenance: 'host-observed',
    }
    // This idempotent journal entry accounts for the same observed failure once.
    // It is not an attempt, progress event, renewed deadline or dispatch claim.
    const budget = store.budgets.failure(context.request.run, failure)
    if (budget.problem) return blocked(budget.problem)
    if (
      exhaustRepeatedRunnerRepair(store, {
        run: context.request.run,
        role: context.stage.kind,
        fingerprint: feedback.fingerprint,
        limit: budget.limits?.noProgress ?? basis.plan.budgets.noProgress,
        evidence: feedback.origin.observation,
      })
    )
      return blocked('repeated-repair-no-progress')
    if (!current()) return blocked('original-repair-window-unavailable')
    const candidate = new RunnerGitStages(store).candidate(
        context.request,
        feedback.origin.unit,
        reader.options.correction,
      ),
      calls = new RunnerNativeScope(store.files, record.invocation).inspect()
    if (
      candidate.receipt.digest !== feedback.origin.commit ||
      calls.some((call) => !['stopped', 'not-started'].includes(call.observed.invocationState))
    )
      return blocked('original-failure-candidate-or-invoker-changed')
    return {
      status: 'admitted' as const,
      failure: failure.key,
      feedback,
      deadline: context.deadline,
      repairDispatch: 'not-performed' as const,
    }
  } catch {
    // Metadata may have committed before an interruption. Its original stable
    // key makes a later admission idempotent; it never grants a second worker.
    return blocked('original-repair-admission-unavailable')
  }
}
