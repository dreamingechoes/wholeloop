import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import type { EffectIntent, EffectRecord } from '../delivery/effect-events.js'
import { DeliveryEffects, type EffectHost } from '../delivery/effects.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import type { RecoveryRead } from '../delivery/read-retry.js'
import { hasToolAttribution } from '../git/commit.js'
import { IntegrationCandidates } from '../integration/store.js'
import { inReadObservation, withReadObservation } from '../state/read-observation.js'
import { publicationKey, publicationMarker, publicationRecords } from './publication-evidence.js'

export { publicationMarker, publicationRecords } from './publication-evidence.js'

import { RunnerAcceptanceStages } from './acceptance-stages.js'
import { ciCorrectionAdmitted } from './ci-correction-admission.js'
import { stableCiCorrectionTarget } from './ci-correction-remote.js'
import type { CiFeedbackRead } from './ci-feedback.js'
import { ciPublicationOrigin, ciPublicationTargets, ciPublishedTarget } from './ci-publication.js'
import { ciRepairAdmission } from './ci-repair.js'
import type {
  RunnerEndpointObservation,
  RunnerStageContext,
  RunnerStageObservation,
} from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { type AcceptedProduct, RunnerHandoffStages } from './handoff-stages.js'
import { RunnerNativeScope } from './native-scope.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

/** One accepted repository head and the owned topic branch it is published to. */
export interface RunnerPublicationTarget {
  repository: string
  path: string
  remote: string
  branch: string
  base: string
  head: string
}
export interface RunnerPullRequest {
  url: string
  branch: string
  base: string
  sha: string
  draft: boolean
  state: 'open' | 'closed' | 'merged'
  body: string
}
/**
 * Installed code-host adapter. Reads are complete or throw; writes never force,
 * never merge and never edit a pull request they did not create.
 */
