// Builder plans and agreements, and the rule that a build completes only with both gates green on
// the same bytes.
import { isObject, validate } from '../config/schema.js'
import { type Criterion, parseCriteria } from '../definition/criteria.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import type { StateEvent } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import planSchema from './schemas/plan-v1.json' with { type: 'json' }

export interface BuilderPlan {
  schema: 'wholeloop/builder-plan@1'
  steps: string[]
  tests: string[]
  assumptions: { text: string; status: 'verified' | 'unknown' | 'contradicted'; evidence: string }[]
}
export interface BuildAgreement {
  criteria: Criterion[]
  by: string
  source: { kind: 'sentence' | 'issue'; ref: string; revision?: string }
}
export type BuildEventData =
  | { type: 'build.agreed'; data: BuildAgreement }
  | {
      type: 'build.planned'
      data: {
        run: string
        plan: BuilderPlan
        snapshot: string
        guidance: { slot: string; ref: string; digest: string }[]
      }
    }
export const BUILDER_PLAN_SCHEMA = planSchema
export function validateBuilderPlan(value: unknown): asserts value is BuilderPlan {
  const problems = validate(value, planSchema, 'builder.plan')
  if (problems.length) throw new Error(problems.join('\n'))
  const plan = value as BuilderPlan
  if (
    [
      ...plan.steps,
      ...plan.tests,
      ...plan.assumptions.flatMap((assumption) => [assumption.text, assumption.evidence]),
    ].some((text) => !text.trim())
  )
    throw new Error('Builder plans need meaningful steps, tests and assumption evidence')
}
export function validBuildData(type: string, data: Record<string, unknown>): boolean {
  try {
    if (type === 'build.agreed') {
      if (
        Object.keys(data).some((key) => !['criteria', 'by', 'source'].includes(key)) ||
        typeof data.by !== 'string' ||
        !data.by.trim() ||
        !isObject(data.source) ||
        Object.keys(data.source).some((key) => !['kind', 'ref', 'revision'].includes(key)) ||
        !['sentence', 'issue'].includes(String(data.source.kind)) ||
        typeof data.source.ref !== 'string' ||
        !data.source.ref.trim() ||
        (data.source.revision !== undefined &&
          (typeof data.source.revision !== 'string' || !data.source.revision.trim()))
      )
        return false
      parseCriteria({ schema: 'wholeloop/criteria@1', criteria: data.criteria })
      return true
    }
    if (
      type !== 'build.planned' ||
      Object.keys(data).some((key) => !['run', 'plan', 'snapshot', 'guidance'].includes(key)) ||
      typeof data.run !== 'string' ||
      !/^run-[a-f0-9]{16}$/.test(data.run) ||
      typeof data.snapshot !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.snapshot) ||
      !Array.isArray(data.guidance) ||
      data.guidance.some(
        (entry) =>
          !isObject(entry) ||
          Object.keys(entry).some((key) => !['slot', 'ref', 'digest'].includes(key)) ||
          typeof entry.slot !== 'string' ||
          typeof entry.ref !== 'string' ||
          typeof entry.digest !== 'string' ||
          !/^[a-f0-9]{64}$/.test(entry.digest),
      )
    )
      return false
    validateBuilderPlan(data.plan)
    return true
  } catch {
    return false
  }
}
export function buildCriteria(events: readonly StateEvent[], subject: string): Criterion[] {
  const created = events.find((entry) => entry.subject === subject && entry.type === 'item.created')
  const source =
    created?.type === 'item.created' && created.data.kind === 'part' ? created.data.parent : subject
  const definition = [...events]
    .reverse()
    .find(
      (entry) =>
        entry.subject === source &&
        (entry.type === 'slice.defined' || entry.type === 'build.agreed'),
    )
  if (definition?.type === 'slice.defined') return definition.data.definition.criteria
  if (definition?.type === 'build.agreed') return definition.data.criteria
  throw new Error('Record agreed criteria before building this slice')
}
export function latestBuilderPlan(events: readonly StateEvent[], subject: string, run?: string) {
  return [...events]
    .reverse()
    .find(
      (entry) =>
        entry.subject === subject &&
        entry.type === 'build.planned' &&
        (!run || entry.data.run === run),
    )
}

/** Every build completion, including direct step completion, needs both gates on the same bytes. */
export function assertBuildGreen(
  events: readonly StateEvent[],
  subject: string,
  root: string,
): void {
  const start = [...events]
    .reverse()
    .find(
      (entry) =>
        entry.subject === subject &&
        entry.type === 'step.started' &&
        entry.data.step === 'build-slice',
    )
  if (start?.type !== 'step.started' || !latestBuilderPlan(events, subject, start.data.run))
    throw new Error('Record the builder plan before completing code')
  const builderPlan = latestBuilderPlan(events, subject, start.data.run)
  const runs = gateRuns(events).filter((run) => run.subject === subject)
  const digest = workspaceSnapshot(root).digest
  for (const kind of ['verify', 'review']) {
    const round = runs
      .filter((run) => run.gate === kind)
      .at(-1)
      ?.rounds.at(-1)
    if (
      round?.decision?.report.verdict !== 'PASS' ||
      round.plan.snapshot.digest !== digest ||
      round.plan.repository !== canonicalPath(root) ||
      events.findIndex(
        (entry) => entry.type === 'gate.planned' && entry.data.plan.run === round.plan.run,
      ) < Math.max(events.indexOf(start), builderPlan ? events.indexOf(builderPlan) : 0)
    )
      throw new Error(`Build completion requires a current ${kind} PASS from this build`)
  }
}
