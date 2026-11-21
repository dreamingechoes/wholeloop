// The research step workflow: plan, angle results, refutations and the report.
import { join } from 'node:path'
import { ADAPTERS } from '../adapters/generate.js'
import { CliError } from '../cli/errors.js'
import { EXIT } from '../cli/io.js'
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { writeSetting } from '../config/write.js'
import type { FlowEngine } from '../flow/engine.js'
import { detectMcpByClient } from '../providers/detect.js'
import { loadProviders } from '../providers/load.js'
import { sourceCandidates } from '../providers/source-access.js'
import { currentClientAttribution } from '../state/attribution-context.js'
import type { StateEvent } from '../state/events.js'
import { researchAssignments } from './assignments.js'
import {
  conclusionBasis,
  conclusionSchema,
  researchCertainty,
  researchSummary,
  validateConclusion,
} from './conclusion.js'
import {
  type AngleResult,
  type Refutation,
  validateRefutation,
  validateResult,
} from './contracts.js'
import { researchPlan } from './plan.js'
import { renderResearchBrief, researchReport, researchState } from './report.js'

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

  plan(
    subject: string,
    options: {
      sources?: readonly string[]
      remember?: string
      client?: string
      path?: string
      env?: NodeJS.ProcessEnv
    } = {},
  ) {
    const declared = currentClientAttribution()?.client
    if (options.client && !ADAPTERS.some((adapter) => adapter.id === options.client))
      throw new CliError('Unknown research client')
    if (declared && options.client && declared !== options.client)
      throw new CliError('The research client must match the executing adapter')
    const client = declared ?? options.client
    const scope = options.remember === 'repository' ? 'project' : (options.remember ?? 'run')
    if (!['run', 'project', 'user'].includes(scope))
      throw new CliError('Remember sources for run, project or user')
    if (options.remember && options.sources === undefined)
      throw new CliError('Remembering sources requires an explicit --sources choice')
    const remember = (sources: readonly string[]) => {
      const file =
        scope === 'user' ? this.engine.userFile : join(this.engine.root, '.wholeloop/config.yml')
      writeSetting(file, ['providers', 'sources'], [...sources].sort())
      return { scope, file }
    }
    return this.engine.store.transaction((events, append) => {
      const run = activeRun(events, subject)
      let existing = events.find(
        (entry) =>
          entry.subject === subject && entry.type === 'research.planned' && entry.data.run === run,
      )
      let remembered: { scope: string; file: string } | undefined
      if (existing?.type === 'research.planned') {
        const pinned = [...new Set(existing.data.plan.angles.map((angle) => angle.provider))].sort()
        if (options.sources !== undefined) {
          const selected = [...options.sources].sort()
          if (JSON.stringify(selected) !== JSON.stringify(pinned))
            throw new CliError(
              'Sources are already pinned; begin a new research run to change them',
            )
          if (options.remember && scope !== 'run') remembered = remember(selected)
        }
      } else {
        const configuration = this.engine.configuration()
        const detection = detectMcpByClient(
          this.engine.root,
          this.engine.home,
          options.env ?? process.env,
        )
        if (detection.problems.some((problem) => problem.target === client))
          throw new CliError(
            'Resolve MCP configuration problems in the current client before planning research',
          )
        const item = this.engine.store.get(subject)
        const started = events.find(
          (entry) =>
            entry.subject === subject && entry.type === 'step.started' && entry.data.run === run,
        )
        if (started?.type !== 'step.started') throw new Error('Research run is missing its input')
        const registry = loadProviders(
          loadExtensionOptions({ root: this.engine.root, userFile: this.engine.userFile }),
        )
        const choices = sourceCandidates({
          registry,
          declarations: detection.declarations,
          client,
          path: options.path,
        })
        const providers = configuration.values.providers
        const configured =
          isObject(providers) && Array.isArray(providers.sources)
            ? (providers.sources as string[])
            : undefined
        const selected = options.sources ?? configured
        if (
          selected !== undefined &&
          (new Set(selected).size !== selected.length ||
            selected.some((id) => !choices.candidates.some((candidate) => candidate.id === id)))
        )
          throw new CliError('Select unique source IDs offered by research plan')
        const plan = researchPlan({
          subject,
          run,
          question: started.data.input,
          owner: item.owner,
          configuration: configuration.values,
          registry,
          declarations: detection.declarations,
          client,
          path: options.path,
          sources: selected ?? [],
          candidates: choices.candidates,
        })
        if (selected === undefined)
          return {
            ...plan,
            schema: 'wholeloop/research-sources@1' as const,
            status: 'needs-sources' as const,
            client: client ?? 'unknown',
            ...choices,
            suggested: choices.candidates
              .filter(
                (candidate) =>
                  candidate.access === 'native' &&
                  candidate.available &&
                  candidate.capabilities.length === 1 &&
                  ((candidate.id === 'native-code' &&
                    candidate.capabilities[0] === 'source.code') ||
                    (candidate.id === 'native-web' && candidate.capabilities[0] === 'source.web')),
              )
              .map((candidate) => candidate.id),
            jobs: [],
            examinations: [],
            remember: ['run', 'project', 'user'],
          }
        if (options.remember && scope !== 'run') remembered = remember(selected)
        append(subject, { type: 'research.planned', data: { run, plan } })
        existing = events.at(-1)
      }
      const state = researchState(events, subject, run)
      if (existing?.type !== 'research.planned') throw new Error('Research plan was not pinned')
      const journalFile = this.engine.store.files.path(`journal/${existing.ts.slice(0, 7)}.ndjson`)
      if (options.remember && scope === 'run') remembered = { scope, file: journalFile }
      return {
        ...state.plan,
        status: 'planned' as const,
        selection: {
          sources: [...new Set(state.plan.angles.map((angle) => angle.provider))].sort(),
          scope: 'run',
          file: journalFile,
        },
        ...(remembered ? { remembered } : {}),
        ...researchAssignments(state.plan, state.results, state.votes),
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

  complete(subject: string, conclusion?: unknown) {
    const events = this.engine.store.events()
    const run = activeRun(events, subject)
    const state = researchState(events, subject, run)
    const report = researchReport(state.plan, state.results, state.votes)
    const basis = conclusionBasis(state.plan, report)
    if (conclusion === undefined)
      return {
        schema: 'wholeloop/research-conclusion-context@1' as const,
        status: 'needs-conclusion' as const,
        subject,
        run,
        basis,
        question: state.plan.question,
        report,
        certainty: researchCertainty(report),
        inputSchema: structuredClone(conclusionSchema),
        text: renderResearchBrief(state.plan, report),
      }
    validateConclusion(conclusion, basis)
    const content = renderResearchBrief(state.plan, report, conclusion)
    const completed = this.engine.complete(
      'research',
      subject,
      content,
      undefined,
      undefined,
      conclusion,
    )
    const summary = researchSummary(report, conclusion)
    return {
      schema: 'wholeloop/research-complete@1' as const,
      report,
      receipt: {
        ...completed,
        ...summary,
        text: `${summary.text}\n\nBrief: ${completed.artifact}`,
        basis,
      },
    }
  }
}

export type { AngleResult, Refutation }
