import { impactRuns } from '../impact/contracts.js'
import { impactReport } from '../impact/report.js'
import { measurementDigest } from '../launch/measurement.js'
import { safeEvidenceReference } from '../providers/numeric.js'
import type { StateEvent } from '../state/events.js'

export interface ReportedLearning {
  summary: string
  promise: string
  refs: string[]
  by: string
  flag?: string
}
export interface LearningEvidence {
  kind: 'checkpoint' | 'reported'
  basis: string
  ref: string
  digest: string
  promise: string
  unknowns: string[]
  flag?: string
  reported?: ReportedLearning
}
export function learningEvidence(
  events: readonly StateEvent[],
  subject: string,
  checkpoints: string[],
  reported?: ReportedLearning,
): LearningEvidence | undefined {
  const runs = impactRuns(events).filter((run) => run.subject === subject)
  const latest = runs.filter((run) => run.observation).at(-1)
  if (latest?.observation) {
    const completed = events.find(
      (event) =>
        event.subject === subject &&
        event.type === 'step.completed' &&
        event.data.run === latest.plan.run,
    )
    if (completed?.type !== 'step.completed')
      throw new Error('Complete the latest measured checkpoint report before deciding')
    const report = impactReport(latest)
    const pending = checkpoints.filter(
      (key) => !runs.some((run) => run.plan.checkpoint === key && run.observation),
    )
    return {
      kind: 'checkpoint',
      basis: latest.observation.event,
      ref: completed.data.artifact.path,
      digest: measurementDigest(report),
      promise: latest.plan.source.plan.impact,
      unknowns: [
        ...report.metrics
          .filter((row) => row.verdict === 'unknown')
          .map((row) => `metric:${row.id}`),
        ...report.qualitative
          .filter((row) => row.observation?.status !== 'observed')
          .map((row) => `qualitative:${row.id}`),
        ...pending.map((key) => `checkpoint:${key}`),
        ...(report.measurementException ? ['measurement-exception'] : []),
      ].sort(),
      ...(latest.plan.source.plan.rollout.flag
        ? { flag: latest.plan.source.plan.rollout.flag }
        : {}),
    }
  }
  if (!reported) return undefined
  if (
    !reported.summary.trim() ||
    !reported.promise.trim() ||
    !reported.by.trim() ||
    !reported.refs.length ||
    reported.refs.some((ref) => !safeEvidenceReference(ref))
  )
    throw new Error(
      'Self-reported evidence needs its promise, observations, person and non-secret references',
    )
  return {
    kind: 'reported',
    basis: 'self-reported',
    ref: reported.refs[0] ?? '',
    digest: measurementDigest(reported),
    promise: reported.promise,
    unknowns: ['no-measured-checkpoint'],
    reported,
    ...(reported.flag ? { flag: reported.flag } : {}),
  }
}
