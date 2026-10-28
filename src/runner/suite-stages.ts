import { existsSync } from 'node:fs'
import { AcceptanceError } from '../acceptance/contracts.js'
import { dockerSuiteExecutor } from '../acceptance/docker-suite.js'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { observedDockerSuiteCommand } from '../acceptance/suite-observation.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import { EnvironmentOperations } from '../environment/operations.js'
import { EnvironmentResources } from '../environment/runtime.js'
import type { FlowEngine } from '../flow/engine.js'
import { type GatePlan, validateGatePlan } from '../gates/contracts.js'
import { gateRuns } from '../gates/state.js'
import { GateWorkflow } from '../gates/workflow.js'
import type { SuitePlan, SuiteResult } from '../verification/contracts.js'
import { runSuite, suiteGateResult, suitePlan } from '../verification/suite.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerEnvironmentScope } from './environment-scope.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface RunnerSuiteSelection {
  acceptance: string
  environment: string
  refs: string[]
  timeoutMs: number
  mapping: Record<string, string>
}
interface SuiteStageBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  deadline: string
  gate: GatePlan
  selection: RunnerSuiteSelection
  suite: SuitePlan
}
export interface RunnerSuiteResult {
  status: 'passed' | 'failed' | 'blocked' | 'unknown'
  invocationState: 'stopped' | 'not-started' | 'unknown'
  provenance: 'fixture' | 'host-observed'
  evidence: string
  result?: SuiteResult
  acceptance: 'not-established'
  problem?: string
}
export interface RunnerSuiteOptions {
  identity: RunnerRequest['host']
  engine(request: Readonly<RunnerRequest>, workspace: string): FlowEngine
}

