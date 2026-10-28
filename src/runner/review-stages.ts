import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import type { FlowEngine } from '../flow/engine.js'
import type { GatePlan } from '../gates/contracts.js'
import { inspectGateRound } from '../gates/execution.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import { prepareReviewInput } from '../review/input.js'
import { itemId, replay } from '../state/events.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { type RunnerGateOptions, RunnerNativeGateHost } from './native-gate.js'
import { RunnerNativeScope } from './native-scope.js'
import { RunnerNativeStage } from './native-stage.js'
import { RunnerRepairCommits } from './repair-commits.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

interface ReviewStageBinding {
  version: 1
  deadline: string
  request: string
  plan: string
  stage: string
  invocation: string
  unit: string
  workspace: string
  subject: string
  run: string
  round: number
  gate: string
}
interface ReviewContinuation {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  deadline: string
  correction: string
  from: ReviewStageBinding
}
export interface RunnerReviewOptions {
  correction?: RunnerRepairCommits
  identity: RunnerRequest['host']
  engine(request: Readonly<RunnerRequest>, workspace: string): FlowEngine
  gate(process: NativeProcessRunner, workspace: string): RunnerGateOptions
}

/** Existing review rounds and their budgets remain authoritative; models never mark a whole stage green. */
export class RunnerReviewStages {
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerReviewOptions,
  ) {}
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation)) throw new DeliveryRunnerError('review-stage-invocation')
    return `delivery/runner-reviews/${invocation}.json`
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      revision = this.store.lifecycle.journal
        .get(actual.run)
        .plans.find((item) => item.digest === record.basis)?.revision,
      prepared = this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(prepared.plan).find((item) => item.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find((item) => item.id === record.id && item.invocation === record.invocation)
    if (
      contractDigest(request.host) !== contractDigest(this.options.identity) ||
      !retained ||
      retained.basis !== record.basis ||
      prepared.digest !== record.basis ||
      stage?.kind !== 'review' ||
      !stage.unit
    )
      throw new DeliveryRunnerError('review-stage-binding')
    const candidate = new RunnerGitStages(this.store).candidate(
        request,
        stage.unit,
        this.options.correction,
      ),
      engine = this.options.engine(request, candidate.allocation.repository.path)
    if (engine.store.files.root !== this.store.files.root)
      throw new DeliveryRunnerError('review-stage-store')
    return { digest, prepared, stage, candidate, engine }
  }
  private read(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    historical = false,
    original?: ReviewStageBinding,
  ) {
    const context = this.context(request, record),
      path = this.path(record.invocation)
    if (!original && !existsSync(this.store.files.path(path))) return undefined
    const binding =
      original ??
      (JSON.parse(readSourceFile(this.store.files.root, path, 65536)) as ReviewStageBinding)
    if (
      Object.keys(binding).sort().join(',') !==
        'deadline,gate,invocation,plan,request,round,run,stage,subject,unit,version,workspace' ||
      binding.version !== 1 ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      binding.request !== context.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      binding.unit !== context.stage.unit ||
      binding.workspace !== context.candidate.allocation.repository.path
    )
      throw new DeliveryRunnerError('review-stage-resource-binding')
    const item = context.engine.store.get(binding.subject),
      run = gateRuns(context.engine.store.events()).find((item) => item.run === binding.run),
      round = run?.rounds.find((item) => item.plan.round === binding.round)
    if (
      item.kind !== 'review' ||
      item.repository !== binding.workspace ||
      !run ||
      run.subject !== item.id ||
      run.gate !== 'review' ||
      !round ||
      contractDigest(round.plan) !== binding.gate ||
      (!historical && run.rounds.at(-1) !== round)
    )
      throw new DeliveryRunnerError('review-stage-gate-binding')
    return { ...context, binding, run, round }
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('review-stage-not-dispatched')
    const pinned = this.context(context.request, record)
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      context.signal.aborted ||
      !context.current() ||
      !Number.isFinite(Date.parse(context.deadline)) ||
      Date.parse(context.deadline) <= Date.now() ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('review-stage-not-current')
    if (this.read(context.request, record)) return this.inspect(context.request, record)
    const slot = `delivery/runner-review-subjects/${contractDigest({ request: pinned.digest, plan: record.basis, unit: pinned.stage.unit })}.json`,
      marker = `${this.path(record.invocation)}.consumed`,
      engine = pinned.engine
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(marker)))
        throw new DeliveryRunnerError('review-stage-original-unresolved')
      this.store.files.atomic(marker, `${record.invocation}\n`)
    })
    // State and delivery stores have distinct lock owners. Publish the private
    // subject locator within its own state transaction; an orphan cannot grant a new round.
    const subject = engine.store.transaction((events, append) => {
        if (existsSync(engine.store.files.path(slot))) {
          const value = JSON.parse(readSourceFile(engine.store.files.root, slot, 65536)) as {
            subject: string
          }
          if (!replay(events).has(value.subject))
            throw new DeliveryRunnerError('review-stage-subject-unresolved')
          return value.subject
        }
        const subject = itemId('review')
        engine.store.files.atomic(slot, `${JSON.stringify({ subject })}\n`)
        append(subject, {
          type: 'item.created',
          data: {
            kind: 'review',
            title: `Review owned unit ${pinned.stage.unit}`,
            owner: context.plan.owner,
            body: 'Machine review of the owned delivery candidate; no human approval or endpoint is implied.',
            repository: pinned.candidate.allocation.repository.path,
          },
        })
        return subject
      }),
      declared = context.plan.repositories.find(
        (item) => item.id === pinned.candidate.allocation.repository.repository,
      )
    if (!declared) throw new DeliveryRunnerError('review-stage-repository')
    const gates = new GateWorkflow(engine),
      selected = gates.plan(subject, 'review', {
        repo: pinned.candidate.allocation.repository.path,
        base: declared.target,
      }),
      binding: ReviewStageBinding = {
        version: 1,
        deadline: context.deadline,
        request: pinned.digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        unit: pinned.stage.unit as string,
        workspace: pinned.candidate.allocation.repository.path,
        subject,
        run: selected.plan.run,
        round: selected.plan.round,
        gate: contractDigest(selected.plan),
      }
    this.store.files.atomic(this.path(record.invocation), `${JSON.stringify(binding)}\n`)
    return this.runRound(context, engine, selected.plan, binding)
  }
  private async runRound(
    context: RunnerStageContext,
    engine: FlowEngine,
    plan: GatePlan,
    binding: ReviewStageBinding,
  ) {
    await new RunnerNativeStage(this.store, context).run(async (process) => {
      const options = this.options.gate(process, binding.workspace),
        host = new RunnerNativeGateHost(
          this.store,
          context,
          engine,
          plan,
          {
            ...options,
            native: { ...options.native, process },
          },
          false,
          this.options.correction,
        )
      await inspectGateRound(engine, plan, host, true, () => {
        if (!context.current() || context.signal.aborted)
          throw new DeliveryRunnerError('review-stage-fenced')
        new RunnerGitStages(this.store).candidate(
          context.request,
          binding.unit,
          this.options.correction,
        )
      })
    })
    if (context.signal.aborted || !context.current())
      throw new DeliveryRunnerError('review-stage-fenced')
    new GateWorkflow(engine).verdict(binding.subject, 'review')
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('review-stage-not-dispatched')
    return this.inspect(context.request, record)
  }
  private continuationPath(invocation: string) {
    this.path(invocation)
    return `delivery/runner-review-continuations/${invocation}.json`
  }
  private continuation(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    proposed?: ReviewContinuation,
  ) {
    const path = this.continuationPath(record.invocation)
    if (!proposed && !existsSync(this.store.files.path(path))) return undefined
    const intent =
        proposed ??
        (JSON.parse(readSourceFile(this.store.files.root, path, 131072)) as ReviewContinuation),
      state = this.read(request, record, true, intent.from),
      checkpoint = this.options.correction
    if (!state || !(checkpoint instanceof RunnerRepairCommits))
      throw new DeliveryRunnerError('review-continuation-checkpoint-required')
    const producer = checkpoint.workers.production(request, record.invocation),
      origin = producer.binding.admission.feedback.origin,
      latest = gateRuns(state.engine.store.events())
        .filter((run) => run.subject === state.binding.subject && run.gate === 'review')
        .at(-1)
    if (
      Object.keys(intent).sort().join(',') !==
        'correction,deadline,from,invocation,plan,request,stage,version' ||
      intent.version !== 1 ||
      intent.request !== state.digest ||
      intent.plan !== record.basis ||
      intent.stage !== record.id ||
      intent.invocation !== record.invocation ||
      !Number.isFinite(Date.parse(intent.deadline)) ||
      new Date(intent.deadline).toISOString() !== intent.deadline ||
      Date.parse(intent.deadline) > Date.parse(producer.binding.deadline) ||
      Date.parse(intent.deadline) > Date.parse(state.binding.deadline) ||
      intent.correction !== state.candidate.receipt.digest ||
      state.candidate.receipt.parent !== state.round.plan.snapshot.head ||
      origin.gate !== state.binding.gate ||
      origin.run !== state.binding.run ||
      origin.round !== state.binding.round ||
      origin.deadline !== state.binding.deadline ||
      origin.stage !== record.id ||
      !state.round.decision ||
      ['PASS', 'EXHAUSTED'].includes(state.round.decision.report.verdict) ||
      state.run.budget !== state.round.plan.budget ||
      state.binding.round >= state.run.budget ||
      latest?.run !== state.binding.run
    )
      throw new DeliveryRunnerError('review-continuation-original-binding')
    const next = state.run.rounds.find((round) => round.plan.round === state.binding.round + 1)
    if (
      next &&
      (state.run.rounds.at(-1) !== next ||
        next.plan.gate !== 'review' ||
        next.plan.subject !== state.binding.subject ||
        next.plan.run !== state.binding.run ||
        next.plan.budget !== state.run.budget ||
        next.plan.snapshot.head !== state.candidate.receipt.head ||
        next.plan.snapshot.branch !== state.candidate.allocation.repository.branch)
    )
      throw new DeliveryRunnerError('review-continuation-next-binding')
    return { intent, state, next }
  }
  async advance(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('review-continuation-not-dispatched')
    let retained = this.continuation(context.request, record)
    if (!retained) {
      const state = this.read(context.request, record),
        checkpoint = this.options.correction
      if (
        !state ||
        !(checkpoint instanceof RunnerRepairCommits) ||
        context.plan.policy.intervention !== 'none' ||
        contractDigest(context.plan) !== record.basis ||
        contractDigest(context.stage) !== contractDigest(state.stage) ||
        !['running', 'prepared'].includes(record.status) ||
        context.signal.aborted ||
        !context.current() ||
        !Number.isFinite(Date.parse(context.deadline)) ||
        Date.parse(context.deadline) <= Date.now() ||
        new RunnerNativeScope(this.store.files, record.invocation)
          .inspect()
          .some((call) => !['stopped', 'not-started'].includes(call.observed.invocationState))
      )
        throw new DeliveryRunnerError('review-continuation-not-current')
      const intent: ReviewContinuation = {
        version: 1,
        request: state.digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        deadline: context.deadline,
        correction: state.candidate.receipt.digest,
        from: state.binding,
      }
      // Validate the source before publishing intent; different store locks must never nest.
      this.continuation(context.request, record, intent)
      let owned = false
      this.store.files.locked(() => {
        const path = this.continuationPath(record.invocation)
        if (existsSync(this.store.files.path(path))) return
        this.store.files.atomic(path, `${JSON.stringify(intent)}\n`)
        owned = true
      })
      if (owned) {
        if (
          context.signal.aborted ||
          !context.current() ||
          Date.parse(context.deadline) <= Date.now()
        )
          throw new DeliveryRunnerError('review-continuation-fenced')
        const declared = context.plan.repositories.find(
          (repo) => repo.id === state.candidate.allocation.repository.repository,
        )
        if (!declared) throw new DeliveryRunnerError('review-continuation-repository')
        const selected = new GateWorkflow(state.engine).plan(state.binding.subject, 'review', {
          repo: state.binding.workspace,
          base: declared.target,
        })
        if (
          selected.resumed ||
          selected.plan.run !== state.binding.run ||
          selected.plan.round !== state.binding.round + 1
        )
          throw new DeliveryRunnerError('review-continuation-original-plan-unresolved')
      }
      retained = this.continuation(context.request, record)
    }
    if (!retained?.next)
      throw new DeliveryRunnerError('review-continuation-original-plan-unresolved')
    const { intent, state, next } = retained,
      binding: ReviewStageBinding = {
        ...intent.from,
        deadline: intent.deadline,
        round: next.plan.round,
        gate: contractDigest(next.plan),
      }
    this.store.files.atomic(this.path(record.invocation), `${JSON.stringify(binding)}\n`)
    const marker = `${this.continuationPath(record.invocation)}.dispatched`
    if (existsSync(this.store.files.path(marker))) return this.inspect(context.request, record)
    if (
      context.signal.aborted ||
      !context.current() ||
      Date.parse(intent.deadline) <= Date.now() ||
      Date.parse(context.deadline) > Date.parse(intent.deadline) ||
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(state.stage) ||
      state.prepared.plan.policy.intervention !== 'none' ||
      !['running', 'prepared'].includes(record.status)
    )
      throw new DeliveryRunnerError('review-continuation-fenced')
    let dispatch = false
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(marker))) return
      this.store.files.atomic(marker, `${next.plan.round}\n`)
      dispatch = true
    })
    if (!dispatch) return this.inspect(context.request, record)
    return this.runRound(
      { ...context, deadline: intent.deadline },
      state.engine,
      next.plan,
      binding,
    )
  }

  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    const state = this.read(request, record),
      calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = calls.every((call) =>
        ['stopped', 'not-started'].includes(call.observed.invocationState),
      ),
      proofs: string[] = []
    let passed = false,
      failed = false,
      audited = false,
      problem: string | undefined,
      report = state?.round.decision
    if (state && closed) {
      failed = !!state.round.decision && state.round.decision.report.verdict !== 'PASS'
      const readContext: RunnerStageContext = {
          request,
          plan: state.prepared.plan,
          stage: state.stage,
          invocation: record.invocation,
          deadline: state.binding.deadline,
          signal: new AbortController().signal,
          current: () => false,
          started: () => {
            throw new DeliveryRunnerError('review-inspection-cannot-start')
          },
        },
        reader = new RunnerNativeGateHost(
          this.store,
          readContext,
          state.engine,
          state.round.plan,
          undefined,
          true,
          this.options.correction,
        ),
        review = prepareReviewInput(state.engine, state.round.plan)
      try {
        for (const unit of state.round.plan.units) {
          const result = state.round.results.find((item) => item.unit === unit.id)
          if (!result) throw new DeliveryRunnerError('review-stage-missing-result')
          const proof = reader.observe(state.round.plan, 'reviewer', unit, review)
          if (contractDigest(proof.value) !== contractDigest(result))
            throw new DeliveryRunnerError('review-stage-result-binding')
          proofs.push(proof.evidence)
        }
        // Audit submitted votes, then let the existing strict-majority policy
        // decide. An unavailable third refuter is not a fabricated negative vote.
        for (const vote of state.round.votes) {
          const source = state.round.results
            .flatMap((result) =>
              result.findings.map((finding) => ({
                id: `${result.unit}:${finding.id}`,
                unit: result.unit,
                finding,
              })),
            )
            .find((item) => item.id === vote.finding)
          if (!source || vote.verifier < 1 || vote.verifier > state.round.plan.verifiers)
            throw new DeliveryRunnerError('review-stage-vote-scope')
          const observed = reader.observe(
            state.round.plan,
            'refuter',
            { finding: vote.finding, verifier: vote.verifier, source },
            review,
          )
          if (contractDigest(observed.value) !== contractDigest(vote))
            throw new DeliveryRunnerError('review-stage-vote-binding')
          proofs.push(observed.evidence)
        }
        // A lost final metadata write may seal only already-observed exact work;
        // inspection never invokes a model, suite, repair or new gate round.
        const verdict = new GateWorkflow(state.engine).verdict(state.binding.subject, 'review')
        if (verdict.run !== state.binding.run || verdict.round !== state.binding.round)
          throw new DeliveryRunnerError('review-stage-verdict-binding')
        audited = true
        report = { observed: state.round.plan.snapshot.digest, report: verdict.report }
        passed = verdict.current && verdict.verdict === 'PASS' && !!calls.length
        failed = verdict.verdict !== 'PASS'
      } catch (error) {
        // Preserve only fixed controller categories; raw worker errors may contain secrets.
        problem =
          error instanceof DeliveryRunnerError ? error.problem : 'review-stage-audit-unavailable'
      }
    }
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status: !state || !closed ? 'unknown' : passed ? 'passed' : failed ? 'blocked' : 'unknown',
      invocationState: !state || !closed ? 'unknown' : calls.length ? 'stopped' : 'not-started',
      evidence: contractDigest({
        binding: state?.binding ?? null,
        report: report ?? null,
        calls,
        proofs,
      }),
      provenance: audited ? 'host-observed' : 'fixture',
      reason: passed
        ? 'The exact current owned candidate passed its observed review round; behavioral QA and acceptance remain separate.'
        : problem
          ? `Original review audit remains unresolved: ${problem}.`
          : 'Retain original review rounds, native receipts and budgets; no replay, approval or endpoint is inferred.',
    }
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    const digest = contractDigest(request)
    this.store.get(digest)
    if (
      contractDigest(request.host) !== contractDigest(this.options.identity) ||
      !record.id.startsWith('review:') ||
      !this.store
        .record(digest)
        .stages.some(
          (item) =>
            item.id === record.id &&
            item.invocation === record.invocation &&
            item.basis === record.basis,
        )
    )
      throw new DeliveryRunnerError('review-stage-binding')
    if (!signal.aborted)
      new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
  }
}
