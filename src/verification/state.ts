import { gateRuns } from '../gates/state.js'
import type { StateEvent } from '../state/events.js'
import type { SuitePlan, SuiteResult } from './contracts.js'

/** Reject duplicate intents and inconsistent process receipts during every replay. */
export function verificationRuns(events: readonly StateEvent[]) {
  const gates = gateRuns(events)
  const runs = new Map<
    string,
    { subject: string; run: string; round: number; plan: SuitePlan; result?: SuiteResult }
  >()
  const agreed = new Set<string>()
  for (const event of events) {
    if (event.type === 'verify.agreed') {
      if (agreed.has(event.subject))
        throw new Error('Verification criteria already agreed for this item')
      agreed.add(event.subject)
    }
    if (event.type === 'verify.suite-planned') {
      const { run, round, plan } = event.data
      const key = `${run}/${round}`
      const gate = gates
        .find((gate) => gate.subject === event.subject && gate.run === run)
        ?.rounds.find((entry) => entry.plan.round === round)
      const gateEvent = events.findIndex(
        (entry) =>
          entry.type === 'gate.planned' &&
          entry.data.plan.run === run &&
          entry.data.plan.round === round,
      )
      if (runs.has(key) || gate?.plan.gate !== 'verify' || gateEvent >= events.indexOf(event))
        throw new Error('Suite needs one prior planned verify round')
      runs.set(key, { subject: event.subject, run, round, plan })
    }
    if (event.type === 'verify.suite-finished') {
      const entry = runs.get(`${event.data.run}/${event.data.round}`)
      const result = event.data.result
      if (
        !entry ||
        entry.subject !== event.subject ||
        entry.result ||
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
  }
  return [...runs.values()]
}
