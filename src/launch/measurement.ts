import { createHash } from 'node:crypto'
import { validate } from '../config/schema.js'
import { OPERATIONS } from '../providers/taxonomy.js'
import { parseScopePlan } from '../scopes/contract.js'
import { type Metric, parseSpec, type Spec } from '../spec/contract.js'
import type { StateEvent } from '../state/events.js'
import schema from './schemas/measurement-v1.json' with { type: 'json' }

export interface MeasurementPlan {
  schema: 'wholeloop/measurement-plan@1'
  impact: string
  metrics: Metric[]
  rollout: Spec['rollout']
  measurementException?: { reason: string; who: string }
}
export interface MeasurementSource {
  ref: string
  revision: string
  digest: string
  plan: MeasurementPlan
}
export const measurementDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Standalone measurement keeps the spec's metric vocabulary without fabricating Define steps. */
export function validateMeasurement(value: unknown): asserts value is MeasurementPlan {
  if (validate(value, schema).length) throw new Error('Invalid wholeloop/measurement-plan@1 input')
  const plan = value as MeasurementPlan
  if (
    !plan.impact.trim() ||
    (!plan.metrics.length && !plan.measurementException) ||
    (plan.metrics.length && plan.measurementException) ||
    new Set(plan.metrics.map((metric) => metric.id)).size !== plan.metrics.length
  )
    throw new Error(
      'Measurement needs unique metrics or an explicit no-measurement reason and person',
    )
  if (
    plan.measurementException &&
    (!plan.measurementException.reason.trim() || !plan.measurementException.who.trim())
  )
    throw new Error('Measurement exception needs its reason and answerer')
  let validatedZones: Set<string> | undefined
  for (const metric of plan.metrics) {
    if (
      !metric.name.trim() ||
      !metric.unit.trim() ||
      !metric.source.provider.trim() ||
      !metric.source.query.trim() ||
      !metric.source.operation.startsWith('source.') ||
      !OPERATIONS.has(metric.source.operation)
    )
      throw new Error('Every metric needs its exact source query, unit and name')
    if (
      metric.baseline.status === 'known' &&
      (metric.baseline.value === undefined || !metric.baseline.evidence?.trim())
    )
      throw new Error('Known baseline needs its value and evidence')
    if (
      metric.baseline.status === 'unknown' &&
      (!metric.baseline.missing?.trim() ||
        !metric.baseline.who?.trim() ||
        metric.baseline.value !== undefined ||
        metric.baseline.evidence !== undefined)
    )
      throw new Error(
        'Unknown baseline needs a missing-evidence reason and person, never an invented value',
      )
    const timezone = metric.window.timezone
    // The constructor validates a zone identifier, not per-metric dates. Share
    // exact identifiers only during this synchronous validation, never across calls.
    if (!validatedZones?.has(timezone)) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone })
      } catch {
        throw new Error('Measurement window needs a valid timezone')
      }
      if (plan.metrics.length > 1) {
        validatedZones ??= new Set()
        validatedZones.add(timezone)
      }
    }
  }
  const rollout = plan.rollout
  if (
    new Set(rollout.stages.map((stage) => stage.name)).size !== rollout.stages.length ||
    !rollout.rollback.trim() ||
    (rollout.strategy === 'flagged' && !rollout.flag?.trim()) ||
    rollout.stages.some(
      (stage, index) =>
        !stage.name.trim() ||
        !stage.audience.trim() ||
        !stage.exit.trim() ||
        (index > 0 && stage.exposure <= (rollout.stages[index - 1]?.exposure ?? 0)),
    )
  )
    throw new Error('Rollout needs explicit increasing stages, exit criteria and rollback')
}

/** Follow the scope's actual cut-scopes revision, never the latest unrelated spec. */
export function scopeMeasurement(
  events: readonly StateEvent[],
  subject: string,
  owner: string,
): MeasurementSource | undefined {
  const definition = events.findLast(
    (event) => event.subject === subject && event.type === 'scope.defined',
  )
  if (definition?.type !== 'scope.defined') return undefined
  const cut = events.findLast(
    (event) =>
      event.subject === definition.data.initiative &&
      event.type === 'step.completed' &&
      event.data.step === 'cut-scopes' &&
      event.data.run === definition.data.run,
  )
  if (cut?.type !== 'step.completed')
    throw new Error('Scope measurement needs its completed cut-scopes artifact')
  const source = parseScopePlan(cut.data.artifact.content).sourceSpec
  if (!source) return undefined
  const stored = events.find(
    (event) =>
      event.subject === definition.data.initiative &&
      event.type === 'step.completed' &&
      event.data.step === 'write-spec' &&
      event.data.artifact.path === source,
  )
  if (stored?.type !== 'step.completed')
    throw new Error('The scope-pinned spec revision is missing')
  const spec = parseSpec(stored.data.artifact.content)
  const metrics = spec.metrics.filter((metric) =>
    definition.data.definition.metrics.includes(metric.id),
  )
  if (metrics.length !== definition.data.definition.metrics.length)
    throw new Error('Scope metric ownership does not match its pinned specification')
  const exception = !metrics.length
    ? (spec.measurementException ??
      (definition.data.definition.measurementReason
        ? { reason: definition.data.definition.measurementReason, who: owner }
        : undefined))
    : undefined
  const plan: MeasurementPlan = {
    schema: 'wholeloop/measurement-plan@1',
    impact: spec.impact,
    metrics,
    rollout: spec.rollout,
    ...(exception ? { measurementException: exception } : {}),
  }
  validateMeasurement(plan)
  const revision = `${stored.id}/${definition.id}`
  return {
    ref: stored.data.artifact.path,
    revision,
    digest: measurementDigest({ revision, plan }),
    plan,
  }
}
