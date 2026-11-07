// The prepare-launch workflow.
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import type { FlowEngine } from '../flow/engine.js'
import type { Profile } from '../profile/presets.js'
import { renderProfile } from '../profile/render.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { canonicalPath } from '../state/paths.js'
import { launchArtifacts, launchReceipt } from './artifacts.js'
import { type LaunchDraft, launchRuns, validateLaunchDraft } from './contracts.js'
import { launchGuidance } from './guidance.js'
import {
  type MeasurementPlan,
  type MeasurementSource,
  measurementDigest,
  scopeMeasurement,
  validateMeasurement,
} from './measurement.js'
import { launchDeliveries } from './publish.js'

export class LaunchWorkflow {
  constructor(readonly engine: FlowEngine) {}
  begin(options: {
    subject?: string
    input?: string
    owner?: string
    measurement?: MeasurementPlan
  }) {
    const events = this.engine.store.events()
    const item = options.subject ? this.engine.store.get(options.subject) : undefined
    if (item && (item.kind !== 'scope' || item.status !== 'open'))
      throw new Error('Prepare launch for an open scope or a standalone shipping description')
    const owner = options.owner ?? item?.owner
    const questions: { id: string; prompt: string }[] = []
    if (!owner?.trim()) questions.push({ id: 'owner', prompt: 'Who owns this launch?' })
    if (!item && !options.input?.trim())
      questions.push({ id: 'input', prompt: 'What is shipping, for which audience?' })
    const stored = item ? scopeMeasurement(events, item.id, owner ?? '') : undefined
    if (
      stored &&
      options.measurement &&
      JSON.stringify(stored.plan) !== JSON.stringify(options.measurement)
    )
      throw new Error('A launch cannot override its scope-pinned measurement plan')
    if (!stored && !options.measurement)
      questions.push({
        id: 'measurement',
        prompt:
          'Which agreed metrics, exact source queries, targets, windows and rollout stages define success? Supply an explicit measurement plan or justified exception.',
      })
    if (questions.length)
      return { schema: 'wholeloop/launch-begin@1', status: 'question' as const, questions }
    if (options.measurement) validateMeasurement(options.measurement)
    const guidance = launchGuidance(this.engine)
    const source: MeasurementSource =
      stored ??
      (() => {
        if (!options.measurement) throw new Error('Missing agreed measurement plan')
        const revision = measurementDigest(options.measurement)
        return {
          ref: 'standalone-agreed-measurement',
          revision,
          digest: measurementDigest({ revision, plan: options.measurement }),
          plan: options.measurement,
        }
      })()
    const subject =
      item?.id ??
      this.engine.store.create({
        kind: 'scope',
        title: options.input ?? '',
        owner: owner ?? '',
        body: 'Standalone launch preparation; no prior Define or merge result is implied.',
        repository: canonicalPath(this.engine.root),
      }).id
    const begun = this.engine.begin('prepare-launch', { subject })
    if (begun.code !== 0 || !begun.payload.run)
      throw new Error('Resolve prepare-launch preconditions before drafting')
    const run = begun.payload.run
    const references = guidance.map(({ content: _content, ...reference }) => reference)
    const plan = { run, source, guidance: references }
    this.engine.store.transaction((current, append) => {
      const prior = launchRuns(current).find(
        (entry) => entry.subject === subject && entry.plan.run === run,
      )
      if (prior && JSON.stringify(prior.plan) !== JSON.stringify(plan))
        throw new Error('Launch inputs changed mid-run; restore the pinned source and guidance')
      if (!prior) append(subject, { type: 'launch.planned', data: plan })
    })
    return {
      schema: 'wholeloop/launch-begin@1',
      status: 'planned' as const,
      subject,
      run,
      plan,
      guidance,
      questions: [],
      mergeReadiness:
        'Not observed by this drafting step; confirm actual merged work before exposure.',
    }
  }
  context(subject: string) {
    const entry = launchRuns(this.engine.store.events())
      .filter((entry) => entry.subject === subject)
      .at(-1)
    if (!entry) throw new Error('Begin prepare-launch before drafting')
    const source = scopeMeasurement(
      this.engine.store.events(),
      subject,
      this.engine.store.get(subject).owner,
    )
    if (source && source.digest !== entry.plan.source.digest)
      throw new Error('The scope measurement revision changed after launch planning')
    const guidance = launchGuidance(this.engine)
    if (
      JSON.stringify(guidance.map(({ content: _content, ...reference }) => reference)) !==
      JSON.stringify(entry.plan.guidance)
    )
      throw new Error('Launch guidance changed after planning')
    const item = this.engine.store.get(subject)
    return {
      ...entry,
      guidance,
      scope: { id: subject, title: item.title, owner: item.owner },
      profile: renderProfile(this.engine.config().profile as Profile),
    }
  }
  complete(subject: string, draft: LaunchDraft) {
    const context = this.context(subject)
    validateLaunchDraft(draft, context.plan)
    this.engine.store.transaction((events, append) => {
      const recorded = launchRuns(events).find(
        (entry) => entry.subject === subject && entry.plan.run === context.plan.run,
      )
      if (recorded?.draft && JSON.stringify(recorded.draft) !== JSON.stringify(draft))
        throw new Error('The launch run already has a different immutable draft')
      if (!recorded?.draft)
        append(subject, { type: 'launch.drafted', data: { run: context.plan.run, draft } })
    })
    const completed = this.engine.store
      .events()
      .find(
        (event) =>
          event.subject === subject &&
          event.type === 'step.completed' &&
          event.data.step === 'prepare-launch' &&
          event.data.run === context.plan.run,
      )
    if (completed?.type === 'step.completed')
      return {
        schema: 'wholeloop/launch-complete@1',
        subject,
        cached: true,
        artifact: completed.data.artifact.path,
        publication: this.publication(subject),
      }
    const receipt = this.engine.complete(
      'prepare-launch',
      subject,
      launchReceipt(this.engine.store.events(), subject, context.plan.run),
    )
    return {
      schema: 'wholeloop/launch-complete@1',
      subject,
      cached: false,
      receipt,
      publication: this.publication(subject),
    }
  }
  publication(subject: string) {
    const entry = this.context(subject)
    const registry = loadProviders(
      loadExtensionOptions({ root: this.engine.root, userFile: this.engine.userFile }),
    )
    if (registry.problems.length)
      throw new Error('Resolve provider registry problems before launch publication')
    const providers = this.engine.config().providers
    const deliveries = launchDeliveries(this.engine.store.events())
    return launchArtifacts(this.engine.store.events(), subject, entry.plan.run).map((artifact) => {
      const delivered = deliveries.find(
        (delivery) =>
          delivery.subject === subject &&
          delivery.run === entry.plan.run &&
          delivery.key === artifact.key,
      )
      if (delivered)
        return {
          ...artifact,
          provider: delivered.provider,
          status: delivered.result?.status ?? 'ambiguous',
          sent: delivered.result?.status === 'succeeded' ? false : 'unknown',
          note: 'A publication attempt is recorded; inspect its remote state before any retry',
          ...(delivered.result ? { externalRef: delivered.result.ref } : {}),
        }
      const capability = artifact.operation.split('.')[0] ?? ''
      const configured =
        isObject(providers) && typeof providers[capability] === 'string'
          ? providers[capability]
          : undefined
      try {
        const provider = resolveProvider(registry, artifact.operation, configured)
        return {
          ...artifact,
          provider: provider.manifest.id,
          status: provider.manifest.access.local ? 'stored' : 'pending',
          sent: false,
          note: provider.manifest.access.local
            ? 'Stored in the external journal'
            : 'Execute this draft/create operation through the explicit host boundary; keep any ambiguous outcome for inspection',
        }
      } catch {
        return {
          ...artifact,
          provider: configured ?? 'manual',
          status: 'handoff',
          sent: false,
          note: 'No configured provider supports this artifact; retain its complete local draft/spec for manual use',
        }
      }
    })
  }
}
