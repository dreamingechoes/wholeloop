import { existsSync } from 'node:fs'
import { ACCEPTANCE_SCHEMAS, type AcceptancePlan } from '../acceptance/contracts.js'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { BUILDER_PLAN_SCHEMA, validateBuilderPlan } from '../build/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type {
  NativeProcessRunner,
  NativeRunOptions,
  NativeRunReceipt,
} from '../delivery/native-host.js'
import {
  checkPlanEnvelope,
  DELIVERY_PLAN_SCHEMA,
  type DeliveryPlan,
  observePlanBases,
  validateDeliveryPlan,
  validateDeliveryShape,
} from '../delivery/plan.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import nativeRunSchema from '../delivery/schemas/native-run-v1.json' with { type: 'json' }
import { workspaceSnapshot } from '../gates/snapshot.js'
import {
  RunnerArtifactAttempts,
  type RunnerArtifactInput,
  type RunnerArtifactLease,
} from './artifact-attempts.js'
import type { RunnerStageContext } from './engine.js'
import type { RunnerStageRecord } from './events.js'
import { RunnerGitStages } from './git-stages.js'
import { RunnerNativeScope } from './native-scope.js'
import { RunnerNativeStage } from './native-stage.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

interface ArtifactStageBinding {
  version: 1
  lease: RunnerArtifactLease
  directory?: string
  workspace?: { path: string; head: string; snapshot: string }
}
export interface RunnerArtifactResult {
  status: 'ready' | 'blocked' | 'unknown'
  invocationState: 'stopped' | 'not-started' | 'unknown'
  provenance: 'fixture' | 'host-observed'
  evidence: string
  artifact?: { ref: string; sha256: string }
  prepared?: {
    kind: 'acceptance' | 'delivery-plan' | 'build-plan'
    digest: string
    revision?: number
    disposition: 'pinned' | 'proposal'
  }
  approvals: 'not-recorded'
  acceptance: 'not-established'
}
export interface RunnerArtifactOptions {
  identity: RunnerRequest['host']
  native(process: NativeProcessRunner): NativeRunOptions
  context(context: RunnerStageContext): RunnerArtifactInput
}

