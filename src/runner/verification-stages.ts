import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import type { FlowEngine } from '../flow/engine.js'
import type { GatePlan } from '../gates/contracts.js'
import { inspectGateRound } from '../gates/execution.js'
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
export interface RunnerVerificationOptions {
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
    const candidate = new RunnerGitStages(this.store).candidate(request, stage.unit),
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
  private unitsCurrent(context: ReturnType<RunnerVerificationStages['context']>, plan: GatePlan) {
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
      current.observed.snapshot.digest === plan.snapshot.digest &&
      sameContractGateUnits(plan.units, current.units)
    )
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const context = this.context(request, record),
      path = this.path(record.invocation)
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, path, 65536),
    ) as VerificationStageBinding
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
      run.rounds.at(-1) !== round ||
      !this.unitsCurrent(context, round.plan)
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
    const suite = await new RunnerSuiteStages(this.store, this.options).execute(
      context,
      selected.plan,
      binding.selection,
      this.options.driver ?? new DockerCli(),
    )
    if (suite.status === 'failed') gates.verdict(subject, 'verify')
    if (suite.status !== 'passed')
      return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
    await new RunnerNativeStage(this.store, context).run(async (process) => {
      const options = this.options.gate(process, binding.workspace),
        host = new RunnerNativeGateHost(this.store, context, engine, selected.plan, {
          ...options,
          native: { ...options.native, process },
        })
      await inspectGateRound(engine, selected.plan, host, true, () => {
        if (!context.current() || context.signal.aborted)
          throw new DeliveryRunnerError('verification-stage-fenced')
        new RunnerGitStages(this.store).candidate(context.request, binding.unit)
      })
    })
    if (context.signal.aborted || !context.current())
      throw new DeliveryRunnerError('verification-stage-fenced')
    gates.verdict(subject, 'verify')
    return this.inspect(context.request, this.store.stage(pinned.digest, record.id) ?? record)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    let state = this.read(request, record)
    const calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = calls.every((call) =>
        ['stopped', 'not-started'].includes(call.observed.invocationState),
      ),
      proofs: string[] = [],
      suite = state
        ? await new RunnerSuiteStages(this.store, this.options).inspect(request, record, {
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
        )
      try {
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
        audited = true
        report = { observed: state.round.plan.snapshot.digest, report: verdict.report }
        passed = verdict.current && verdict.verdict === 'PASS' && !!calls.length
        failed = verdict.verdict !== 'PASS'
      } catch {
        /* Partial/fixture/stale native claims cannot become a positive legacy gate. */
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
