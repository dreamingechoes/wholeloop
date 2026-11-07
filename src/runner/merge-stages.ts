// Runner stages for CI waiting and conditional merge.
import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import {
  type CiClock,
  type CiObservation,
  type CiVerdict,
  type RunnerCiHost,
  RunnerCiObserver,
  SYSTEM_CI_CLOCK,
  validateCiObservation,
} from './ci-observations.js'
import { ciRepairAdmission, ciRepairRequest, retainCiRepairRequest } from './ci-repair.js'
import type {
  RunnerEndpointObservation,
  RunnerStageContext,
  RunnerStageObservation,
} from './engine.js'
import type { RunnerStageRecord } from './events.js'
import {
  type MergeEligibility,
  type MergeEligibilityInput,
  mergeEligibility,
} from './merge-eligibility.js'
import {
  type RunnerMergeFactsHost,
  type RunnerMergeHost,
  RunnerMerger,
  type RunnerMergeTarget,
} from './merge-execution.js'
import { RunnerPublicationStages } from './publication-stages.js'
import { DeliveryRunnerError, type RunnerStage, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

const iso = (value: string) =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
export interface StageBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  publication: string
  targets: RunnerMergeTarget[]
}
const KEYS = 'at,invocation,plan,publication,request,stage,targets,version'
type Kind = 'ci' | 'merge' | 'handoff'

/** Shared fixed binding for the to-merge stages; each stage writes it once before acting. */
abstract class MergeRouteStages {
  constructor(
    readonly store: RunnerStore,
    readonly publication: RunnerPublicationStages,
    readonly identity: RunnerRequest['host'],
    private readonly kinds: readonly Kind[],
    private readonly root: string,
  ) {
    if (
      !(publication instanceof RunnerPublicationStages) ||
      publication.store.files.root !== store.files.root
    )
      throw new DeliveryRunnerError('merge-route-fixed-publication-required')
  }
  protected path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation)) throw new DeliveryRunnerError('merge-route-invocation')
    return `delivery/${this.root}/${invocation}`
  }
  protected context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
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
      !this.kinds.includes(stage.kind as Kind) ||
      basis.plan.policy.endpoint !== 'to-merge' ||
      !basis.plan.policy.merge ||
      contractDigest(request.host) !== contractDigest(this.identity)
    )
      throw new DeliveryRunnerError('merge-route-stage-binding')
    return { digest, basis, stage, merge: basis.plan.policy.merge }
  }
  protected read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.path(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/binding.json`))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, `${base}/binding.json`, 2 * 1024 * 1024),
    ) as StageBinding
    if (
      Object.keys(binding).sort().join(',') !== KEYS ||
      binding.version !== 1 ||
      binding.request !== contractDigest(request) ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !iso(binding.at) ||
      !Array.isArray(binding.targets) ||
      !binding.targets.length ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(binding)
    )
      throw new DeliveryRunnerError('merge-route-original-binding')
    return binding
  }
  /** Publish intent once; a lost reply never licenses a second read loop or merge. */
  protected bind(binding: StageBinding) {
    const base = this.path(binding.invocation)
    safeSourceText(JSON.stringify(binding), 2 * 1024 * 1024)
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${base}/consumed`)))
        throw new DeliveryRunnerError('merge-route-original-unresolved')
      this.store.files.atomic(`${base}/consumed`, `${contractDigest(binding)}\n`)
      this.store.files.atomic(`${base}/binding.json`, `${JSON.stringify(binding)}\n`)
    })
  }
  protected admit(context: RunnerStageContext) {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('merge-route-stage-not-dispatched')
    const pinned = this.context(context.request, record)
    if (
      context.signal.aborted ||
      !context.current() ||
      !iso(context.deadline) ||
      Date.now() >= Date.parse(context.deadline) ||
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('merge-route-stage-not-current')
    return { record, pinned }
  }
  /** The stage before this one must have passed under the current basis. */
  protected passed(request: Readonly<RunnerRequest>, id: string) {
    const record = this.store.stage(contractDigest(request), id)
    return record?.status === 'passed' && record.provenance === 'host-observed'
  }
  protected observation(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    status: RunnerStageObservation['status'],
    invocationState: RunnerStageObservation['invocationState'],
    evidence: unknown,
    provenance: RunnerStageObservation['provenance'],
    reason: string,
  ): RunnerStageObservation {
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState,
      evidence: contractDigest(evidence),
      provenance,
      reason,
    }
  }
  protected start(context: RunnerStageContext) {
    // In-process controller work; the PID is descriptive, never a cancellation target.
    context.started({
      backend: 'owned-core',
      instance: context.invocation,
      worker: `pid-${process.pid}`,
    })
  }
  async stop(
    _request: Readonly<RunnerRequest>,
    _record: Readonly<RunnerStageRecord>,
    _signal: AbortSignal,
  ) {
    // Reads are bounded by the stage deadline; an issued merge is never cancelled,
    // only observed and reconciled through its effect.
  }
}

