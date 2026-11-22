// Replays gate rounds and rejects impossible transitions.
import { isObject, validate } from '../config/schema.js'
import type { StateEvent } from '../state/events.js'
import { type SuiteStartFailure, validStartupFailure } from '../verification/start.js'
import type {
  GateClassification,
  GateKind,
  GatePlan,
  GateReport,
  GateResult,
  GateVote,
} from './contracts.js'
import {
  severitySchema,
  validateGatePlan,
  validateGateResult,
  validateGateVote,
} from './contracts.js'
import { gateReport } from './report.js'
import schemas from './schemas/events-v1.json' with { type: 'json' }

export interface GateRound {
  plan: GatePlan
  results: GateResult[]
  votes: GateVote[]
  classifications: GateClassification[]
  decision?: { observed: string; report: GateReport }
}
export interface GateRun {
  subject: string
  run: string
  gate: GateKind
  budget: number
  rounds: GateRound[]
  unavailable?: SuiteStartFailure
}

export const remainingStartupBudget = (run: GateRun) => run.budget - (run.rounds.length - 1)

export function validGateData(type: string, data: Record<string, unknown>): boolean {
  if (type === 'gate.classified') return !validate(data, severitySchema).length
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
  const runs = new Map<string, GateRun>(),
    latestBySubject = new Map<string, Map<GateKind, GateRun>>()
  for (const entry of events) {
    if (entry.type === 'verify.suite-unavailable') {
      const run = runs.get(entry.data.run),
        current = run?.rounds.at(-1)
      if (
        !run ||
        run.subject !== entry.subject ||
        run.gate !== 'verify' ||
        run.unavailable ||
        latestBySubject.get(entry.subject)?.get('verify') !== run ||
        current?.plan.round !== entry.data.round ||
        current.decision ||
        current.votes.length ||
        current.results.some((result) => result.unit !== 'testability') ||
        !validStartupFailure(entry.data)
      )
        throw new Error('Only an unchanged unexamined verify startup can release its unused budget')
      run.unavailable = entry.data
      continue
    }
    if (!entry.type.startsWith('gate.')) continue
    if (entry.type === 'gate.planned') {
      const plan = entry.data.plan,
        subject = entry.subject
      if (plan.subject !== subject) throw new Error('Gate plan subject mismatch')
      let run = runs.get(plan.run)
      const latest = latestBySubject.get(subject)?.get(plan.gate)
      if (!run) {
        if (
          plan.round !== 1 ||
          (latest &&
            !latest.unavailable &&
            latest.rounds.at(-1)?.decision?.report.verdict !== 'PASS')
        )
          throw new Error('Finish the existing gate run; failed budgets cannot reset implicitly')
        if (latest?.unavailable) {
          const first = latest.rounds[0]?.plan
          if (
            plan.budget !== remainingStartupBudget(latest) ||
            !first ||
            first.repository !== plan.repository ||
            first.snapshot.branch !== plan.snapshot.branch ||
            JSON.stringify(first.base) !== JSON.stringify(plan.base) ||
            first.policy !== plan.policy ||
            first.verifiers !== plan.verifiers
          )
            throw new Error(
              'A startup replacement must preserve policy and the remaining evaluation budget',
            )
        }
        run = {
          subject,
          run: plan.run,
          gate: plan.gate,
          budget: plan.budget,
          rounds: [],
        }
        runs.set(plan.run, run)
        // Latest means creation order, matching the original run-vector scan.
        // Advancing an older run must never move this selector backwards.
        const lanes = latestBySubject.get(subject) ?? new Map<GateKind, GateRun>()
        lanes.set(plan.gate, run)
        latestBySubject.set(subject, lanes)
      } else {
        const first = run.rounds[0]?.plan
        const previous = run.rounds.at(-1)
        if (
          latest !== run ||
          run.subject !== subject ||
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
      run.rounds.push({ plan, results: [], votes: [], classifications: [] })
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
      if (run.unavailable)
        throw new Error('A suite startup failure cannot receive a code verdict or worker results')
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
      if (entry.type === 'gate.classified') {
        const { finding, severity } = entry.data
        const unit = current.plan.units.find(({ id }) => finding.startsWith(`${id}:`))
        const known = current.results.some(
          (result) =>
            result.unit === unit?.id &&
            result.findings.some(({ id }) => `${result.unit}:${id}` === finding),
        )
        if (
          !unit ||
          unit.failSafe ||
          !known ||
          current.classifications.some((prior) => prior.finding === finding) ||
          current.votes.some((vote) => vote.finding === finding)
        )
          throw new Error(
            'Only an unexamined finding of an optional lens can be classified, once, below blocker',
          )
        current.classifications.push({ finding, severity })
      }
      if (entry.type === 'gate.examined') {
        const { vote } = entry.data
        if (current.classifications.some((entry) => entry.finding === vote.finding))
          throw new Error('Advisory findings are reported, not cross-examined')
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
          current.classifications,
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
