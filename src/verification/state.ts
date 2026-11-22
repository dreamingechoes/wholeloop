// Replays verification runs and rejects duplicate or inconsistent records.
import type { GatePlan } from '../gates/contracts.js'
import { gateRuns } from '../gates/state.js'
import type { StateEvent } from '../state/events.js'
import type { SuiteExecution, SuitePlan, SuiteResult } from './contracts.js'
import { type SuiteStartFailure, validStartupFailure } from './start.js'

/** Reject duplicate intents and inconsistent process receipts during every replay. */
export function verificationRuns(events: readonly StateEvent[]) {
  return replayVerification(events).suites
}

/** One fixed replay exposes its validated gate and suite facts together. */
export function replayVerification(events: readonly StateEvent[]) {
  // Preserve validation of the complete gate history, including later corrupt
  // transitions. Suite linkage itself needs only a validated earlier plan.
  const gates = gateRuns(events)
  return { gates, suites: replaySuites(events) }
}

function replaySuites(events: readonly StateEvent[]) {
  const planned = new Map<string, GatePlan>()
  const runs = new Map<
    string,
    {
      subject: string
      run: string
      round: number
      plan: SuitePlan
      result?: SuiteResult
      unavailable?: SuiteStartFailure
      execution?: SuiteExecution
    }
  >()
  const agreed = new Set<string>()
  for (const event of events) {
    if (event.type === 'gate.planned') {
      const plan = event.data.plan
      planned.set(`${plan.run}/${plan.round}`, plan)
      continue
    }
    if (event.type === 'verify.agreed') {
      if (agreed.has(event.subject))
        throw new Error('Verification criteria already agreed for this item')
      agreed.add(event.subject)
    }
    if (event.type === 'verify.suite-planned') {
      const { run, round, plan } = event.data
      const key = `${run}/${round}`
      const gate = planned.get(key)
      if (runs.has(key) || gate?.subject !== event.subject || gate.gate !== 'verify')
        throw new Error('Suite needs one prior planned verify round')
      runs.set(key, { subject: event.subject, run, round, plan })
    }
    if (event.type === 'verify.suite-execution') {
      const entry = runs.get(`${event.data.run}/${event.data.round}`)
      if (
        !entry ||
        entry.subject !== event.subject ||
        entry.execution ||
        entry.result ||
        entry.unavailable
      )
        throw new Error('Suite execution must describe its unique unfinished suite intent')
      entry.execution = event.data
    }
    if (event.type === 'verify.suite-finished') {
      const entry = runs.get(`${event.data.run}/${event.data.round}`)
      const result = event.data.result
      if (
        !entry ||
        entry.subject !== event.subject ||
        entry.result ||
        entry.unavailable ||
        !result.commands.length ||
        result.commands.length > entry.plan.commands.length ||
        result.commands.some((command, index) => command.ref !== entry.plan.commands[index]?.ref) ||
        (result.status === 'passed' &&
          (!result.unchanged ||
            result.commands.length !== entry.plan.commands.length ||
            result.commands.some((command) => command.exitCode !== 0 || !!command.signal)))
      )
        throw new Error('Suite receipt must match its unique planned execution')
      entry.result = result
    }
    if (event.type === 'verify.suite-unavailable') {
      const entry = runs.get(`${event.data.run}/${event.data.round}`),
        commands = event.data.commands,
        last = commands.at(-1),
        declared = entry?.plan.commands[commands.length - 1]
      if (
        !entry ||
        entry.subject !== event.subject ||
        entry.result ||
        entry.unavailable ||
        !commands.length ||
        commands.length > entry.plan.commands.length ||
        commands.some((command, index) => command.ref !== entry.plan.commands[index]?.ref) ||
        commands.slice(0, -1).some((command) => command.exitCode !== 0 || !!command.signal) ||
        last?.ref !== event.data.cause.ref ||
        declared?.argv[0] !== event.data.cause.executable ||
        !validStartupFailure(event.data)
      )
        throw new Error('Startup failure must match its unique unfinished suite intent')
      entry.unavailable = event.data
    }
  }
  return [...runs.values()]
}
