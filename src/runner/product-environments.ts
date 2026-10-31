import { existsSync } from 'node:fs'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import type { EnvironmentProvisionRequest } from '../environment/provision.js'
import type { IntegrationCandidate } from '../integration/observe.js'
import { IntegrationCandidates } from '../integration/store.js'
import {
  type IntegrationVerificationRequest,
  integrationVerificationSelection,
} from '../integration/verification.js'
import { RunnerAssemblyReadiness } from './assembly-readiness.js'
import type { RunnerStageContext } from './engine.js'
import { RunnerEnvironmentProducer } from './environment-producer.js'
import { RunnerEnvironmentScope } from './environment-scope.js'
import type { RunnerStageRecord } from './events.js'
import { rootIntegrationCaseOwner } from './integration-stages.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface RunnerProductInput {
  candidate: string
  assembly: string
  helperImage: string
}
interface ProductBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  deadline: string
  input: RunnerProductInput
  ready: string
  provision: EnvironmentProvisionRequest
}

/** Fixed product inputs select original preparation; they never supply a backend or QA verdict. */
export class RunnerProductEnvironments {
  private readonly selections: ReadonlyMap<string, RunnerProductInput>
  readonly producer: RunnerEnvironmentProducer
  constructor(
    readonly store: RunnerStore,
    readonly readiness: RunnerAssemblyReadiness,
    inputs: ReadonlyMap<string, RunnerProductInput>,
    readonly driver: DockerTransport = new DockerCli(),
  ) {
    if (
      !(readiness instanceof RunnerAssemblyReadiness) ||
      readiness.store.files.root !== store.files.root
    )
      throw new DeliveryRunnerError('product-environment-fixed-readiness-required')
    this.selections = new Map(
      [...inputs].map(([milestone, input]) => {
        if (!/^[a-z][a-z0-9_-]{0,63}$/.test(milestone))
          throw new DeliveryRunnerError('product-environment-milestone')
        this.validate(input)
        return [milestone, Object.freeze(structuredClone(input))]
      }),
    )
    // One phase per original invocation prevents a changed selection from
    // obtaining another provisioning allowance through a different phase key.
    this.producer = new RunnerEnvironmentProducer(
      store,
      contractDigest({ phase: 'original-root-product-environment' }),
    )
  }
  private validate(input: RunnerProductInput) {
    if (
      Object.keys(input).sort().join(',') !== 'assembly,candidate,helperImage' ||
      !/^[a-f0-9]{64}$/.test(input.candidate) ||
      !/^[a-f0-9]{64}$/.test(input.assembly) ||
      input.helperImage.length > 512 ||
      !/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(input.helperImage)
    )
      throw new DeliveryRunnerError('product-environment-input')
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('product-environment-invocation')
    return `delivery/runner-products/${invocation}`
  }
  private provision(
    input: RunnerProductInput,
    invocation: string,
    candidate: IntegrationCandidate,
  ) {
    const recipes = candidate.inputs.filter((entry) => entry.kind === 'recipe')
    if (recipes.length !== 1)
      throw new DeliveryRunnerError('product-environment-single-recipe-required')
    return {
      schema: 'wholeloop/environment-provision-request@1' as const,
      run: candidate.run,
      recipe: recipes[0]?.ref ?? '',
      key: `runner-product-${invocation.slice(0, 40)}`,
      helperImage: input.helperImage,
      workspaces: candidate.assemblies.map(({ repository, path, head, snapshot }) => ({
        repository,
        path,
        head,
        snapshot,
      })),
    }
  }
  private original(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const digest = contractDigest(request),
      actual = this.store.get(digest),
      revision = this.store.lifecycle.journal
        .get(actual.run)
        .plans.find((plan) => plan.digest === record.basis)?.revision,
      basis = this.store.planning.getPlan(actual.run, revision ?? 0),
      stage = runnerRoute(basis.plan).find((entry) => entry.id === record.id),
      retained = this.store
        .record(digest)
        .stages.find((entry) => entry.id === record.id && entry.invocation === record.invocation)
    if (
      !retained ||
      retained.basis !== record.basis ||
      basis.digest !== record.basis ||
      stage?.kind !== 'integration' ||
      !stage.milestone
    )
      throw new DeliveryRunnerError('product-environment-original-stage')
    return { digest, basis, stage, milestone: stage.milestone }
  }
  private read(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.path(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/binding.json`))) return undefined
    const binding = JSON.parse(
        readSourceFile(this.store.files.root, `${base}/binding.json`, 65536),
      ) as ProductBinding,
      original = this.original(request, record)
    this.validate(binding.input)
    if (
      Object.keys(binding).sort().join(',') !==
        'deadline,input,invocation,plan,provision,ready,request,stage,version' ||
      binding.version !== 1 ||
      binding.request !== original.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      !/^[a-f0-9]{64}$/.test(binding.ready) ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(binding)
    )
      throw new DeliveryRunnerError('product-environment-original-binding')
    const candidate = new IntegrationCandidates(this.store.files.root).get(binding.input.candidate),
      assembly = this.readiness.assembly.get(binding.input.assembly)
    if (
      candidate.candidate.run !== request.run ||
      candidate.candidate.plan !== record.basis ||
      candidate.candidate.milestone !== original.milestone ||
      assembly.assembly.request.run !== request.run ||
      assembly.assembly.request.plan !== record.basis ||
      assembly.assembly.request.milestone !== original.milestone ||
      contractDigest(assembly.assembly.parts) !== contractDigest(candidate.candidate.parts) ||
      contractDigest(binding.provision) !==
        contractDigest(this.provision(binding.input, record.invocation, candidate.candidate))
    )
      throw new DeliveryRunnerError('product-environment-original-candidate-binding')
    return binding
  }
  async prepare(inputContext: RunnerStageContext): Promise<IntegrationVerificationRequest> {
    const context = Object.freeze({
        ...inputContext,
        request: structuredClone(inputContext.request),
        plan: structuredClone(inputContext.plan),
        stage: structuredClone(inputContext.stage),
        current: inputContext.current.bind(inputContext),
        started: inputContext.started.bind(inputContext),
      }),
      record = this.store.stage(contractDigest(context.request), context.stage.id)
    if (!record || record.invocation !== context.invocation)
      throw new DeliveryRunnerError('product-environment-not-dispatched')
    const original = this.original(context.request, record),
      current = () => {
        if (
          context.signal.aborted ||
          !context.current() ||
          !Number.isFinite(Date.parse(context.deadline)) ||
          new Date(context.deadline).toISOString() !== context.deadline ||
          Date.now() >= Date.parse(context.deadline) ||
          this.store.basis(context.request).digest !== record.basis ||
          contractDigest(context.plan) !== record.basis ||
          contractDigest(context.stage) !== contractDigest(original.stage) ||
          !['prepared', 'running'].includes(
            this.store.stage(original.digest, record.id)?.status ?? '',
          )
        )
          throw new DeliveryRunnerError('product-environment-not-current')
      }
    current()
    const input = this.selections.get(original.milestone)
    if (!input) throw new DeliveryRunnerError('product-environment-selection-required')
    const base = this.path(context.invocation),
      prior = this.read(context.request, record)
    if (
      prior &&
      (contractDigest(prior.input) !== contractDigest(input) || prior.deadline !== context.deadline)
    )
      throw new DeliveryRunnerError('product-environment-input-conflict')
    if (!prior && existsSync(this.store.files.path(`${base}/consumed`)))
      throw new DeliveryRunnerError('product-environment-original-unresolved')
    const ready = await this.readiness.inspect(context.request, original.milestone, input.assembly)
    current()
    if (ready.status !== 'ready' || ready.provenance !== 'host-observed')
      throw new DeliveryRunnerError('product-environment-current-assembly-required')
    const candidate = new IntegrationCandidates(this.store.files.root).inspect(input.candidate),
      recipes = candidate.candidate.inputs.filter((entry) => entry.kind === 'recipe'),
      acceptance = candidate.candidate.inputs.find((entry) => entry.kind === 'acceptance'),
      pinned = new DeliveryAcceptance(this.store.files.root).get(acceptance?.ref ?? ''),
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
      recipes.length !== 1 ||
      tests.missing.length ||
      pinned.plan.cases.some(
        (test) =>
          tests.cases.includes(test.id) &&
          (test.owner !== 'machine' || rootIntegrationCaseOwner(test) === 'unsupported'),
      )
    )
      throw new DeliveryRunnerError('product-environment-candidate-binding')
    const provision: EnvironmentProvisionRequest = this.provision(
        input,
        context.invocation,
        candidate.candidate,
      ),
      binding: ProductBinding = {
        version: 1,
        request: original.digest,
        plan: record.basis,
        stage: record.id,
        invocation: context.invocation,
        deadline: context.deadline,
        input,
        ready: ready.evidence,
        provision,
      }
    current()
    if (prior && contractDigest(prior) !== contractDigest(binding))
      throw new DeliveryRunnerError('product-environment-original-inputs-changed')
    if (!prior)
      this.store.files.locked(() => {
        current()
        if (existsSync(this.store.files.path(`${base}/consumed`)))
          throw new DeliveryRunnerError('product-environment-original-unresolved')
        safeSourceText(JSON.stringify(binding), 65536)
        this.store.files.atomic(`${base}/consumed`, `${contractDigest(binding)}\n`)
        this.store.files.atomic(`${base}/binding.json`, `${JSON.stringify(binding)}\n`)
      })
    const produced = await this.producer.prepare(context, provision, this.driver)
    current()
    if (produced.status !== 'recorded-ready' || !produced.environment)
      throw new DeliveryRunnerError('product-environment-original-ready-unavailable')
    // Provisioning deliberately leaves the run waiting for its effect. Only
    // this positively observed original result can release that boundary for
    // QA; check ownership inside the transaction so a pause cannot be undone.
    this.store.lifecycle.journal.transaction(
      { kind: 'controller', name: 'delivery-runner-product' },
      (view, append) => {
        current()
        const state = view().get(context.request.run),
          authority = this.store.lifecycle.authority.inspect(context.request.grant)
        if (authority.status !== 'active' || authority.digest !== state?.grant?.digest)
          throw new DeliveryRunnerError('product-environment-inactive-authority')
        if (state?.state === 'waiting-external')
          append(context.request.run, {
            schema: 'wholeloop/delivery-control-event@1',
            from: state.state,
            to: 'queued',
            basis: record.basis,
            reason: 'The exact original product preparation is observed ready before its root QA.',
          })
      },
    )
    current()
    return {
      schema: 'wholeloop/integration-verification-request@1',
      candidate: input.candidate,
      assembly: input.assembly,
      environment: produced.environment.id,
    }
  }
  /** Historical selection never consults new configuration or executes preparation. */
  inspect(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    try {
      const binding = this.read(request, record),
        produced = binding && this.producer.inspect(record.invocation),
        scope = new RunnerEnvironmentScope(this.store, record.invocation, this.producer.phase),
        origin = binding && scope.origin()
      if (
        !binding ||
        produced?.status !== 'recorded-ready' ||
        !produced.environment ||
        origin?.deadline !== binding.deadline ||
        origin.request !== binding.request ||
        origin.plan !== binding.plan ||
        origin.stage !== binding.stage ||
        contractDigest(binding.provision) !== contractDigest(scope.originalPreparation()?.input)
      )
        return undefined
      return {
        selection: {
          schema: 'wholeloop/integration-verification-request@1' as const,
          candidate: binding.input.candidate,
          assembly: binding.input.assembly,
          environment: produced.environment.id,
        },
        evidence: contractDigest({ binding, produced }),
        readiness: 'historical-only' as const,
        acceptance: 'not-established' as const,
      }
    } catch {
      return undefined
    }
  }
}