export interface RunnerCiStageOptions {
  identity: RunnerRequest['host']
  host: RunnerCiHost
  clock?: CiClock
}
export interface CiResult {
  binding: string
  targets: {
    repository: string
    outcome: 'settled' | 'deadline' | 'cancelled'
    verdict: CiVerdict
    observations: string[]
    repair?: string
  }[]
}

/**
 * ADR-0199: wait, finitely and read-only, for revision-bound CI on each published
 * PR at its exact head. A failure retains its typed repair request (ADR-0187);
 * pending at the deadline or unreadable checks never pass.
 */
export class RunnerCiStages extends MergeRouteStages {
  readonly observer: RunnerCiObserver
  constructor(
    store: RunnerStore,
    publication: RunnerPublicationStages,
    readonly options: RunnerCiStageOptions,
  ) {
    super(store, publication, options.identity, ['ci'], 'runner-ci-stages')
    this.observer = new RunnerCiObserver(store, options.host, options.clock ?? SYSTEM_CI_CLOCK)
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const { record, pinned } = this.admit(context)
    if (this.read(context.request, record) || record.runtime)
      return this.inspect(context.request, record)
    const published = await this.publication.published(context.request, context.signal)
    if (!published?.ready)
      return this.observation(
        context.request,
        record,
        'blocked',
        'not-started',
        { publication: published ?? null },
        'host-observed',
        'ci-stage-ready-publication-required',
      )
    const binding: StageBinding = {
      version: 1,
      request: pinned.digest,
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      at: new Date().toISOString(),
      publication: published.evidence,
      targets: published.targets.map((target) => ({ ...target, method: pinned.merge.method })),
    }
    this.bind(binding)
    this.start(context)
    const result: CiResult = { binding: contractDigest(binding), targets: [] }
    for (const target of binding.targets) {
      const waited = await this.observer.wait({
          run: context.request.run,
          target,
          pr: target.pr,
          policy: pinned.merge.checks,
          deadline: Date.parse(context.deadline),
          signal: context.signal,
        }),
        entry: CiResult['targets'][number] = { repository: target.repository, ...waited }
      const last = waited.observations.at(-1)
      if (waited.verdict.status === 'failed' && last) {
        const observation = JSON.parse(
          readSourceFile(
            this.store.files.root,
            `delivery/runner-ci/${context.request.run}/${last}.json`,
            4 * 1024 * 1024,
          ),
        ) as CiObservation
        validateCiObservation(observation)
        entry.repair = retainCiRepairRequest(
          this.store,
          ciRepairRequest({
            run: context.request.run,
            observation,
            policy: pinned.merge.checks,
            comments: [],
            admission: ciRepairAdmission(this.store, context.request.run),
          }),
        )
      }
      result.targets.push(entry)
      if (waited.verdict.status !== 'passed') break
    }
    this.store.files.atomic(
      `${this.path(record.invocation)}/result.json`,
      `${JSON.stringify(result)}\n`,
    )
    return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    this.context(request, record)
    const binding = this.read(request, record),
      path = `${this.path(record.invocation)}/result.json`
    if (!binding)
      return this.observation(
        request,
        record,
        record.runtime ? 'unknown' : 'blocked',
        record.runtime ? 'unknown' : 'not-started',
        { binding: null },
        'host-observed',
        'ci-stage-not-issued',
      )
    if (!existsSync(this.store.files.path(path)))
      return this.observation(
        request,
        record,
        'unknown',
        'unknown',
        { binding },
        'host-observed',
        'ci-stage-result-unobserved',
      )
    const result = JSON.parse(readSourceFile(this.store.files.root, path, 4 * 1024 * 1024))
    if (result.binding !== contractDigest(binding))
      throw new DeliveryRunnerError('ci-stage-result-binding')
    const entries = result.targets as CiResult['targets'],
      passed =
        entries.length === binding.targets.length &&
        entries.every((entry) => entry.outcome === 'settled' && entry.verdict.status === 'passed'),
      failed = entries.some((entry) => entry.verdict.status === 'failed')
    return this.observation(
      request,
      record,
      passed ? 'passed' : failed ? 'failed' : 'blocked',
      'stopped',
      { binding, result },
      'host-observed',
      passed
        ? 'Required checks from trusted issuers passed at every published head; merge eligibility is evaluated separately.'
        : failed
          ? 'A required check failed at the published head; its typed repair request is retained.'
          : 'Checks stayed pending, unreadable or untrusted until the deadline; nothing is inferred.',
    )
  }
}