export interface RunnerCodeHost {
  /** A complete bounded read; raw comment bodies and actors never leave the adapter. */
  readFeedback?(
    target: Readonly<RunnerPublicationTarget>,
    pr: string,
    signal: AbortSignal,
  ): Promise<CiFeedbackRead>
  readonly provenance: 'fixture' | 'host-observed'
  remoteHead(target: Readonly<RunnerPublicationTarget>, signal: AbortSignal): Promise<string | null>
  push(target: Readonly<RunnerPublicationTarget>, signal: AbortSignal): Promise<void>
  pullRequests(
    target: Readonly<RunnerPublicationTarget>,
    signal: AbortSignal,
  ): Promise<RunnerPullRequest[]>
  create(
    target: Readonly<RunnerPublicationTarget>,
    text: Readonly<{ title: string; body: string }>,
    signal: AbortSignal,
  ): Promise<void>
  ready(target: Readonly<RunnerPublicationTarget>, url: string, signal: AbortSignal): Promise<void>
}
export interface RunnerPublicationOptions {
  identity: RunnerRequest['host']
  host: RunnerCodeHost
}
export interface PublicationBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  acceptance: string
  ready: boolean
  targets: RunnerPublicationTarget[]
  texts: { title: string; body: string }[]
}
interface PublicationHandoff {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  publication: { invocation: string; evidence: string; outcome: 'draft-pr' | 'ready-pr' }
}
type Step = 'push' | 'create' | 'ready'
const ORDER: Step[] = ['push', 'create', 'ready']
const OPERATION: Record<Step, EffectIntent['operation']> = {
  push: 'git.push',
  create: 'pr.create',
  ready: 'pr.ready',
}
const iso = (value: string) =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
/** Pure: the accepted candidate's owned topic per repository, refused outside the grant. */
export function publicationTargets(
  plan: Readonly<DeliveryPlan>,
  assemblies: readonly { repository: string; path: string; ref: string; head: string }[],
  grants: readonly { repository: string; remote?: string }[],
): RunnerPublicationTarget[] {
  return assemblies
    .map((assembly) => {
      const repository = plan.repositories.find((entry) => entry.id === assembly.repository),
        remote = grants.find((entry) => entry.repository === assembly.repository)?.remote,
        branch = assembly.ref.replace(/^refs\/heads\//, '')
      if (
        !repository ||
        !remote ||
        !assembly.ref.startsWith('refs/heads/') ||
        !/^wl\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(branch) ||
        !repository.target.startsWith('refs/heads/') ||
        repository.target === assembly.ref ||
        !/^[a-f0-9]{40,64}$/.test(assembly.head)
      )
        throw new DeliveryRunnerError('publication-target-scope')
      return {
        repository: assembly.repository,
        path: assembly.path,
        remote,
        branch,
        base: repository.target.replace(/^refs\/heads\//, ''),
        head: assembly.head,
      }
    })
    .sort((a, b) => a.repository.localeCompare(b.repository))
}
/** Pure: PR text names its acceptance kind truthfully and carries the run's ownership marker. */
export function publicationText(
  plan: Readonly<DeliveryPlan>,
  accepted: Readonly<Pick<AcceptedProduct, 'decisions' | 'human'>>,
  target: Readonly<RunnerPublicationTarget>,
) {
  const outcome = plan.scope.outcomes[0]?.text ?? plan.source,
    title = outcome.length > 72 ? `${outcome.slice(0, 69).trimEnd()}...` : outcome,
    acceptance = accepted.human
      ? `A person's recorded acceptance of the exact product (${accepted.human}).`
      : `Delegated machine acceptance under the run's grant (${accepted.decisions.join(', ')}). This is not human testing.`,
    body = `## Summary\n\n${plan.scope.outcomes.map((entry) => `- ${entry.text}`).join('\n')}\n\n## Acceptance\n\n${acceptance}\n\n## Validation\n\nVerification, review, re-verification, integration and acceptance passed for ${target.head} in ${target.repository}. Merging, deployment and flag changes are not performed by this run.\n\n${publicationMarker(plan.run, target.repository)}\n`
  if ((!accepted.human && !accepted.decisions.length) || hasToolAttribution(`${title}\n${body}`))
    throw new DeliveryRunnerError('publication-text')
  return { title, body }
}
export interface RunnerPublication {
  plan: string
  ready: boolean
  targets: RunnerPublicationTarget[]
  texts: { title: string; body: string }[]
}
/** Owned non-force push, one owned draft PR and an optional ready transition per repository. */
export class RunnerPublisher {
  readonly effects: DeliveryEffects
  constructor(
    readonly store: RunnerStore,
    readonly code: RunnerCodeHost,
  ) {
    this.effects = new DeliveryEffects(store.files.root, store.now, store.budgets.clock)
  }
  key(step: Step, repository: string) {
    return publicationKey(step, repository)
  }
  records(run: string, binding: Readonly<RunnerPublication>) {
    return publicationRecords(this.store, run, binding)
  }
  /** Effect host for one step: the async preconditions were read before issue. */
  private host(
    step: Step,
    target: RunnerPublicationTarget,
    text: { title: string; body: string },
    run: string,
    admission: { allowed: boolean; evidence: string },
    originalPr?: string,
  ): EffectHost {
    const code = this.code,
      marker = publicationMarker(run, target.repository),
      owned = (pr: RunnerPullRequest) =>
        pr.branch === target.branch &&
        pr.base === target.base &&
        pr.body.includes(marker) &&
        (!originalPr || pr.url === originalPr),
      observation = (
        intent: Readonly<EffectIntent>,
        applied: boolean,
        evidence: unknown,
        revision?: string,
      ): RecoveryRead<NonNullable<EffectRecord['observations'][number]>> => ({
        available: true,
        value: {
          binding: contractDigest(intent),
          status: applied ? 'applied' : 'unknown',
          reason: 'observed',
          provenance: code.provenance,
          invocationState: applied ? 'stopped' : 'unknown',
          evidence: contractDigest(evidence),
          ...(applied && revision ? { resource: { ref: intent.ref, revision } } : {}),
        },
      })
    return {
      eligible: () => ({ ...admission, provenance: code.provenance }),
      invoke: async (_intent, _invocation, signal) => {
        if (step === 'push') return code.push(target, signal)
        const listed = await code.pullRequests(target, signal),
          mine = listed.filter((pr) => owned(pr) && pr.state === 'open')
        if (step === 'create') {
          if (originalPr && (mine.length !== 1 || mine[0]?.sha !== target.head))
            throw new DeliveryRunnerError('ci-publication-original-pr-required')
          if (!mine.length) await code.create(target, text, signal)
          return
        }
        const [pr] = mine
        if (mine.length !== 1 || !pr || pr.sha !== target.head)
          throw new DeliveryRunnerError('publication-ready-target')
        if (pr.draft) await code.ready(target, pr.url, signal)
      },
      observe: async (intent, _invocation, signal) => {
        try {
          if (step === 'push') {
            const tip = await code.remoteHead(target, signal)
            return observation(intent, tip === target.head, { tip }, target.head)
          }
          const listed = await code.pullRequests(target, signal),
            mine = listed.filter((pr) => owned(pr) && pr.state === 'open'),
            [pr] = mine,
            applied =
              mine.length === 1 &&
              !!pr &&
              pr.sha === target.head &&
              (step === 'create' || !pr.draft)
          return observation(intent, applied, { listed }, pr?.url)
        } catch {
          return { available: false, reason: 'unavailable-read' }
        }
      },
    }
  }
  private resume(run: string) {
    this.store.lifecycle.journal.transaction(
      { kind: 'controller', name: 'delivery-runner-publication' },
      (view, append) => {
        const state = view().get(run)
        if (
          state?.state === 'waiting-external' &&
          !this.effects.inspect(run).some((entry) => ['pending', 'unknown'].includes(entry.status))
        )
          append(run, {
            schema: 'wholeloop/delivery-control-event@1',
            from: state.state,
            to: 'queued',
            basis: state.basis.digest,
            reason: 'The exact owned publication effect is positively observed.',
          })
      },
    )
  }
  /** Complete remote reads before issue; a competing writer or foreign PR pauses publication. */
  private async admission(
    step: Step,
    target: RunnerPublicationTarget,
    run: string,
    signal: AbortSignal,
    publication: Readonly<RunnerPublication>,
    current: () => void,
  ) {
    const code = this.code
    try {
      const correction = ciPublicationOrigin(this.store, run, publication, target)
      if (correction) {
        if (step === 'push' && !ciRepairAdmission(this.store, run).allowed)
          throw new DeliveryRunnerError('ci-publication-push-budget')
        const repository = correction.basis.plan.repositories.find(
          (value) => value.id === target.repository,
        )
        if (!repository) throw new DeliveryRunnerError('ci-publication-original-targets')
        const value = await stableCiCorrectionTarget({
          run,
          repository,
          target: step === 'push' ? { ...target, head: correction.original.head } : target,
          pr: correction.original.pr,
          host: code,
          signal,
          since: this.store.now(),
          now: this.store.now,
          current,
        })
        current()
        return {
          allowed: true,
          evidence: contractDigest({
            step,
            origin: correction.origin?.proof,
            candidate: target.head,
            observed: value,
          }),
        }
      }
      if (step === 'push') {
        const tip = await code.remoteHead(target, signal)
        return {
          allowed: tip === null || tip === target.head,
          evidence: contractDigest({ step, tip }),
        }
      }
      const listed = await code.pullRequests(target, signal),
        marker = publicationMarker(run, target.repository),
        open = listed.filter((pr) => pr.state === 'open'),
        foreign = open.filter((pr) => !pr.body.includes(marker) || pr.base !== target.base),
        mine = open.filter((pr) => pr.body.includes(marker) && pr.base === target.base)
      return {
        allowed:
          !foreign.length &&
          mine.length <= 1 &&
          mine.every((pr) => pr.sha === target.head) &&
          (step === 'create' || mine.length === 1),
        evidence: contractDigest({ step, listed }),
      }
    } catch {
      return { allowed: false, evidence: contractDigest({ step, read: 'unavailable' }) }
    }
  }
  /** Returns after the first refused or unapplied step; nothing is retried or overwritten. */
  async publish(
    run: string,
    publication: Readonly<RunnerPublication>,
    current: () => void,
    signal: AbortSignal,
  ) {
    for (const [index, target] of publication.targets.entries()) {
      const text = publication.texts[index]
      if (!text) throw new DeliveryRunnerError('publication-text')
      for (const step of ORDER) {
        if (step === 'ready' && !publication.ready) continue
        current()
        const admission = await this.admission(step, target, run, signal, publication, current)
        current()
        if (!admission.allowed) return false
        const prepared = this.effects.prepare(run, {
          key: this.key(step, target.repository),
          operation: OPERATION[step],
          repository: target.repository,
          ref: target.branch,
          expectedHead: target.head,
          inputDigest: contractDigest({ step, target, text, admission: admission.evidence }),
        })
        const effect = await this.effects.execute(
          run,
          prepared.intent.id,
          this.host(
            step,
            target,
            text,
            run,
            admission,
            ciPublicationOrigin(this.store, run, publication, target)?.original.pr,
          ),
        )
        this.resume(run)
        if (effect.status !== 'applied') return false
      }
    }
    return true
  }
  /** A lost response is resolved by reading the exact resource, never by writing again. */
  async observe(run: string, publication: Readonly<RunnerPublication>) {
    if (!inReadObservation()) {
      for (const [index, records] of this.records(run, publication).entries())
        for (const step of ORDER) {
          const effect = records[step],
            target = publication.targets[index],
            text = publication.texts[index]
          if (effect && target && text && ['pending', 'unknown'].includes(effect.status))
            await this.effects.reconcile(
              run,
              effect.intent.id,
              this.host(
                step,
                target,
                text,
                run,
                { allowed: false, evidence: '' },
                ciPublicationOrigin(this.store, run, publication, target)?.original.pr,
              ),
            )
        }
      this.resume(run)
    }
    const records = this.records(run, publication),
      steps = records.flatMap((entry) =>
        ORDER.filter((step) => step !== 'ready' || publication.ready).map((step) => entry[step]),
      )
    return {
      records,
      complete: steps.every((effect) => effect?.status === 'applied'),
      unresolved: steps.some((effect) => effect && ['pending', 'unknown'].includes(effect.status)),
    }
  }
}

/** Publish the accepted candidate as owned draft PRs; never merge, force or forge testing. */
export class RunnerPublicationStages {
  readonly handoff: RunnerHandoffStages
  readonly publisher: RunnerPublisher
  constructor(
    readonly store: RunnerStore,
    readonly acceptance: RunnerAcceptanceStages,
    readonly options: RunnerPublicationOptions,
  ) {
    if (
      !(acceptance instanceof RunnerAcceptanceStages) ||
      acceptance.store.files.root !== store.files.root
    )
      throw new DeliveryRunnerError('publication-stage-fixed-acceptance-required')
    this.handoff = new RunnerHandoffStages(store, acceptance)
    this.publisher = new RunnerPublisher(store, options.host)
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('publication-stage-invocation')
    return `delivery/runner-publications/${invocation}`
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      basis = this.store.basis(request),
      stage = runnerRoute(basis.plan).find((entry) => entry.id === record.id),
      original = this.store
        .record(digest)
        .stages.find(
          (entry) =>
            entry.id === record.id &&
            entry.invocation === record.invocation &&
            entry.basis === record.basis,
        )
    if (
      !original ||
      record.basis !== basis.digest ||
      !stage ||
      !['publication', 'handoff'].includes(stage.kind) ||
      !['to-pr', 'to-merge'].includes(basis.plan.policy.endpoint) ||
      // A merge route's handoff belongs to the merge stages (ADR-0199).
      (stage.kind === 'handoff' && basis.plan.policy.endpoint !== 'to-pr') ||
      contractDigest(request.host) !== contractDigest(this.options.identity)
    )
      throw new DeliveryRunnerError('publication-stage-binding')
    return { digest, basis, stage, original }
  }
  private released(digest: string) {
    return this.store.inspect(digest).ownership === 'released'
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.path(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/binding.json`))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, `${base}/binding.json`, 2 * 1024 * 1024),
    ) as PublicationBinding
    if (
      Object.keys(binding).sort().join(',') !==
        'acceptance,at,invocation,plan,ready,request,stage,targets,texts,version' ||
      binding.version !== 1 ||
      binding.request !== contractDigest(request) ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !iso(binding.at) ||
      !Array.isArray(binding.targets) ||
      !binding.targets.length ||
      !Array.isArray(binding.texts) ||
      binding.texts.length !== binding.targets.length ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(binding)
    )
      throw new DeliveryRunnerError('publication-stage-original-binding')
    return binding
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const digest = contractDigest(context.request),
      record = this.store.stage(digest, context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('publication-stage-not-dispatched')
    const pinned = this.context(context.request, record),
      current = () => {
        if (
          context.signal.aborted ||
          !context.current() ||
          !iso(context.deadline) ||
          Date.now() >= Date.parse(context.deadline) ||
          this.store.basis(context.request).digest !== record.basis
        )
          throw new DeliveryRunnerError('publication-stage-not-current')
      }
    current()
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('publication-stage-context-binding')
    if (pinned.stage.kind === 'handoff') return this.executeHandoff(context, record)
    const base = this.path(record.invocation)
    if (
      existsSync(this.store.files.path(`${base}/consumed`)) ||
      record.runtime ||
      new RunnerNativeScope(this.store.files, record.invocation).calls().length
    )
      return this.inspect(context.request, record)
    ciCorrectionAdmitted(this.store, context.request)
    let accepted: AcceptedProduct
    try {
      accepted = await this.handoff.accepted(context.request)
    } catch {
      current()
      return this.inspect(context.request, record)
    }
    current()
    const grant = this.store.lifecycle.authority.inspect(context.request.grant).grant
    if (
      !grant.effects.includes('git.push') ||
      !grant.effects.includes('pr.create') ||
      // A merge needs a ready PR, so its route never publishes a draft only.
      (pinned.basis.plan.policy.endpoint === 'to-merge' && !grant.effects.includes('pr.ready'))
    )
      throw new DeliveryRunnerError('publication-stage-authority')
    const candidate = accepted.input.product.candidate
    if (!candidate) throw new DeliveryRunnerError('publication-complete-candidate-required')
    const targets = ciPublicationTargets(
        this.store,
        pinned.basis.plan,
        publicationTargets(
          pinned.basis.plan,
          new IntegrationCandidates(this.store.files.root).get(candidate).candidate.assemblies,
          grant.repositories,
        ),
      ),
      binding: PublicationBinding = {
        version: 1,
        request: digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        at: new Date().toISOString(),
        acceptance: contractDigest(accepted),
        ready: grant.effects.includes('pr.ready'),
        targets,
        texts: targets.map((target) => publicationText(pinned.basis.plan, accepted, target)),
      }
    safeSourceText(JSON.stringify(binding), 2 * 1024 * 1024)
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${base}/consumed`)))
        throw new DeliveryRunnerError('publication-stage-original-unresolved')
      this.store.files.atomic(`${base}/consumed`, `${contractDigest(binding)}\n`)
      this.store.files.atomic(`${base}/binding.json`, `${JSON.stringify(binding)}\n`)
    })
    // In-process controller work; this PID is descriptive, never a cancellation target.
    context.started({
      backend: 'owned-core',
      instance: record.invocation,
      worker: `pid-${process.pid}`,
    })
    await this.publisher.publish(context.request.run, binding, current, context.signal)
    return this.inspect(context.request, this.store.stage(digest, record.id) ?? record)
  }
  private async observePublication(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ) {
    const pinned = this.context(request, record),
      binding = this.read(request, record)
    if (!binding) {
      const untouched =
        !record.runtime &&
        !existsSync(this.store.files.path(`${this.path(record.invocation)}/consumed`))
      return {
        status: untouched ? ('blocked' as const) : ('unknown' as const),
        invocationState: untouched ? ('not-started' as const) : ('unknown' as const),
        evidence: { binding: null } as Record<string, unknown>,
      }
    }
    const { records, complete, unresolved } = await this.publisher.observe(request.run, binding)
    let accepted = false
    try {
      accepted = contractDigest(await this.handoff.accepted(request)) === binding.acceptance
    } catch {
      accepted = false
    }
    const evidence = { binding, effects: records, accepted }
    if (complete && accepted)
      return { status: 'passed' as const, invocationState: 'stopped' as const, evidence }
    const stopped = !unresolved || this.released(pinned.digest)
    return {
      status: stopped ? ('blocked' as const) : ('unknown' as const),
      invocationState: stopped ? ('stopped' as const) : ('unknown' as const),
      evidence,
    }
  }
  /**
   * ADR-0199: the current passed publication of this request, with each
   * repository's one owned open PR at the published head. Anything else is
   * undefined; a merge or CI stage never guesses which PR is its own.
   */
  async published(request: Readonly<RunnerRequest>, signal: AbortSignal) {
    const record = this.store.stage(contractDigest(request), 'publication')
    if (record?.status !== 'passed' || !record.evidence) return undefined
    const observed = await this.observePublication(request, record),
      binding = this.read(request, record)
    if (
      observed.status !== 'passed' ||
      contractDigest(observed.evidence) !== record.evidence ||
      !binding
    )
      return undefined
    const targets: (RunnerPublicationTarget & { pr: string })[] = []
    for (const target of binding.targets) {
      const observed = ciPublishedTarget(
        this.store,
        request.run,
        binding,
        target,
        await this.options.host.pullRequests(target, signal),
      )
      if (!observed) return undefined
      targets.push(observed)
    }
    return {
      invocation: record.invocation,
      evidence: record.evidence,
      ready: binding.ready,
      targets,
    }
  }
  private outcome(request: Readonly<RunnerRequest>): RunnerPublicationOutcome | undefined {
    const record = this.store.stage(contractDigest(request), 'publication')
    if (record?.status !== 'passed' || !record.evidence) return undefined
    const binding = this.read(request, record)
    return binding
      ? {
          invocation: record.invocation,
          evidence: record.evidence,
          outcome: binding.ready ? 'ready-pr' : 'draft-pr',
        }
      : undefined
  }
  private async currentPublication(request: Readonly<RunnerRequest>) {
    const outcome = this.outcome(request),
      record = this.store.stage(contractDigest(request), 'publication')
    if (!outcome || !record) return undefined
    const observed = await this.observePublication(request, record)
    return observed.status === 'passed' && contractDigest(observed.evidence) === record.evidence
      ? outcome
      : undefined
  }
  private handoffPath(invocation: string) {
    return `${this.path(invocation).replace('runner-publications', 'runner-publication-handoffs')}`
  }
  private readHandoff(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.handoffPath(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/binding.json`))) return undefined
    const value = JSON.parse(
      readSourceFile(this.store.files.root, `${base}/binding.json`, 65536),
    ) as PublicationHandoff
    if (
      Object.keys(value).sort().join(',') !==
        'at,invocation,plan,publication,request,stage,version' ||
      value.version !== 1 ||
      value.request !== contractDigest(request) ||
      value.plan !== record.basis ||
      value.stage !== record.id ||
      value.invocation !== record.invocation ||
      !iso(value.at) ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(value) ||
      record.runtime?.backend !== 'owned-core' ||
      record.runtime.instance !== record.invocation
    )
      throw new DeliveryRunnerError('publication-handoff-original-binding')
    return value
  }
  private async executeHandoff(context: RunnerStageContext, record: Readonly<RunnerStageRecord>) {
    const base = this.handoffPath(record.invocation)
    if (existsSync(this.store.files.path(`${base}/consumed`)) || record.runtime)
      return this.inspect(context.request, record)
    const publication = await this.currentPublication(context.request)
    if (!publication || context.signal.aborted || !context.current())
      return this.inspect(context.request, record)
    const value: PublicationHandoff = {
      version: 1,
      request: contractDigest(context.request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      at: new Date().toISOString(),
      publication,
    }
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${base}/consumed`)))
        throw new DeliveryRunnerError('publication-handoff-original-unresolved')
      this.store.files.atomic(`${base}/consumed`, `${contractDigest(value)}\n`)
    })
    context.started({
      backend: 'owned-core',
      instance: record.invocation,
      worker: `pid-${process.pid}`,
    })
    this.store.files.atomic(`${base}/binding.json`, `${JSON.stringify(value)}\n`)
    return this.inspect(context.request, this.store.stage(value.request, record.id) ?? record)
  }
  private async observeHandoff(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ) {
    const pinned = this.context(request, record),
      binding = this.readHandoff(request, record)
    if (!binding) {
      const untouched =
        !record.runtime &&
        !existsSync(this.store.files.path(`${this.handoffPath(record.invocation)}/consumed`))
      const stopped = untouched || this.released(pinned.digest)
      return {
        status: stopped ? ('blocked' as const) : ('unknown' as const),
        invocationState: untouched
          ? ('not-started' as const)
          : stopped
            ? ('stopped' as const)
            : ('unknown' as const),
        evidence: { binding: null } as Record<string, unknown>,
      }
    }
    const publication = await this.currentPublication(request)
    return {
      status:
        contractDigest(publication ?? null) === contractDigest(binding.publication)
          ? ('passed' as const)
          : ('blocked' as const),
      invocationState: 'stopped' as const,
      evidence: { binding },
    }
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    const pinned = this.context(request, record),
      observed =
        pinned.stage.kind === 'handoff'
          ? await this.observeHandoff(request, record)
          : await this.observePublication(request, record),
      passed = observed.status === 'passed'
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status: observed.status,
      invocationState: observed.invocationState,
      evidence: contractDigest(observed.evidence),
      provenance: passed ? this.options.host.provenance : 'fixture',
      reason: passed
        ? 'The accepted candidate is pushed without force and its owned pull request is observed at the exact head; no merge, deployment or human testing is inferred.'
        : 'Retain the original publication effects; a competing writer, foreign pull request or unresolved effect is never overwritten or retried.',
    }
  }
  async endpoint(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    signal: AbortSignal,
  ): Promise<RunnerEndpointObservation> {
    return withReadObservation(signal, () => this.observeEndpoint(request, plan, signal))
  }
  private async observeEndpoint(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    signal: AbortSignal,
  ): Promise<RunnerEndpointObservation> {
    const digest = contractDigest(request),
      basis = this.store.basis(request),
      record = this.store.stage(digest, 'handoff')
    let current = false,
      outcome: RunnerEndpointObservation['outcome'] = 'draft-pr',
      observed: RunnerStageObservation | undefined
    if (
      !signal.aborted &&
      basis.digest === contractDigest(plan) &&
      basis.plan.policy.endpoint === 'to-pr' &&
      record?.status === 'passed'
    ) {
      observed = await this.inspect(request, record)
      const binding = this.readHandoff(request, record)
      current =
        !signal.aborted &&
        !!binding &&
        observed.status === 'passed' &&
        observed.evidence === record.evidence &&
        this.store.basis(request).digest === basis.digest
      if (binding) outcome = binding.publication.outcome
    }
    return {
      request: digest,
      plan: basis.digest,
      source: basis.plan.source,
      outcome,
      current,
      evidence: contractDigest({
        request: digest,
        record: record ?? null,
        observed: observed ?? null,
        current,
      }),
      provenance: current ? this.options.host.provenance : 'fixture',
    }
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    this.context(request, record)
    if (!signal.aborted)
      new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
  }
}
interface RunnerPublicationOutcome {
  invocation: string
  evidence: string
  outcome: 'draft-pr' | 'ready-pr'
}
