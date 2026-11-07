// Leases for artifact-producing attempts, which consume report authority but never delegated
// approval.
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { guidanceContextProblem } from '../delivery/guidance.js'
import { safeSourceText } from '../delivery/input.js'
import type { NativeRunReceipt } from '../delivery/native-host.js'
import {
  NativeReadOnlyAttempts,
  type NativeReadOnlyLease,
} from '../delivery/native-readonly-attempts.js'
import { DeliveryQueue } from '../delivery/queue.js'
import {
  validateWorkerAssignment,
  type WorkerAssignment,
  type WorkerContext,
} from '../delivery/worker-protocol.js'
import type { RunnerStageContext } from './engine.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerStore } from './store.js'

type ArtifactPurpose = 'definition' | 'plan' | 'acceptance-definition' | 'build-plan' | 'research'
export interface RunnerArtifactLease extends NativeReadOnlyLease {
  version: 1
  purpose: ArtifactPurpose
  root: { request: string; plan: string; stage: string; invocation: string; deadline: string }
  key: string
}
export interface RunnerArtifactInput {
  brief: string
  environment: WorkerAssignment['environment']
  contextRoot: string
  context: WorkerContext[]
  provenance: 'fixture' | 'host-observed'
}

/** Producing an artifact consumes report authority, never delegated approval. */
export class RunnerArtifactAttempts extends NativeReadOnlyAttempts<RunnerArtifactLease> {
  protected override readonly historicalObservations: boolean = true
  protected override readonly purposeDescription: string = 'artifact producer'
  constructor(
    readonly store: RunnerStore,
    readonly context: RunnerStageContext,
  ) {
    super(new DeliveryQueue(store.files.root, store.now, undefined, store.budgets.clock))
  }
  private root() {
    const context = this.context,
      request = contractDigest(context.request),
      actual = this.store.get(request),
      state = this.store.lifecycle.journal.view(actual.run),
      record = this.store
        .record(request)
        .stages.find((s) => s.id === context.stage.id && s.invocation === context.invocation),
      revision = state.plans.find((p) => p.digest === record?.basis)?.revision,
      pinned = this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(pinned.plan).find((s) => s.id === context.stage.id)
    if (
      !record ||
      pinned.digest !== record.basis ||
      record.basis !== contractDigest(context.plan) ||
      contractDigest(stage ?? null) !== contractDigest(context.stage) ||
      !['definition', 'plan', 'acceptance-definition', 'build-plan', 'research'].includes(
        context.stage.kind,
      )
    )
      throw new DeliveryRunnerError('artifact-purpose-root')
    if (
      (context.stage.kind === 'research' &&
        (context.stage.unit || pinned.plan.policy.endpoint !== 'research-report')) ||
      (context.stage.kind === 'build-plan' && !context.stage.unit)
    )
      throw new DeliveryRunnerError('artifact-purpose-route')
    return {
      record,
      pinned,
      root: {
        request,
        plan: record.basis,
        stage: record.id,
        invocation: record.invocation,
        deadline: context.deadline,
      },
    }
  }
  claim(input: RunnerArtifactInput) {
    const selected = this.root(),
      context = this.context,
      authority = this.store.lifecycle.authority.inspect(context.request.grant)
    if (
      context.signal.aborted ||
      !context.current() ||
      !['prepared', 'running'].includes(selected.record.status) ||
      !Number.isFinite(Date.parse(context.deadline)) ||
      new Date(context.deadline).toISOString() !== context.deadline ||
      Date.parse(context.deadline) <= Date.now() ||
      (context.stage.kind === 'plan' && authority.grant.basis.kind !== 'envelope')
    )
      throw new DeliveryRunnerError('artifact-purpose-not-current')
    // Artifact purposes are claimed as planner work (below), so they carry planner guidance.
    if (guidanceContextProblem(selected.pinned.plan.guidance, 'planner', input.context))
      throw new DeliveryRunnerError('artifact-purpose-guidance')
    // A deadline narrows this invocation; changing it must not buy a new cell.
    const { deadline: _deadline, ...scope } = selected.root
    const key = contractDigest(scope),
      purpose = context.stage.kind as ArtifactPurpose
    safeSourceText(input.brief, 1024 * 1024)
    return this.claimAttempt({
      ...input,
      run: context.request.run,
      grant: context.request.grant,
      key,
      cell: `artifact:${purpose}:${key}`,
      role: 'planner',
      deadline: context.deadline,
      authorize: (grant) => {
        if (!grant.effects.includes('source.read') || !grant.effects.includes('report.write'))
          throw new DeliveryRunnerError('artifact-purpose-authority')
      },
      create: (assignment) => ({
        version: 1,
        purpose,
        root: selected.root,
        key,
        grant: context.request.grant,
        contextRoot: input.contextRoot,
        provenance: input.provenance,
        assignment,
      }),
    })
  }
  override completed(
    lease: Readonly<RunnerArtifactLease>,
    receipt: Readonly<NativeRunReceipt>,
  ): boolean {
    return (
      super.completed(lease, receipt) &&
      Date.parse(receipt.execution?.finishedAt ?? '') <= Date.parse(lease.root.deadline)
    )
  }
  protected override active(lease: Readonly<RunnerArtifactLease>): boolean {
    const record = this.store.stage(lease.root.request, lease.root.stage)
    return (
      !this.context.signal.aborted &&
      this.context.current() &&
      record?.invocation === lease.root.invocation &&
      ['prepared', 'running'].includes(record.status) &&
      Date.now() < Date.parse(lease.root.deadline)
    )
  }
  protected path(attempt: string) {
    if (!/^attempt-[a-f0-9]{16}$/.test(attempt))
      throw new DeliveryRunnerError('artifact-purpose-attempt')
    return `delivery/runner-artifact-attempts/${attempt}.json`
  }
  protected validate(value: unknown) {
    safeSourceText(JSON.stringify(value), 2 * 1024 * 1024)
    if (
      !isObject(value) ||
      Object.keys(value).sort().join(',') !==
        'assignment,contextRoot,grant,key,provenance,purpose,root,version' ||
      value.version !== 1
    )
      throw new DeliveryRunnerError('artifact-purpose-private-binding')
    const lease = value as unknown as RunnerArtifactLease,
      selected = this.root()
    validateWorkerAssignment(lease.assignment)
    const { deadline: _deadline, ...scope } = selected.root
    if (
      lease.grant !== this.context.request.grant ||
      contractDigest(lease.root) !== contractDigest(selected.root) ||
      lease.key !== contractDigest(scope) ||
      lease.purpose !== this.context.stage.kind ||
      lease.assignment.identity.role !== 'planner' ||
      lease.assignment.identity.unit !== undefined ||
      lease.assignment.identity.cell !== `artifact:${lease.purpose}:${lease.key}` ||
      lease.assignment.identity.run !== this.context.request.run ||
      lease.assignment.identity.plan !== selected.pinned.digest ||
      Date.parse(lease.assignment.deadline) > Date.parse(lease.root.deadline) ||
      typeof lease.contextRoot !== 'string' ||
      !['fixture', 'host-observed'].includes(lease.provenance)
    )
      throw new DeliveryRunnerError('artifact-purpose-original-binding')
  }
}