export interface RunnerMergeStageOptions {
  identity: RunnerRequest['host']
  facts: RunnerMergeFactsHost
  ci: RunnerCiHost
  merge: RunnerMergeHost
  /** A separate installed runtime allowance; a plan or grant alone never merges. */
  runtime: { allowsMerge: boolean }
}
interface MergeResult {
  binding: string
  eligibility: MergeEligibility[]
  outcome: string
}

/**
 * ADR-0199: evaluate eligibility from complete fresh reads just before the one
 * expected-head merge per repository, then hand off only an observed own merge.
 */
export class RunnerMergeStages extends MergeRouteStages {
  readonly merger: RunnerMerger
  constructor(
    store: RunnerStore,
    publication: RunnerPublicationStages,
    readonly options: RunnerMergeStageOptions,
  ) {
    super(store, publication, options.identity, ['merge', 'handoff'], 'runner-merge-stages')
    this.merger = new RunnerMerger(store, options.merge)
  }
  /** Evidence for the final candidate, from this request's records on the current basis. */
  private evidence(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
  ): MergeEligibilityInput['evidence'] {
    const route = runnerRoute(plan as DeliveryPlan),
      digest = contractDigest(request),
      gate = (select: (stage: RunnerStage) => boolean) => {
        const stages = route.filter(select)
        if (!stages.length) return 'missing' as const
        const records = stages.map((stage) => this.store.stage(digest, stage.id))
        return records.every(
          (record) => record?.status === 'passed' && record.provenance === 'host-observed',
        )
          ? ('passed' as const)
          : records.some((record) => record?.status === 'failed')
            ? ('failed' as const)
            : ('missing' as const)
      },
      acceptance = this.passed(request, 'acceptance')
    return {
      acceptance: acceptance ? 'current' : 'missing',
      verify: gate((stage) => stage.kind === 'verification' && !stage.id.startsWith('re')),
      review: gate((stage) => stage.kind === 'review'),
      // The re-entry verification of each reviewed head refutes a stale review.
      refutation: gate((stage) => stage.id.startsWith('reverification:')),
      integration: gate((stage) => stage.kind === 'integration'),
      humanObservations: plan.criteria.some((criterion) => criterion.acceptance === 'human')
        ? acceptance
          ? 'satisfied'
          : 'unsatisfied'
        : 'not-required',
    }
  }
  private async eligibility(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    target: Readonly<RunnerMergeTarget>,
    signal: AbortSignal,
  ) {
    const merge = plan.policy.merge
    if (!merge) throw new DeliveryRunnerError('merge-stage-policy')
    const [facts, ci] = await Promise.all([
        this.options.facts.facts(target, signal),
        this.options.ci.observe(target, target.pr, signal),
      ]),
      authority = this.store.lifecycle.authority.inspect(request.grant),
      repository = plan.repositories.find((entry) => entry.id === target.repository)
    validateCiObservation(ci)
    const input: MergeEligibilityInput = {
      now: this.store.now(),
      policy: merge,
      grant: {
        active: authority.status === 'active',
        endpoint: authority.grant.policy.endpoint,
        effects: authority.grant.effects,
        repository: authority.grant.repositories.some(
          (scope) => scope.repository === target.repository,
        )
          ? target.repository
          : '',
        target: repository?.target ?? '',
        methods: authority.grant.policy.merge ? [authority.grant.policy.merge.method] : [],
        expiresAt: authority.grant.expiresAt,
      },
      runtime: { allowsMerge: this.options.runtime.allowsMerge },
      candidate: {
        repository: target.repository,
        head: target.head,
        target: repository?.target ?? '',
      },
      evidence: this.evidence(request, plan),
      pr: {
        codeHost: 'github',
        url: target.pr,
        state: facts.state,
        draft: facts.draft,
        head: facts.head,
        base: facts.base,
        mergeable: facts.mergeable,
        files: facts.files,
        unresolvedDiscussions: facts.unresolvedDiscussions,
        allowedMethods: facts.allowedMethods,
      },
      ci,
      base: { observedAt: facts.observedAt, current: facts.baseCurrent },
      // Repositories merge in order and the merger stops at the first that does not.
      dependencies: [],
      requested: { adminBypass: false, force: false, protectionChange: false, autoMerge: false },
    }
    return mergeEligibility(input)
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const { record, pinned } = this.admit(context)
    if (pinned.stage.kind === 'handoff') return this.executeHandoff(context, record)
    if (this.read(context.request, record) || record.runtime)
      return this.inspect(context.request, record)
    const published = await this.publication.published(context.request, context.signal)
    if (!published?.ready || !this.passed(context.request, 'ci'))
      return this.observation(
        context.request,
        record,
        'blocked',
        'not-started',
        { publication: published ?? null },
        'host-observed',
        'merge-stage-ready-publication-and-ci-required',
      )
    const binding: StageBinding = {
      version: 1,
      request: pinned.digest,
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      at: new Date().toISOString(),
      publication: published.evidence,
      targets: published.targets.map((target) => ({ ...target, method: pinned.merge.method })),
    }
    this.bind(binding)
    this.start(context)
    const verdicts: MergeEligibility[] = [],
      execution = await this.merger.merge(
        context.request.run,
        binding.targets,
        async (target) => {
          const verdict = await this.eligibility(
            context.request,
            pinned.basis.plan,
            target,
            context.signal,
          )
          verdicts.push(verdict)
          return verdict
        },
        context.signal,
      ),
      result: MergeResult = {
        binding: contractDigest(binding),
        eligibility: verdicts,
        outcome: execution.outcome,
      }
    this.store.files.atomic(
      `${this.path(record.invocation)}/result.json`,
      `${JSON.stringify(result)}\n`,
    )
    return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
  }
  /** The effect ledger, not the result cache, decides whether each merge is the run's own. */
  private merged(run: string, binding: Readonly<StageBinding>) {
    const effects = this.merger.effects.inspect(run)
    return binding.targets.map(
      (target) =>
        effects.find(
          (effect) =>
            effect.intent.key === this.merger.key(target.repository) &&
            effect.intent.basis === binding.plan &&
            effect.intent.expectedHead === target.head,
        )?.status ?? 'missing',
    )
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    const pinned = this.context(request, record)
    if (pinned.stage.kind === 'handoff') return this.inspectHandoff(request, record)
    const binding = this.read(request, record)
    if (!binding)
      return this.observation(
        request,
        record,
        record.runtime ? 'unknown' : 'blocked',
        record.runtime ? 'unknown' : 'not-started',
        { binding: null },
        this.options.merge.provenance,
        'merge-stage-not-issued',
      )
    const statuses = this.merged(request.run, binding),
      path = `${this.path(record.invocation)}/result.json`,
      result = existsSync(this.store.files.path(path))
        ? (JSON.parse(readSourceFile(this.store.files.root, path, 4 * 1024 * 1024)) as MergeResult)
        : null,
      unresolved = statuses.some((status) => ['prepared', 'pending', 'unknown'].includes(status))
    if (result && result.binding !== contractDigest(binding))
      throw new DeliveryRunnerError('merge-stage-result-binding')
    const status = statuses.every((entry) => entry === 'applied')
      ? 'passed'
      : unresolved || !result
        ? 'unknown'
        : 'blocked'
    return this.observation(
      request,
      record,
      status,
      status === 'unknown' ? 'unknown' : 'stopped',
      { binding, statuses, result },
      this.options.merge.provenance,
      status === 'passed'
        ? 'Every repository was merged by this run at its exact expected head.'
        : status === 'unknown'
          ? 'A merge effect awaits reconciliation by reading; it is never issued again.'
          : 'Eligibility refused, the server refused or someone else merged; nothing is claimed.',
    )
  }
  private async executeHandoff(context: RunnerStageContext, record: Readonly<RunnerStageRecord>) {
    const merge = this.store.stage(contractDigest(context.request), 'merge')
    if (record.runtime || !merge || !this.passed(context.request, 'merge'))
      return this.inspectHandoff(context.request, record)
    this.start(context)
    return this.inspectHandoff(
      context.request,
      this.store.stage(contractDigest(context.request), record.id) ?? record,
    )
  }
  /** Re-read each PR: only a merge of the exact head by this run's own actor hands off. */
  private async currentMerge(request: Readonly<RunnerRequest>, signal: AbortSignal) {
    const record = this.store.stage(contractDigest(request), 'merge')
    if (record?.status !== 'passed' || !record.evidence) return undefined
    const binding = this.read(request, record)
    if (!binding || this.merged(request.run, binding).some((status) => status !== 'applied'))
      return undefined
    const actor = await this.options.merge.actor(signal)
    for (const target of binding.targets) {
      const read = await this.options.merge.read(target, signal)
      if (read.state !== 'merged' || read.head !== target.head || read.mergedBy !== actor)
        return undefined
    }
    return { invocation: record.invocation, evidence: record.evidence }
  }
  private async inspectHandoff(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    let merged: Awaited<ReturnType<RunnerMergeStages['currentMerge']>>
    try {
      merged = await this.currentMerge(request, new AbortController().signal)
    } catch {
      merged = undefined
    }
    const started = !!record.runtime
    return this.observation(
      request,
      record,
      merged && started ? 'passed' : started ? 'blocked' : 'not-started',
      started ? 'stopped' : 'not-started',
      { merged: merged ?? null },
      this.options.merge.provenance,
      merged
        ? 'The run delivered its own exact-head merge; no rollback or follow-up is implied.'
        : 'No current own merge is observed; nothing is handed off.',
    )
  }
  async endpoint(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    signal: AbortSignal,
  ): Promise<RunnerEndpointObservation> {
    const digest = contractDigest(request),
      handoff = this.store.stage(digest, 'handoff'),
      merged = await this.currentMerge(request, signal)
    if (plan.policy.endpoint !== 'to-merge' || handoff?.status !== 'passed' || !merged)
      throw new DeliveryRunnerError('merge-endpoint-unavailable')
    return {
      request: digest,
      plan: contractDigest(plan),
      source: plan.source,
      outcome: 'merged',
      current: true,
      evidence: contractDigest({ handoff: handoff.evidence, merged }),
      provenance: this.options.merge.provenance,
    }
  }
}
