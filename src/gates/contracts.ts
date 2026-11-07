// Gate plans, findings, votes, results and their events.
import { validate } from '../config/schema.js'
import type { GateInputs, GateUnit } from './lenses.js'
import planSchema from './schemas/plan-v1.json' with { type: 'json' }
import resultSchema from './schemas/result-v1.json' with { type: 'json' }
import voteSchema from './schemas/vote-v1.json' with { type: 'json' }
import type { WorkspaceSnapshot } from './snapshot.js'

export type GateKind = 'verify' | 'review'
export interface GatePlan {
  schema: 'wholeloop/gate-round@1'
  subject: string
  run: string
  gate: GateKind
  round: number
  budget: number
  policy: string
  repository: string
  base: { ref: string; sha: string }
  snapshot: WorkspaceSnapshot
  inputs: GateInputs
  units: GateUnit[]
  excluded: { id: string; reason: string }[]
  verifiers: number
  refutations: number
}
export interface GateFinding {
  id: string
  location: string
  text: string
  evidence: string[]
}
export interface GateResult {
  unit: string
  status: 'ok' | 'unavailable'
  evidence: string[]
  findings: GateFinding[]
  execution?: { status: 'passed' | 'failed' }
  reason?: string
}
export interface GateVote {
  finding: string
  verifier: number
  outcome: 'refute' | 'confirm' | 'uncertain'
  reason: string
  evidence: string[]
}
export interface GateReport {
  verdict: 'PASS' | 'FAIL' | 'EXHAUSTED'
  unchanged: boolean
  missing: string[]
  kept: { id: string; unit: string; finding: GateFinding; refutations: number; reason: string }[]
  dropped: { id: string; unit: string; finding: GateFinding; refutations: number; reason: string }[]
}
export type GateEventData =
  | { type: 'gate.planned'; data: { plan: GatePlan } }
  | { type: 'gate.submitted'; data: { run: string; round: number; result: GateResult } }
  | { type: 'gate.examined'; data: { run: string; round: number; vote: GateVote } }
  | { type: 'gate.extended'; data: { run: string; budget: number; reason: string } }
  | {
      type: 'gate.decided'
      data: { run: string; round: number; observed: string; report: GateReport }
    }

export const GATE_SCHEMAS = { plan: planSchema, result: resultSchema, vote: voteSchema }
const meaningful = (value: string) => !!value.trim()
export function validateGatePlan(value: unknown): asserts value is GatePlan {
  const problems = validate(value, planSchema, 'gate.plan')
  if (problems.length) throw new Error(problems.join('\n'))
  const plan = value as GatePlan
  if (
    plan.refutations !== Math.floor(plan.verifiers / 2) + 1 ||
    plan.round > plan.budget ||
    !plan.units.length ||
    new Set(plan.units.map((unit) => unit.id)).size !== plan.units.length
  )
    throw new Error(
      'Gate plan needs unique coverage and a strict-majority quorum within its budget',
    )
}
export function validateGateResult(value: unknown): asserts value is GateResult {
  const problems = validate(value, resultSchema, 'gate.result')
  if (problems.length) throw new Error(problems.join('\n'))
  const result = value as GateResult
  if (
    !result.evidence.every(meaningful) ||
    new Set(result.findings.map(({ id }) => id)).size !== result.findings.length ||
    result.findings.some(
      (finding) =>
        !meaningful(finding.text) ||
        !meaningful(finding.location) ||
        !finding.evidence.every(meaningful),
    )
  )
    throw new Error('Gate findings need unique ids, locations and meaningful evidence')
  if (result.execution && result.unit !== 'suite')
    throw new Error('Only the suite unit carries process execution status')
  if (result.status === 'ok' && !result.evidence.length)
    throw new Error('A completed gate unit needs observed evidence, even with no findings')
  if (result.status === 'unavailable' && (!result.reason?.trim() || result.findings.length))
    throw new Error('Unavailable units need a reason and cannot report findings')
}
export function validateGateVote(value: unknown): asserts value is GateVote {
  const problems = validate(value, voteSchema, 'gate.vote')
  if (problems.length) throw new Error(problems.join('\n'))
  const vote = value as GateVote
  if (
    !vote.reason.trim() ||
    !vote.evidence.every(meaningful) ||
    (vote.outcome === 'refute' && !vote.evidence.length)
  )
    throw new Error('An active refutation needs a reason and observed evidence')
}
