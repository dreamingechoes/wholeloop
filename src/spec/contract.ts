// Specification documents: stories, criteria and metrics, parsed and checked for write-spec.
import { validate } from '../config/schema.js'
import { type Criterion, lintCriteria } from '../definition/criteria.js'
import { frontmatter } from '../harness/frontmatter.js'
import { OPERATIONS } from '../providers/taxonomy.js'
import schema from './schemas/spec-v1.json' with { type: 'json' }

export const SPEC_SCHEMA = schema
export const SPEC_SECTIONS = [
  'Problem',
  'Users',
  'Stories',
  'Criteria',
  'Metrics',
  'Rollout',
  'Measurement plan',
  'Technical appendix',
] as const
export type { Criterion } from '../definition/criteria.js'
export interface Story {
  id: string
  actor: string
  want: string
  benefit: string
  criteria: Criterion[]
}
export interface Metric {
  id: string
  name: string
  unit: string
  source: { provider: string; operation: string; query: string }
  baseline: {
    status: 'known' | 'unknown'
    value?: number
    evidence?: string
    missing?: string
    who?: string
  }
  target: { operator: 'lt' | 'lte' | 'eq' | 'gte' | 'gt'; value: number }
  window: { days: number; timezone: string }
  trackingStory?: string
}
export interface Spec {
  schema: 'wholeloop/spec@1'
  impact: string
  measurementException?: { reason: string; who: string }
  stories: Story[]
  metrics: Metric[]
  rollout: {
    strategy: 'flagged' | 'direct' | 'manual'
    flag?: string
    stages: { name: string; audience: string; exposure: number; exit: string }[]
    rollback: string
  }
}

export function parseSpec(content: string): Spec {
  let data: unknown
  try {
    data = frontmatter(content.replaceAll('\r\n', '\n'))
  } catch {
    throw new Error('Invalid spec YAML front matter; contents omitted')
  }
  const problems = validate(data, SPEC_SCHEMA, 'spec')
  if (problems.length) throw new Error(problems.join('\n'))
  return data as Spec
}

export function checkSpec(content: string): string[] {
  let spec: Spec
  try {
    spec = parseSpec(content)
  } catch (error) {
    return [error instanceof Error ? error.message : 'Invalid spec']
  }
  const problems: string[] = []
  function textFields(value: unknown, path: string): void {
    if (typeof value === 'string' && !value.trim())
      problems.push(`${path}: provide meaningful text`)
    else if (Array.isArray(value))
      value.forEach((entry, index) => {
        textFields(entry, `${path}[${index}]`)
      })
    else if (value && typeof value === 'object')
      for (const [key, entry] of Object.entries(value)) textFields(entry, `${path}.${key}`)
  }
  textFields(spec, 'spec')
  if (!spec.metrics.length && !spec.measurementException)
    problems.push(
      'Provide at least one metric or an explicit measurementException with a reason and answerer',
    )
  if (spec.metrics.length && spec.measurementException)
    problems.push('A measurement exception applies only when no metrics are defined')
  const unique = (values: string[], name: string) => {
    if (new Set(values).size !== values.length) problems.push(`${name} ids must be unique`)
  }
  unique(
    spec.stories.map((story) => story.id),
    'Story',
  )
  unique(
    spec.metrics.map((metric) => metric.id),
    'Metric',
  )
  problems.push(
    ...lintCriteria(spec.stories.flatMap((story) => story.criteria)).map(
      (finding) => finding.message,
    ),
  )
  for (const metric of spec.metrics) {
    if (!metric.source.operation.startsWith('source.') || !OPERATIONS.has(metric.source.operation))
      problems.push(`Metric ${metric.id}: source operation must be a taxonomy query`)
    if (!metric.source.query.trim())
      problems.push(`Metric ${metric.id}: store the measurement query`)
    if (
      metric.baseline.status === 'known' &&
      (metric.baseline.value === undefined || !metric.baseline.evidence?.trim())
    )
      problems.push(`Metric ${metric.id}: a known baseline needs its value and evidence`)
    if (
      metric.baseline.status === 'unknown' &&
      (!metric.baseline.missing?.trim() ||
        !metric.baseline.who?.trim() ||
        !metric.trackingStory ||
        !spec.stories.some((story) => story.id === metric.trackingStory))
    )
      problems.push(
        `Metric ${metric.id}: an unknown baseline needs missing evidence, an answerer and an existing trackingStory`,
      )
    if (metric.trackingStory && !spec.stories.some((story) => story.id === metric.trackingStory))
      problems.push(`Metric ${metric.id}: trackingStory references an unknown story`)
    if (
      metric.baseline.status === 'unknown' &&
      (metric.baseline.value !== undefined || metric.baseline.evidence !== undefined)
    )
      problems.push(
        `Metric ${metric.id}: an unknown baseline cannot also contain a measured value or evidence`,
      )
    try {
      new Intl.DateTimeFormat('en', { timeZone: metric.window.timezone })
    } catch {
      problems.push(`Metric ${metric.id}: invalid measurement timezone`)
    }
  }
  if (spec.rollout.strategy === 'flagged' && !spec.rollout.flag?.trim())
    problems.push('A flagged rollout needs its proposed flag name')
  if (!spec.rollout.rollback.trim()) problems.push('Rollout needs a rollback outline')
  if (
    spec.rollout.stages.some(
      (stage, index) =>
        index > 0 && stage.exposure <= (spec.rollout.stages[index - 1]?.exposure ?? 0),
    )
  )
    problems.push('Rollout exposure stages must increase')
  return problems
}
