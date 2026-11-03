import { existsSync } from 'node:fs'
import { browserInput } from '../acceptance/browser-input.js'
import { browserReferenceCommand } from '../acceptance/browser-reference.js'
import { type AcceptanceCase, acceptanceShape } from '../acceptance/contracts.js'
import { privateEvaluatorSource } from '../acceptance/docker-private.js'
import { PrivateAcceptance } from '../acceptance/private-plan.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import { EnvironmentOperations } from '../environment/operations.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { IntegrationError } from '../integration/contracts.js'
import {
  INTEGRATION_VERIFICATION_SCHEMA,
  IntegrationVerification,
  type IntegrationVerificationRequest,
  integrationVerificationKey,
  integrationVerificationSelection,
} from '../integration/verification.js'
import { observedIntegrationVerification } from '../integration/verification-observation.js'
import { RunnerAssemblyReadiness } from './assembly-readiness.js'
import type { RunnerStageContext, RunnerStageObservation } from './engine.js'
import { RunnerEnvironmentScope } from './environment-scope.js'
import type { RunnerStageRecord } from './events.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

/** Kind alone cannot distinguish an in-controller HTTP case from an opaque evaluator. */
export function rootIntegrationCaseOwner(test: Pick<AcceptanceCase, 'runner'> | undefined) {
  if (test?.runner.kind === 'cli' && test.runner.capability === 'process.exec')
    return 'container-start'
  if (test?.runner.kind === 'api' && test.runner.capability === 'http.request')
    return 'controller-http'
  if (test?.runner.kind === 'api' && test.runner.capability === 'evaluator.private-http')
    return 'evaluator-container'
  if (test?.runner.kind === 'browser' && test.runner.capability === 'browser.journey')
    return 'browser-exec'
  return 'unsupported'
}

interface IntegrationStageBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  at: string
  deadline: string
  selection: IntegrationVerificationRequest
}

