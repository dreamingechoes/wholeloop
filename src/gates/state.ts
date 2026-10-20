import { isObject, validate } from '../config/schema.js'
import type { StateEvent } from '../state/events.js'
import type { GateKind, GatePlan, GateReport, GateResult, GateVote } from './contracts.js'
import { validateGatePlan, validateGateResult, validateGateVote } from './contracts.js'
import { gateReport } from './report.js'
import schemas from './schemas/events-v1.json' with { type: 'json' }

export interface GateRound {
  plan: GatePlan
  results: GateResult[]
  votes: GateVote[]
  decision?: { observed: string; report: GateReport }
}
export interface GateRun {
  subject: string
  run: string
  gate: GateKind
  budget: number
  rounds: GateRound[]
}

export function validGateData(type: string, data: Record<string, unknown>): boolean {
  const schema = Object.entries(schemas.properties).find(([key]) => key === type)?.[1]
  if (!schema || validate(data, schema).length) return false
  try {
    if (type === 'gate.planned') validateGatePlan(data.plan)
    if (type === 'gate.submitted') validateGateResult(data.result)
    if (type === 'gate.examined') validateGateVote(data.vote)
    return true
  } catch {
    return false
  }
}

/** Replay rejects impossible transitions even when callers bypass the workflow API. */
export function gateRuns(events: readonly StateEvent[]): GateRun[] {
  const runs = new Map<string, GateRun>()
  for (const entry of events) {
    if (!entry.type.startsWith('gate.')) continue
    if (entry.type === 'gate.planned') {
      const plan = entry.data.plan
      if (plan.subject !== entry.subject) throw new Error('Gate plan subject mismatch')
      let run = runs.get(plan.run)
      const latest = [...runs.values()]
        .filter((value) => value.subject === entry.subject && value.gate === plan.gate)
        .at(-1)
      if (!run) {
        if (
          plan.round !== 1 ||
          (latest && latest.rounds.at(-1)?.decision?.report.verdict !== 'PASS')
        )
          throw new Error('Finish the existing gate run; failed budgets cannot reset implicitly')
        run = {
          subject: entry.subject,
          run: plan.run,
          gate: plan.gate,
          budget: plan.budget,
          rounds: [],
        }
        runs.set(plan.run, run)
      } else {
        const first = run.rounds[0]?.plan
        const previous = run.rounds.at(-1)
        if (
          latest !== run ||
          run.subject !== entry.subject ||
          run.gate !== plan.gate ||
          !previous?.decision ||
          previous.decision.report.verdict === 'PASS' ||
          plan.round !== run.rounds.length + 1 ||
          plan.budget !== run.budget ||
          plan.round > run.budget ||
          !first ||
          first.repository !== plan.repository ||
          JSON.stringify(first.base) !== JSON.stringify(plan.base) ||
          first.policy !== plan.policy ||
          first.verifiers !== plan.verifiers
        )
          throw new Error('Gate rounds must preserve their run, policy, repository and budget')
      }
      run.rounds.push({ plan, results: [], votes: [] })
    } else if ('run' in entry.data && typeof entry.data.run === 'string') {
      const run = runs.get(entry.data.run)
      if (!run || run.subject !== entry.subject) throw new Error('Gate event needs its planned run')
      const current = run.rounds.at(-1)
      if (!current) throw new Error('Gate event needs a round')
      if (entry.type === 'gate.extended') {
        if (
          !entry.data.reason.trim() ||
          current.decision?.report.verdict === 'PASS' ||
          entry.data.budget <= run.budget
        )
          throw new Error('Extend a non-passing gate with a larger explicit budget and reason')
        run.budget = entry.data.budget
        continue
      }
      if (!('round' in entry.data) || entry.data.round !== current.plan.round || current.decision)
        throw new Error('Gate submissions require the current unsealed round')
      if (entry.type === 'gate.submitted') {
        const { result } = entry.data
        if (
          !current.plan.units.some(({ id }) => id === result.unit) ||
          current.results.some(({ unit }) => unit === result.unit)
        )
          throw new Error('Gate unit is unplanned or already submitted')
        current.results.push(result)
      }
      if (entry.type === 'gate.examined') {
        const { vote } = entry.data
        const known = current.results.some((result) =>
          result.findings.some((finding) => `${result.unit}:${finding.id}` === vote.finding),
        )
        if (
          !known ||
          vote.verifier > current.plan.verifiers ||
          current.votes.some(
            (prior) => prior.finding === vote.finding && prior.verifier === vote.verifier,
          )
        )
          throw new Error('Finding or verifier is unknown, outside quorum or already submitted')
        current.votes.push(vote)
      }
      if (entry.type === 'gate.decided') {
        const expected = gateReport(
          current.plan,
          current.results,
          current.votes,
          entry.data.observed,
          run.budget,
        )
        if (
          !isObject(entry.data.report) ||
          JSON.stringify(entry.data.report) !== JSON.stringify(expected)
        )
          throw new Error('Gate verdict must match deterministic aggregation')
        current.decision = { observed: entry.data.observed, report: expected }
      }
    }
  }
  return [...runs.values()]
}
