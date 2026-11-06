import { isAbsolute } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { validate } from '../config/schema.js'
import { type Criterion, lintCriteria } from '../definition/criteria.js'
import { frontmatter } from '../harness/frontmatter.js'
import { parseSpec } from '../spec/contract.js'
import type { StateEvent } from '../state/events.js'
import planSchema from './schemas/plan-v1.json' with { type: 'json' }
import sliceSchema from './schemas/slice-v1.json' with { type: 'json' }

export const SLICE_SCHEMA = planSchema
export const SLICE_SECTIONS = [
  'Slice overview',
  'Acceptance criteria',
  'Test cases',
  'End-to-end demonstrations',
  'Repositories and contracts',
  'Dependencies',
  'Open questions',
] as const
export interface Repository {
  key: string
  path: string
}
export interface SliceDefinition {
  key: string
  title: string
  objective: string
  outcomes: string[]
  demonstration: { entry: string; steps: string[]; expected: string }
  criteria: Criterion[]
  tests: { id: string; criteria: string[]; steps: string[]; expected: string }[]
  repositories: string[]
  contract?: { repository: string; interface: string; examples: string[] }
  blockedBy?: string[]
}
export interface SlicePlan {
  schema: 'wholeloop/slice-plan@1'
  sourceScope?: string
  sourceSpec?: string
  repositories: Repository[]
  slices: SliceDefinition[]
}
export interface SlicingContext {
  sourceScope?: string
  sourceSpec?: string
  criteria: Criterion[]
}

export function slicingContext(events: readonly StateEvent[], subject: string): SlicingContext {
  const scope = [...events]
    .reverse()
    .find((entry) => entry.subject === subject && entry.type === 'scope.defined')
  if (scope?.type !== 'scope.defined') return { criteria: [] }
  const spec = [...events]
    .reverse()
    .find(
      (entry) =>
        entry.subject === scope.data.initiative &&
        entry.type === 'step.completed' &&
        entry.data.step === 'write-spec',
    )
  return {
    sourceScope: scope.id,
    ...(spec?.type === 'step.completed'
      ? {
          sourceSpec: spec.data.artifact.path,
          criteria: parseSpec(spec.data.artifact.content)
            .stories.filter((story) => scope.data.definition.stories?.includes(story.id))
            .flatMap((story) => story.criteria),
        }
      : { criteria: [] }),
  }
}

export function validateSlice(value: unknown): asserts value is SliceDefinition {
  const problems = validate(value, sliceSchema, 'slice')
  if (problems.length) throw new Error(problems.join('\n'))
  const slice = value as SliceDefinition
  if (slice.outcomes.length !== 1)
    throw new Error(`Slice ${slice.key}: declare exactly one user-visible outcome`)
  const meaningful = (value: unknown): boolean =>
    typeof value === 'string'
      ? !!value.trim()
      : Array.isArray(value)
        ? value.every(meaningful)
        : value !== null && typeof value === 'object'
          ? Object.values(value).every(meaningful)
          : true
  if (!meaningful(slice))
    throw new Error(
      `Slice ${slice.key}: provide meaningful definition and end-to-end demonstration text`,
    )
  const lint = lintCriteria(slice.criteria)
  if (lint.length) throw new Error(lint.map((finding) => finding.message).join('\n'))
  if (new Set(slice.tests.map((test) => test.id)).size !== slice.tests.length)
    throw new Error(`Slice ${slice.key}: test ids must be unique`)
  for (const criterion of slice.criteria)
    if (!slice.tests.some((test) => test.criteria.includes(criterion.id)))
      throw new Error(`Criterion ${criterion.id} needs a test case`)
  for (const test of slice.tests)
    if (test.criteria.some((id) => !slice.criteria.some((criterion) => criterion.id === id)))
      throw new Error(`Test ${test.id} references an unknown criterion`)
  if (slice.repositories.length > 1 && !slice.contract)
    throw new Error(`Slice ${slice.key}: multiple repositories need a contract-first part`)
  if (slice.contract && !slice.repositories.includes(slice.contract.repository))
    throw new Error(`Slice ${slice.key}: contract repository must belong to this slice`)
}

export function parseSlicePlan(content: string): SlicePlan {
  let value: unknown
  try {
    value = frontmatter(content.replaceAll('\r\n', '\n'))
  } catch {
    throw new Error('Invalid slice-plan YAML front matter; contents omitted')
  }
  const problems = validate(value, SLICE_SCHEMA, 'slice-plan')
  if (problems.length) throw new Error(problems.join('\n'))
  const plan = value as SlicePlan
  for (const slice of plan.slices) validateSlice(slice)
  return plan
}

export function checkSlicePlan(plan: SlicePlan, context: SlicingContext): void {
  for (const key of ['sourceScope', 'sourceSpec'] as const)
    if (plan[key] !== context[key])
      throw new Error(`Slice plan must pin the current ${key} reference`)
  for (const [values, name] of [
    [plan.repositories.map((repo) => repo.key), 'Repository'],
    [plan.repositories.map((repo) => repo.path), 'Repository path'],
    [plan.slices.map((slice) => slice.key), 'Slice'],
  ] as const)
    if (new Set(values).size !== values.length) throw new Error(`${name} keys must be unique`)
  for (const repo of plan.repositories)
    if (!isAbsolute(repo.path)) throw new Error('Repository paths must be explicit absolute roots')
  for (const criterion of context.criteria) {
    const owners = plan.slices.flatMap((slice) =>
      slice.criteria.filter((candidate) => candidate.id === criterion.id),
    )
    if (!owners.length) throw new Error(`Spec criterion ${criterion.id} has no slice owner`)
    if (owners.some((owner) => !isDeepStrictEqual(owner, criterion)))
      throw new Error(`Preserve spec criterion ${criterion.id}; revise the spec before changing it`)
  }
  const keys = plan.slices.map((slice) => slice.key)
  for (const slice of plan.slices) {
    if (slice.repositories.some((ref) => !plan.repositories.some((repo) => repo.key === ref)))
      throw new Error(`Slice ${slice.key}: unknown repository`)
    for (const dependency of slice.blockedBy ?? [])
      if (!keys.includes(dependency) && !/^slice-[a-f0-9]{8}$/.test(dependency))
        throw new Error(`Unknown slice dependency: ${dependency}`)
  }
  const graph = new Map(
    plan.slices.map((slice, index) => [
      slice.key,
      slice.blockedBy ?? (index ? [plan.slices[index - 1]?.key ?? ''] : []),
    ]),
  )
  checkDependencies(graph)
}

export function checkDependencies(graph: ReadonlyMap<string, readonly string[]>): void {
  const checked = new Set<string>(),
    active = new Set<string>()
  const visit = (id: string): void => {
    if (active.has(id)) throw new Error('Slice dependencies contain a cycle')
    if (checked.has(id)) return
    // One private depth-first branch preserves cycle detection without copying
    // every ancestor for each edge. Completed siblings must leave the branch.
    active.add(id)
    for (const next of graph.get(id) ?? []) visit(next)
    active.delete(id)
    checked.add(id)
  }
  for (const id of graph.keys()) visit(id)
}
