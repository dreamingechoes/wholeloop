// Research plans, angles, claims, evidence and refutations, with their validation.
import { type Schema, validate } from '../config/schema.js'
import { OPERATIONS } from '../providers/taxonomy.js'
import planSchema from './schemas/plan-v1.json' with { type: 'json' }
import resultSchema from './schemas/result-v1.json' with { type: 'json' }
import voteSchema from './schemas/vote-v1.json' with { type: 'json' }

export interface Evidence {
  ref: string
  excerpt: string
}
export interface OpenQuestion {
  question: string
  missing: string
  who: string
}
export interface Claim {
  id: string
  text: string
  confidence: 'low' | 'medium' | 'high'
  loadBearing: boolean
  evidence: Evidence[]
}
export interface Angle {
  id: string
  provider: string
  capability: string
  operation: string
  available: boolean
  evidence: string
}
export interface ResearchPlan {
  schema: 'wholeloop/research-plan@1'
  subject: string
  run: string
  question: string
  owner: string
  verifiers: number
  refutations: number
  angles: Angle[]
  openQuestions: OpenQuestion[]
}
export interface AngleResult {
  angle: string
  status: 'ok' | 'unavailable'
  claims: Claim[]
  openQuestions: OpenQuestion[]
  reason?: string
}
export interface Refutation {
  claim: string
  verifier: number
  outcome: 'refute' | 'confirm' | 'uncertain'
  reason: string
  evidence: Evidence[]
}

function check(value: unknown, schema: Schema): void {
  const problems = validate(value, schema, 'research')
  if (problems.length) throw new Error(problems.join('\n'))
}
export function validatePlan(value: unknown): asserts value is ResearchPlan {
  check(value, planSchema)
  const plan = value as ResearchPlan
  if (plan.refutations !== Math.floor(plan.verifiers / 2) + 1)
    throw new Error('Research refutations must be a strict majority')
  if (new Set(plan.angles.map((angle) => angle.id)).size !== plan.angles.length)
    throw new Error('Research angle ids must be unique')
  if (
    !plan.angles.every(
      (angle) =>
        angle.capability.startsWith('source.') &&
        OPERATIONS.has(angle.operation) &&
        angle.operation === `${angle.capability}.query`,
    )
  )
    throw new Error('Research angles must use source query operations')
}
export function validateResult(value: unknown): asserts value is AngleResult {
  check(value, resultSchema)
  const result = value as AngleResult
  if (
    result.claims.some(
      (claim) =>
        !claim.text.trim() ||
        claim.evidence.some((entry) => !entry.ref.trim() || !entry.excerpt.trim()),
    ) ||
    result.openQuestions.some(
      (entry) => !entry.question.trim() || !entry.missing.trim() || !entry.who.trim(),
    )
  )
    throw new Error('Claims, evidence and open questions must contain meaningful text')
  if (new Set(result.claims.map((claim) => claim.id)).size !== result.claims.length)
    throw new Error('Claim ids must be unique within an angle')
  if (result.status === 'unavailable' && (!result.reason?.trim() || result.claims.length))
    throw new Error('Unavailable sources require a reason and cannot provide claims')
  if (result.status === 'ok' && !result.claims.length && !result.openQuestions.length)
    throw new Error('An empty source result must explain its open questions')
}
export function validateRefutation(value: unknown): asserts value is Refutation {
  check(value, voteSchema)
  const vote = value as Refutation
  if (
    !vote.reason.trim() ||
    vote.evidence.some((entry) => !entry.ref.trim() || !entry.excerpt.trim())
  )
    throw new Error('An examination needs meaningful reasons and evidence')
  if (vote.outcome === 'refute' && !vote.evidence.length)
    throw new Error('An active refutation needs evidence')
}
