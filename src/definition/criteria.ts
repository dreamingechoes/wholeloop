import { validate } from '../config/schema.js'
import schema from './schemas/criteria-v1.json' with { type: 'json' }

export const CRITERIA_SCHEMA = schema
export interface Assertion {
  subject: string
  context: string
  unit: string
  operator: 'lt' | 'lte' | 'eq' | 'ne' | 'gte' | 'gt'
  value: number
}
export interface Criterion {
  id: string
  text: string
  test: string
  assertion?: Assertion
}
export interface DefinitionFinding {
  rule:
    | 'vague-wording'
    | 'missing-test'
    | 'contradictory-pair'
    | 'duplicate-id'
    | 'invalid-assertion'
  criteria: string[]
  message: string
}
const VAGUE =
  /\b(fast|quickly|intuitive|better|user[- ]friendly|seamless|robust|scalable|easy|asap)\b/i

export function parseCriteria(value: unknown): Criterion[] {
  const problems = validate(value, CRITERIA_SCHEMA, 'criteria')
  if (problems.length) throw new Error(problems.join('\n'))
  return (value as { criteria: Criterion[] }).criteria
}

function accepts(assertion: Assertion, value: number): boolean {
  switch (assertion.operator) {
    case 'lt':
      return value < assertion.value
    case 'lte':
      return value <= assertion.value
    case 'eq':
      return value === assertion.value
    case 'ne':
      return value !== assertion.value
    case 'gte':
      return value >= assertion.value
    case 'gt':
      return value > assertion.value
  }
}

/** Only identical named contexts/subjects/units are comparable; prose is not a constraint parser. */
export function contradictory(a: Assertion, b: Assertion): boolean {
  if (a.subject !== b.subject || a.context !== b.context || a.unit !== b.unit) return false
  if (a.operator === 'eq') return !accepts(b, a.value)
  if (b.operator === 'eq') return !accepts(a, b.value)
  // A single excluded point cannot empty an otherwise unbounded numeric interval.
  if (a.operator === 'ne' || b.operator === 'ne') return false
  const lower = [a, b].find((entry) => ['gt', 'gte'].includes(entry.operator))
  const upper = [a, b].find((entry) => ['lt', 'lte'].includes(entry.operator))
  return (
    !!lower &&
    !!upper &&
    (lower.value > upper.value ||
      (lower.value === upper.value && (lower.operator === 'gt' || upper.operator === 'lt')))
  )
}

export function lintCriteria(criteria: readonly Criterion[]): DefinitionFinding[] {
  const findings: DefinitionFinding[] = []
  const seen = new Set<string>()
  for (const criterion of criteria) {
    if (seen.has(criterion.id))
      findings.push({
        rule: 'duplicate-id',
        criteria: [criterion.id],
        message: `Criterion ids must be unique: ${criterion.id}`,
      })
    seen.add(criterion.id)
    const match = VAGUE.exec(criterion.text)
    if (match)
      findings.push({
        rule: 'vague-wording',
        criteria: [criterion.id],
        message: `Criterion ${criterion.id}: replace untestable wording "${match[0]}" with an observable threshold or behavior`,
      })
    if (!criterion.text.trim() || !criterion.test.trim())
      findings.push({
        rule: 'missing-test',
        criteria: [criterion.id],
        message: `Criterion ${criterion.id}: describe observable behavior and a falsifiable test`,
      })
    if (
      criterion.assertion &&
      [criterion.assertion.subject, criterion.assertion.context, criterion.assertion.unit].some(
        (value) => !value.trim(),
      )
    )
      findings.push({
        rule: 'invalid-assertion',
        criteria: [criterion.id],
        message: `Criterion ${criterion.id}: name the assertion subject, context and unit`,
      })
  }
  for (const [index, criterion] of criteria.entries())
    for (const other of criteria.slice(index + 1))
      if (
        criterion.assertion &&
        other.assertion &&
        contradictory(criterion.assertion, other.assertion)
      )
        findings.push({
          rule: 'contradictory-pair',
          criteria: [criterion.id, other.id],
          message: `Criteria ${criterion.id} and ${other.id}: contradictory numeric assertions in the same subject, context and unit`,
        })
  return findings
}