/** Actual command/case observations supply a suite; a model cannot provide this executor. */
export class RunnerSuiteStages {
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerSuiteOptions,
  ) {}
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation)) throw new DeliveryRunnerError('suite-stage-invocation')
    return `delivery/runner-suites/${invocation}.json`
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      revision = this.store.lifecycle.journal
        .get(actual.run)
        .plans.find((p) => p.digest === record.basis)?.revision,
      prepared = this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(prepared.plan).find((s) => s.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find((s) => s.id === record.id && s.invocation === record.invocation)
    if (
      contractDigest(request.host) !== contractDigest(this.options.identity) ||
      !retained ||
      retained.basis !== record.basis ||
      prepared.digest !== record.basis ||
      stage?.kind !== 'verification' ||
      !stage.unit
    )
      throw new DeliveryRunnerError('suite-stage-binding')
    const candidate = new RunnerGitStages(this.store).candidate(request, stage.unit),
      engine = this.options.engine(request, candidate.allocation.repository.path)
    if (engine.store.files.root !== this.store.files.root)
      throw new DeliveryRunnerError('suite-stage-store')
    return { prepared, stage, candidate, engine }
  }
  private validate(
    binding: SuiteStageBinding,
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ) {
    const context = this.context(request, record)
    if (
      Object.keys(binding).sort().join(',') !==
        'deadline,gate,invocation,plan,request,selection,stage,suite,version' ||
      binding.version !== 1 ||
      binding.request !== contractDigest(request) ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline
    )
      throw new DeliveryRunnerError('suite-stage-resource-binding')
    validateGatePlan(binding.gate)
    const round = gateRuns(context.engine.store.events())
      .find((r) => r.run === binding.gate.run)
      ?.rounds.at(-1)
    if (
      !round ||
      binding.gate.gate !== 'verify' ||
      binding.gate.repository !== context.candidate.allocation.repository.path ||
      binding.gate.snapshot.head !== context.candidate.receipt.head ||
      contractDigest(round.plan) !== contractDigest(binding.gate) ||
      !binding.gate.units.some((u) => u.id === 'suite' && u.lens === 'suite')
    )
      throw new DeliveryRunnerError('suite-stage-gate-binding')
    const actual = suitePlan(
        context.engine,
        binding.gate,
        binding.selection.refs,
        binding.selection.timeoutMs,
      ),
      acceptance = new DeliveryAcceptance(this.store.files.root),
      pinned = acceptance.get(binding.selection.acceptance),
      environment = new EnvironmentResources(this.store.files).get(
        binding.selection.environment,
      ).record
    if (
      contractDigest(actual) !== contractDigest(binding.suite) ||
      Object.keys(binding.selection).sort().join(',') !==
        'acceptance,environment,mapping,refs,timeoutMs' ||
      contractDigest(Object.keys(binding.selection.mapping).sort()) !==
        contractDigest([...binding.selection.refs].sort()) ||
      pinned.plan.run !== request.run ||
      pinned.plan.plan !== record.basis ||
      environment.run !== request.run ||
      environment.basis !== record.basis ||
      environment.grant !== request.grant ||
      !environment.candidates.some(
        (c) =>
          c.path === binding.gate.repository &&
          c.head === binding.gate.snapshot.head &&
          c.snapshot === binding.gate.snapshot.digest,
      )
    )
      throw new DeliveryRunnerError('suite-stage-input-binding')
    return { ...context, round, acceptance, pinned, environment }
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const path = this.path(record.invocation)
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, path, 512 * 1024),
    ) as SuiteStageBinding
    return { binding, ...this.validate(binding, request, record) }
  }
  async execute(
    context: RunnerStageContext,
    gate: GatePlan,
    selection: RunnerSuiteSelection,
    driver: DockerTransport = new DockerCli(),
  ): Promise<RunnerSuiteResult> {
    const request = contractDigest(context.request),
      record = this.store.stage(request, context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('suite-stage-not-dispatched')
    const pinned = this.context(context.request, record)
    if (
      contractDigest(context.plan) !== record.basis ||
      contractDigest(context.stage) !== contractDigest(pinned.stage) ||
      context.signal.aborted ||
      !context.current() ||
      Date.parse(context.deadline) <= Date.now() ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('suite-stage-not-current')
    validateGatePlan(gate)
    if (gate.gate !== 'verify' || gate.repository !== pinned.candidate.allocation.repository.path)
      throw new DeliveryRunnerError('suite-stage-gate-binding')
    const binding: SuiteStageBinding = {
      version: 1,
      request,
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      deadline: context.deadline,
      gate: structuredClone(gate),
      selection: structuredClone(selection),
      suite: suitePlan(pinned.engine, gate, selection.refs, selection.timeoutMs),
    }
    this.validate(binding, context.request, record)
    safeSourceText(JSON.stringify(binding), 512 * 1024)
    const prior = this.read(context.request, record)
    if (prior) {
      if (contractDigest(prior.binding) !== contractDigest(binding))
        throw new DeliveryRunnerError('suite-stage-input-conflict')
      return this.inspect(context.request, record)
    }
    const events = pinned.engine.store.events()
    if (
      events.some(
        (e) =>
          e.subject === gate.subject &&
          e.type === 'verify.suite-planned' &&
          e.data.run === gate.run &&
          e.data.round === gate.round,
      )
    )
      throw new DeliveryRunnerError('suite-stage-unowned-prior-intent')
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(`${this.path(record.invocation)}.consumed`)))
        throw new DeliveryRunnerError('suite-stage-original-unresolved')
      this.store.files.atomic(`${this.path(record.invocation)}.consumed`, `${record.invocation}\n`)
      this.store.files.atomic(this.path(record.invocation), `${JSON.stringify(binding)}\n`)
    })
    const scope = new RunnerEnvironmentScope(this.store, record.invocation),
      acceptance = new DeliveryAcceptance(this.store.files.root)
    let problem: string | undefined
    try {
      await scope.run(context, selection.environment, driver, async (owned) => {
        const executor = dockerSuiteExecutor(
          acceptance,
          selection.acceptance,
          selection.environment,
          { run: gate.run, round: gate.round },
          selection.mapping,
          owned,
        )
        await runSuite(pinned.engine, gate.subject, gate.run, gate.round, {
          refs: selection.refs,
          timeoutMs: selection.timeoutMs,
          executor: async (root, command, timeoutMs) => {
            const result = await executor(root, command, timeoutMs),
              observed = observedDockerSuiteCommand(
                acceptance,
                selection.acceptance,
                { run: gate.run, round: gate.round },
                command.ref,
                selection.mapping[command.ref] ?? '',
              )
            if (
              observed.result.provenance !== 'host-observed' ||
              scope.inspect().invocationState !== 'stopped'
            )
              throw new DeliveryRunnerError('suite-stage-observation-unavailable')
            return result
          },
        })
      })
    } catch (error) {
      // Only fixed controller categories may escape; arbitrary process text can
      // contain credentials. Original owners remain available for inspection.
      problem =
        error instanceof AcceptanceError || error instanceof DeliveryRunnerError
          ? error.problem
          : 'suite-stage-execution-unavailable'
    }
    const observed = await this.inspect(
      context.request,
      this.store.stage(request, record.id) ?? record,
    )
    return observed.status === 'unknown' && problem ? { ...observed, problem } : observed
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    expected?: { gate: GatePlan; selection: RunnerSuiteSelection },
  ): Promise<RunnerSuiteResult> {
    const state = this.read(request, record),
      scope = new RunnerEnvironmentScope(this.store, record.invocation).inspect()
    if (
      state &&
      expected &&
      (contractDigest(state.binding.gate) !== contractDigest(expected.gate) ||
        contractDigest(state.binding.selection) !== contractDigest(expected.selection))
    )
      throw new DeliveryRunnerError('suite-stage-parent-binding')
    let result: SuiteResult | undefined,
      status: RunnerSuiteResult['status'] = 'unknown',
      provenance: RunnerSuiteResult['provenance'] = 'fixture'
    const proofs: string[] = []
    if (state && scope.invocationState === 'stopped' && scope.provenance === 'host-observed') {
      const { binding, engine, acceptance } = state,
        commands: SuiteResult['commands'] = []
      try {
        for (const command of binding.suite.commands) {
          const observed = observedDockerSuiteCommand(
            acceptance,
            binding.selection.acceptance,
            { run: binding.gate.run, round: binding.gate.round },
            command.ref,
            binding.selection.mapping[command.ref] ?? '',
          )
          const commandOwner =
            typeof observed.execution?.container === 'string' && observed.result.process
              ? new EnvironmentOperations(
                  this.store.files,
                  binding.selection.environment,
                  'host-observed',
                ).completion(
                  ['container', 'start', '--attach', '--interactive', observed.execution.container],
                  observed.result.process.pid,
                )
              : undefined
          if (
            !commandOwner ||
            commandOwner.operation !== observed.execution?.controllerOperation ||
            commandOwner.code !== observed.applicationExit ||
            !scope.operations.some(
              (o) => o?.operation.id === commandOwner.operation && o.status === 'stopped',
            ) ||
            observed.result.provenance !== 'host-observed' ||
            observed.result.bindings.environment !== binding.selection.environment ||
            observed.result.bindings.recipe !== state.environment.recipe ||
            !observed.result.process ||
            Date.parse(observed.result.process.endedAt) > Date.parse(binding.deadline) ||
            !observed.result.bindings.candidates.some(
              (c) =>
                c.repository === state.candidate.allocation.repository.repository &&
                c.head === binding.gate.snapshot.head &&
                c.snapshot === binding.gate.snapshot.digest,
            )
          )
            throw new DeliveryRunnerError('suite-stage-original-case-binding')
          commands.push(observed.receipt)
          proofs.push(contractDigest(observed.result))
          if (observed.receipt.exitCode !== 0 || observed.receipt.signal) break
        }
        if (
          !commands.length ||
          (commands.every((c) => c.exitCode === 0 && !c.signal) &&
            commands.length !== binding.suite.commands.length)
        )
          throw new DeliveryRunnerError('suite-stage-incomplete-observations')
        result = {
          commands,
          unchanged: true,
          status: commands.every((c) => c.exitCode === 0 && !c.signal) ? 'passed' : 'failed',
        }
        // Restore only the original observed result, never execute another case.
        engine.store.transaction((events, append) => {
          const finished = events.find(
            (e) =>
              e.subject === binding.gate.subject &&
              e.type === 'verify.suite-finished' &&
              e.data.run === binding.gate.run &&
              e.data.round === binding.gate.round,
          )
          if (finished?.type === 'verify.suite-finished') {
            if (contractDigest(finished.data.result) !== contractDigest(result))
              throw new DeliveryRunnerError('suite-stage-finished-binding')
          } else {
            const intent = events.find(
              (e) =>
                e.subject === binding.gate.subject &&
                e.type === 'verify.suite-planned' &&
                e.data.run === binding.gate.run &&
                e.data.round === binding.gate.round,
            )
            if (
              intent?.type !== 'verify.suite-planned' ||
              contractDigest(intent.data.plan) !== contractDigest(binding.suite)
            )
              throw new DeliveryRunnerError('suite-stage-original-intent')
            append(binding.gate.subject, {
              type: 'verify.suite-finished',
              data: {
                run: binding.gate.run,
                round: binding.gate.round,
                result: result as SuiteResult,
              },
            })
          }
        })
        const expected = suiteGateResult(result),
          actual = state.round.results.find((r) => r.unit === 'suite')
        if (actual && contractDigest(actual) !== contractDigest(expected))
          throw new DeliveryRunnerError('suite-stage-gate-result-binding')
        if (!actual)
          new GateWorkflow(engine).submit(
            binding.gate.subject,
            binding.gate.run,
            binding.gate.round,
            expected,
          )
        provenance = 'host-observed'
        status = result.status === 'passed' ? 'passed' : 'failed'
      } catch {
        /* Missing, fixture or conflicting records stay unavailable. */
      }
    }
    return {
      status,
      invocationState: scope.invocationState,
      provenance,
      evidence: contractDigest({
        binding: state?.binding ?? null,
        scope,
        proofs,
        result: result ?? null,
      }),
      ...(result ? { result } : {}),
      acceptance: 'not-established',
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
          (s) =>
            s.id === record.id && s.invocation === record.invocation && s.basis === record.basis,
        )
    )
      throw new DeliveryRunnerError('suite-stage-binding')
    if (!signal.aborted) new RunnerEnvironmentScope(this.store, record.invocation).cancelAll()
  }
}
