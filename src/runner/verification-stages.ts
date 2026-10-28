import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import { EnvironmentResources } from '../environment/runtime.js'
import type { FlowEngine } from '../flow/engine.js'
import type { GatePlan } from '../gates/contracts.js'
import { inspectGateRound } from '../gates/execution.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import { itemId, replay } from '../state/events.js'
import {
  type ContractGateInput,
  contractGateInput,
  contractGateUnits,
  sameContractGateUnits,
} from '../verification/contract-gate.js'
import { suiteGateResult } from '../verification/suite.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import { RunnerEnvironmentScope } from './environment-scope.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { type RunnerGateOptions, RunnerNativeGateHost } from './native-gate.js'
import { RunnerNativeScope } from './native-scope.js'
import { RunnerNativeStage } from './native-stage.js'
import { RunnerRepairCommits } from './repair-commits.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'
import { type RunnerSuiteSelection, RunnerSuiteStages } from './suite-stages.js'

interface VerificationStageBinding {
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
  selection: RunnerSuiteSelection
}
interface VerificationContinuation {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  deadline: string
  correction: string
  from: VerificationStageBinding
  selection: RunnerSuiteSelection
}
export interface RunnerVerificationOptions {
  correction?: RunnerRepairCommits
  identity: RunnerRequest['host']
  engine(request: Readonly<RunnerRequest>, workspace: string): FlowEngine
  gate(process: NativeProcessRunner, workspace: string): RunnerGateOptions
  suite(request: Readonly<RunnerRequest>, workspace: string): RunnerSuiteSelection
  driver?: DockerTransport
  contracts?(request: Readonly<RunnerRequest>, workspace: string): Record<string, string>
}

