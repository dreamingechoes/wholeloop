// Impact plans, observations, layouts and events for measure-impact.
import { validate } from '../config/schema.js'
import {
  type MeasurementSource,
  measurementDigest,
  validateMeasurement,
} from '../launch/measurement.js'
import { satisfies } from '../ramp/contracts.js'
import type { StateEvent } from '../state/events.js'
import type { DigestTarget } from './digest.js'
import schema from './schemas/events-v1.json' with { type: 'json' }

export interface QualitativeQuery {
  id: string
  provider: string
  operation: string
  query: string
  days: number
  timezone: string
}
export interface ImpactPlan {
  run: string
  source: MeasurementSource
  checkpoint: string
  launchedAt: string
  afterDays: number
  at: string
  qualitative: QualitativeQuery[]
  guidance: { ref: string; origin: string; digest: string }
}
export interface ImpactObservation {
  id: string
  status: 'observed' | 'unknown'
  unit?: string
  window: { start: string; end: string; timezone: string }
  value?: number
  text?: string
  ref?: string
  bodyDigest?: string
  missing?: string
}
export interface ImpactLayout {
  title: string
  metrics: string[]
  qualitative: string[]
}
export type ImpactEventData =
  | { type: 'impact.planned'; data: ImpactPlan }
  | {
      type: 'impact.observed'
      data: { run: string; metrics: ImpactObservation[]; qualitative: ImpactObservation[] }
    }
  | { type: 'impact.formatted'; data: { run: string; basis: string; sections: ImpactLayout[] } }
  | {
      type: 'impact.dispatch-planned'
      data: { digest: string; key: string; subjects: string[]; target: DigestTarget }
    }
  | {
      type: 'impact.dispatch-finished'
      data: { key: string; result: { status: 'succeeded' | 'pending'; ref: string } }
    }

