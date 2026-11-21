// Absolute budgets apply before live calibration; missing baseline evidence can never become a pass.
import type { ExperienceReport } from './report.js'
import { object } from './transcript.js'

export const EXPERIENCE_STEPS = [
  'research',
  'frame-problem',
  'write-spec',
  'cut-scopes',
  'slice-work',
  'build-slice',
] as const
export interface CalibratedBudget {
  inputTokens: number
  outputTokens: number
  firstQuestionOrPlanMs: number
  toolCalls: number
  wallMs: number
}
export type ExperienceBaseline = Record<string, CalibratedBudget>

export function experienceBaseline(value: unknown): ExperienceBaseline {
  if (!object(value)) throw new Error('Invalid experience baseline')
  for (const [key, budget] of Object.entries(value)) {
    if (
      !/^(codex|claude)\/(research|frame-problem|write-spec|cut-scopes|slice-work|build-slice)$/.test(
        key,
      ) ||
      !object(budget) ||
      !['inputTokens', 'outputTokens', 'firstQuestionOrPlanMs', 'toolCalls', 'wallMs'].every(
        (field) =>
          typeof budget[field] === 'number' &&
          Number.isSafeInteger(budget[field]) &&
          Number(budget[field]) >= 0,
      )
    )
      throw new Error(`Invalid experience budget: ${key}`)
  }
  return value as ExperienceBaseline
}

export function experienceFailures(
  report: ExperienceReport,
  baseline?: ExperienceBaseline,
): string[] {
  const failures: string[] = []
  const limit = report.step === 'research' ? 180000 : report.step === 'build-slice' ? null : 300000
  if (report.exitCode !== 0) failures.push('Client did not exit successfully')
  if (!EXPERIENCE_STEPS.includes(report.step as (typeof EXPERIENCE_STEPS)[number]))
    failures.push('Unknown experience step')
  if (limit !== null && report.wallMs > limit) failures.push(`Wall time exceeds ${limit}ms`)
  if (report.step === 'research' && report.workers > 3)
    failures.push('Research exceeds three workers')
  if (report.tokens === null) failures.push('Token usage not observed')
  if (report.firstQuestionOrPlanMs === null) failures.push('First question or plan not observed')
  if (report.finalLines === null || report.finalLines > 25)
    failures.push('Final answer missing or exceeds 25 lines')
  if (report.rawJson) failures.push('Raw JSON shown')
  if (report.bannedTerms.length)
    failures.push(`Internal terms shown: ${report.bannedTerms.join(', ')}`)
  if (report.unchosenSources.length)
    failures.push(`Unchosen sources: ${report.unchosenSources.join(', ')}`)
  if (report.fixedSleeps) failures.push('Fixed sleeps observed')
  for (const [question, asked] of Object.entries(report.questions))
    if (!asked) failures.push(`Question not asked: ${question}`)
  failures.push(...report.diagnostics)
  const calibrated = baseline?.[`${report.client}/${report.step}`]
  if (!calibrated) failures.push('Live baseline calibration pending')
  else {
    if (report.tokens && report.tokens.input > calibrated.inputTokens)
      failures.push('Input tokens exceed baseline')
    if (report.tokens && report.tokens.output > calibrated.outputTokens)
      failures.push('Output tokens exceed baseline')
    if (
      report.firstQuestionOrPlanMs !== null &&
      report.firstQuestionOrPlanMs > calibrated.firstQuestionOrPlanMs
    )
      failures.push('First question or plan exceeds baseline')
    if (report.toolCalls > calibrated.toolCalls) failures.push('Tool calls exceed baseline')
    if (report.step === 'build-slice' && report.wallMs > calibrated.wallMs)
      failures.push('Build gates exceed baseline')
  }
  return failures
}

export function calibrateExperience(
  reports: readonly ExperienceReport[],
  previous: ExperienceBaseline = {},
): ExperienceBaseline {
  const baseline = { ...previous }
  for (const client of ['codex', 'claude'])
    for (const step of EXPERIENCE_STEPS) {
      const matching = reports.filter((report) => report.client === client && report.step === step)
      if (matching.length !== 1) throw new Error(`Need one live baseline for ${client}/${step}`)
      const report = matching[0]
      if (
        report?.provenance !== 'live' ||
        !report.tokens ||
        report.firstQuestionOrPlanMs === null ||
        report.exitCode !== 0 ||
        report.diagnostics.length
      )
        throw new Error(`Incomplete live baseline: ${client}/${step}`)
      const key = `${client}/${step}`,
        old = previous[key]
      baseline[key] = {
        inputTokens: Math.min(old?.inputTokens ?? Infinity, report.tokens.input),
        outputTokens: Math.min(old?.outputTokens ?? Infinity, report.tokens.output),
        firstQuestionOrPlanMs: Math.min(
          old?.firstQuestionOrPlanMs ?? Infinity,
          report.firstQuestionOrPlanMs,
        ),
        toolCalls: Math.min(old?.toolCalls ?? Infinity, report.toolCalls),
        wallMs: Math.min(old?.wallMs ?? Infinity, report.wallMs),
      }
    }
  return baseline
}
