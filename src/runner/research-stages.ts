// Runner stages for research: angles, claim examinations and synthesis.
import { existsSync, readdirSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { NativeDelegatedDecisionHost } from '../decisions/native-host.js'
import type { DecisionRequest } from '../decisions/store.js'
import { readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import {
  conclusionBasis,
  type ResearchConclusion,
  researchCertainty,
  validateConclusion,
} from '../research/conclusion.js'
import {
  type Angle,
  type AngleResult,
  type Evidence,
  type Refutation,
  type ResearchPlan,
  validatePlan,
  validateRefutation,
  validateResult,
} from '../research/contracts.js'
import { renderResearchBrief, researchReport } from '../research/report.js'
import { RunnerDecisionStages } from './decision-stages.js'
import type {
  RunnerEndpointObservation,
  RunnerStageContext,
  RunnerStageObservation,
} from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerNativeScope } from './native-scope.js'
import { RunnerNativeStage } from './native-stage.js'
import { DeliveryRunnerError, runnerDecisionRequirements, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

/** Default bounded research policy; a larger plan is refused, never silently trimmed. */
export const RESEARCH_LIMITS = Object.freeze({
  angles: 8,
  sources: 40,
  claims: 64,
  repairs: 2,
  wallMs: 30 * 60 * 1000,
  bytes: 1024 * 1024,
})
export interface RunnerResearchObservation {
  provenance: 'fixture' | 'host-observed'
  evidence: string
  value: unknown
}
/** A job key is unique per stage invocation, target and attempt. */
export interface RunnerResearchAngleJob {
  key: string
  question: string
  angle: Readonly<Angle>
}
/** Each verifier sees only the claim and its evidence, never another verifier's vote. */
export interface RunnerResearchClaimJob {
  key: string
  question: string
  claim: Readonly<{ id: string; text: string; evidence: Evidence[] }>
  verifier: number
}
/** The conclusion author sees the stored evidence aggregate and nothing it could query. */
export interface RunnerResearchConclusionJob {
  key: string
  question: string
  basis: string
  report: Readonly<ReturnType<typeof researchReport>>
  certainty: Readonly<ReturnType<typeof researchCertainty>>
}
export interface RunnerResearchWorkers {
  angle(job: RunnerResearchAngleJob, signal: AbortSignal): Promise<RunnerResearchObservation>
  examine(job: RunnerResearchClaimJob, signal: AbortSignal): Promise<RunnerResearchObservation>
  conclude(
    job: RunnerResearchConclusionJob,
    signal: AbortSignal,
  ): Promise<RunnerResearchObservation>
}
export interface RunnerResearchOptions {
  identity: RunnerRequest['host']
  plan(context: RunnerStageContext): ResearchPlan
  workers(process: NativeProcessRunner, context: RunnerStageContext): RunnerResearchWorkers
  requests(context: RunnerStageContext, artifact: Readonly<ResearchArtifact>): DecisionRequest[]
  host(process: NativeProcessRunner): NativeDelegatedDecisionHost
}
interface ResearchArtifact {
  ref: string
  sha256: string
}
interface ResearchBinding {
  /** Version 2 adds the authored conclusion (P9-23); version 1 runs replay unchanged. */
  version: 1 | 2
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  deadline: string
  research: ResearchPlan
}
interface ResearchEntry {
  version: 1
  kind: 'angle' | 'claim' | 'conclusion'
  target: string
  attempt: number
  outcome: 'observed' | 'crashed' | 'unavailable'
  reason: string
  evidence?: string
  value?: AngleResult | Refutation | ResearchConclusion
}
type ResearchOutcome = 'complete' | 'unknowns' | 'blocked'
interface ResearchSynthesis {
  version: 1
  outcome: ResearchOutcome
  report: string
  completedAt: string
  artifact: ResearchArtifact | null
  calls: { invocation: string; evidence: string }[]
}
interface ResearchHandoff {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  research: { invocation: string; evidence: string; outcome: ResearchOutcome }
}
const ENTRY_LIMIT = 2048
const iso = (value: string) =>
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value

/** Pure: stored entries alone decide results, votes, unknowns and the outcome. */
export function researchSynthesis(
  research: ResearchPlan,
  entries: readonly ResearchEntry[],
  uncertainty: DeliveryPlan['policy']['uncertainty'],
  concluded = false,
) {
  const results: AngleResult[] = []
  for (const angle of research.angles) {
    const own = entries.filter((entry) => entry.kind === 'angle' && entry.target === angle.id),
      observed = own.find((entry) => entry.outcome === 'observed'),
      unavailable = own.find((entry) => entry.outcome === 'unavailable')
    if (observed) results.push(observed.value as AngleResult)
    else if (unavailable)
      results.push({
        angle: angle.id,
        status: 'unavailable',
        claims: [],
        openQuestions: [],
        reason: unavailable.reason,
      })
  }
  const votes = entries.flatMap((entry) =>
      entry.kind === 'claim' && entry.outcome === 'observed' ? [entry.value as Refutation] : [],
    ),
    // The result contract already refuses claims without cited evidence.
    report = researchReport(research, results, votes),
    observed = results.some((result) => result.status === 'ok'),
    basis = conclusionBasis(research, report),
    // Only a conclusion written for exactly this evidence counts; any other stays unused.
    conclusion = concluded
      ? entries.find(
          (entry) =>
            entry.kind === 'conclusion' &&
            entry.outcome === 'observed' &&
            (entry.value as ResearchConclusion).basis === basis,
        )?.value
      : undefined,
    attempts = entries.filter((entry) => entry.kind === 'conclusion'),
    missing =
      concluded && !conclusion
        ? (attempts.at(-1)?.reason ?? 'No source produced evidence to conclude from.')
        : undefined,
    // A missing conclusion is an unknown, never an inferred answer.
    open = report.openQuestions.length > 0 || missing !== undefined,
    outcome: ResearchOutcome = !observed
      ? 'blocked'
      : !open
        ? 'complete'
        : uncertainty === 'complete-with-unknowns'
          ? 'unknowns'
          : 'blocked'
  return {
    results,
    votes,
    report,
    outcome,
    basis,
    conclusion: conclusion as ResearchConclusion | undefined,
    missing,
  }
}

/** Report-level research: bounded sources, independent challenge, a stored brief and no code authority. */
export class RunnerResearchStages {
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerResearchOptions,
  ) {}
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('research-stage-invocation')
    return `delivery/runner-research/${invocation}`
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
      stage.unit ||
      !['research', 'handoff'].includes(stage.kind) ||
      basis.plan.policy.endpoint !== 'research-report' ||
      contractDigest(request.host) !== contractDigest(this.options.identity)
    )
      throw new DeliveryRunnerError('research-stage-binding')
    return { digest, basis, stage, original }
  }
  private released(digest: string) {
    return this.store.inspect(digest).ownership === 'released'
  }
  private binding(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const path = `${this.path(record.invocation)}/binding.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, path, 2 * 1024 * 1024),
    ) as ResearchBinding
    const pinned = this.context(request, record)
    validatePlan(binding.research)
    if (
      Object.keys(binding).sort().join(',') !==
        'at,deadline,invocation,plan,request,research,stage,version' ||
      (binding.version !== 1 && binding.version !== 2) ||
      binding.request !== pinned.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      pinned.stage.kind !== 'research' ||
      !iso(binding.at) ||
      !iso(binding.deadline) ||
      binding.at >= binding.deadline ||
      Date.parse(binding.deadline) - Date.parse(binding.at) > RESEARCH_LIMITS.wallMs ||
      binding.research.run !== request.run ||
      binding.research.owner !== pinned.basis.plan.owner ||
      binding.research.angles.length > RESEARCH_LIMITS.angles ||
      readSourceFile(
        this.store.files.root,
        `${this.path(record.invocation)}/consumed`,
        128,
      ).trim() !== contractDigest(binding)
    )
      throw new DeliveryRunnerError('research-stage-original-binding')
    return binding
  }
  private entries(binding: ResearchBinding) {
    const directory = `${this.path(binding.invocation)}/entries`
    if (!existsSync(this.store.files.path(directory))) return []
    // An interrupted atomic write leaves only a temporary name, never an entry.
    const names = readdirSync(this.store.files.path(directory))
      .filter((name) => /^[0-9]{4}\.json$/.test(name))
      .sort()
    if (names.length > ENTRY_LIMIT) throw new DeliveryRunnerError('research-stage-entry-limit')
    return names.map((name, index) => {
      if (name !== `${String(index).padStart(4, '0')}.json`)
        throw new DeliveryRunnerError('research-stage-entry-sequence')
      const entry = JSON.parse(
        readSourceFile(this.store.files.root, `${directory}/${name}`, RESEARCH_LIMITS.bytes * 2),
      ) as ResearchEntry
      this.validateEntry(binding.research, entry, binding.version)
      return entry
    })
  }
  private validateEntry(research: ResearchPlan, entry: ResearchEntry, version: 1 | 2) {
    const keys = Object.keys(entry).sort().join(',')
    if (
      entry.version !== 1 ||
      !(version === 2 ? ['angle', 'claim', 'conclusion'] : ['angle', 'claim']).includes(
        entry.kind,
      ) ||
      (entry.kind === 'conclusion' && entry.target !== 'conclusion') ||
      !Number.isInteger(entry.attempt) ||
      entry.attempt < 0 ||
      entry.attempt > 1 + RESEARCH_LIMITS.repairs ||
      typeof entry.reason !== 'string' ||
      !entry.reason.trim() ||
      (entry.kind === 'angle' && !research.angles.some((angle) => angle.id === entry.target))
    )
      throw new DeliveryRunnerError('research-stage-entry')
    if (entry.outcome !== 'observed') {
      if (keys !== 'attempt,kind,outcome,reason,target,version' || entry.outcome === undefined)
        throw new DeliveryRunnerError('research-stage-entry')
      return
    }
    if (
      keys !== 'attempt,evidence,kind,outcome,reason,target,value,version' ||
      !/^[a-f0-9]{64}$/.test(entry.evidence ?? '')
    )
      throw new DeliveryRunnerError('research-stage-entry')
    safeSourceText(JSON.stringify(entry.value), RESEARCH_LIMITS.bytes)
    if (entry.kind === 'conclusion') {
      try {
        validateConclusion(entry.value)
      } catch {
        throw new DeliveryRunnerError('research-stage-entry')
      }
    } else if (entry.kind === 'angle') {
      validateResult(entry.value)
      if (entry.value.angle !== entry.target) throw new DeliveryRunnerError('research-stage-entry')
    } else {
      validateRefutation(entry.value)
      if (`${entry.value.claim}#${entry.value.verifier}` !== entry.target)
        throw new DeliveryRunnerError('research-stage-entry')
    }
  }
  private synthesis(binding: ResearchBinding) {
    const path = `${this.path(binding.invocation)}/synthesis.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const value = JSON.parse(
      readSourceFile(this.store.files.root, path, 65536),
    ) as ResearchSynthesis
    if (
      Object.keys(value).sort().join(',') !== 'artifact,calls,completedAt,outcome,report,version' ||
      value.version !== 1 ||
      !['complete', 'unknowns', 'blocked'].includes(value.outcome) ||
      !/^[a-f0-9]{64}$/.test(value.report) ||
      !iso(value.completedAt) ||
      value.completedAt < binding.at ||
      !Array.isArray(value.calls) ||
      (value.artifact === null && value.outcome !== 'blocked')
    )
      throw new DeliveryRunnerError('research-stage-synthesis')
    return value
  }
  private brief(
    binding: ResearchBinding,
    plan: Readonly<DeliveryPlan>,
    synthesized: ReturnType<typeof researchSynthesis>,
    completedAt: string,
  ) {
    const excerpts = new Map<string, Set<string>>()
    for (const evidence of [
      ...synthesized.results.flatMap((result) => result.claims.flatMap((claim) => claim.evidence)),
      ...synthesized.votes.flatMap((vote) => vote.evidence),
    ]) {
      const digest = sourceHash(evidence.excerpt)
      excerpts.set(digest, (excerpts.get(digest) ?? new Set()).add(evidence.ref))
    }
    const refs = [...new Set([...excerpts.values()].flatMap((set) => [...set]))].sort(),
      mirrors = [...excerpts.values()].filter((set) => set.size > 1).map((set) => [...set].sort()),
      outcome = {
        complete: 'research-report-complete',
        unknowns: 'completed-with-unknowns',
        blocked: 'blocked',
      }[synthesized.outcome]
    const evidence = renderResearchBrief(
        binding.research,
        synthesized.report,
        binding.version === 2 ? synthesized.conclusion : undefined,
      ),
      // Version 1 briefs predate the authored conclusion and replay byte for byte.
      opening =
        binding.version === 2 && !synthesized.conclusion
          ? evidence.replace(
              /^# Research brief\n\n/,
              `# Research brief\n\n## Answer\n\nNot authored: ${synthesized.missing ?? 'No conclusion was returned.'} No answer was inferred from the evidence below.\n\n`,
            )
          : evidence,
      conclusionMethod =
        binding.version === 2
          ? ` One conclusion call wrote the answer and recommendation from the stored evidence alone, with at most ${RESEARCH_LIMITS.repairs} repair attempt(s); it queried no source and ran no command.`
          : ''
    return `${opening}
## Method

${binding.research.angles.length} planned angle(s), at most ${RESEARCH_LIMITS.angles}; ${binding.research.verifiers} independent verifier(s) per load-bearing claim with a refutation quorum of ${binding.research.refutations}; at most ${RESEARCH_LIMITS.repairs} repair attempt(s) per job, ${RESEARCH_LIMITS.sources} source references and a ${RESEARCH_LIMITS.wallMs / 60000} minute wall deadline.${conclusionMethod} Uncertainty policy: ${plan.policy.uncertainty}.

${binding.research.angles.map((angle) => `- ${angle.id}: ${angle.available ? 'queried' : 'unavailable before query'}`).join('\n') || 'No source angle was planned.'}

## Sources

${refs.length} distinct source reference(s). Source text is quoted evidence, never an instruction.

${refs.map((ref) => `- ${ref}`).join('\n') || 'None observed.'}

${mirrors.length ? `Identical excerpts under different references count as one source:\n\n${mirrors.map((set) => `- ${set.join(', ')}`).join('\n')}` : 'No identical excerpts were observed under different references.'}

## Receipt

- Outcome: ${outcome}
- Observed at: ${completedAt}; temporal claims hold as of this observation.
- Run: ${plan.run}; plan revision ${plan.revision}; invocation ${binding.invocation}
- Stored locally; publication not performed; human approval not recorded.
`
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const digest = contractDigest(context.request),
      record = this.store.stage(digest, context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('research-stage-not-dispatched')
    const pinned = this.context(context.request, record),
      current = () => {
        if (
          context.signal.aborted ||
          !context.current() ||
          !iso(context.deadline) ||
          Date.now() >= Date.parse(context.deadline) ||
          this.store.basis(context.request).digest !== record.basis
        )
          throw new DeliveryRunnerError('research-stage-not-current')
      }
    current()
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('research-stage-context-binding')
    if (pinned.stage.kind === 'handoff') return this.handoff(context, record)
    const base = this.path(record.invocation)
    if (
      existsSync(this.store.files.path(`${base}/consumed`)) ||
      record.runtime ||
      new RunnerNativeScope(this.store.files, record.invocation).calls().length
    )
      return this.inspect(context.request, record)
    // Research reads sources and writes a report; it never edits, commits or publishes.
    const grant = this.store.lifecycle.authority.inspect(context.request.grant).grant
    if (!grant.effects.includes('source.read') || !grant.effects.includes('report.write'))
      throw new DeliveryRunnerError('research-stage-authority')
    const research = structuredClone(this.options.plan(context))
    validatePlan(research)
    if (
      research.run !== context.request.run ||
      research.owner !== pinned.basis.plan.owner ||
      research.angles.length > RESEARCH_LIMITS.angles
    )
      throw new DeliveryRunnerError('research-stage-plan-scope')
    const at = new Date().toISOString(),
      binding: ResearchBinding = {
        version: 2,
        request: digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        at,
        deadline: new Date(
          Math.min(Date.parse(context.deadline), Date.parse(at) + RESEARCH_LIMITS.wallMs),
        ).toISOString(),
        research,
      }
    safeSourceText(JSON.stringify(binding), 2 * 1024 * 1024)
    current()
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${base}/consumed`)))
        throw new DeliveryRunnerError('research-stage-original-unresolved')
      this.store.files.atomic(`${base}/consumed`, `${contractDigest(binding)}\n`)
      this.store.files.atomic(`${base}/binding.json`, `${JSON.stringify(binding)}\n`)
    })
    // In-process controller work; this PID is descriptive, never a cancellation target.
    context.started({
      backend: 'owned-core',
      instance: record.invocation,
      worker: `pid-${process.pid}`,
    })
    const entries: ResearchEntry[] = [],
      sources = new Set<string>(),
      abort = new AbortController(),
      cancel = () => abort.abort(),
      timer = setTimeout(cancel, Math.max(1, Date.parse(binding.deadline) - Date.now()))
    context.signal.addEventListener('abort', cancel, { once: true })
    if (context.signal.aborted) cancel()
    const expired = () => abort.signal.aborted || Date.now() >= Date.parse(binding.deadline),
      append = (entry: ResearchEntry) => {
        current()
        this.validateEntry(research, entry, binding.version)
        this.store.files.atomic(
          `${base}/entries/${String(entries.length).padStart(4, '0')}.json`,
          `${JSON.stringify(entry)}\n`,
        )
        entries.push(entry)
      },
      bounded = async (pending: Promise<RunnerResearchObservation>) => {
        let stop: (() => void) | undefined
        try {
          return await Promise.race([
            pending,
            new Promise<never>((_, reject) => {
              stop = () => reject(new DeliveryRunnerError('research-worker-cancelled'))
              if (abort.signal.aborted) stop()
              else abort.signal.addEventListener('abort', stop, { once: true })
            }),
          ])
        } finally {
          if (stop) abort.signal.removeEventListener('abort', stop)
        }
      },
      // Each job gets the original try and two repair attempts; a crash is never an observation.
      job = async (
        kind: ResearchEntry['kind'],
        target: string,
        call: (key: string) => Promise<RunnerResearchObservation>,
        admit: (value: AngleResult | Refutation | ResearchConclusion) => string | undefined,
      ) => {
        let attempt = 0
        while (attempt <= RESEARCH_LIMITS.repairs && !expired()) {
          attempt += 1
          let observed: RunnerResearchObservation
          try {
            observed = await bounded(
              call(contractDigest({ invocation: record.invocation, kind, target, attempt })),
            )
            if (
              observed.provenance !== 'host-observed' ||
              !/^[a-f0-9]{64}$/.test(observed.evidence)
            )
              throw new DeliveryRunnerError('research-worker-observation')
            const value = structuredClone(observed.value) as
              | AngleResult
              | Refutation
              | ResearchConclusion
            this.validateEntry(
              research,
              {
                version: 1,
                kind,
                target,
                attempt,
                outcome: 'observed',
                reason: 'Observed source result.',
                evidence: observed.evidence,
                value,
              },
              binding.version,
            )
            const refusal = admit(value)
            if (refusal) {
              append({ version: 1, kind, target, attempt, outcome: 'unavailable', reason: refusal })
              return
            }
            append({
              version: 1,
              kind,
              target,
              attempt,
              outcome: 'observed',
              reason: 'Observed source result.',
              evidence: observed.evidence,
              value,
            })
            return
          } catch {
            current()
            append({
              version: 1,
              kind,
              target,
              attempt,
              outcome: 'crashed',
              reason: 'The worker did not return a valid host-observed result.',
            })
          }
        }
        append({
          version: 1,
          kind,
          target,
          attempt,
          outcome: 'unavailable',
          reason: expired()
            ? 'The research deadline ended before this job returned a result.'
            : `No valid result after ${attempt} attempt(s).`,
        })
      },
      budget = (refs: readonly string[]) =>
        new Set([...sources, ...refs]).size > RESEARCH_LIMITS.sources
          ? `The source budget of ${RESEARCH_LIMITS.sources} documents is exhausted.`
          : undefined
    let claims = 0
    try {
      await new RunnerNativeStage(this.store, { ...context, signal: abort.signal }).run(
        async (process) => {
          const workers = this.options.workers(process, { ...context, signal: abort.signal })
          for (const angle of research.angles) {
            if (!angle.available) {
              append({
                version: 1,
                kind: 'angle',
                target: angle.id,
                attempt: 0,
                outcome: 'unavailable',
                reason: `The source provider is unavailable: ${angle.evidence}`,
              })
              continue
            }
            await job(
              'angle',
              angle.id,
              (key) =>
                workers.angle(
                  structuredClone({ key, question: research.question, angle }),
                  abort.signal,
                ),
              (value) => {
                const result = value as AngleResult,
                  refs = result.claims.flatMap((claim) => claim.evidence.map((item) => item.ref)),
                  refusal =
                    budget(refs) ??
                    (claims + result.claims.length > RESEARCH_LIMITS.claims
                      ? `The claim budget of ${RESEARCH_LIMITS.claims} claims is exhausted.`
                      : undefined)
                if (!refusal) {
                  for (const ref of refs) sources.add(ref)
                  claims += result.claims.length
                }
                return refusal
              },
            )
          }
          const draft = researchSynthesis(research, entries, pinned.basis.plan.policy.uncertainty)
          for (const claim of draft.report.claims.filter((item) => item.loadBearing))
            for (let verifier = 1; verifier <= research.verifiers; verifier++)
              await job(
                'claim',
                `${claim.id}#${verifier}`,
                (key) =>
                  workers.examine(
                    structuredClone({
                      key,
                      question: research.question,
                      claim: { id: claim.id, text: claim.text, evidence: claim.evidence },
                      verifier,
                    }),
                    abort.signal,
                  ),
                (value) => {
                  const refs = (value as Refutation).evidence.map((item) => item.ref),
                    refusal = budget(refs)
                  if (!refusal) for (const ref of refs) sources.add(ref)
                  return refusal
                },
              )
          // One bounded call authors the answer from the finished evidence; nothing is queried.
          const finished = researchSynthesis(
            research,
            entries,
            pinned.basis.plan.policy.uncertainty,
          )
          if (finished.results.some((result) => result.status === 'ok'))
            await job(
              'conclusion',
              'conclusion',
              (key) =>
                workers.conclude(
                  structuredClone({
                    key,
                    question: research.question,
                    basis: finished.basis,
                    report: finished.report,
                    certainty: researchCertainty(finished.report),
                  }),
                  abort.signal,
                ),
              (value) =>
                (value as ResearchConclusion).basis === finished.basis
                  ? undefined
                  : 'The conclusion was written for different evidence.',
            )
        },
      )
    } finally {
      clearTimeout(timer)
      context.signal.removeEventListener('abort', cancel)
    }
    current()
    const synthesized = researchSynthesis(
        research,
        entries,
        pinned.basis.plan.policy.uncertainty,
        binding.version === 2,
      ),
      completedAt = new Date().toISOString(),
      body = this.brief(binding, pinned.basis.plan, synthesized, completedAt)
    safeSourceText(body, 8 * 1024 * 1024)
    const captured = this.store.budgets.captureArtifact(context.request.run, Buffer.from(body)),
      synthesis: ResearchSynthesis = {
        version: 1,
        outcome: captured.stored ? synthesized.outcome : 'blocked',
        report: contractDigest(synthesized.report),
        completedAt,
        artifact: captured.stored
          ? { ref: captured.artifact.ref, sha256: captured.artifact.digest }
          : null,
        calls: new RunnerNativeScope(this.store.files, record.invocation)
          .inspect()
          .map((call) => ({ invocation: call.invocation, evidence: call.observed.evidence })),
      }
    current()
    this.store.files.atomic(`${base}/synthesis.json`, `${JSON.stringify(synthesis)}\n`)
    if (synthesis.artifact && synthesis.outcome !== 'blocked') {
      const artifact = Object.freeze({ ...synthesis.artifact })
      await new RunnerDecisionStages(
        this.store,
        this.options.identity,
        artifact,
        synthesis.calls,
      ).execute(context, this.options.requests(context, artifact), (process) => {
        const host = this.options.host(process)
        if (
          !(host instanceof NativeDelegatedDecisionHost) ||
          host.options.native.process !== process ||
          host.purposes.queue.lifecycle.journal.files.root !== this.store.files.root
        )
          throw new DeliveryRunnerError('research-stage-native-host')
        return host
      })
    }
    return this.inspect(context.request, this.store.stage(digest, record.id) ?? record)
  }
  /** Recompute the stored report from entries alone; no worker is called again. */
  private async observeResearch(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ) {
    const pinned = this.context(request, record),
      binding = this.binding(request, record),
      calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = calls.every((call) =>
        ['stopped', 'not-started'].includes(call.observed.invocationState),
      )
    if (!binding) {
      const untouched =
        !record.runtime &&
        !calls.length &&
        !existsSync(this.store.files.path(`${this.path(record.invocation)}/consumed`))
      return {
        status: untouched ? ('blocked' as const) : ('unknown' as const),
        invocationState: untouched ? ('not-started' as const) : ('unknown' as const),
        provenance: 'fixture' as const,
        decisions: [] as string[],
        evidence: { binding: null, calls },
      }
    }
    const entries = this.entries(binding),
      synthesis = this.synthesis(binding),
      synthesized = researchSynthesis(
        binding.research,
        entries,
        pinned.basis.plan.policy.uncertainty,
        binding.version === 2,
      )
    const evidence: Record<string, unknown> = { binding, entries, synthesis: synthesis ?? null }
    if (!synthesis) {
      // Interrupted work keeps every stored source identity; it is never completed later.
      const stopped = closed && this.released(pinned.digest)
      return {
        status: stopped ? ('blocked' as const) : ('unknown' as const),
        invocationState: stopped ? ('stopped' as const) : ('unknown' as const),
        provenance: 'fixture' as const,
        decisions: [] as string[],
        evidence,
      }
    }
    if (
      synthesis.report !== contractDigest(synthesized.report) ||
      (synthesis.artifact &&
        (synthesis.outcome !== synthesized.outcome ||
          sourceHash(
            readSourceFile(this.store.files.root, synthesis.artifact.ref, 8 * 1024 * 1024),
          ) !== synthesis.artifact.sha256 ||
          readSourceFile(this.store.files.root, synthesis.artifact.ref, 8 * 1024 * 1024) !==
            this.brief(binding, pinned.basis.plan, synthesized, synthesis.completedAt) ||
          !this.store.budgets
            .inspect(request.run)
            .artifacts.some(
              (entry) =>
                entry.digest === synthesis.artifact?.sha256 &&
                entry.ref === synthesis.artifact.ref &&
                entry.status === 'observed',
            ))) ||
      contractDigest(synthesis.calls) !==
        contractDigest(
          calls
            .slice(0, synthesis.calls.length)
            .map((call) => ({ invocation: call.invocation, evidence: call.observed.evidence })),
        )
    )
      throw new DeliveryRunnerError('research-stage-synthesis-binding')
    if (synthesis.outcome === 'blocked' || !synthesis.artifact)
      return {
        status: closed ? ('blocked' as const) : ('unknown' as const),
        invocationState: closed ? ('stopped' as const) : ('unknown' as const),
        provenance: 'host-observed' as const,
        decisions: [] as string[],
        evidence,
        outcome: synthesis.outcome,
      }
    const required = runnerDecisionRequirements(
        pinned.basis.plan,
        pinned.stage,
        this.store.lifecycle.authority.inspect(request.grant).grant.basis.kind,
      ),
      decision = await new RunnerDecisionStages(
        this.store,
        this.options.identity,
        synthesis.artifact,
        synthesis.calls,
      ).inspect(request, record)
    evidence.decision = decision
    const status: RunnerStageObservation['status'] =
      !closed || decision.status === 'unknown'
        ? 'unknown'
        : required.length &&
            decision.status === 'ready' &&
            decision.provenance === 'host-observed' &&
            calls.length - synthesis.calls.length >= 2 * required.length
          ? 'passed'
          : 'blocked'
    return {
      status,
      invocationState: closed ? ('stopped' as const) : ('unknown' as const),
      provenance: decision.provenance,
      decisions: decision.decisions,
      evidence,
      outcome: synthesis.outcome,
    }
  }
  private handoffPath(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('research-stage-invocation')
    return `delivery/runner-research-handoffs/${invocation}`
  }
  /** The research stage's current observation, or undefined when it cannot support a report. */
  private async current(request: Readonly<RunnerRequest>) {
    const digest = contractDigest(request),
      record = this.store.stage(digest, 'research')
    if (record?.status !== 'passed' || record.basis !== this.store.basis(request).digest)
      return undefined
    const observed = await this.observeResearch(request, record)
    if (
      observed.status !== 'passed' ||
      observed.invocationState !== 'stopped' ||
      observed.provenance !== 'host-observed' ||
      contractDigest(observed.evidence) !== record.evidence ||
      !observed.outcome
    )
      return undefined
    return { invocation: record.invocation, evidence: record.evidence, outcome: observed.outcome }
  }
  private readHandoff(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.handoffPath(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/binding.json`))) return undefined
    const value = JSON.parse(
      readSourceFile(this.store.files.root, `${base}/binding.json`, 65536),
    ) as ResearchHandoff
    if (
      Object.keys(value).sort().join(',') !== 'at,invocation,plan,request,research,stage,version' ||
      value.version !== 1 ||
      value.request !== contractDigest(request) ||
      value.plan !== record.basis ||
      value.stage !== record.id ||
      value.invocation !== record.invocation ||
      !iso(value.at) ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(value) ||
      record.runtime?.backend !== 'owned-core' ||
      record.runtime.instance !== record.invocation ||
      new RunnerNativeScope(this.store.files, record.invocation).calls().length
    )
      throw new DeliveryRunnerError('research-handoff-original-binding')
    return value
  }
  private async handoff(context: RunnerStageContext, record: Readonly<RunnerStageRecord>) {
    const base = this.handoffPath(record.invocation)
    if (
      existsSync(this.store.files.path(`${base}/consumed`)) ||
      record.runtime ||
      new RunnerNativeScope(this.store.files, record.invocation).calls().length
    )
      return this.inspect(context.request, record)
    const research = await this.current(context.request)
    if (!research || context.signal.aborted || !context.current())
      return this.inspect(context.request, record)
    const value: ResearchHandoff = {
      version: 1,
      request: contractDigest(context.request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      at: new Date().toISOString(),
      research,
    }
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${base}/consumed`)))
        throw new DeliveryRunnerError('research-handoff-original-unresolved')
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
        evidence: { binding: null },
      }
    }
    const research = await this.current(request)
    return contractDigest(research ?? null) === contractDigest(binding.research)
      ? { status: 'passed' as const, invocationState: 'stopped' as const, evidence: { binding } }
      : { status: 'blocked' as const, invocationState: 'stopped' as const, evidence: { binding } }
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    const pinned = this.context(request, record),
      observed =
        pinned.stage.kind === 'handoff'
          ? {
              ...(await this.observeHandoff(request, record)),
              provenance: 'host-observed' as const,
              decisions: [] as string[],
            }
          : await this.observeResearch(request, record),
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
      provenance: observed.provenance,
      ...(pinned.stage.kind === 'research' ? { decisions: observed.decisions } : {}),
      reason: passed
        ? 'The stored research brief and its independent source decision are current; no code, merge or publication authority is inferred.'
        : 'Retain stored source results, the original question and their unknowns; incomplete, refuted or unavailable evidence never completes the report.',
    }
  }
  async endpoint(
    request: Readonly<RunnerRequest>,
    plan: Readonly<DeliveryPlan>,
    signal: AbortSignal,
  ): Promise<RunnerEndpointObservation> {
    const digest = contractDigest(request),
      basis = this.store.basis(request),
      record = this.store.stage(digest, 'handoff')
    let current = false,
      outcome: RunnerEndpointObservation['outcome'] = 'research-report-complete',
      observed: RunnerStageObservation | undefined
    if (
      !signal.aborted &&
      basis.digest === contractDigest(plan) &&
      basis.plan.policy.endpoint === 'research-report' &&
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
      if (binding?.research.outcome === 'unknowns') outcome = 'completed-with-unknowns'
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
      provenance: current ? 'host-observed' : 'fixture',
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
