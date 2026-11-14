// Runner stages that produce research and report artifacts, with controller-owned cases appended.
import { existsSync } from 'node:fs'
import {
  ACCEPTANCE_SCHEMAS,
  type AcceptanceCase,
  type AcceptancePlan,
} from '../acceptance/contracts.js'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { BUILDER_PLAN_SCHEMA, validateBuilderPlan } from '../build/contracts.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText, sourceHash } from '../delivery/input.js'
import type {
  NativeProcessRunner,
  NativeRunOptions,
  NativeRunReceipt,
} from '../delivery/native-host.js'
import {
  checkPlanEnvelope,
  type DeliveryPlan,
  deliveryPlanSchema,
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
  version: 1 | 2
  calls?: string[]
  lease: RunnerArtifactLease
  directory?: string
  workspace?: { path: string; head: string; snapshot: string }
}
export interface RunnerArtifactResult {
  status: 'ready' | 'blocked' | 'unknown'
  invocationState: 'stopped' | 'not-started' | 'unknown'
  provenance: 'fixture' | 'host-observed'
  evidence: string
  deadline?: string
  ownedCalls?: { invocation: string; evidence: string }[]
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
  /**
   * Controller-owned acceptance cases, such as a repository's declared suite,
   * appended to the produced acceptance plan before it is pinned (ADR-0207).
   * They must be a pure function of the pinned plan and trusted host inputs;
   * a produced case with the same id refuses the plan rather than replacing it.
   */
  cases?(context: RunnerStageContext): AcceptanceCase[]
  /** Installed input formats and fixture identifiers inform production, never authority. */
  acceptanceContext?(context: RunnerStageContext): Record<string, unknown>
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
        (key) =>
          ![
            'version',
            'lease',
            'directory',
            'workspace',
            ...(binding.version === 2 ? ['calls'] : []),
          ].includes(key),
      ) ||
      ![1, 2].includes(binding.version) ||
      (binding.version === 2 &&
        (!Array.isArray(binding.calls) ||
          binding.calls.length > 1000 ||
          binding.calls.some((id) => !/^[a-f0-9]{64}$/.test(id)) ||
          new Set(binding.calls).size !== binding.calls.length)) ||
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
  /**
   * The pinned rubric an independent judge will apply to a builder plan. The
   * producer saw only its reference and digest, so a live builder plan was
   * rejected for missing a pre-edit inspection the rubric required. Rubrics
   * are policy, not private acceptance; an unpinned one is simply omitted.
   */
  private approvalRubric(plan: Readonly<DeliveryPlan>) {
    const delegation = plan.policy.delegations?.find((item) => item.id === 'approve-build-plan')
    if (!delegation) return {}
    try {
      const text = readSourceFile(
          this.store.files.root,
          `delivery/decision-rubrics/${delegation.rubric.sha256}.json`,
          64 * 1024,
        ),
        rubric = JSON.parse(text) as { purpose?: unknown; rules?: unknown }
      if (sourceHash(text) !== delegation.rubric.sha256) return {}
      return {
        approvalRubric: { decision: delegation.id, purpose: rubric.purpose, rules: rubric.rules },
        approvalRule:
          'An independent judge approves this plan against approvalRubric before any code changes. Address each rule explicitly.',
      }
    } catch {
      return {}
    }
  }
  private response(kind: string, plan: Readonly<DeliveryPlan>) {
    if (kind === 'acceptance-definition') {
      const schema = ACCEPTANCE_SCHEMAS.plan
      // Acceptance cases describe this revision. Only a delivery-plan proposal
      // creates a successor; never repair a producer's wrong identity on readback.
      return {
        ...schema,
        properties: {
          ...schema.properties,
          run: { ...schema.properties.run, const: plan.run },
          revision: { ...schema.properties.revision, const: plan.revision },
          plan: { ...schema.properties.plan, const: contractDigest(plan) },
          source: { ...schema.properties.source, const: plan.source },
        },
      }
    }
    if (kind === 'build-plan') return BUILDER_PLAN_SCHEMA
    if (kind === 'definition' || kind === 'plan') return deliveryPlanSchema(plan)
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
    if (existsSync(this.store.files.path(`${this.path(record.invocation)}.consumed`)))
      throw new DeliveryRunnerError('artifact-stage-original-unresolved')
    if (
      record.runtime ||
      new RunnerNativeScope(this.store.files, context.invocation).calls().length
    )
      throw new DeliveryRunnerError('artifact-stage-foreign-native-work')
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
        response: this.response(context.stage.kind, context.plan),
        outputArtifact: { ref: 'artifacts/production.json', kind: 'report', count: 1 },
        ...(context.stage.kind === 'acceptance-definition' && this.options.cases
          ? {
              controllerCases: this.options.cases(context),
              controllerCasesRule:
                'The controller appends these exact cases to the plan. Do not redefine their ids; define every other case the criteria need.',
            }
          : {}),
        ...(context.stage.kind === 'acceptance-definition' && this.options.acceptanceContext
          ? { acceptanceContext: this.options.acceptanceContext(context) }
          : {}),
        ...(context.stage.kind === 'build-plan' ? this.approvalRubric(context.plan) : {}),
        // Integration selects, for each milestone, the machine cases whose
        // actions contain its procedure verbatim, and refuses the candidate
        // when none does. A live producer paraphrased the procedure and the
        // integration stage stopped before running any case.
        ...(context.stage.kind === 'acceptance-definition'
          ? {
              milestoneProcedures: context.plan.milestones.map(({ id, criteria, procedure }) => ({
                id,
                criteria,
                procedure,
              })),
              milestoneProcedureRule:
                'For every milestone, at least one applicable machine case covering one of its criteria must list its procedure verbatim as one of its actions; other actions may follow.',
            }
          : {}),
        instruction:
          'Produce exactly one report artifact at artifacts/production.json containing JSON that follows response. Preserve original scope, source, ownership, exclusions, guidance, policy and unknowns. Only delivery-plan proposals for definition or plan stages use the next revision and original digest as previous. Acceptance definitions retain the exact current run/revision/plan/source constants in response. Use the installed acceptanceContext input formats and fixture identifiers when supplied; never invent capabilities or waive a criterion because its required observation is unavailable. Define complete acceptance cases before any builder; never waive human ownership or claim tests, execution, approval or delivery completion. Keep outer criteria/findings/unknowns empty; encode missing facts explicitly in the artifact. Every assertion expected value is JSON text, parsed before comparison: quote a string, as in "\\"abc\\"", and write numbers, booleans, arrays and objects as JSON. Every assertion path is a JSON Pointer that starts with /, as in /changedPaths; omit path to compare the whole value.',
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
        version: 2,
        calls: [],
        lease,
        ...(candidate ? { workspace: candidate } : {}),
      }
    this.store.files.atomic(this.path(record.invocation), `${JSON.stringify(binding)}\n`)
    // Only this producer's managed calls enter its prefix. A closed unrelated
    // call cannot qualify as production just because it shares the root stage.
    await new RunnerNativeStage(this.store, context, (invocation) => {
      const original = this.read(context.request, record),
        calls = new RunnerNativeScope(this.store.files, context.invocation).calls()
      if (
        !original ||
        contractDigest(original.binding) !== contractDigest(binding) ||
        !binding.calls ||
        binding.calls.includes(invocation) ||
        !calls.some((call) => call.invocation === invocation)
      )
        throw new DeliveryRunnerError('artifact-stage-call-binding')
      binding.calls.push(invocation)
      binding.calls.sort(
        (a, b) =>
          calls.findIndex((c) => c.invocation === a) - calls.findIndex((c) => c.invocation === b),
      )
      safeSourceText(JSON.stringify(binding), 2 * 1024 * 1024)
      this.store.files.atomic(this.path(record.invocation), `${JSON.stringify(binding)}\n`)
    }).run(async (process) => {
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
    const originalCalls = selected?.binding.calls,
      prefix =
        selected?.binding.version === 1 ||
        (!!originalCalls?.length &&
          contractDigest(originalCalls) ===
            contractDigest(calls.slice(0, originalCalls.length).map((c) => c.invocation))),
      ownedCalls =
        prefix && originalCalls
          ? calls
              .slice(0, originalCalls.length)
              .map((call) => ({ invocation: call.invocation, evidence: call.observed.evidence }))
          : undefined
    if (selected?.binding.directory && closed && prefix) {
      const attempt = deliveryAttempts(this.store.lifecycle.journal.view(request.run)).records.find(
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
              validateDeliveryShape(
                value,
                this.response(selected.context.stage.kind, selected.context.plan),
              )
              if (selected.context.stage.kind === 'acceptance-definition') {
                const produced = value as AcceptancePlan,
                  appended = this.options.cases?.(selected.context) ?? []
                if (produced.cases.some((test) => appended.some((owned) => owned.id === test.id)))
                  throw new DeliveryRunnerError('artifact-stage-controller-case')
                const input: AcceptancePlan = {
                  ...produced,
                  cases: [...produced.cases, ...structuredClone(appended)],
                }
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
      ...(ownedCalls && selected
        ? { ownedCalls, deadline: selected.binding.lease.root.deadline }
        : {}),
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
