import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { StateStore } from '../state/store.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerReviewStages } from './review-stages.js'
import type { RunnerRequest } from './store.js'
import { RunnerVerificationStages } from './verification-stages.js'

type Reader = RunnerVerificationStages | RunnerReviewStages
const unavailable = () => ({
  status: 'unavailable' as const,
  reason: 'Original current actionable failure evidence is unavailable.',
  repairDispatch: 'not-authorized' as const,
  limits: 'unchanged' as const,
})
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ')

export interface RepairFinding {
  unit: string
  id: string
  location: string
  text: string
  evidence: string[]
}
export interface RepairCommand {
  ref: string
  exitCode: number
  signal: string
  diagnostic: string
}
export function knownSuiteFailure(commands: readonly RepairCommand[]) {
  // A signal or missing exit is interruption evidence, not a code-failure
  // diagnosis. The fixed reader must establish provenance before this check.
  return (
    commands.length > 0 &&
    commands.every(
      (command) =>
        !command.signal &&
        Number.isInteger(command.exitCode) &&
        command.exitCode >= 0 &&
        command.exitCode <= 255,
    ) &&
    commands.some((command) => command.exitCode > 0)
  )
}

export function repairFailureFingerprint(input: {
  category: 'suite-failure' | 'review-findings' | 'verification-findings'
  unit: string
  commands: readonly RepairCommand[]
  findings: readonly RepairFinding[]
}) {
  return contractDigest({
    category: input.category,
    unit: input.unit,
    commands: [...input.commands].sort((a, b) => a.ref.localeCompare(b.ref)),
    // Retry-specific IDs and candidate/round identities cannot manufacture
    // progress when the same observed diagnostic and finding substance recur.
    findings: input.findings
      .map((finding) => ({
        unit: finding.unit,
        location: normalize(finding.location),
        text: normalize(finding.text),
        evidence: [...finding.evidence].sort(),
      }))
      .sort((a, b) => contractDigest(a).localeCompare(contractDigest(b))),
  })
}

/** Read-only failure facts are input to repair, never permission to launch it. */
export async function runnerRepairFeedback(
  reader: Reader,
  request: Readonly<RunnerRequest>,
  record: Readonly<RunnerStageRecord>,
) {
  if (!(reader instanceof RunnerVerificationStages || reader instanceof RunnerReviewStages))
    return unavailable()
  try {
    const observation = await reader.inspect(request, record)
    if (
      observation.status !== 'blocked' ||
      observation.provenance !== 'host-observed' ||
      observation.invocationState !== 'stopped'
    )
      return unavailable()
    const prefix =
        reader instanceof RunnerVerificationStages ? 'runner-verifications' : 'runner-reviews',
      binding = JSON.parse(
        readSourceFile(
          reader.store.files.root,
          `delivery/${prefix}/${record.invocation}.json`,
          65536,
        ),
      ) as {
        run: string
        round: number
        gate: string
        unit: string
        workspace: string
        deadline: string
      },
      events = new StateStore(reader.store.files.root).events(),
      round = gateRuns(events)
        .find((run) => run.run === binding.run)
        ?.rounds.at(-1)
    if (
      !round?.decision ||
      round.plan.round !== binding.round ||
      contractDigest(round.plan) !== binding.gate ||
      !round.decision.report.unchanged ||
      round.decision.report.verdict === 'PASS' ||
      workspaceSnapshot(binding.workspace).digest !== round.plan.snapshot.digest
    )
      return unavailable()
    const candidate = new RunnerGitStages(reader.store).candidate(request, binding.unit)
    if (candidate.receipt.head !== round.plan.snapshot.head) return unavailable()
    const report = round.decision.report,
      failedSuite = round.results.some(
        (result) =>
          result.unit === 'suite' &&
          result.status === 'ok' &&
          result.execution?.status === 'failed',
      ),
      suite = failedSuite
        ? events.findLast(
            (event) =>
              event.type === 'verify.suite-finished' &&
              event.data.run === binding.run &&
              event.data.round === binding.round,
          )
        : undefined
    if (failedSuite && suite?.type !== 'verify.suite-finished') return unavailable()
    if (!failedSuite && (report.missing.length || !report.kept.length)) return unavailable()
    const findings = report.kept
        .map((entry) => ({
          unit: entry.unit,
          id: entry.finding.id,
          location: entry.finding.location,
          text: entry.finding.text,
          evidence: [...entry.finding.evidence].sort(),
        }))
        .sort((a, b) => `${a.unit}:${a.id}`.localeCompare(`${b.unit}:${b.id}`)),
      commands =
        suite?.type === 'verify.suite-finished'
          ? suite.data.result.commands
              .map((command) => ({
                ref: command.ref,
                exitCode: command.exitCode,
                signal: command.signal,
                diagnostic: contractDigest({
                  stdout: normalize(command.stdout),
                  stderr: normalize(command.stderr),
                }),
              }))
              .sort((a, b) => a.ref.localeCompare(b.ref))
          : [],
      category = failedSuite
        ? 'suite-failure'
        : round.plan.gate === 'review'
          ? 'review-findings'
          : 'verification-findings',
      fingerprint = repairFailureFingerprint({ category, unit: binding.unit, commands, findings })
    if (
      failedSuite &&
      (!knownSuiteFailure(commands) ||
        suite?.type !== 'verify.suite-finished' ||
        suite.data.result.status !== 'failed' ||
        !suite.data.result.unchanged)
    )
      return unavailable()
    return {
      status: report.verdict === 'EXHAUSTED' ? ('exhausted' as const) : ('actionable' as const),
      category,
      fingerprint,
      findings,
      commands,
      origin: {
        request: contractDigest(request),
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        unit: binding.unit,
        candidate: candidate.receipt.head,
        commit: candidate.receipt.digest,
        gate: binding.gate,
        run: binding.run,
        round: binding.round,
        deadline: binding.deadline,
        observation: observation.evidence,
      },
      provenance: 'host-observed' as const,
      repairDispatch: 'not-authorized' as const,
      limits: 'unchanged' as const,
    }
  } catch {
    // Corrupt, stale or incomplete original observations cannot be converted
    // into actionable feedback, even if some earlier report looked negative.
    return unavailable()
  }
}
