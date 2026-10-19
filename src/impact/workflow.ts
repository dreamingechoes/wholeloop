import { BuildWorkflow } from '../build/workflow.js'
import { loadExtensionOptions } from '../config/load.js'
import type { FlowEngine } from '../flow/engine.js'
import { launchRuns } from '../launch/contracts.js'
import {
  type MeasurementPlan,
  measurementDigest,
  scopeMeasurement,
  validateMeasurement,
} from '../launch/measurement.js'
import { loadProviders } from '../providers/load.js'
import type { ProviderHost } from '../providers/operations.js'
import { rampRuns } from '../ramp/contracts.js'
import { observationTime } from '../ramp/evidence.js'
import { canonicalPath } from '../state/paths.js'
import {
  type ImpactLayout,
  type ImpactPlan,
  impactRuns,
  type QualitativeQuery,
  validImpactData,
} from './contracts.js'
import { collectImpact } from './evidence.js'
import { impactGuidance } from './guidance.js'
import { impactReceipt, impactReport } from './report.js'
import { checkpointDays, configuredCheckpoints, impactSchedule } from './schedule.js'

const last = (engine: FlowEngine, subject: string) =>
  impactRuns(engine.store.events())
    .filter((run) => run.subject === subject)
    .at(-1)
export class ImpactWorkflow {
  constructor(readonly engine: FlowEngine) {}
  begin(options: {
    subject?: string
    input?: string
    owner?: string
    measurement?: MeasurementPlan
    checkpoint?: string
    launchedAt?: string
    afterDays?: number
    at?: string
    qualitative?: QualitativeQuery[]
  }) {
    const engine = options.subject
      ? new BuildWorkflow(this.engine).engineFor(options.subject)
      : this.engine
    const item = options.subject ? engine.store.get(options.subject) : undefined
    if (item && (item.kind !== 'scope' || item.status !== 'open'))
      throw new Error('Measure an open scope or an explicitly owned standalone outcome')
    const owner = options.owner ?? item?.owner
    const events = engine.store.events()
    const previous = item ? last(engine, item.id) : undefined
    const active =
      previous &&
      !events.some(
        (event) =>
          (event.type === 'step.completed' || event.type === 'step.skipped') &&
          event.data.run === previous.plan.run,
      )
        ? previous
        : undefined
    const launch = launchRuns(events)
      .filter((run) => run.subject === item?.id)
      .at(-1)
    const stored = item
      ? (scopeMeasurement(events, item.id, owner ?? '') ??
        launch?.plan.source ??
        previous?.plan.source)
      : undefined
    if (
      stored &&
      options.measurement &&
      measurementDigest(stored.plan) !== measurementDigest(options.measurement)
    )
      throw new Error('Impact cannot override the scope-pinned measurement plan')
    const ramp = rampRuns(events)
      .filter((run) => run.subject === item?.id && run.stage === run.plan.stages.length)
      .at(-1)
    const confirmation = ramp
      ? events.find((event) => event.id === ramp.confirmations.at(-1))
      : undefined
    const launchedAt =
      options.launchedAt ??
      active?.plan.launchedAt ??
      previous?.plan.launchedAt ??
      (confirmation?.type === 'ramp.confirmed' ? confirmation.data.at : undefined)
    const checkpoints = configuredCheckpoints(engine.config())
    const checkpoint =
      options.checkpoint ??
      active?.plan.checkpoint ??
      checkpoints.find(
        (key) =>
          !impactRuns(events).some(
            (run) => run.subject === item?.id && run.plan.checkpoint === key && run.observation,
          ),
      )
    const afterDays =
      options.afterDays ??
      active?.plan.afterDays ??
      (checkpoint ? checkpointDays(checkpoint) : undefined)
    const questions: { id: string; prompt: string }[] = []
    if (!owner?.trim())
      questions.push({ id: 'owner', prompt: 'Who owns the measured outcome and missing evidence?' })
    if (!item && !options.input?.trim())
      questions.push({ id: 'input', prompt: 'Which shipped outcome should be measured?' })
    if (!stored && !options.measurement)
      questions.push({
        id: 'measurement',
        prompt:
          'Confirm the exact metrics, queries, units, baselines, targets and windows, or an explicit exception.',
      })
    if (!launchedAt)
      questions.push({
        id: 'launchedAt',
        prompt:
          'When did the measured audience actually receive the change? Supply an evidence-backed timestamp.',
      })
    if (!checkpoint || afterDays === undefined)
      questions.push({
        id: 'checkpoint',
        prompt: 'Confirm a checkpoint name and its offset in days from actual launch.',
      })
    if (questions.length)
      return { schema: 'wholeloop/impact-begin@1', status: 'question' as const, questions }
    if (!checkpoint || afterDays === undefined || !launchedAt)
      throw new Error('Missing confirmed checkpoint')
    if (!Number.isFinite(afterDays) || afterDays < 0 || afterDays > 3650)
      throw new Error('Use a checkpoint offset between zero and 3650 days')
    const launchAt = observationTime(launchedAt)
    if (previous && Date.parse(launchAt) !== Date.parse(previous.plan.launchedAt))
      throw new Error(
        'The launch anchor is already pinned; use a new scope for a different release',
      )
    const at = observationTime(options.at ?? active?.plan.at)
    if (Date.parse(at) < Date.parse(launchAt) + afterDays * 86400000)
      throw new Error('Checkpoint is not due; no observation or workflow was created')
    if (options.measurement) validateMeasurement(options.measurement)
    const measurement = options.measurement
    const source =
      stored ??
      (() => {
        if (!measurement) throw new Error('Missing measurement plan')
        const revision = measurementDigest(measurement)
        return {
          ref: 'standalone-agreed-measurement',
          revision,
          digest: measurementDigest({ revision, plan: measurement }),
          plan: measurement,
        }
      })()
    const guidance = impactGuidance(engine)
    const { content: _content, ...reference } = guidance
    const qualitative = options.qualitative ?? active?.plan.qualitative ?? []
    // Validate before creating an item/run, so malformed inputs leave no synthetic history.
    const candidate = {
      run: 'run-0000000000000000',
      source,
      checkpoint,
      launchedAt: launchAt,
      afterDays,
      at,
      qualitative,
      guidance: reference,
    }
    if (!validImpactData('impact.planned', candidate))
      throw new Error('Invalid confirmed impact plan')
    const subject =
      item?.id ??
      engine.store.create({
        kind: 'scope',
        title: options.input ?? '',
        owner: owner ?? '',
        body: 'Standalone impact measurement; no prior shipping or Define history is implied.',
        repository: canonicalPath(engine.root),
      }).id
    const begun = engine.begin('measure-impact', { subject })
    if (begun.code !== 0 || !begun.payload.run)
      throw new Error('Resolve measure-impact preconditions')
    const plan: ImpactPlan = { ...candidate, run: begun.payload.run }
    engine.store.transaction((current, append) => {
      const existing = impactRuns(current).find((run) => run.plan.run === plan.run)
      if (existing && measurementDigest(existing.plan) !== measurementDigest(plan))
        throw new Error('Impact inputs changed during the checkpoint; restore the pinned plan')
      if (!existing) append(subject, { type: 'impact.planned', data: plan })
    })
    return {
      schema: 'wholeloop/impact-begin@1',
      status: 'planned' as const,
      subject,
      plan,
      guidance,
      questions: [],
    }
  }
  context(subject: string) {
    const engine = new BuildWorkflow(this.engine).engineFor(subject)
    const record = last(engine, subject)
    if (!record) throw new Error('Begin measure-impact before collecting evidence')
    const source = scopeMeasurement(engine.store.events(), subject, engine.store.get(subject).owner)
    if (source && source.digest !== record.plan.source.digest)
      throw new Error('Scope measurement revision changed during the checkpoint')
    const guidance = impactGuidance(engine)
    const { content: _content, ...reference } = guidance
    if (measurementDigest(reference) !== measurementDigest(record.plan.guidance))
      throw new Error('Impact report guidance changed during the checkpoint')
    const registry = loadProviders(
      loadExtensionOptions({ root: engine.root, userFile: engine.userFile }),
    )
    if (registry.problems.length)
      throw new Error('Resolve provider registry problems before measuring impact')
    return { engine, record, guidance, registry, owner: engine.store.get(subject).owner }
  }
  async observe(subject: string, host: ProviderHost) {
    const { engine, record, registry, owner } = this.context(subject)
    const data = await collectImpact(record.plan, registry, owner, host)
    engine.store.transaction((events, append) => {
      const current = impactRuns(events)
        .filter((run) => run.subject === subject)
        .at(-1)
      if (
        current?.plan.run !== record.plan.run ||
        current.observation?.event !== record.observation?.event
      )
        throw new Error('Checkpoint advanced during collection; inspect current evidence')
      append(subject, { type: 'impact.observed', data })
    })
    return this.report(subject)
  }
  format(subject: string, sections: ImpactLayout[]) {
    const { engine, record } = this.context(subject)
    if (!record.observation) throw new Error('Observe impact before formatting')
    engine.store.transaction((_events, append) =>
      append(subject, {
        type: 'impact.formatted',
        data: { run: record.plan.run, basis: record.observation?.event ?? '', sections },
      }),
    )
    return this.report(subject)
  }
  report(subject: string) {
    return impactReport(this.context(subject).record)
  }
  complete(subject: string) {
    const { engine, record, guidance } = this.context(subject)
    const prior = engine.store
      .events()
      .find((event) => event.type === 'step.completed' && event.data.run === record.plan.run)
    if (prior?.type === 'step.completed')
      return { artifact: prior.data.artifact.path, cached: true }
    if (!record.layout && guidance.origin === 'harness')
      this.format(subject, [
        {
          title: 'Metrics',
          metrics: record.plan.source.plan.metrics.map((row) => row.id),
          qualitative: [],
        },
        {
          title: 'Qualitative signals',
          metrics: [],
          qualitative: record.plan.qualitative.map((row) => row.id),
        },
      ])
    return engine.complete('measure-impact', subject, impactReceipt(engine.store.events(), subject))
  }
  schedule(subject: string, at = new Date().toISOString()) {
    const { engine } = this.context(subject)
    return (
      impactSchedule(
        engine.store.events(),
        subject,
        configuredCheckpoints(engine.config()),
        at,
      ) ?? { schema: 'wholeloop/impact-schedule@1', subject, checkpoints: [] }
    )
  }
}