export function validImpactData(type: string, data: Record<string, unknown>) {
  try {
    const rule = schema.properties[type as keyof typeof schema.properties]
    if (!rule || validate(data, rule).length) return false
    if (type === 'impact.planned') {
      const plan = data as unknown as ImpactPlan
      validateMeasurement(plan.source.plan)
      if (
        plan.source.digest !==
          measurementDigest({ revision: plan.source.revision, plan: plan.source.plan }) ||
        !plan.checkpoint.trim() ||
        !Number.isFinite(Date.parse(plan.launchedAt)) ||
        !Number.isFinite(Date.parse(plan.at)) ||
        Date.parse(plan.at) < Date.parse(plan.launchedAt) + plan.afterDays * 86400000 ||
        new Set(plan.qualitative.map((row) => row.id)).size !== plan.qualitative.length
      )
        return false
      for (const row of plan.qualitative) {
        if (
          !row.query.trim() ||
          ![
            'source.support.query',
            'source.feedback.query',
            'source.meetings.query',
            'source.knowledge.query',
          ].includes(row.operation)
        )
          return false
        new Intl.DateTimeFormat('en', { timeZone: row.timezone })
      }
    }
    return true
  } catch {
    return false
  }
}
export const impactWindow = (at: string, days: number, timezone: string) => ({
  start: new Date(Date.parse(at) - Math.round(days * 86400000)).toISOString(),
  end: at,
  timezone,
})
export function validateLayout(sections: ImpactLayout[], metrics: string[], qualitative: string[]) {
  const listedMetrics = sections.flatMap((section) => section.metrics)
  const listedQualitative = sections.flatMap((section) => section.qualitative)
  if (
    !sections.length ||
    sections.some((section) => !/^[A-Za-z][A-Za-z -]{0,79}$/.test(section.title)) ||
    JSON.stringify([...listedMetrics].sort()) !== JSON.stringify([...metrics].sort()) ||
    JSON.stringify([...listedQualitative].sort()) !== JSON.stringify([...qualitative].sort())
  )
    throw new Error(
      'Report layout must include every metric and qualitative query exactly once, with plain headings',
    )
}
export function impactRuns(events: readonly StateEvent[]) {
  const runs = new Map<
    string,
    {
      subject: string
      plan: ImpactPlan
      observation?: {
        event: string
        metrics: ImpactObservation[]
        qualitative: ImpactObservation[]
      }
      layout?: { basis: string; sections: ImpactLayout[] }
    }
  >()
  const active = new Map<string, string>()
  for (const event of events) {
    if (event.type === 'step.started' && event.data.step === 'measure-impact')
      active.set(event.subject, event.data.run)
    if (
      (event.type === 'step.completed' || event.type === 'step.skipped') &&
      event.data.step === 'measure-impact'
    )
      active.delete(event.subject)
    if (event.type === 'impact.planned') {
      if (
        runs.has(event.data.run) ||
        active.get(event.subject) !== event.data.run ||
        Date.parse(event.data.at) > Date.parse(event.ts)
      )
        throw new Error(
          'Impact plans need one active matching workflow and a historical checkpoint',
        )
      runs.set(event.data.run, { subject: event.subject, plan: event.data })
    }
    if (event.type === 'impact.observed' || event.type === 'impact.formatted') {
      const run = runs.get(event.data.run)
      if (!run || run.subject !== event.subject || active.get(event.subject) !== event.data.run)
        throw new Error('Impact evidence needs its active pinned checkpoint')
      if (event.type === 'impact.observed') {
        for (const [kind, rows] of [
          ['metrics', event.data.metrics],
          ['qualitative', event.data.qualitative],
        ] as const) {
          const planned =
            kind === 'metrics'
              ? run.plan.source.plan.metrics.map((metric) => ({
                  id: metric.id,
                  ...metric.window,
                  unit: metric.unit,
                }))
              : run.plan.qualitative
          if (
            rows.length !== planned.length ||
            new Set(rows.map((row) => row.id)).size !== rows.length
          )
            throw new Error('Every planned datapoint needs one explicit observation or unknown')
          for (const row of rows) {
            const query = planned.find((query) => query.id === row.id)
            if (
              !query ||
              Object.entries(impactWindow(run.plan.at, query.days, query.timezone)).some(
                ([key, value]) => row.window[key as keyof typeof row.window] !== value,
              )
            )
              throw new Error('Impact observations must retain their pinned query window')
            if (kind === 'metrics' && row.unit !== ('unit' in query ? query.unit : undefined))
              throw new Error('Metric units cannot drift')
            if (
              row.status === 'observed' &&
              (!row.ref?.trim() ||
                !row.bodyDigest ||
                row.missing !== undefined ||
                (kind === 'metrics'
                  ? row.value === undefined || !Number.isFinite(row.value) || row.text !== undefined
                  : !row.text?.trim() || row.text.length > 16384 || row.value !== undefined))
            )
              throw new Error(
                'Observed datapoints require actual typed values and evidence references',
              )
            if (
              row.status === 'unknown' &&
              (!row.missing?.trim() ||
                row.value !== undefined ||
                row.text !== undefined ||
                row.ref !== undefined ||
                row.bodyDigest !== undefined)
            )
              throw new Error('Unknown datapoints cannot invent observations')
          }
        }
        run.observation = {
          event: event.id,
          metrics: event.data.metrics,
          qualitative: event.data.qualitative,
        }
        delete run.layout
      } else {
        if (run.observation?.event !== event.data.basis)
          throw new Error('Report layout needs current observed evidence')
        validateLayout(
          event.data.sections,
          run.plan.source.plan.metrics.map((metric) => metric.id),
          run.plan.qualitative.map((row) => row.id),
        )
        run.layout = { basis: event.data.basis, sections: event.data.sections }
      }
    }
  }
  return [...runs.values()]
}
export function metricVerdict(
  value: number | undefined,
  metric: MeasurementSource['plan']['metrics'][number],
) {
  if (value === undefined) return 'unknown' as const
  if (satisfies(value, metric.target.operator, metric.target.value)) return 'met' as const
  const baseline = metric.baseline.value
  return metric.baseline.status === 'known' &&
    baseline !== undefined &&
    !satisfies(baseline, metric.target.operator, metric.target.value) &&
    Math.abs(value - metric.target.value) < Math.abs(baseline - metric.target.value)
    ? ('partly' as const)
    : ('missed' as const)
}