/** Execute product QA under the original root stage; historical proof alone cannot pass it. */
export class RunnerIntegrationStages {
  constructor(
    readonly store: RunnerStore,
    readonly readiness: RunnerAssemblyReadiness,
  ) {
    if (
      !(readiness instanceof RunnerAssemblyReadiness) ||
      readiness.store.files.root !== store.files.root
    )
      throw new DeliveryRunnerError('integration-stage-fixed-readiness-required')
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('integration-stage-invocation')
    return `delivery/runner-integrations/${invocation}`
  }
  private context(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      basis = this.store.basis(request),
      original = this.store
        .record(digest)
        .stages.find((stage) => stage.id === record.id && stage.invocation === record.invocation),
      stage = runnerRoute(basis.plan).find((stage) => stage.id === record.id)
    if (
      !original ||
      original.basis !== record.basis ||
      record.basis !== basis.digest ||
      stage?.kind !== 'integration' ||
      !stage.milestone
    )
      throw new DeliveryRunnerError('integration-stage-original-binding')
    return { digest, basis, stage, milestone: stage.milestone }
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.path(record.invocation),
      context = this.context(request, record)
    if (!existsSync(this.store.files.path(`${base}/binding.json`))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, `${base}/binding.json`, 65536),
    ) as IntegrationStageBinding
    acceptanceShape(binding.selection, INTEGRATION_VERIFICATION_SCHEMA)
    if (
      Object.keys(binding).sort().join(',') !==
        'at,deadline,invocation,plan,request,selection,stage,version' ||
      binding.version !== 1 ||
      binding.request !== context.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !Number.isFinite(Date.parse(binding.at)) ||
      new Date(binding.at).toISOString() !== binding.at ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      binding.at >= binding.deadline ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(binding)
    )
      throw new DeliveryRunnerError('integration-stage-resource-binding')
    return { binding, ...context }
  }
  async execute(
    inputContext: RunnerStageContext,
    inputSelection: IntegrationVerificationRequest,
    driver: DockerTransport = new DockerCli(),
  ): Promise<RunnerStageObservation> {
    // A caller may reuse its context while an asynchronous readiness read is
    // pending. Retain the original parent and selection, never their replacements.
    const context = Object.freeze({
        ...inputContext,
        request: structuredClone(inputContext.request),
        plan: structuredClone(inputContext.plan),
        stage: structuredClone(inputContext.stage),
      }),
      selection = structuredClone(inputSelection)
    const digest = contractDigest(context.request),
      record = this.store.stage(digest, context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('integration-stage-not-dispatched')
    const original = this.context(context.request, record),
      base = this.path(record.invocation)
    const current = () => {
      if (
        context.signal.aborted ||
        !context.current() ||
        !Number.isFinite(Date.parse(context.deadline)) ||
        new Date(context.deadline).toISOString() !== context.deadline ||
        Date.parse(context.deadline) <= Date.now() ||
        contractDigest(context.plan) !== record.basis ||
        contractDigest(context.stage) !== contractDigest(original.stage) ||
        !['prepared', 'running'].includes(this.store.stage(digest, record.id)?.status ?? '')
      )
        throw new DeliveryRunnerError('integration-stage-not-current')
    }
    current()
    const prior = this.read(context.request, record)
    if (prior) {
      if (
        contractDigest(prior.binding.selection) !== contractDigest(selection) ||
        prior.binding.deadline !== context.deadline
      )
        throw new DeliveryRunnerError('integration-stage-input-conflict')
      return this.inspect(context.request, record)
    }
    const ready = await this.readiness.inspect(
      context.request,
      original.milestone,
      selection.assembly,
    )
    current()
    if (ready.status !== 'ready' || ready.provenance !== 'host-observed')
      throw new DeliveryRunnerError('integration-stage-assembly-not-ready')
    const verifier = new IntegrationVerification(this.store.files.root, driver),
      candidate = verifier.candidates.inspect(selection.candidate),
      input = candidate.candidate.inputs.find((input) => input.kind === 'acceptance'),
      pinned = verifier.acceptance.get(input?.ref ?? ''),
      tests = integrationVerificationSelection(candidate.candidate, pinned.plan)
    if (
      candidate.status !== 'current' ||
      candidate.candidate.run !== context.request.run ||
      candidate.candidate.plan !== record.basis ||
      candidate.candidate.milestone !== original.milestone ||
      contractDigest(
        candidate.candidate.assemblies.map(({ repository, path, ref, head }) => ({
          repository,
          path,
          ref,
          head,
        })),
      ) !== contractDigest(ready.candidates) ||
      tests.missing.length ||
      pinned.plan.cases.some((test) => tests.cases.includes(test.id) && test.owner !== 'machine')
    )
      throw new DeliveryRunnerError('integration-stage-candidate-binding')
    if (
      pinned.plan.cases.some(
        (test) => tests.cases.includes(test.id) && rootIntegrationCaseOwner(test) === 'unsupported',
      )
    )
      throw new DeliveryRunnerError('integration-stage-case-owner-unsupported')
    for (const test of pinned.plan.cases)
      if (
        tests.cases.includes(test.id) &&
        rootIntegrationCaseOwner(test) === 'evaluator-container'
      ) {
        new PrivateAcceptance(verifier.acceptance).forCase(pinned.digest, test)
        privateEvaluatorSource()
      }
    const binding: IntegrationStageBinding = {
      version: 1,
      request: digest,
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      at: new Date().toISOString(),
      deadline: context.deadline,
      selection: structuredClone(selection),
    }
    safeSourceText(JSON.stringify(binding), 65536)
    this.store.files.locked(() => {
      current()
      if (
        existsSync(this.store.files.path(`${base}/consumed`)) ||
        tests.cases.some((id) =>
          existsSync(
            this.store.files.path(
              `delivery/acceptance-cases/${pinned.digest}/${id}/${integrationVerificationKey(selection, id)}/intent.json`,
            ),
          ),
        )
      )
        throw new DeliveryRunnerError('integration-stage-original-unresolved')
      this.store.files.atomic(`${base}/consumed`, `${contractDigest(binding)}\n`)
      this.store.files.atomic(`${base}/binding.json`, `${JSON.stringify(binding)}\n`)
    })
    const scope = new RunnerEnvironmentScope(this.store, record.invocation)
    try {
      await scope.run(context, selection.environment, driver, async (owned) => {
        const result = await new IntegrationVerification(this.store.files.root, owned, {
          deadline: binding.deadline,
          signal: context.signal,
          current: context.current,
        }).run(selection)
        current()
        if (!result.artifact) throw new DeliveryRunnerError('integration-stage-report-required')
        this.store.files.atomic(
          `${base}/report.json`,
          `${JSON.stringify({ artifact: result.artifact })}\n`,
        )
      })
    } catch {
      // Original scope owners and consumed input remain inspectable. Never
      // repeat uncertain HTTP/native work or expose arbitrary process text.
    }
    return this.inspect(context.request, this.store.stage(digest, record.id) ?? record)
  }
  /**
   * What a correction builder may learn of a failed integration (ADR-0208):
   * each product case's id and status, and for a public case its pinned
   * actions, assertion descriptions and failure conditions. A private
   * evaluator case gives its id and status only, never its objective.
   */
  failedCases(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    // History, not current evidence: the failed record belongs to an earlier
    // basis, so the original binding is checked against it directly.
    const base = this.path(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/binding.json`)))
      throw new DeliveryRunnerError('integration-stage-original-unresolved')
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, `${base}/binding.json`, 65536),
    ) as IntegrationStageBinding
    acceptanceShape(binding.selection, INTEGRATION_VERIFICATION_SCHEMA)
    if (
      binding.request !== contractDigest(request) ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation
    )
      throw new DeliveryRunnerError('integration-stage-original-binding')
    const original = { binding }
    const retained = JSON.parse(
        readSourceFile(this.store.files.root, `${this.path(record.invocation)}/report.json`, 1024),
      ) as { artifact: string },
      proof = observedIntegrationVerification(
        this.store.files.root,
        original.binding.selection,
        retained.artifact,
      ),
      plan = new IntegrationVerification(this.store.files.root).acceptance.get(
        proof.report.acceptancePlan,
      ).plan
    return proof.cases.map(({ result }) => {
      const definition = plan.cases.find((test) => test.id === result.case)
      return {
        case: result.case,
        status: result.status,
        ...(definition && rootIntegrationCaseOwner(definition) !== 'evaluator-container'
          ? {
              actions: definition.actions,
              assertions: definition.assertions.map(({ id, description }) => ({ id, description })),
              failureConditions: definition.failureConditions,
            }
          : {}),
      }
    })
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    record: Readonly<RunnerStageRecord>,
  ): Promise<RunnerStageObservation> {
    let status: RunnerStageObservation['status'] = 'unknown',
      provenance: RunnerStageObservation['provenance'] = 'fixture',
      invocationState: RunnerStageObservation['invocationState'] = 'unknown',
      reason = 'Original integrated verification is unresolved.'
    const proofs: unknown[] = []
    try {
      const original = this.read(request, record)
      if (!original) throw new DeliveryRunnerError('integration-stage-original-unresolved')
      const { binding, milestone } = original,
        scope = new RunnerEnvironmentScope(this.store, record.invocation),
        origin = scope.origin(),
        closed = scope.inspect(),
        retained = JSON.parse(
          readSourceFile(
            this.store.files.root,
            `${this.path(record.invocation)}/report.json`,
            1024,
          ),
        ) as { artifact: string },
        proof = observedIntegrationVerification(
          this.store.files.root,
          binding.selection,
          retained.artifact,
        )
      if (
        Object.keys(retained).join(',') !== 'artifact' ||
        origin?.request !== binding.request ||
        origin.plan !== binding.plan ||
        origin.stage !== binding.stage ||
        origin.deadline !== binding.deadline ||
        origin.environment !== binding.selection.environment ||
        closed.invocationState !== 'stopped' ||
        closed.provenance !== 'host-observed'
      )
        throw new DeliveryRunnerError('integration-stage-original-scope-required')
      for (const observed of proof.cases) {
        const result = observed.result,
          definition = new IntegrationVerification(this.store.files.root).acceptance
            .get(proof.report.acceptancePlan)
            .plan.cases.find((test) => test.id === result.case),
          intent = JSON.parse(
            readSourceFile(
              this.store.files.root,
              `delivery/acceptance-cases/${result.plan}/${result.case}/${result.key}/intent.json`,
              65536,
            ),
          ) as { deadline: string }
        const owner = rootIntegrationCaseOwner(definition)
        if (owner === 'evaluator-container' && definition)
          new PrivateAcceptance(
            new IntegrationVerification(this.store.files.root).acceptance,
          ).forCase(proof.report.acceptancePlan, definition)
        if (
          result.startedAt < binding.at ||
          result.endedAt > binding.deadline ||
          !Number.isFinite(Date.parse(intent.deadline)) ||
          new Date(intent.deadline).toISOString() !== intent.deadline ||
          intent.deadline > binding.deadline
        )
          throw new DeliveryRunnerError('integration-stage-original-case-deadline')
        if (result.process) {
          const execution = observed.execution as
              | {
                  container?: string
                  controllerOperation?: string
                  clientExit?: number
                  operation?: string
                }
              | undefined,
            input = owner === 'browser-exec' && definition ? browserInput(definition) : undefined,
            resource = new EnvironmentResources(this.store.files)
              .get(binding.selection.environment)
              .record.resources.find(
                (resource) =>
                  resource.kind === 'container' &&
                  (input
                    ? resource.purpose === 'service' && resource.service === input.browser.service
                    : resource.id === execution?.container &&
                      resource.purpose === 'test' &&
                      (owner === 'evaluator-container'
                        ? resource.slot ===
                          `private-${contractDigest(result.invocation).slice(0, 20)}-verify`
                        : resource.slot.startsWith(
                            `behavior-${contractDigest(result.invocation).slice(0, 20)}-`,
                          ))),
              ),
            completion = resource?.id
              ? new EnvironmentOperations(
                  this.store.files,
                  binding.selection.environment,
                  'host-observed',
                ).completion(
                  input
                    ? [
                        'container',
                        'exec',
                        '--interactive',
                        resource.id,
                        ...browserReferenceCommand(
                          `http://${input.service}:${input.port}`,
                          contractDigest(result.invocation),
                        ),
                      ]
                    : ['container', 'start', '--attach', '--interactive', resource.id],
                  result.process.pid,
                )
              : undefined
          if (
            !resource ||
            !['container-start', 'evaluator-container', 'browser-exec'].includes(owner) ||
            !completion ||
            completion.operation !==
              (input ? execution?.operation : execution?.controllerOperation) ||
            completion.code !== (input ? 0 : execution?.clientExit) ||
            // The private wrapper normalizes nonzero exits to one; the
            // original Docker outcome retains the exact application code.
            result.process.code !== (completion.code === 0 ? 0 : 1) ||
            result.process.signal !== undefined ||
            Date.parse(completion.at) > Date.parse(binding.deadline) ||
            !closed.operations.some(
              (operation) =>
                operation?.operation.id === completion.operation && operation.status === 'stopped',
            )
          )
            throw new DeliveryRunnerError('integration-stage-original-case-owner')
        } else if (
          rootIntegrationCaseOwner(definition) !== 'controller-http' ||
          result.host.id !== 'docker-behavior' ||
          observed.execution !== undefined
        )
          throw new DeliveryRunnerError('integration-stage-original-case-owner')
      }
      const ready = await this.readiness.inspect(request, milestone, binding.selection.assembly),
        candidate = new IntegrationVerification(this.store.files.root).candidates.inspect(
          binding.selection.candidate,
        ),
        after = scope.inspect()
      // Current unit QA yields to asynchronous readers. Reopen the original
      // product proof and locator too, rather than retaining their earlier view.
      const reopened = observedIntegrationVerification(
          this.store.files.root,
          binding.selection,
          retained.artifact,
        ),
        locator = JSON.parse(
          readSourceFile(
            this.store.files.root,
            `${this.path(record.invocation)}/report.json`,
            1024,
          ),
        )
      proofs.push({ binding, proof: proof.evidence, closed, ready, candidate, after })
      if (
        ready.status !== 'ready' ||
        ready.provenance !== 'host-observed' ||
        candidate.status !== 'current' ||
        proof.evidence !== reopened.evidence ||
        contractDigest(retained) !== contractDigest(locator) ||
        contractDigest(closed) !== contractDigest(after) ||
        contractDigest(original) !== contractDigest(this.read(request, record))
      )
        throw new DeliveryRunnerError('integration-stage-current-vector-unavailable')
      status = proof.report.status === 'passed' ? 'passed' : 'failed'
      provenance = 'host-observed'
      invocationState = 'stopped'
      reason =
        status === 'passed'
          ? 'Original bounded product QA passes at the current QA-ready assembly; feature acceptance remains separate.'
          : 'Original bounded product QA fails at the current QA-ready assembly.'
    } catch (error) {
      reason =
        error instanceof DeliveryRunnerError || error instanceof IntegrationError
          ? error.problem
          : 'integration-stage-original-observation-unavailable'
    }
    return {
      schema: 'wholeloop/delivery-runner-stage-observation@1',
      request: contractDigest(request),
      plan: record.basis,
      stage: record.id,
      invocation: record.invocation,
      status,
      invocationState,
      provenance,
      evidence: contractDigest({
        request: contractDigest(request),
        record: { id: record.id, invocation: record.invocation, basis: record.basis },
        proofs,
        reason,
      }),
      reason,
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
      !record.id.startsWith('integration:') ||
      !this.store
        .record(digest)
        .stages.some(
          (stage) =>
            stage.id === record.id &&
            stage.invocation === record.invocation &&
            stage.basis === record.basis,
        )
    )
      throw new DeliveryRunnerError('integration-stage-original-binding')
    if (!signal.aborted) new RunnerEnvironmentScope(this.store, record.invocation).cancelAll()
  }
}