/** Artifact production precedes its independent decisions; it never completes a root stage alone. */
export class RunnerArtifactStages {
  constructor(
    readonly store: RunnerStore,
    readonly options: RunnerArtifactOptions,
  ) {}
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('artifact-stage-invocation')
    return `delivery/runner-artifacts/${invocation}.json`
  }
  private context(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    deadline: string,
  ) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      revision = this.store.lifecycle.journal
        .get(actual.run)
        .plans.find((p) => p.digest === record.basis)?.revision,
      pinned = this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(pinned.plan).find((s) => s.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find((s) => s.id === record.id && s.invocation === record.invocation)
    if (
      contractDigest(request.host) !== contractDigest(this.options.identity) ||
      !retained ||
      retained.basis !== record.basis ||
      pinned.digest !== record.basis ||
      !stage ||
      !['definition', 'plan', 'acceptance-definition', 'build-plan'].includes(stage.kind)
    )
      throw new DeliveryRunnerError('artifact-stage-binding')
    const context: RunnerStageContext = {
      request,
      plan: pinned.plan,
      stage,
      invocation: record.invocation,
      deadline,
      signal: new AbortController().signal,
      current: () => false,
      started: () => {
        throw new DeliveryRunnerError('artifact-inspection-cannot-start')
      },
    }
    return { context, pinned }
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const path = this.path(record.invocation)
    if (!existsSync(this.store.files.path(path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, path, 2 * 1024 * 1024),
    ) as ArtifactStageBinding
    if (
      Object.keys(binding).some(
        (key) => !['version', 'lease', 'directory', 'workspace'].includes(key),
      ) ||
      binding.version !== 1 ||
      !binding.lease?.root ||
      binding.lease.root.request !== contractDigest(request) ||
      binding.lease.root.plan !== record.basis ||
      binding.lease.root.stage !== record.id ||
      binding.lease.root.invocation !== record.invocation
    )
      throw new DeliveryRunnerError('artifact-stage-resource-binding')
    const selected = this.context(request, record, binding.lease.root.deadline)
    if (
      binding.directory &&
      !new RegExp(
        `^delivery/native/${request.run}/${binding.lease.assignment.identity.attempt}/[a-f0-9-]{36}$`,
      ).test(binding.directory)
    )
      throw new DeliveryRunnerError('artifact-stage-directory')
    if (binding.workspace) {
      const workspace = new RunnerGitStages(this.store).workspace(
          request,
          selected.context.stage.unit ?? '',
        ).repository.path,
        snapshot = workspaceSnapshot(workspace)
      if (
        binding.workspace.path !== workspace ||
        binding.workspace.head !== snapshot.head ||
        binding.workspace.snapshot !== snapshot.digest
      )
        throw new DeliveryRunnerError('artifact-stage-candidate-changed')
    } else if (selected.context.stage.kind === 'build-plan')
      throw new DeliveryRunnerError('artifact-stage-workspace-missing')
    return { binding, ...selected }
  }
  private response(kind: string) {
    if (kind === 'acceptance-definition') return ACCEPTANCE_SCHEMAS.plan
    if (kind === 'build-plan') return BUILDER_PLAN_SCHEMA
    if (kind === 'definition' || kind === 'plan') return DELIVERY_PLAN_SCHEMA
    throw new DeliveryRunnerError('artifact-stage-purpose')
  }
  async execute(context: RunnerStageContext): Promise<RunnerArtifactResult> {
    const request = contractDigest(context.request),
      record = this.store.stage(request, context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('artifact-stage-not-dispatched')
    const selected = this.context(context.request, record, context.deadline)
    if (
      contractDigest(context.stage) !== contractDigest(selected.context.stage) ||
      contractDigest(context.plan) !== record.basis ||
      context.signal.aborted ||
      !context.current() ||
      Date.parse(context.deadline) <= Date.now() ||
      !['prepared', 'running'].includes(record.status)
    )
      throw new DeliveryRunnerError('artifact-stage-not-current')
    if (this.read(context.request, record)) return this.inspect(context.request, record)
    let candidate: ArtifactStageBinding['workspace']
    if (context.stage.kind === 'build-plan') {
      const workspace = new RunnerGitStages(this.store).workspace(
          context.request,
          context.stage.unit ?? '',
        ).repository.path,
        snapshot = workspaceSnapshot(workspace)
      candidate = { path: workspace, head: snapshot.head, snapshot: snapshot.digest }
    }
    const input = this.options.context(context),
      source = this.store.planning.sources.get(context.plan.source),
      brief = JSON.stringify({
        purpose: context.stage.kind,
        stage: context.stage,
        ...(candidate ? { candidate } : {}),
        source: source.body,
        plan: context.plan,
        response: this.response(context.stage.kind),
        instruction:
          'Produce exactly one report artifact at artifacts/production.json containing JSON that follows response. Preserve original scope, source, ownership, exclusions, guidance, policy and unknowns. Definition/plan proposals use the next revision and original digest as previous. Define complete acceptance cases before any builder; never waive human ownership or claim tests, execution, approval or delivery completion. Keep outer criteria/findings/unknowns empty; encode missing facts explicitly in the artifact.',
      })
    safeSourceText(brief, 1024 * 1024)
    // Capture before selecting files, so a changed workspace cannot label old
    // selected code with a newer candidate snapshot.
    if (candidate && workspaceSnapshot(candidate.path).digest !== candidate.snapshot)
      throw new DeliveryRunnerError('artifact-stage-candidate-changed')
    const attempts = new RunnerArtifactAttempts(this.store, context),
      marker = `${this.path(record.invocation)}.consumed`
    this.store.files.locked(() => {
      if (existsSync(this.store.files.path(marker)))
        throw new DeliveryRunnerError('artifact-stage-original-unresolved')
      this.store.files.atomic(marker, `${record.invocation}\n`)
    })
    const lease = attempts.claim({ ...input, brief }),
      binding: ArtifactStageBinding = {
        version: 1,
        lease,
        ...(candidate ? { workspace: candidate } : {}),
      }
    this.store.files.atomic(this.path(record.invocation), `${JSON.stringify(binding)}\n`)
    await new RunnerNativeStage(this.store, context).run(async (process) => {
      const options = this.options.native(process)
      await attempts.run(lease, {
        ...options,
        process,
        signal: context.signal,
        output: 'inline-proposal',
        prepared: (prepared) => {
          const original = this.read(context.request, record)
          if (
            !original ||
            contractDigest(original.binding) !== contractDigest(binding) ||
            prepared.assignment.assignment !== lease.assignment.assignment ||
            binding.directory
          )
            throw new DeliveryRunnerError('artifact-stage-native-binding')
          binding.directory = prepared.directory
          this.store.files.atomic(this.path(record.invocation), `${JSON.stringify(binding)}\n`)
          options.prepared?.(prepared)
        },
      })
    })
    return this.inspect(context.request, this.store.stage(request, record.id) ?? record)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerArtifactResult> {
    const selected = this.read(request, record),
      calls = new RunnerNativeScope(this.store.files, record.invocation).inspect(),
      closed = calls.every((call) =>
        ['stopped', 'not-started'].includes(call.observed.invocationState),
      )
    let status: RunnerArtifactResult['status'] = 'unknown',
      receipt: NativeRunReceipt | undefined,
      artifact: RunnerArtifactResult['artifact'],
      prepared: RunnerArtifactResult['prepared']
    if (selected?.binding.directory && closed) {
      const attempt = deliveryAttempts(this.store.lifecycle.journal.get(request.run)).records.find(
        (a) => a.id === selected.binding.lease.assignment.identity.attempt,
      )
      if (attempt?.evidence && /^[a-f0-9]{64}$/.test(attempt.evidence)) {
        receipt = JSON.parse(
          readSourceFile(
            this.store.files.root,
            `${selected.binding.directory}/receipt-${attempt.evidence}.json`,
            2 * 1024 * 1024,
          ),
        ) as NativeRunReceipt
        validateDeliveryShape(receipt, nativeRunSchema)
        if (
          contractDigest(receipt) !== attempt.evidence ||
          receipt.directory !== selected.binding.directory
        )
          throw new DeliveryRunnerError('artifact-stage-receipt-binding')
        const attempts = new RunnerArtifactAttempts(this.store, selected.context)
        if (receipt.status !== 'succeeded') status = 'blocked'
        else if (calls.length && attempts.completed(selected.binding.lease, receipt)) {
          const result = receipt.result,
            output = result?.artifacts[0],
            captured = receipt.artifacts?.[0]
          if (
            !result ||
            result.criteria.length ||
            result.findings.length ||
            result.unknowns.length ||
            result.artifacts.length !== 1 ||
            receipt.artifacts?.length !== 1 ||
            output?.kind !== 'report' ||
            output.ref !== 'artifacts/production.json' ||
            captured?.worker !== output.ref
          )
            status = 'blocked'
          else {
            const body = readSourceFile(this.store.files.root, captured.ref, 256 * 1024)
            try {
              const value: unknown = JSON.parse(body)
              validateDeliveryShape(value, this.response(selected.context.stage.kind))
              if (selected.context.stage.kind === 'acceptance-definition') {
                const input = value as AcceptancePlan
                if (
                  input.run !== request.run ||
                  input.plan !== record.basis ||
                  input.revision !== selected.pinned.plan.revision ||
                  input.source !== selected.pinned.plan.source
                )
                  throw new DeliveryRunnerError('artifact-stage-acceptance-basis')
                const accepted = new DeliveryAcceptance(this.store.files.root).prepare(input)
                prepared = { kind: 'acceptance', digest: accepted.digest, disposition: 'pinned' }
              } else if (selected.context.stage.kind === 'build-plan') {
                validateBuilderPlan(value)
                prepared = {
                  kind: 'build-plan',
                  digest: contractDigest(value),
                  disposition: 'proposal',
                }
              } else {
                const input = value as DeliveryPlan
                if (
                  input.run !== request.run ||
                  input.source !== selected.pinned.plan.source ||
                  input.owner !== selected.pinned.plan.owner ||
                  input.revision !== selected.pinned.plan.revision + 1 ||
                  input.previous !== record.basis
                )
                  throw new DeliveryRunnerError('artifact-stage-plan-basis')
                const grant = this.store.lifecycle.authority.inspect(request.grant).grant
                if (contractDigest(input.policy) !== contractDigest(selected.pinned.plan.policy))
                  throw new DeliveryRunnerError('artifact-stage-plan-policy')
                if (grant.basis.kind === 'envelope') {
                  if (input.envelope !== grant.basis.digest)
                    throw new DeliveryRunnerError('artifact-stage-plan-envelope')
                  checkPlanEnvelope(
                    input,
                    this.store.planning.getEnvelope(grant.basis.digest).envelope,
                  )
                } else if (
                  ['scope', 'repositories', 'guidance', 'budgets', 'capabilities', 'envelope'].some(
                    (key) =>
                      contractDigest(input[key as keyof DeliveryPlan] ?? null) !==
                      contractDigest(selected.pinned.plan[key as keyof DeliveryPlan] ?? null),
                  )
                )
                  throw new DeliveryRunnerError('artifact-stage-plan-scope')
                // Reserving the next immutable revision before its decisions
                // would prevent a rejected proposal from being revised at all.
                const plan = validateDeliveryPlan(
                  input,
                  this.store.planning.sources.get(input.source),
                )
                observePlanBases(plan.repositories)
                prepared = {
                  kind: 'delivery-plan',
                  digest: contractDigest(plan),
                  revision: plan.revision,
                  disposition: 'proposal',
                }
              }
              artifact = { ref: captured.ref, sha256: captured.digest }
              status = 'ready'
            } catch {
              status = 'blocked'
            }
          }
        }
      }
    }
    return {
      status,
      invocationState: !selected || !closed ? 'unknown' : calls.length ? 'stopped' : 'not-started',
      provenance: selected?.binding.lease.provenance ?? 'fixture',
      evidence: contractDigest({
        binding: selected?.binding ?? null,
        receipt: receipt ?? null,
        calls,
        artifact: artifact ?? null,
        prepared: prepared ?? null,
      }),
      ...(artifact ? { artifact } : {}),
      ...(prepared ? { prepared } : {}),
      approvals: 'not-recorded',
      acceptance: 'not-established',
    }
  }
  async stop(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
    signal: AbortSignal,
  ) {
    this.context(request, record, this.store.now())
    if (!signal.aborted)
      new RunnerNativeScope(this.store.files, record.invocation).requestCancellation()
  }
}
