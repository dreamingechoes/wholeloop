import { existsSync } from 'node:fs'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { DeliveryPlan } from '../delivery/plan.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import type { EnvironmentProvisionRequest } from '../environment/provision.js'
import { EnvironmentRecipes } from '../environment/recipe-store.js'
import { type AssemblyRequest, IntegrationAssembly } from '../integration/assembly.js'
import {
  type IntegrationInput,
  type IntegrationRequest,
  integrationRequest,
  integrationScope,
} from '../integration/contracts.js'
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
/** Static milestone inputs; the owned assembly, its recipe and candidate are derived. */
export interface RunnerProductProduction {
  helperImage: string
  recipe: string
  inputs: IntegrationInput[]
  repairOwners: IntegrationRequest['repairOwners']
}
interface ProductionBinding {
  version: 1
  request: string
  plan: string
  stage: string
  invocation: string
  deadline: string
  input: RunnerProductProduction
  units: string
  assembly: AssemblyRequest
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
  private readonly selections: ReadonlyMap<string, RunnerProductInput | RunnerProductProduction>
  readonly producer: RunnerEnvironmentProducer
  constructor(
    readonly store: RunnerStore,
    readonly readiness: RunnerAssemblyReadiness,
    inputs: ReadonlyMap<string, RunnerProductInput | RunnerProductProduction>,
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
        if ('recipe' in input) this.production(input)
        else this.validate(input)
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
  /** Configuration coverage only; actual selection still validates current inputs. */
  configured(milestone: string) {
    return this.selections.has(milestone)
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
  private production(input: RunnerProductProduction) {
    const id = /^[a-z][a-z0-9_-]{0,63}$/
    if (
      Object.keys(input).sort().join(',') !== 'helperImage,inputs,recipe,repairOwners' ||
      !/^[a-f0-9]{64}$/.test(input.recipe) ||
      input.helperImage.length > 512 ||
      !/^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(input.helperImage) ||
      !Array.isArray(input.inputs) ||
      !input.inputs.length ||
      input.inputs.length > 255 ||
      // The derived recipe owns this identifier; static inputs cannot replace it.
      input.inputs.some(
        (entry) =>
          !id.test(entry?.id ?? '') ||
          entry.id === 'recipe' ||
          !['acceptance', 'data', 'gate-policy'].includes(entry.kind) ||
          !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '') ||
          !Array.isArray(entry.after),
      ) ||
      input.inputs.filter((entry) => entry.kind === 'acceptance').length !== 1 ||
      !Array.isArray(input.repairOwners) ||
      input.repairOwners.length > 256
    )
      throw new DeliveryRunnerError('product-environment-production-input')
    safeSourceText(JSON.stringify(input), 65536)
  }
  private path(invocation: string) {
    if (!/^[a-f0-9]{64}$/.test(invocation))
      throw new DeliveryRunnerError('product-environment-invocation')
    return `delivery/runner-products/${invocation}`
  }
  private candidateRequest(
    plan: DeliveryPlan,
    input: RunnerProductProduction,
    request: AssemblyRequest,
    assemblies: IntegrationRequest['assemblies'],
    recipe: string,
  ): IntegrationRequest {
    return {
      schema: 'wholeloop/integration-candidate-request@1',
      run: request.run,
      revision: request.revision,
      plan: request.plan,
      milestone: request.milestone,
      strategy: 'ordered-merge',
      parts: structuredClone(request.parts),
      assemblies,
      contracts: integrationScope(plan, request.milestone).contracts,
      inputs: [
        ...structuredClone(input.inputs),
        { id: 'recipe', kind: 'recipe', ref: recipe, sha256: recipe, after: [] },
      ],
      repairOwners: structuredClone(input.repairOwners),
    }
  }
  private readProduction(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    const base = this.path(record.invocation)
    if (!existsSync(this.store.files.path(`${base}/production.json`))) return undefined
    const binding = JSON.parse(
        readSourceFile(this.store.files.root, `${base}/production.json`, 65536),
      ) as ProductionBinding,
      original = this.original(request, record)
    this.production(binding.input)
    if (
      Object.keys(binding).sort().join(',') !==
        'assembly,deadline,input,invocation,plan,request,stage,units,version' ||
      binding.version !== 1 ||
      binding.request !== original.digest ||
      binding.plan !== record.basis ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline ||
      !/^[a-f0-9]{64}$/.test(binding.units) ||
      binding.assembly.run !== request.run ||
      binding.assembly.plan !== record.basis ||
      binding.assembly.milestone !== original.milestone ||
      binding.assembly.key !== `runner-${record.invocation.slice(0, 25)}` ||
      readSourceFile(this.store.files.root, `${base}/production.consumed`, 128).trim() !==
        contractDigest(binding)
    )
      throw new DeliveryRunnerError('product-environment-original-production')
    return binding
  }
  private produced(invocation: string) {
    return readSourceFile(
      this.store.files.root,
      `${this.path(invocation)}/production-assembly`,
      128,
    ).trim()
  }
  /** Assemble the current unit vector once, then derive its recipe and candidate as metadata. */
  private async produce(
    context: RunnerStageContext,
    record: Readonly<RunnerStageRecord>,
    original: ReturnType<RunnerProductEnvironments['original']>,
    input: RunnerProductProduction,
    current: () => void,
  ): Promise<RunnerProductInput> {
    const base = this.path(context.invocation),
      prior = this.readProduction(context.request, record),
      plan = original.basis.plan
    if (
      prior &&
      (contractDigest(prior.input) !== contractDigest(input) || prior.deadline !== context.deadline)
    )
      throw new DeliveryRunnerError('product-environment-input-conflict')
    if (!prior && existsSync(this.store.files.path(`${base}/production.consumed`)))
      throw new DeliveryRunnerError('product-environment-original-unresolved')
    const recipes = new EnvironmentRecipes(this.store.files.root),
      template = recipes.get(input.recipe).recipe
    if (
      contractDigest(template.repositories.map((entry) => entry.id).sort()) !==
      contractDigest([...integrationScope(plan, original.milestone).repositories].sort())
    )
      throw new DeliveryRunnerError('product-environment-recipe-repositories')
    let request = prior?.assembly
    if (!request) {
      const units = await this.readiness.units.inspect(context.request, original.milestone)
      current()
      if (units.status !== 'ready' || units.provenance !== 'host-observed' || !units.parts)
        throw new DeliveryRunnerError('product-environment-current-units-required')
      request = {
        schema: 'wholeloop/integration-assembly-request@1',
        run: context.request.run,
        revision: plan.revision,
        plan: record.basis,
        milestone: original.milestone,
        key: `runner-${context.invocation.slice(0, 25)}`,
        parts: units.parts,
      }
      const binding: ProductionBinding = {
        version: 1,
        request: original.digest,
        plan: record.basis,
        stage: record.id,
        invocation: context.invocation,
        deadline: context.deadline,
        input: structuredClone(input),
        units: units.evidence,
        assembly: request,
      }
      safeSourceText(JSON.stringify(binding), 65536)
      this.store.files.locked(() => {
        current()
        if (existsSync(this.store.files.path(`${base}/production.consumed`)))
          throw new DeliveryRunnerError('product-environment-original-unresolved')
        // Consume before publishing the locator: losing it must never buy another assembly.
        this.store.files.atomic(`${base}/production.consumed`, `${contractDigest(binding)}\n`)
        this.store.files.atomic(`${base}/production.json`, `${JSON.stringify(binding)}\n`)
      })
    }
    let registered = this.store.stage(original.digest, record.id)?.runtime !== undefined
    const assembly = new IntegrationAssembly(this.store.files.root, undefined, {
        deadline: context.deadline,
        signal: context.signal,
        current: context.current,
        started: ({ operation, pid }) => {
          if (registered) return
          context.started({
            backend: 'owned-assembly-git',
            instance: operation,
            worker: String(pid),
          })
          registered = true
        },
      }),
      prepared = assembly.prepare(request),
      provisional = prepared.assembly.repositories.map((repository) => ({
        repository: repository.repository,
        path: repository.path,
        ref: `refs/heads/${repository.branch}`,
        base: repository.base,
        head: repository.base,
      }))
    current()
    if (prior) {
      if (this.produced(context.invocation) !== prepared.digest)
        throw new DeliveryRunnerError('product-environment-original-production')
    } else this.store.files.atomic(`${base}/production-assembly`, `${prepared.digest}\n`)
    // Refuse structurally invalid static inputs before the first Git effect.
    integrationRequest(
      this.candidateRequest(plan, input, prepared.assembly.request, provisional, input.recipe),
      plan,
      record.basis,
    )
    // A retained binding observes its original assembly; it never issues Git again.
    const observed = prior
      ? assembly.inspect(prepared.digest)
      : await assembly.execute(prepared.digest)
    current()
    if (observed.status !== 'assembled')
      throw new DeliveryRunnerError(
        prior
          ? 'product-environment-original-assembly-unresolved'
          : 'product-environment-assembly-unavailable',
      )
    const assemblies = observed.repositories.map((repository) => {
        const declared = plan.repositories.find((entry) => entry.id === repository.repository)
        if (!repository.head || !declared)
          throw new DeliveryRunnerError('product-environment-assembly-head-required')
        return {
          repository: repository.repository,
          path: repository.path,
          ref: repository.ref,
          base: declared.base,
          head: repository.head,
        }
      }),
      recipe = structuredClone(template)
    recipe.repositories = recipe.repositories.map((entry) => ({
      ...entry,
      root: assemblies.find((repository) => repository.repository === entry.id)?.path ?? '',
    }))
    const derived = recipes.prepare(recipe)
    current()
    const candidate = new IntegrationCandidates(this.store.files.root).prepare(
      this.candidateRequest(plan, input, prepared.assembly.request, assemblies, derived.digest),
    )
    current()
    return {
      candidate: candidate.digest,
      assembly: prepared.digest,
      helperImage: input.helperImage,
    }
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
    const production = this.readProduction(request, record)
    if (
      production &&
      (this.produced(record.invocation) !== binding.input.assembly ||
        assembly.assembly.request.key !== production.assembly.key ||
        binding.input.helperImage !== production.input.helperImage)
    )
      throw new DeliveryRunnerError('product-environment-original-production')
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
    const configured = this.selections.get(original.milestone)
    if (!configured) throw new DeliveryRunnerError('product-environment-selection-required')
    const base = this.path(context.invocation),
      prior = this.read(context.request, record)
    if (
      prior &&
      (('recipe' in configured
        ? !existsSync(this.store.files.path(`${base}/production.json`))
        : contractDigest(prior.input) !== contractDigest(configured)) ||
        prior.deadline !== context.deadline)
    )
      throw new DeliveryRunnerError('product-environment-input-conflict')
    if (!prior && existsSync(this.store.files.path(`${base}/consumed`)))
      throw new DeliveryRunnerError('product-environment-original-unresolved')
    const input =
      'recipe' in configured
        ? await this.produce(context, record, original, configured, current)
        : configured
    if (prior && contractDigest(prior.input) !== contractDigest(input))
      throw new DeliveryRunnerError('product-environment-input-conflict')
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
  /** Cancellation reads only the original production locator, including after revocation. */
  stop(request: Readonly<RunnerRequest>, record: Readonly<RunnerStageRecord>) {
    if (
      this.readProduction(request, record) &&
      existsSync(this.store.files.path(`${this.path(record.invocation)}/production-assembly`))
    )
      new IntegrationAssembly(this.store.files.root).requestCancellation(
        this.produced(record.invocation),
      )
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