/** Join actual suite facts and independent requirement judgments without recording a human approval. */
export class RunnerVerificationStages {
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerVerificationOptions,
  ) {}
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('verification-stage-invocation')
    return `delivery/runner-verifications/${invocation}.json`
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
      stage?.kind !== 'verification' ||
      !stage.unit
    )
      throw new DeliveryRunnerError('verification-stage-binding')
    const candidate = new RunnerGitStages(this.store).candidate(
        request,
        stage.unit,
        this.options.correction,
      ),
      engine = this.options.engine(request, candidate.allocation.repository.path)
    if (engine.store.files.root !== this.store.files.root)
      throw new DeliveryRunnerError('verification-stage-store')
    return { digest, prepared, stage, candidate, engine }
  }
  private criteria(context: ReturnType<RunnerVerificationStages['context']>) {
    if (!context.stage.criteria.length)
      throw new DeliveryRunnerError('verification-stage-criteria-required')
    return context.stage.criteria.map((id) => {
      const criterion = context.prepared.plan.criteria.find((c) => c.id === id)
      if (!criterion) throw new DeliveryRunnerError('verification-stage-criterion-scope')
      return { id: criterion.id, text: criterion.text, test: criterion.test }
    })
  }
  private unitsCurrent(
    context: ReturnType<RunnerVerificationStages['context']>,
    plan: GatePlan,
    historical = false,
  ) {
    if (context.stage.criteria.length)
      return (
        !plan.units.some((unit) => unit.origin === 'delivery:contracts') &&
        contractDigest(
          plan.units
            .filter((unit) => unit.origin === 'agreed:criteria')
            .map((unit) => JSON.parse(unit.asks)),
        ) === contractDigest(this.criteria(context))
      )
    const input = contractGateInput(plan.units)
    if (
      !input ||
      input.run !== context.prepared.plan.run ||
      input.revision !== context.prepared.plan.revision ||
      input.unit !== context.stage.unit ||
      plan.units.some((unit) => unit.origin === 'agreed:criteria')
    )
      return false
    const current = contractGateUnits(
      this.store.files.root,
      context.candidate.allocation.repository.path,
      input,
    )
    return (
      (historical || current.observed.snapshot.digest === plan.snapshot.digest) &&
      sameContractGateUnits(plan.units, current.units)
    )
  }
  private read(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    historical = false,
    original?: VerificationStageBinding,
  ) {
    const context = this.context(request, record),
      path = this.path(record.invocation)
    if (!original && !existsSync(this.store.files.path(path))) return undefined
    const binding =
      original ??
      (JSON.parse(readSourceFile(this.store.files.root, path, 65536)) as VerificationStageBinding)
    if (
      Object.keys(binding).sort().join(',') !==
        'deadline,gate,invocation,plan,request,round,run,selection,stage,subject,unit,version,workspace' ||
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
      throw new DeliveryRunnerError('verification-stage-resource-binding')
    const item = context.engine.store.get(binding.subject),
      run = gateRuns(context.engine.store.events()).find((item) => item.run === binding.run),
      round = run?.rounds.find((item) => item.plan.round === binding.round)
    if (
      item.kind !== 'review' ||
      item.repository !== binding.workspace ||
      !run ||
      run.subject !== item.id ||
      run.gate !== 'verify' ||
      !round ||
      contractDigest(round.plan) !== binding.gate ||
      (!historical && run.rounds.at(-1) !== round) ||
      !this.unitsCurrent(context, round.plan, historical)
    )
      throw new DeliveryRunnerError('verification-stage-gate-binding')
    return { ...context, binding, run, round }
  }
  async execute(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('verification-stage-not-dispatched')
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
      throw new DeliveryRunnerError('verification-stage-not-current')
    if (this.read(context.request, record)) return this.inspect(context.request, record)
    // A lost private binding must fence even read-side reselection. Keep the
    // locked recheck below too, so another owner cannot race round consumption.
    if (existsSync(this.store.files.path(`${this.path(record.invocation)}.consumed`)))
      throw new DeliveryRunnerError('verification-stage-original-unresolved')
    let contracts: ContractGateInput | undefined
    if (!pinned.stage.criteria.length) {
      if (!this.options.contracts)
        throw new DeliveryRunnerError('verification-stage-contract-selection-required')
      contracts = {
        run: pinned.prepared.plan.run,
        revision: pinned.prepared.plan.revision,
        unit: pinned.stage.unit as string,
        refs: structuredClone(
          this.options.contracts(context.request, pinned.candidate.allocation.repository.path),
        ),
      }
      // Refuse missing or different committed bytes before consuming a round.
      contractGateUnits(
        this.store.files.root,
        pinned.candidate.allocation.repository.path,
        contracts,
      )
    }
    const slot = `delivery/runner-verification-subjects/${contractDigest({ request: pinned.digest, plan: record.basis, unit: pinned.stage.unit })}.json`,
      marker = `${this.path(record.invocation)}.consumed`,
      engine = pinned.engine
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(marker)))
        throw new DeliveryRunnerError('verification-stage-original-unresolved')
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
            throw new DeliveryRunnerError('verification-stage-subject-unresolved')
          return value.subject
        }
        const subject = itemId('review')
        engine.store.files.atomic(slot, `${JSON.stringify({ subject })}\n`)
        append(subject, {
          type: 'item.created',
          data: {
            kind: 'review',
            title: `Verify owned unit ${pinned.stage.unit}`,
            owner: context.plan.owner,
            body: 'Machine verification of the owned delivery candidate; no human approval or endpoint is implied.',
            repository: pinned.candidate.allocation.repository.path,
          },
        })
        return subject
      }),
      declared = context.plan.repositories.find(
        (item) => item.id === pinned.candidate.allocation.repository.repository,
      )
    if (!declared) throw new DeliveryRunnerError('verification-stage-repository')
    const gates = new GateWorkflow(engine),
      selected = gates.plan(subject, 'verify', {
        repo: pinned.candidate.allocation.repository.path,
        base: declared.target,
        ...(contracts ? { contracts } : { criteria: this.criteria(pinned) }),
      }),
      binding: VerificationStageBinding = {
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
        selection: structuredClone(
          this.options.suite(context.request, pinned.candidate.allocation.repository.path),
        ),
      }
    safeSourceText(JSON.stringify(binding), 65536)
    this.store.files.atomic(this.path(record.invocation), `${JSON.stringify(binding)}\n`)
    return this.runRound(context, engine, selected.plan, binding)
  }
  private async runRound(
    context: RunnerStageContext,
    engine: FlowEngine,
    plan: GatePlan,
    binding: VerificationStageBinding,
    phase?: string,
  ) {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('verification-stage-not-dispatched')
    const suite = await new RunnerSuiteStages(this.store, {
      ...this.options,
      ...(phase ? { phase } : {}),
    }).execute(context, plan, binding.selection, this.options.driver ?? new DockerCli())
    if (suite.status === 'failed') new GateWorkflow(engine).verdict(binding.subject, 'verify')
    if (suite.status !== 'passed')
      return this.inspect(
        context.request,
        this.store.stage(contractDigest(context.request), record.id) ?? record,
      )
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
          throw new DeliveryRunnerError('verification-stage-fenced')
        new RunnerGitStages(this.store).candidate(
          context.request,
          binding.unit,
          this.options.correction,
        )
      })
    })
    if (context.signal.aborted || !context.current())
      throw new DeliveryRunnerError('verification-stage-fenced')
    new GateWorkflow(engine).verdict(binding.subject, 'verify')
    return this.inspect(
      context.request,
      this.store.stage(contractDigest(context.request), record.id) ?? record,
    )
  }
  private phaseSelection(
    request: Readonly<RunnerRequest>,
    state: NonNullable<ReturnType<RunnerVerificationStages['read']>>,
    selected: RunnerSuiteSelection,
  ) {
    safeSourceText(JSON.stringify(selected), 65536)
    const environment = new EnvironmentResources(this.store.files).get(selected.environment).record,
      shape = (selection: RunnerSuiteSelection) => ({
        acceptance: selection.acceptance,
        refs: selection.refs,
        timeoutMs: selection.timeoutMs,
        mapping: selection.mapping,
      })
    if (
      Object.keys(selected).sort().join(',') !== 'acceptance,environment,mapping,refs,timeoutMs' ||
      selected.environment === state.binding.selection.environment ||
      contractDigest(shape(selected)) !== contractDigest(shape(state.binding.selection)) ||
      environment.run !== request.run ||
      environment.basis !== state.binding.plan ||
      environment.grant !== request.grant ||
      environment.grantDigest !== this.store.lifecycle.authority.inspect(request.grant).digest ||
      environment.provenance !== 'host-observed' ||
      !environment.candidates.some(
        (candidate) =>
          candidate.path === state.binding.workspace &&
          candidate.head === state.candidate.receipt.head &&
          candidate.snapshot === workspaceSnapshot(state.binding.workspace).digest,
      )
    )
      throw new DeliveryRunnerError('verification-continuation-selection-binding')
    return environment
  }
  private continuationPath(invocation: string) {
    this.path(invocation)
    return `delivery/runner-verification-continuations/${invocation}.json`
  }
  private continuation(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    proposed?: VerificationContinuation,
  ) {
    const path = this.continuationPath(record.invocation)
    if (!proposed && !existsSync(this.store.files.path(path))) return undefined
    const intent =
        proposed ??
        (JSON.parse(
          readSourceFile(this.store.files.root, path, 131072),
        ) as VerificationContinuation),
      state = this.read(request, record, true, intent.from),
      checkpoint = this.options.correction
    if (!state || !(checkpoint instanceof RunnerRepairCommits))
      throw new DeliveryRunnerError('verification-continuation-checkpoint-required')
    const producer = checkpoint.workers.production(request, record.invocation),
      origin = producer.binding.admission.feedback.origin,
      latest = gateRuns(state.engine.store.events())
        .filter((run) => run.subject === state.binding.subject && run.gate === 'verify')
        .at(-1)
    if (
      Object.keys(intent).sort().join(',') !==
        'correction,deadline,from,invocation,plan,request,selection,stage,version' ||
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
      throw new DeliveryRunnerError('verification-continuation-original-binding')
    this.phaseSelection(request, state, intent.selection)
    const next = state.run.rounds.find((round) => round.plan.round === state.binding.round + 1)
    if (
      next &&
      (state.run.rounds.at(-1) !== next ||
        next.plan.gate !== 'verify' ||
        next.plan.subject !== state.binding.subject ||
        next.plan.run !== state.binding.run ||
        next.plan.budget !== state.run.budget ||
        next.plan.snapshot.head !== state.candidate.receipt.head ||
        next.plan.snapshot.branch !== state.candidate.allocation.repository.branch ||
        !this.unitsCurrent(state, next.plan))
    )
      throw new DeliveryRunnerError('verification-continuation-next-binding')
    return { intent, state, next }
  }
  async advance(context: RunnerStageContext): Promise<RunnerStageObservation> {
    const record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('verification-continuation-not-dispatched')
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
        throw new DeliveryRunnerError('verification-continuation-not-current')
      const intent: VerificationContinuation = {
        version: 1,
        request: state.digest,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        deadline: context.deadline,
        correction: state.candidate.receipt.digest,
        from: state.binding,
        selection: structuredClone(this.options.suite(context.request, state.binding.workspace)),
      }
      safeSourceText(JSON.stringify(intent), 131072)
      if (this.phaseSelection(context.request, state, intent.selection).state !== 'ready')
        throw new DeliveryRunnerError('verification-continuation-environment-not-ready')
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
          throw new DeliveryRunnerError('verification-continuation-fenced')
        const declared = context.plan.repositories.find(
          (repo) => repo.id === state.candidate.allocation.repository.repository,
        )
        if (!declared) throw new DeliveryRunnerError('verification-continuation-repository')
        const contracts = contractGateInput(state.round.plan.units)
        const selected = new GateWorkflow(state.engine).plan(state.binding.subject, 'verify', {
          repo: state.binding.workspace,
          base: declared.target,
          ...(contracts ? { contracts } : { criteria: this.criteria(state) }),
        })
        if (
          selected.resumed ||
          selected.plan.run !== state.binding.run ||
          selected.plan.round !== state.binding.round + 1
        )
          throw new DeliveryRunnerError('verification-continuation-original-plan-unresolved')
      }
      retained = this.continuation(context.request, record)
    }
    if (!retained?.next)
      throw new DeliveryRunnerError('verification-continuation-original-plan-unresolved')
    const { intent, state, next } = retained,
      binding: VerificationStageBinding = {
        ...intent.from,
        deadline: intent.deadline,
        round: next.plan.round,
        gate: contractDigest(next.plan),
        selection: intent.selection,
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
      throw new DeliveryRunnerError('verification-continuation-fenced')
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
      contractDigest(next.plan),
    )
  }

  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    let state = this.read(request, record)
    const retained = this.continuation(request, record),
      phase = retained?.next ? contractDigest(retained.next.plan) : undefined
    if (retained && state?.binding.gate !== phase)
      throw new DeliveryRunnerError('verification-continuation-active-binding')
    const calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = calls.every((call) =>
        ['stopped', 'not-started'].includes(call.observed.invocationState),
      ),
      proofs: string[] = [],
      suite = state
        ? await new RunnerSuiteStages(this.store, {
            ...this.options,
            ...(phase ? { phase } : {}),
          }).inspect(request, record, {
            gate: state.round.plan,
            selection: state.binding.selection,
          })
        : undefined,
      ownedClosed = closed && suite?.invocationState === 'stopped'
    // Suite recovery may have restored its original journal submission. Read
    // that committed round before auditing it; stale projections are not facts.
    if (state) state = this.read(request, record)
    let passed = false,
      failed = false,
      audited = false,
      problem: string | undefined,
      report = state?.round.decision
    if (state && ownedClosed && suite?.provenance === 'host-observed') {
      failed =
        suite.status === 'failed' ||
        (!!state.round.decision && state.round.decision.report.verdict !== 'PASS')
      const readContext: RunnerStageContext = {
          request,
          plan: state.prepared.plan,
          stage: state.stage,
          invocation: record.invocation,
          deadline: state.binding.deadline,
          signal: new AbortController().signal,
          current: () => false,
          started: () => {
            throw new DeliveryRunnerError('verification-inspection-cannot-start')
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
        )
      try {
        if (suite.status === 'failed' && suite.result) {
          const actual = state.round.results.find((result) => result.unit === 'suite')
          if (contractDigest(actual ?? null) !== contractDigest(suiteGateResult(suite.result)))
            throw new DeliveryRunnerError('verification-stage-suite-binding')
          // A known actual failure needs no positive model judgment. Seal only
          // its original negative verdict, never replay the command to recover metadata.
          const verdict = new GateWorkflow(state.engine).verdict(state.binding.subject, 'verify')
          if (
            verdict.run !== state.binding.run ||
            verdict.round !== state.binding.round ||
            !verdict.current ||
            verdict.verdict === 'PASS'
          )
            throw new DeliveryRunnerError('verification-stage-negative-verdict-binding')
          proofs.push(suite.evidence)
          audited = true
          failed = true
          report = { observed: state.round.plan.snapshot.digest, report: verdict.report }
        } else {
          if (suite.status !== 'passed' || !suite.result)
            throw new DeliveryRunnerError('verification-stage-suite-not-passed')
          const actualSuite = state.round.results.find((r) => r.unit === 'suite')
          if (contractDigest(actualSuite ?? null) !== contractDigest(suiteGateResult(suite.result)))
            throw new DeliveryRunnerError('verification-stage-suite-binding')
          proofs.push(suite.evidence)
          for (const unit of state.round.plan.units) {
            if (unit.id === 'suite') continue
            const result = state.round.results.find((item) => item.unit === unit.id)
            if (!result) throw new DeliveryRunnerError('verification-stage-missing-result')
            const proof = reader.observe(state.round.plan, 'verifier', unit)
            if (contractDigest(proof.value) !== contractDigest(result))
              throw new DeliveryRunnerError('verification-stage-result-binding')
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
              throw new DeliveryRunnerError('verification-stage-vote-scope')
            const observed = reader.observe(state.round.plan, 'refuter', {
              finding: vote.finding,
              verifier: vote.verifier,
              source,
            })
            if (contractDigest(observed.value) !== contractDigest(vote))
              throw new DeliveryRunnerError('verification-stage-vote-binding')
            proofs.push(observed.evidence)
          }
          // A lost final metadata write may seal only already-observed exact work;
          // inspection never invokes a model, suite, repair or new gate round.
          const verdict = new GateWorkflow(state.engine).verdict(state.binding.subject, 'verify')
          if (verdict.run !== state.binding.run || verdict.round !== state.binding.round)
            throw new DeliveryRunnerError('verification-stage-verdict-binding')
          audited = true
          report = { observed: state.round.plan.snapshot.digest, report: verdict.report }
          passed = verdict.current && verdict.verdict === 'PASS' && !!calls.length
          failed = verdict.verdict !== 'PASS'
        }
      } catch (error) {
        // Raw worker errors may contain credentials; retain only fixed controller categories.
        problem =
          error instanceof DeliveryRunnerError
            ? error.problem
            : 'verification-stage-audit-unavailable'
      }
    }
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status:
        !state || !ownedClosed ? 'unknown' : passed ? 'passed' : failed ? 'blocked' : 'unknown',
      invocationState: ownedClosed ? 'stopped' : 'unknown',
      evidence: contractDigest({
        binding: state?.binding ?? null,
        report: report ?? null,
        calls,
        suite: suite ?? null,
        proofs,
      }),
      provenance:
        audited || (failed && suite?.provenance === 'host-observed') ? 'host-observed' : 'fixture',
      reason: passed
        ? 'The exact current owned candidate passed its original suite and observed requirement verification round; independent review and feature acceptance remain separate.'
        : problem
          ? `Original verification audit remains unresolved: ${problem}.`
          : 'Retain original verification rounds, suite/native receipts and budgets; no replay, approval or endpoint is inferred.',
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
      !record.id.startsWith('verification:') ||
      !this.store
        .record(digest)
        .stages.some(
          (item) =>
            item.id === record.id &&
            item.invocation === record.invocation &&
            item.basis === record.basis,
        )
    )
      throw new DeliveryRunnerError('verification-stage-binding')
    if (!signal.aborted) {
      try {
        if (
          existsSync(
            this.store.files.path(`delivery/runner-environments/${record.invocation}.json`),
          )
        )
          new RunnerEnvironmentScope(this.store, record.invocation).cancelAll()
      } finally {
        new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
      }
    }
  }
}
