import { existsSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import {
  DECISION_SCHEMAS,
  type DecisionRequest,
  type DelegatedDecisionHost,
} from '../decisions/store.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { NativeProcessRunner } from '../delivery/native-host.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import type { RunnerStageContext } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerNativeScope } from './native-scope.js'
import { RunnerNativeStage } from './native-stage.js'
import { DeliveryRunnerError, runnerDecisionRequirements, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

interface DecisionStageBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  requests: DecisionRequest[]
}
export interface RunnerDecisionResult {
  status: 'ready' | 'blocked' | 'unknown'
  decisions: string[]
  evidence: string
  provenance: 'fixture' | 'host-observed'
  invocationState: 'stopped' | 'not-started' | 'unknown'
  gates: 'unchanged'
  humanApproval: 'not-recorded'
}

/** Decision evidence is a component of a stage, never its behavioral or endpoint result. */
export class RunnerDecisionStages {
  constructor(
    readonly store: RunnerStore,
    readonly identity: RunnerRequest['host'],
  ) {}
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('decision-stage-invocation')
    return `delivery/runner-decisions/${invocation}.json`
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
        .stages.find((item) => item.id === record.id && item.invocation === record.invocation),
      grant = this.store.lifecycle.authority.inspect(actual.grant)
    if (
      contractDigest(this.identity) !== contractDigest(request.host) ||
      !stage ||
      !retained ||
      retained.basis !== record.basis ||
      prepared.digest !== record.basis
    )
      throw new DeliveryRunnerError('decision-stage-binding')
    return {
      digest,
      prepared,
      stage,
      required: runnerDecisionRequirements(prepared.plan, stage, grant.grant.basis.kind),
    }
  }
  private validate(
    binding: DecisionStageBinding,
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ) {
    const context = this.context(request, record)
    if (
      Object.keys(binding).sort().join(',') !== 'invocation,plan,request,requests,stage,version' ||
      binding.version !== 1 ||
      binding.request !== context.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !Array.isArray(binding.requests) ||
      binding.requests.length !== context.required.length ||
      new Set(binding.requests.map((item) => item.decision)).size !== context.required.length
    )
      throw new DeliveryRunnerError('decision-stage-request-binding')
    for (const selected of binding.requests) {
      validateDeliveryShape(selected, DECISION_SCHEMAS.request)
      if (
        selected.run !== request.run ||
        selected.grant !== request.grant ||
        selected.plan !== record.basis ||
        selected.revision !== context.prepared.plan.revision ||
        !context.required.some((item) => item.id === selected.decision)
      )
        throw new DeliveryRunnerError('decision-stage-request-scope')
    }
    return context
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const path = this.path(record.invocation)
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, path, 2 * 1024 * 1024),
    ) as DecisionStageBinding
    this.validate(binding, request, record)
    return binding
  }
  async execute(
    context: RunnerStageContext,
    requests: readonly DecisionRequest[],
    host: (process: NativeProcessRunner) => DelegatedDecisionHost,
  ) {
    const request = contractDigest(context.request),
      record = this.store.stage(request, context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('decision-stage-not-dispatched')
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
      throw new DeliveryRunnerError('decision-stage-not-current')
    const binding: DecisionStageBinding = {
      version: 1,
      request,
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      requests: structuredClone([...requests]).sort((a, b) => a.decision.localeCompare(b.decision)),
    }
    this.validate(binding, context.request, record)
    const body = `${JSON.stringify(binding)}\n`
    safeSourceText(body, 2 * 1024 * 1024)
    const prior = this.read(context.request, record)
    if (prior) {
      if (contractDigest(prior) !== contractDigest(binding))
        throw new DeliveryRunnerError('decision-stage-input-conflict')
      return this.inspect(context.request, record)
    }
    const consumed = `delivery/runner-decision-claims/${record.invocation}.txt`
    if (
      record.runtime ||
      new RunnerNativeScope(this.store.files, record.invocation).calls().length ||
      existsSync(this.store.files.path(consumed))
    )
      throw new DeliveryRunnerError('decision-stage-missing-binding')
    this.store.basis(context.request)
    this.store.decisions.pin(context.request.grant)
    this.store.files.locked(() => {
      if (this.read(context.request, record))
        throw new DeliveryRunnerError('decision-stage-already-issued')
      if (existsSync(this.store.files.path(consumed)))
        throw new DeliveryRunnerError('decision-stage-missing-binding')
      // This fences invocation only, never approval. Losing the descriptor must
      // not buy another decision key, even before the first native group starts.
      this.store.files.atomic(consumed, `${contractDigest(binding)}\n`)
      this.store.files.atomic(this.path(record.invocation), body)
    })
    if (!binding.requests.length) return this.inspect(context.request, record)
    const abort = new AbortController(),
      cancel = () => abort.abort(),
      timer = setTimeout(cancel, Math.max(1, Date.parse(context.deadline) - Date.now()))
    context.signal.addEventListener('abort', cancel, { once: true })
    if (context.signal.aborted) cancel()
    try {
      await new RunnerNativeStage(this.store, { ...context, signal: abort.signal }).run(
        async (process) => {
          const selected = host(process)
          for (const decision of binding.requests) {
            if (
              abort.signal.aborted ||
              !context.current() ||
              Date.now() >= Date.parse(context.deadline)
            )
              throw new DeliveryRunnerError('decision-stage-no-longer-current')
            await this.store.decisions.decide(decision, selected, abort.signal)
          }
        },
      )
    } finally {
      clearTimeout(timer)
      context.signal.removeEventListener('abort', cancel)
      abort.abort()
    }
    return this.inspect(context.request, this.store.stage(request, record.id) ?? record)
  }
  private receipt(request: DecisionRequest) {
    const path = `delivery/decision-keys/${request.run}/${request.key}.json`
    if (!existsSync(this.store.files.path(path))) return undefined
    const index = JSON.parse(readSourceFile(this.store.files.root, path, 65536)) as {
      request?: string
      digest?: string
    }
    if (index.request !== contractDigest(request))
      throw new DeliveryRunnerError('decision-stage-key-binding')
    let digest = index.digest
    if (!digest) {
      const head = `delivery/decision-heads/${request.run}/${request.plan}/${request.decision}.json`
      if (!existsSync(this.store.files.path(head))) return undefined
      digest = (
        JSON.parse(readSourceFile(this.store.files.root, head, 65536)) as { digest?: string }
      ).digest
    }
    if (!digest) return undefined
    const receipt = this.store.decisions.inspect(digest)
    // A newer decision head can locate only its own exact immutable request.
    if (contractDigest(receipt.record.request) !== contractDigest(request)) return undefined
    return receipt
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerDecisionResult> {
    const context = this.context(request, record),
      binding = this.read(request, record),
      receipts = binding?.requests.map((item) => this.receipt(item)) ?? [],
      calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = calls.every((call) =>
        ['stopped', 'not-started'].includes(call.observed.invocationState),
      ),
      complete =
        !!binding &&
        receipts.length === context.required.length &&
        receipts.every((item) => item !== undefined),
      ready =
        complete &&
        receipts.every(
          (item) =>
            item?.status === 'current' &&
            item.record.grantDigest ===
              this.store.lifecycle.authority.inspect(request.grant).digest &&
            context.required.some(
              (required) =>
                required.id === item.record.request.decision &&
                required.outcome === item.record.judgment.outcome,
            ),
        ),
      fixture = receipts.some(
        (item) =>
          item?.record.status === 'fixture-only' ||
          item?.record.judgment.identity.provenance === 'fixture' ||
          item?.record.challenge.identity.provenance === 'fixture',
      )
    return {
      status: !closed || !complete ? 'unknown' : ready ? 'ready' : 'blocked',
      decisions: receipts.flatMap((item) => (item ? [item.digest] : [])),
      evidence: contractDigest({
        binding: binding ?? null,
        receipts: receipts.map((item) =>
          item ? { digest: item.digest, status: item.status } : null,
        ),
        calls,
      }),
      provenance: fixture || !complete ? 'fixture' : 'host-observed',
      invocationState: !closed || !binding ? 'unknown' : calls.length ? 'stopped' : 'not-started',
      gates: 'unchanged',
      humanApproval: 'not-recorded',
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
