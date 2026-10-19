import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { BuildWorkflow } from '../build/workflow.js'
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import type { FlowEngine } from '../flow/engine.js'
import { launchRuns } from '../launch/contracts.js'
import { measurementDigest } from '../launch/measurement.js'
import { loadProviders } from '../providers/load.js'
import type { ProviderHost } from '../providers/operations.js'
import type { StateEvent } from '../state/events.js'
import { canonicalPath, inside } from '../state/paths.js'
import {
  bindRampControl,
  observedTarget,
  type RampOutcome,
  type RampPlan,
  rampProposal,
  rampRecommendation,
  rampRuns,
  validateRampPlan,
} from './contracts.js'
import { collectRampEvidence, flagEvidence } from './evidence.js'

const latest = (events: readonly StateEvent[], subject: string) =>
  rampRuns(events)
    .filter((run) => run.subject === subject)
    .at(-1)
export function defaultRampStages(internalAudience = '<confirm-internal-audience>') {
  return [
    { key: 'off', audience: 'all', enabled: false, exposure: 0 },
    { key: 'internal', audience: internalAudience, enabled: true, exposure: 100 },
    { key: 'ten', audience: 'all', enabled: true, exposure: 10 },
    { key: 'half', audience: 'all', enabled: true, exposure: 50 },
    { key: 'all', audience: 'all', enabled: true, exposure: 100 },
  ]
}
function criteriaGuidance(engine: FlowEngine) {
  const inventory = discover(engine.root, engine.store.files, engine.home)
  const slots = engine.config().slots
  const binding = resolveSlot('ramp.criteria', inventory.repo, {
    user: inventory.user,
    ...(isObject(slots) && typeof slots['ramp.criteria'] === 'string'
      ? { binding: slots['ramp.criteria'] }
      : {}),
  })
  const selected = binding.selected
  if (!selected || binding.questions.length)
    throw new Error('Resolve ramp.criteria before planning the stages')
  let content =
    'Collect explicit error, observability and key-metric queries. Unknown required evidence blocks go; optional open signals need explicit acknowledgment. Every exposure change remains human.'
  if (selected.origin !== 'harness') {
    const base = selected.origin === 'user' ? engine.home : engine.root
    const file = canonicalPath(isAbsolute(selected.ref) ? selected.ref : join(base, selected.ref))
    if (
      !inside(canonicalPath(base), file) ||
      !statSync(file).isFile() ||
      statSync(file).size > 1024 * 1024
    )
      throw new Error('Ramp criteria guidance must be a local file under 1 MiB')
    content = readFileSync(file, 'utf8')
    if (!content.trim()) throw new Error('Ramp criteria guidance must contain meaningful text')
  }
  return { ref: selected.ref, origin: selected.origin, digest: measurementDigest(content), content }
}
export class RampWorkflow {
  constructor(readonly engine: FlowEngine) {}
  begin(options: { subject?: string; input?: string; owner?: string; plan?: RampPlan }) {
    const engine = options.subject
      ? new BuildWorkflow(this.engine).engineFor(options.subject)
      : this.engine
    const item = options.subject ? engine.store.get(options.subject) : undefined
    if (item && (item.kind !== 'scope' || item.status !== 'open'))
      throw new Error('Ramp an open scope or an explicitly owned standalone exposure control')
    const questions: { id: string; prompt: string }[] = []
    const owner = options.owner ?? item?.owner
    if (!owner?.trim())
      questions.push({
        id: 'owner',
        prompt: 'Who owns this ramp and its external exposure changes?',
      })
    if (!item && !options.input?.trim())
      questions.push({ id: 'input', prompt: 'What change and exposure control should be ramped?' })
    if (!options.plan)
      questions.push({
        id: 'plan',
        prompt:
          'Confirm the environment, named flag or manual control, audience stages and exact query/threshold/window checks for every stage.',
      })
    const launch = launchRuns(engine.store.events())
      .filter((run) => run.subject === options.subject && run.draft)
      .at(-1)
    if (questions.length)
      return {
        schema: 'wholeloop/ramp-begin@1',
        status: 'question' as const,
        questions,
        proposalOnly: true,
        stageSuggestion: launch?.plan.source.plan.rollout.stages ?? defaultRampStages(),
      }
    if (!options.plan) throw new Error('Missing confirmed ramp plan')
    validateRampPlan(options.plan)
    if (launch && options.plan.sourceDigest !== launch.plan.source.digest)
      throw new Error('The ramp must pin its prepared launch measurement digest')
    const guidance = criteriaGuidance(engine)
    const subject =
      item?.id ??
      engine.store.create({
        kind: 'scope',
        title: options.input ?? '',
        owner: owner ?? '',
        body: 'Standalone ramp; no prior Define, merge or exposure result is implied.',
        repository: canonicalPath(engine.root),
      }).id
    const begun = engine.begin('ramp-exposure', { subject })
    if (begun.code !== 0 || !begun.payload.run)
      throw new Error('Resolve ramp-exposure preconditions before observing stages')
    const { content: _content, ...criteria } = guidance
    const run = begun.payload.run
    engine.store.transaction((events, append) => {
      const current = latest(events, subject)
      if (current?.run === run) {
        if (
          JSON.stringify(current.plan) !== JSON.stringify(options.plan) ||
          JSON.stringify(current.criteria) !== JSON.stringify(criteria)
        )
          throw new Error(
            'Ramp plan/guidance changed mid-run; restore it or explicitly end the old run',
          )
      } else
        append(subject, {
          type: 'ramp.planned',
          data: { run, plan: options.plan as RampPlan, criteria },
        })
    })
    return {
      schema: 'wholeloop/ramp-begin@1',
      status: 'planned' as const,
      subject,
      run,
      guidance,
      questions: [],
      report: this.report(subject),
    }
  }
  context(subject: string) {
    const engine = new BuildWorkflow(this.engine).engineFor(subject)
    const record = latest(engine.store.events(), subject)
    if (!record) throw new Error('Begin ramp-exposure before observing or deciding stages')
    const guidance = criteriaGuidance(engine)
    const { content: _content, ...reference } = guidance
    if (JSON.stringify(reference) !== JSON.stringify(record.criteria))
      throw new Error('Ramp criteria guidance changed after planning')
    const launch = launchRuns(engine.store.events())
      .filter((run) => run.subject === subject && run.draft)
      .at(-1)
    if (record.plan.sourceDigest && launch?.plan.source.digest !== record.plan.sourceDigest)
      throw new Error('The prepared launch measurement revision changed during this ramp')
    const registry = loadProviders(
      loadExtensionOptions({ root: engine.root, userFile: engine.userFile }),
    )
    if (registry.problems.length)
      throw new Error('Resolve provider manifest problems before reading ramp evidence')
    const providers = engine.config().providers
    const flagsProvider =
      isObject(providers) && typeof providers.flags === 'string' ? providers.flags : undefined
    return {
      engine,
      record,
      guidance,
      registry,
      flagsProvider,
      owner: engine.store.get(subject).owner,
    }
  }
  async observe(subject: string, host: ProviderHost, at?: string) {
    const { engine, record, registry, flagsProvider, owner } = this.context(subject)
    const evidence = bindRampControl(
      await collectRampEvidence(
        record.run,
        record.plan,
        record.stage,
        registry,
        flagsProvider,
        owner,
        host,
        at,
        record.exposureSince,
      ),
      record.baseline,
      record.controlUncertain,
    )
    engine.store.transaction((events, append) => {
      const current = latest(events, subject)
      if (
        !current ||
        current.run !== record.run ||
        current.stage !== record.stage ||
        current.observation?.event !== record.observation?.event ||
        current.decision?.event !== record.decision?.event
      )
        throw new Error('Ramp advanced during evidence collection; inspect its current stage')
      append(subject, { type: 'ramp.observed', data: evidence })
    })
    return this.report(subject)
  }
  decide(
    subject: string,
    outcome: RampOutcome,
    options: { basis: string; by: string; reason: string; acknowledgedRisks?: string[] },
  ) {
    if (
      !['go', 'hold', 'rollback'].includes(outcome) ||
      !options.by.trim() ||
      !options.reason.trim()
    )
      throw new Error('Record go/hold/rollback, person and reason')
    const { engine, record } = this.context(subject)
    engine.store.transaction((events, append) => {
      const current = latest(events, subject)
      if (current?.run !== record.run || current.stage !== record.stage)
        throw new Error('Ramp stage advanced before the decision')
      append(subject, {
        type: 'ramp.decided',
        data: {
          run: record.run,
          stage: record.stage,
          basis: options.basis,
          by: options.by,
          reason: options.reason,
          outcome,
          acknowledgedRisks: options.acknowledgedRisks ?? [],
        },
      })
    })
    return this.report(subject)
  }
  async confirm(
    subject: string,
    host: ProviderHost,
    options: { by: string; manualEvidence?: string },
  ) {
    const { engine, record, registry, flagsProvider } = this.context(subject)
    if (!options.by.trim() || !record.decision || record.decision.outcome === 'hold')
      throw new Error('Confirm an explicitly approved go/rollback with the person who performed it')
    const observed = await flagEvidence(record.plan, registry, flagsProvider, host)
    if (!record.plan.flag) {
      if (!options.manualEvidence?.trim())
        throw new Error('Manual exposure confirmation needs an explicit evidence reference')
      observed.ref = options.manualEvidence
    }
    const target = record.plan.stages[record.stage]
    if (record.decision.outcome === 'go' && (!target || !observedTarget(observed, target)))
      throw new Error(
        'The flag read has not confirmed the approved exposure/audience; no stage advanced',
      )
    const at = new Date().toISOString()
    engine.store.transaction((events, append) => {
      const current = latest(events, subject)
      if (
        !current ||
        current.decision?.event !== record.decision?.event ||
        current.stage !== record.stage
      )
        throw new Error('Ramp decision changed before confirmation')
      append(subject, {
        type: 'ramp.confirmed',
        data: {
          run: record.run,
          stage: record.stage,
          basis: record.decision?.event ?? '',
          by: options.by,
          at,
          evidence: observed,
        },
      })
    })
    const result = this.report(subject)
    if (result.complete) return { ...result, receipt: this.complete(subject) }
    return result
  }
  proposal(subject: string) {
    const { record } = this.context(subject)
    return rampProposal(record)
  }
  report(subject: string) {
    const { record, guidance } = this.context(subject)
    const stage = record.plan.stages[record.stage]
    return {
      schema: 'wholeloop/ramp-report@1',
      subject,
      run: record.run,
      index: record.stage,
      complete: record.stage === record.plan.stages.length,
      stage: stage ?? null,
      observation: record.observation ?? null,
      decision: record.decision ?? null,
      recommendation:
        record.observation && stage
          ? rampRecommendation(record.observation.evidence, stage)
          : 'unknown',
      guidance,
      confirmations: record.confirmations,
      changedFlag: false,
    }
  }
  complete(subject: string) {
    const { engine, record } = this.context(subject)
    const receipt = rampReceipt(engine.store.events(), subject)
    const prior = engine.store
      .events()
      .find(
        (event) =>
          event.subject === subject &&
          event.type === 'step.completed' &&
          event.data.step === 'ramp-exposure' &&
          event.data.run === record.run,
      )
    if (prior?.type === 'step.completed')
      return { artifact: prior.data.artifact.path, cached: true }
    return engine.complete('ramp-exposure', subject, receipt)
  }
}
export function rampReceipt(events: readonly StateEvent[], subject: string) {
  const run = latest(events, subject)
  if (!run || run.stage !== run.plan.stages.length)
    throw new Error(
      'Ramp completion requires every stage explicitly approved and externally confirmed',
    )
  const decisions = events.filter(
    (event) =>
      event.subject === subject && event.type === 'ramp.decided' && event.data.run === run.run,
  )
  return `# Ramp receipt\n\n## Stages\n\n${run.plan.stages.map((stage) => `- ${stage.key}: ${stage.exposure}% for ${stage.audience}; enabled ${stage.enabled}.`).join('\n')}\n\n## Evidence\n\nRead-only query windows and normalized observations remain in the journal. Plan confirmed by ${run.plan.confirmedBy}.\n\n## Decisions\n\n${decisions.map((event) => (event.type === 'ramp.decided' ? `- ${event.data.outcome}: ${event.data.by}, ${event.ts}; basis ${event.data.basis}; reason ${event.data.reason}.` : '')).join('\n')}\n\n## Confirmations\n\n${run.confirmations.join('\n')}\n\n## Handoff\n\nEvery exposure change was performed/reported by a person and separately observed or explicitly attested for manual control. The core changed no flag. Continue to impact measurement.\n`
}
