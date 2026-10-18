import { CliError } from '../cli/errors.js'
import { EXIT } from '../cli/io.js'
import { loadExtensionOptions } from '../config/load.js'
import type { FlowEngine } from '../flow/engine.js'
import { detectMcp } from '../providers/detect.js'
import { loadProviders } from '../providers/load.js'
import type { StateEvent } from '../state/events.js'
import {
  type AngleResult,
  type Refutation,
  validateRefutation,
  validateResult,
} from './contracts.js'
import { researchPlan } from './plan.js'
import { researchBrief, researchReport, researchState } from './report.js'

function activeRun(events: readonly StateEvent[], subject: string): string {
  const latest = [...events]
    .reverse()
    .find(
      (entry) =>
        entry.subject === subject &&
        (entry.type === 'step.started' ||
          entry.type === 'step.completed' ||
          entry.type === 'step.skipped') &&
        entry.data.step === 'research',
    )
  if (latest?.type !== 'step.started')
    throw new CliError(
      'Begin research before planning, submitting or completing it',
      EXIT.precondition,
    )
  return latest.data.run
}

export class ResearchWorkflow {
  constructor(readonly engine: FlowEngine) {}

  plan(subject: string) {
    return this.engine.store.transaction((events, append) => {
      const run = activeRun(events, subject)
      let existing = events.find(
        (entry) =>
          entry.subject === subject && entry.type === 'research.planned' && entry.data.run === run,
      )
      if (existing?.type !== 'research.planned') {
        const configuration = this.engine.configuration()
        const detection = detectMcp(this.engine.root, this.engine.home)
        if (detection.problems.length)
          throw new CliError('Resolve MCP configuration problems before planning research')
        const item = this.engine.store.get(subject)
        const started = events.find(
          (entry) =>
            entry.subject === subject && entry.type === 'step.started' && entry.data.run === run,
        )
        if (started?.type !== 'step.started') throw new Error('Research run is missing its input')
        const plan = researchPlan({
          subject,
          run,
          question: started.data.input,
          owner: item.owner,
          configuration: configuration.values,
          registry: loadProviders(
            loadExtensionOptions({ root: this.engine.root, userFile: this.engine.userFile }),
          ),
          declarations: detection.declarations,
        })
        append(subject, { type: 'research.planned', data: { run, plan } })
        existing = events.at(-1)
      }
      const state = researchState(events, subject, run)
      const report = researchReport(state.plan, state.results, state.votes)
      return {
        ...state.plan,
        jobs: state.plan.angles
          .filter((angle) => !state.results.some((result) => result.angle === angle.id))
          .map((angle) => ({ role: 'researcher', angle })),
        examinations: report.claims
          .filter((claim) => claim.loadBearing)
          .flatMap((claim) =>
            Array.from({ length: state.plan.verifiers }, (_, index) => ({
              role: 'challenger',
              claim: claim.id,
              verifier: index + 1,
            })).filter(
              (job) =>
                !state.votes.some(
                  (vote) => vote.claim === job.claim && vote.verifier === job.verifier,
                ),
            ),
          ),
      }
    })
  }

  submit(subject: string, value: unknown) {
    validateResult(value)
    return this.engine.store.transaction((events, append) => {
      const run = activeRun(events, subject)
      const state = researchState(events, subject, run)
      if (state.results.some((result) => result.angle === value.angle))
        throw new CliError('This angle already has a result; start a new research run to revise it')
      researchReport(state.plan, [...state.results, value], state.votes)
      append(subject, { type: 'research.submitted', data: { run, result: value } })
      return { schema: 'wholeloop/research-submit@1', subject, run, angle: value.angle }
    })
  }

  examine(subject: string, value: unknown) {
    validateRefutation(value)
    return this.engine.store.transaction((events, append) => {
      const run = activeRun(events, subject)
      const state = researchState(events, subject, run)
      researchReport(state.plan, state.results, [...state.votes, value])
      append(subject, { type: 'research.examined', data: { run, vote: value } })
      return {
        schema: 'wholeloop/research-examine@1',
        subject,
        run,
        claim: value.claim,
        verifier: value.verifier,
      }
    })
  }

  complete(subject: string) {
    const events = this.engine.store.events()
    const run = activeRun(events, subject)
    const state = researchState(events, subject, run)
    const report = researchReport(state.plan, state.results, state.votes)
    const receipt = this.engine.complete('research', subject, researchBrief(events, subject, run))
    return { schema: 'wholeloop/research-complete@1', report, receipt }
  }
}

export type { AngleResult, Refutation }
