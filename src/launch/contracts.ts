import { validate } from '../config/schema.js'
import type { StateEvent } from '../state/events.js'
import { type MeasurementSource, measurementDigest, validateMeasurement } from './measurement.js'
import dispatchSchema from './schemas/dispatch-v1.json' with { type: 'json' }
import draftSchema from './schemas/draft-v1.json' with { type: 'json' }
import planSchema from './schemas/plan-v1.json' with { type: 'json' }

export interface LaunchGuidance {
  slot: string
  ref: string
  origin: string
  digest: string
}
export interface LaunchPlan {
  run: string
  source: MeasurementSource
  guidance: LaunchGuidance[]
}
export interface LaunchDraft {
  schema: 'wholeloop/launch-kit@1'
  sourceDigest: string
  rolloutPlan: string
  comms: { key: string; audience: string; stage: string; body: string }[]
  dashboards: { key: string; title: string; metric: string }[]
  enablement: { supportGuide: string; onePager: string; runbook: string }
}
export type LaunchEventData =
  | { type: 'launch.planned'; data: LaunchPlan }
  | { type: 'launch.drafted'; data: { run: string; draft: LaunchDraft } }
  | {
      type: 'launch.dispatch-planned'
      data: {
        run: string
        key: string
        provider: string
        operation: 'comms.draft' | 'dashboards.create' | 'docs.create'
        bodyDigest: string
      }
    }
  | {
      type: 'launch.dispatch-finished'
      data: { run: string; key: string; result: { status: 'succeeded' | 'pending'; ref: string } }
    }

export function validateLaunchDraft(
  value: unknown,
  plan: LaunchPlan,
): asserts value is LaunchDraft {
  if (validate(value, draftSchema).length) throw new Error('Invalid wholeloop/launch-kit@1 draft')
  const draft = value as LaunchDraft
  const metrics = plan.source.plan.metrics
  if (draft.sourceDigest !== plan.source.digest)
    throw new Error('Launch draft must reference its pinned measurement digest')
  const all = [...draft.comms, ...draft.dashboards]
  if (new Set(all.map((item) => item.key)).size !== all.length)
    throw new Error('Launch artifact keys must be unique')
  if (
    draft.dashboards.some((entry) => !metrics.some((metric) => metric.id === entry.metric)) ||
    metrics.some((metric) => !draft.dashboards.some((entry) => entry.metric === metric.id))
  )
    throw new Error(
      'Every dashboard must implement a pinned metric and every owned metric needs a dashboard',
    )
  const stages = plan.source.plan.rollout.stages
  if (
    draft.comms.some((entry) => !stages.some((stage) => stage.name === entry.stage)) ||
    stages.some((stage) => !draft.comms.some((entry) => entry.stage === stage.name))
  )
    throw new Error('Comms drafts must reference and cover the pinned rollout stages')
  const prose = [
    draft.rolloutPlan,
    ...draft.comms.flatMap((entry) => [entry.audience, entry.body]),
    ...draft.dashboards.map((entry) => entry.title),
    ...Object.values(draft.enablement),
  ]
  if (prose.some((text) => !text.trim()))
    throw new Error('Launch kit sections must contain meaningful drafts')
}
export function validLaunchData(type: string, data: Record<string, unknown>): boolean {
  try {
    if (type === 'launch.dispatch-planned' || type === 'launch.dispatch-finished')
      return validate(data, dispatchSchema.properties[type]).length === 0
    if (type === 'launch.planned') {
      if (validate(data, planSchema).length) return false
      const plan = data as unknown as LaunchPlan
      validateMeasurement(plan.source.plan)
      return (
        plan.source.digest ===
          measurementDigest({ revision: plan.source.revision, plan: plan.source.plan }) &&
        plan.guidance.length === 2 &&
        new Set(plan.guidance.map((item) => item.slot)).size === 2
      )
    }
    return (
      type === 'launch.drafted' &&
      Object.keys(data).every((key) => ['run', 'draft'].includes(key)) &&
      typeof data.run === 'string' &&
      /^run-[a-f0-9]{16}$/.test(data.run) &&
      validate(data.draft, draftSchema).length === 0
    )
  } catch {
    return false
  }
}
export function launchRuns(events: readonly StateEvent[]) {
  const runs = new Map<
    string,
    { subject: string; event: string; plan: LaunchPlan; draft?: LaunchDraft }
  >()
  const active = new Map<string, string>()
  for (const event of events) {
    if (event.type === 'step.started' && event.data.step === 'prepare-launch')
      active.set(event.subject, event.data.run)
    if (
      (event.type === 'step.completed' || event.type === 'step.skipped') &&
      event.data.step === 'prepare-launch'
    )
      active.delete(event.subject)
    if (event.type === 'launch.planned') {
      if (runs.has(event.data.run) || active.get(event.subject) !== event.data.run)
        throw new Error('Launch plan needs one matching active prepare-launch run')
      runs.set(event.data.run, { subject: event.subject, event: event.id, plan: event.data })
    }
    if (event.type === 'launch.drafted') {
      const run = runs.get(event.data.run)
      if (
        !run ||
        run.subject !== event.subject ||
        run.draft ||
        active.get(event.subject) !== event.data.run
      )
        throw new Error('Launch draft needs one prior active pinned plan')
      validateLaunchDraft(event.data.draft, run.plan)
      run.draft = event.data.draft
    }
  }
  return [...runs.values()]
}
