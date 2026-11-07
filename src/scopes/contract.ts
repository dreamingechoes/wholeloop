// Scope documents and plans: sections, stable keys and validation for cut-scopes.
import { validate } from '../config/schema.js'
import { frontmatter } from '../harness/frontmatter.js'
import { parseSpec } from '../spec/contract.js'
import type { StateEvent } from '../state/events.js'
import planSchema from './schemas/plan-v1.json' with { type: 'json' }
import scopeSchema from './schemas/scope-v1.json' with { type: 'json' }

export const SCOPE_SCHEMA = planSchema
export const SCOPE_SECTIONS = [
  'Scope overview',
  'Metric ownership',
  'Delivery plan',
  'Complexity',
  'Open questions',
] as const
export interface ScopeDefinition {
  key: string
  title: string
  goal: string
  metrics: string[]
  stories?: string[]
  measurementReason?: string
  delivery: { mode: 'feature' | 'proof-of-concept'; flag?: string; withoutFlagReason?: string }
  complexity: { level: 'simple' | 'complex'; why: string }
  after?: string[]
}
export interface ScopePlan {
  schema: 'wholeloop/scope-plan@1'
  sourceSpec?: string
  metricIds?: string[]
  measurementException?: { reason: string; who: string }
  scopes: ScopeDefinition[]
}
export interface ScopeContext {
  sourceSpec?: string
  metrics: string[]
  stories: string[]
  impact?: string
  measurementException?: { reason: string; who: string }
}

export function scopeContext(events: readonly StateEvent[], subject: string): ScopeContext {
  const entry = [...events]
    .reverse()
    .find(
      (event) =>
        event.subject === subject &&
        event.type === 'step.completed' &&
        event.data.step === 'write-spec',
    )
  if (entry?.type !== 'step.completed') return { metrics: [], stories: [] }
  const spec = parseSpec(entry.data.artifact.content)
  return {
    sourceSpec: entry.data.artifact.path,
    metrics: spec.metrics.map((metric) => metric.id),
    stories: spec.stories.map((story) => story.id),
    impact: spec.impact,
    ...(spec.measurementException ? { measurementException: spec.measurementException } : {}),
  }
}
export function validateScope(value: unknown): asserts value is ScopeDefinition {
  const problems = validate(value, scopeSchema, 'scope')
  if (problems.length) throw new Error(problems.join('\n'))
  const scope = value as ScopeDefinition
  if (!scope.title.trim() || !scope.goal.trim() || !scope.complexity.why.trim())
    throw new Error('A scope needs a title, goal and argued complexity')
  if (!scope.delivery.flag?.trim() && !scope.delivery.withoutFlagReason?.trim())
    throw new Error(`Scope ${scope.key}: name a flag or explain its absence`)
  if (!scope.metrics.length && !scope.measurementReason?.trim())
    throw new Error(`Scope ${scope.key}: no metrics needs an explicit measurementReason`)
}
export function parseScopePlan(content: string): ScopePlan {
  let value: unknown
  try {
    value = frontmatter(content.replaceAll('\r\n', '\n'))
  } catch {
    throw new Error('Invalid scope-plan YAML front matter; contents omitted')
  }
  const problems = validate(value, SCOPE_SCHEMA, 'scope-plan')
  if (problems.length) throw new Error(problems.join('\n'))
  const plan = value as ScopePlan
  for (const scope of plan.scopes) validateScope(scope)
  return plan
}
export function checkScopePlan(plan: ScopePlan, context: ScopeContext): void {
  if (context.sourceSpec && plan.sourceSpec !== context.sourceSpec)
    throw new Error('Scope plan must pin the current completed spec artifact')
  if (!context.sourceSpec && plan.sourceSpec)
    throw new Error('No completed spec matches sourceSpec; adopt the source before using it')
  if (
    context.sourceSpec &&
    plan.metricIds &&
    (plan.metricIds.length !== context.metrics.length ||
      plan.metricIds.some((id) => !context.metrics.includes(id)))
  )
    throw new Error('Scope metricIds must match the completed spec')
  if (context.sourceSpec && plan.measurementException && !context.measurementException)
    throw new Error('A scope plan cannot replace the spec measurement contract')
  const metrics = context.sourceSpec ? context.metrics : (plan.metricIds ?? [])
  if (!context.sourceSpec && plan.metricIds === undefined && !plan.measurementException)
    throw new Error('Standalone scope planning needs metricIds or an explicit measurementException')
  if (!metrics.length && !(context.measurementException ?? plan.measurementException))
    throw new Error('No metrics requires an explicit measurementException')
  const keys = plan.scopes.map((scope) => scope.key)
  if (new Set(keys).size !== keys.length) throw new Error('Scope keys must be unique')
  for (const id of metrics)
    if (!plan.scopes.some((scope) => scope.metrics.includes(id)))
      throw new Error(`Metric ${id} has no scope owner`)
  for (const story of context.stories)
    if (!plan.scopes.some((scope) => scope.stories?.includes(story)))
      throw new Error(`Story ${story} has no scope owner`)
  for (const scope of plan.scopes) {
    if (scope.metrics.some((metric) => !metrics.includes(metric)))
      throw new Error(`Scope ${scope.key} references an unknown metric`)
    if (context.sourceSpec && scope.stories?.some((story) => !context.stories.includes(story)))
      throw new Error(`Scope ${scope.key} references an unknown story`)
    for (const dependency of scope.after ?? [])
      if (!keys.includes(dependency) && !/^scope-[a-f0-9]{8}$/.test(dependency))
        throw new Error(`Unknown scope dependency: ${dependency}`)
  }
  const visit = (key: string, stack: Set<string>): void => {
    if (stack.has(key)) throw new Error('Scope dependencies contain a cycle')
    const next = plan.scopes.find((scope) => scope.key === key)
    for (const dependency of next?.after ?? [])
      if (keys.includes(dependency)) visit(dependency, new Set([...stack, key]))
  }
  for (const key of keys) visit(key, new Set())
}
