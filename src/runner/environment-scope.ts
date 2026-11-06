import { existsSync, readdirSync } from 'node:fs'
import {
  type RepositoryDiffReader,
  repositoryDiffArguments,
} from '../acceptance/repository-diff.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import {
  type DockerCallOptions,
  DockerCli,
  type DockerTransport,
} from '../environment/docker-command.js'
import { EnvironmentOperations } from '../environment/operations.js'
import { DeliveryEnvironments, type EnvironmentProvisionRequest } from '../environment/provision.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { withWorkerOwnership } from '../fanout/ownership.js'
import { assemblyGitEnvironment } from '../integration/git-process.js'
import type { RunnerStageContext } from './engine.js'
import {
  boundEnvironmentOperations,
  selectEnvironmentObservations,
} from './environment-bindings.js'
import {
  captureEnvironmentPreparation,
  type EnvironmentPreparation,
  validateEnvironmentPreparation,
} from './environment-preparation.js'
import { ManagedRunnerProcess } from './native-process.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerStore } from './store.js'

interface EnvironmentStageBinding {
  version: 1 | 2 | 3
  phase?: string
  preparation?: EnvironmentPreparation
  request: string
  plan: string
  stage: string
  invocation: string
  deadline: string
  environment: string
  identity: string
  provenance: DockerTransport['provenance']
  operations: { id: string; nonce: string; command: string }[]
  reads: string[]
}

/** Join existing Docker operation owners, never infer application success from client closure. */
/** Read-only Docker queries an environment stage may issue without an owned operation. */
function inertRead(args: readonly string[], preparation: boolean) {
  return (
    args.length >= 1 &&
    (['info', 'version'].includes(args[0] ?? '') ||
      (preparation && args[0] === 'context' && args[1] === 'inspect') ||
      (['container', 'image', 'network', 'volume'].includes(args[0] ?? '') &&
        args[1] === 'inspect') ||
      (args[0] === 'container' && ['logs', 'wait'].includes(args[1] ?? '')))
  )
}
export class RunnerEnvironmentScope {
  constructor(
    readonly store: RunnerStore,
    readonly invocation: string,
    readonly phase?: string,
  ) {
    if (
      !/^[a-f0-9]{64}$/.test(invocation) ||
      (phase !== undefined && !/^[a-f0-9]{64}$/.test(phase))
    )
      throw new DeliveryRunnerError('environment-stage-invocation')
  }
  private get path() {
    return this.phase
      ? `delivery/runner-environments/${this.invocation}/${this.phase}.json`
      : `delivery/runner-environments/${this.invocation}.json`
  }
  private identity(environment: string, preparation?: EnvironmentPreparation) {
    // Only an intact original preparation can precede the resource record.
    // A present but damaged history must never fall back to this expectation.
    const record =
      preparation && !existsSync(this.store.files.path(`delivery/environments/${environment}`))
        ? preparation.expected
        : new EnvironmentResources(this.store.files).get(environment).record
    if (
      preparation &&
      (record.key !== preparation.input.key || record.helperImage !== preparation.input.helperImage)
    )
      throw new DeliveryRunnerError('environment-preparation-original-binding')
    return {
      record,
      digest: contractDigest({
        id: record.id,
        run: record.run,
        basis: record.basis,
        grant: record.grant,
        grantDigest: record.grantDigest,
        recipe: record.recipe,
        candidates: record.candidates,
      }),
    }
  }
  private read() {
    if (!existsSync(this.store.files.path(this.path))) return undefined
    const binding = JSON.parse(
      readSourceFile(this.store.files.root, this.path, 256 * 1024),
    ) as EnvironmentStageBinding
    if (
      Object.keys(binding).sort().join(',') !==
        (binding.version === 3 && this.phase
          ? 'deadline,environment,identity,invocation,operations,phase,plan,preparation,provenance,reads,request,stage,version'
          : this.phase
            ? 'deadline,environment,identity,invocation,operations,phase,plan,provenance,reads,request,stage,version'
            : 'deadline,environment,identity,invocation,operations,plan,provenance,reads,request,stage,version') ||
      binding.version !== (binding.preparation && this.phase ? 3 : this.phase ? 2 : 1) ||
      binding.phase !== this.phase ||
      binding.invocation !== this.invocation ||
      !Array.isArray(binding.operations) ||
      !Array.isArray(binding.reads) ||
      binding.operations.length + binding.reads.length > 1000 ||
      binding.reads.some((id) => !/^[a-f0-9]{64}$/.test(id)) ||
      new Set(binding.reads).size !== binding.reads.length ||
      new Set(binding.operations.map((o) => o.id)).size !== binding.operations.length ||
      !Number.isFinite(Date.parse(binding.deadline)) ||
      new Date(binding.deadline).toISOString() !== binding.deadline
    )
      throw new DeliveryRunnerError('environment-stage-private-binding')
    if (binding.preparation) {
      validateEnvironmentPreparation(binding.preparation)
      if (
        !existsSync(this.store.files.path(`${this.path}.consumed`)) ||
        readSourceFile(this.store.files.root, `${this.path}.consumed`, 128).trim() !==
          contractDigest({ ...binding, operations: [], reads: [] })
      )
        throw new DeliveryRunnerError('environment-preparation-original-binding')
    }
    const request = this.store.get(binding.request),
      stage = this.store
        .record(binding.request)
        .stages.find((s) => s.id === binding.stage && s.invocation === binding.invocation),
      environment = this.identity(binding.environment, binding.preparation),
      authority = this.store.lifecycle.authority.inspect(request.grant)
    if (
      !stage ||
      stage.basis !== binding.plan ||
      environment.digest !== binding.identity ||
      environment.record.run !== request.run ||
      environment.record.basis !== binding.plan ||
      environment.record.grant !== request.grant ||
      environment.record.grantDigest !== authority.digest ||
      environment.record.provenance !== binding.provenance
    )
      throw new DeliveryRunnerError('environment-stage-original-binding')
    if (
      binding.preparation &&
      (binding.preparation.expected.id !== binding.environment ||
        binding.identity !==
          contractDigest({
            id: binding.preparation.expected.id,
            run: binding.preparation.expected.run,
            basis: binding.preparation.expected.basis,
            grant: binding.preparation.expected.grant,
            grantDigest: binding.preparation.expected.grantDigest,
            recipe: binding.preparation.expected.recipe,
            candidates: binding.preparation.expected.candidates,
          }))
    )
      throw new DeliveryRunnerError('environment-preparation-original-binding')
    const operations = new EnvironmentOperations(
        this.store.files,
        binding.environment,
        binding.provenance,
      ),
      listed = operations.list(),
      retained = boundEnvironmentOperations(binding.operations, listed, binding.provenance)
    for (const original of retained) {
      const claim = JSON.parse(
        readSourceFile(
          this.store.files.root,
          `delivery/runner-environment-claims/${original.id}.json`,
          65536,
        ),
      )
      if (
        contractDigest(claim) !==
        contractDigest({
          invocation: this.invocation,
          ...(this.phase ? { phase: this.phase } : {}),
          environment: binding.environment,
          operation: original,
        })
      )
        throw new DeliveryRunnerError('environment-stage-operation-claim')
    }
    return { binding, operations, listed }
  }
  async run<T>(
    context: RunnerStageContext,
    environment: string,
    driver: DockerTransport,
    operation: (driver: DockerTransport, repositoryRead: RepositoryDiffReader) => Promise<T>,
  ): Promise<T> {
    return this.runOwned(context, environment, driver, operation)
  }
  /** Provision under a distinct original phase, then retain its owners for recovery. */
  async provision(
    inputContext: RunnerStageContext,
    input: EnvironmentProvisionRequest,
    driver: DockerTransport = new DockerCli(),
  ) {
    if (!this.phase) throw new DeliveryRunnerError('environment-preparation-phase-required')
    if (inputContext.invocation !== this.invocation)
      throw new DeliveryRunnerError('environment-preparation-invocation')
    const context = Object.freeze({
        ...inputContext,
        request: structuredClone(inputContext.request),
        plan: structuredClone(inputContext.plan),
        stage: structuredClone(inputContext.stage),
        current: inputContext.current.bind(inputContext),
        started: inputContext.started.bind(inputContext),
      }),
      preparation = captureEnvironmentPreparation(this.store, context, input, driver.provenance)
    if (existsSync(this.store.files.path(`delivery/environments/${preparation.expected.id}`)))
      throw new DeliveryRunnerError('environment-preparation-already-exists')
    return this.runOwned(
      context,
      preparation.expected.id,
      driver,
      (owned) =>
        new DeliveryEnvironments(this.store.files.root, owned, undefined, undefined, {
          deadline: context.deadline,
          signal: context.signal,
          current: context.current,
          requireNewResource: true,
        }).provision(preparation.input),
      preparation,
    )
  }
  private async runOwned<T>(
    context: RunnerStageContext,
    environment: string,
    driver: DockerTransport,
    operation: (driver: DockerTransport, repositoryRead: RepositoryDiffReader) => Promise<T>,
    preparation?: EnvironmentPreparation,
  ): Promise<T> {
    const request = contractDigest(context.request),
      actual = this.store.get(request),
      record = this.store.stage(request, context.stage.id),
      basis = this.store.basis(actual),
      selected = this.identity(environment, preparation),
      stage = runnerRoute(basis.plan).find((s) => s.id === context.stage.id),
      authority = this.store.lifecycle.authority.inspect(actual.grant)
    if (
      !record ||
      record.invocation !== this.invocation ||
      context.invocation !== this.invocation ||
      record.basis !== basis.digest ||
      !['prepared', 'running'].includes(record.status) ||
      contractDigest(context.plan) !== basis.digest ||
      contractDigest(stage ?? null) !== contractDigest(context.stage) ||
      !['verification', 'integration', 'acceptance'].includes(context.stage.kind) ||
      context.signal.aborted ||
      !context.current() ||
      Date.parse(context.deadline) <= Date.now() ||
      !Number.isFinite(Date.parse(context.deadline)) ||
      new Date(context.deadline).toISOString() !== context.deadline ||
      selected.record.run !== actual.run ||
      selected.record.basis !== basis.digest ||
      selected.record.grant !== actual.grant ||
      selected.record.grantDigest !== authority.digest ||
      selected.record.provenance !== driver.provenance
    )
      throw new DeliveryRunnerError('environment-stage-not-current')
    const binding: EnvironmentStageBinding = {
      version: preparation ? 3 : this.phase ? 2 : 1,
      ...(this.phase ? { phase: this.phase } : {}),
      ...(preparation ? { preparation } : {}),
      request,
      plan: basis.digest,
      stage: context.stage.id,
      invocation: this.invocation,
      deadline: context.deadline,
      environment,
      identity: selected.digest,
      provenance: driver.provenance,
      operations: [],
      reads: [],
    }
    this.store.files.locked(() => {
      if (
        existsSync(this.store.files.path(`${this.path}.consumed`)) ||
        existsSync(this.store.files.path(this.path))
      )
        throw new DeliveryRunnerError('environment-stage-original-unresolved')
      // Consume before publishing the locator: losing it must never buy another effect.
      this.store.files.atomic(`${this.path}.consumed`, `${contractDigest(binding)}\n`)
      this.store.files.atomic(this.path, `${JSON.stringify(binding)}\n`)
    })
    let open = true,
      registered = record.runtime !== undefined
    const registerRoot = (worker: string) => {
      if (!registered) {
        context.started({ backend: 'owned-docker', instance: this.invocation, worker })
        registered = true
      }
    }
    const admit = (args: string[], options: DockerCallOptions = {}) => {
      const remaining = Date.parse(context.deadline) - Date.now()
      if (
        !open ||
        context.signal.aborted ||
        options.signal?.aborted ||
        !context.current() ||
        remaining <= 0
      )
        throw new DeliveryRunnerError('environment-stage-fenced')
      safeSourceText(JSON.stringify(args), 65536)
      const registration = options.registration
      // An allowed inert read publishes its locator under the writer lock after
      // reading this same complete binding again (ADR-0244). Reading it here too
      // repeated every guarded access in the same synchronous span; that later
      // read keeps its errors and maps an unresolved binding to the same refusal.
      if (!registration && inertRead(args, !!preparation)) return { allowance: remaining }
      const current = this.read()
      if (!current) throw new DeliveryRunnerError('environment-stage-original-unresolved')
      let allowance = remaining
      if (registration) {
        // This read just listed and validated every operation; select from that list.
        const original = current.listed.find((o) => o.id === registration.operation),
          directory = `delivery/environment-operations/${environment}/${registration.operation}`
        if (
          !original ||
          original.nonce !== registration.nonce ||
          original.command !== contractDigest(args) ||
          original.provenance !== driver.provenance ||
          registration.cancel !== this.store.files.path(`${directory}/cancel.json`) ||
          registration.outcome !== this.store.files.path(`${directory}/outcome.json`)
        )
          throw new DeliveryRunnerError('environment-stage-operation-binding')
        allowance = Math.min(allowance, original.timeoutMs)
        this.store.files.locked(() => {
          const retained = this.read()
          if (
            !retained ||
            retained.binding.operations.length + retained.binding.reads.length >= 1000 ||
            retained.binding.operations.some((o) => o.id === original.id)
          )
            throw new DeliveryRunnerError('environment-stage-operation-already-issued')
          const claim = `delivery/runner-environment-claims/${original.id}.json`
          if (
            existsSync(this.store.files.path(claim)) ||
            ['started', 'outcome', 'client-close', 'cancel'].some((name) =>
              existsSync(this.store.files.path(`${directory}/${name}.json`)),
            )
          )
            throw new DeliveryRunnerError('environment-stage-operation-already-issued')
          this.store.files.atomic(
            claim,
            `${JSON.stringify({ invocation: this.invocation, ...(this.phase ? { phase: this.phase } : {}), environment, operation: original })}\n`,
          )
          retained.binding.operations.push({
            id: original.id,
            nonce: original.nonce,
            command: original.command,
          })
          this.store.files.atomic(this.path, `${JSON.stringify(retained.binding)}\n`)
        })
      } else throw new DeliveryRunnerError('environment-stage-unregistered-operation')

      return {
        allowance,
        registration: registration
          ? {
              ...registration,
              started: (pid: number) => {
                if (
                  !open ||
                  context.signal.aborted ||
                  options.signal?.aborted ||
                  !context.current() ||
                  Date.now() >= Date.parse(context.deadline)
                )
                  throw new DeliveryRunnerError('environment-stage-fenced')
                registration.started(pid)
                const started = JSON.parse(
                  readSourceFile(
                    this.store.files.root,
                    `delivery/environment-operations/${environment}/${registration.operation}/started.json`,
                    65536,
                  ),
                )
                if (
                  started.pid !== pid ||
                  started.nonce !== registration.nonce ||
                  started.operation !== registration.operation
                )
                  throw new DeliveryRunnerError('environment-stage-operation-start')
                registerRoot(registration.operation)
              },
            }
          : undefined,
      }
    }
    const wrapped: DockerTransport = {
      provenance: driver.provenance,
      ...(driver instanceof DockerCli
        ? {
            interactive: {
              native: driver,
              register: (
                args: string[],
                registration: NonNullable<DockerCallOptions['registration']>,
              ) => {
                if (args[0] !== 'container' || args[1] !== 'exec' || args[2] !== '--interactive')
                  throw new DeliveryRunnerError('environment-stage-interactive-command')
                const owned = admit(args, { registration }).registration
                if (!owned) throw new DeliveryRunnerError('environment-stage-operation-binding')
                return owned
              },
            },
          }
        : {}),
      call: async (args, options: DockerCallOptions = {}) => {
        const { allowance, registration } = admit(args, options)
        const abort = new AbortController(),
          cancel = () => abort.abort(),
          signals = [context.signal, ...(options.signal ? [options.signal] : [])]
        for (const signal of signals) {
          signal.addEventListener('abort', cancel, { once: true })
          if (signal.aborted) cancel()
        }
        try {
          const optionsForDriver: DockerCallOptions = {
            ...options,
            signal: abort.signal,
            timeoutMs: Math.max(1, Math.min(options.timeoutMs ?? 10000, allowance)),
            ...(registration ? { registration } : {}),
          }
          // Effect wrappers keep their actual PID. Nesting another wrapper
          // would break their original started/outcome identity. Inert reads
          // have no environment operation and need a separate native owner.
          if (registration) return await driver.call(args, optionsForDriver)
          // An inert query answered in-process starts no process, so it has no
          // owner to register or recover (ADR-0244); any other outcome takes
          // the original owned read path below with its original semantics.
          if (driver.query && options.input === undefined && !options.observe && !options.process) {
            const served = await driver.query(args, {
              signal: abort.signal,
              timeoutMs: optionsForDriver.timeoutMs ?? 10000,
              ...(options.outputBytes !== undefined ? { outputBytes: options.outputBytes } : {}),
            })
            if (served) return served
          }
          let reader: ManagedRunnerProcess | undefined
          this.store.files.locked(() => {
            const retained = this.read()
            if (!retained) throw new DeliveryRunnerError('environment-stage-original-unresolved')
            if (retained.binding.operations.length + retained.binding.reads.length >= 1000)
              throw new DeliveryRunnerError('environment-stage-read-capacity')
            const invocation = contractDigest({
              stage: this.invocation,
              ...(this.phase ? { phase: this.phase } : {}),
              read: retained.binding.reads.length,
              args,
            })
            retained.binding.reads.push(invocation)
            this.store.files.atomic(this.path, `${JSON.stringify(retained.binding)}\n`)
            reader = new ManagedRunnerProcess(this.store.files, invocation)
          })
          let dispatched = false
          return await withWorkerOwnership(
            async (command, argv, native) => {
              if (
                !reader ||
                dispatched ||
                !open ||
                abort.signal.aborted ||
                !context.current() ||
                Date.now() >= Date.parse(context.deadline)
              )
                throw new DeliveryRunnerError('environment-stage-read-already-issued')
              dispatched = true
              return reader.invoke(command, argv, native.input, {
                ...native,
                timeoutMs: Math.max(
                  1,
                  Math.min(native.timeoutMs, Date.parse(context.deadline) - Date.now()),
                ),
                current: () =>
                  open &&
                  !abort.signal.aborted &&
                  context.current() &&
                  Date.now() < Date.parse(context.deadline),
                started: (pid) => {
                  registerRoot(`pid-${pid}`)
                  native.started?.(pid)
                },
              })
            },
            () => driver.call(args, optionsForDriver),
          )
        } finally {
          for (const signal of signals) signal.removeEventListener('abort', cancel)
        }
      },
    }
    const repositoryRead: RepositoryDiffReader = async (repository, read, input) => {
      const retained = this.read(),
        candidate = selected.record.candidates.find((c) => c.repository === repository),
        declared = basis.plan.repositories.find((r) => r.id === repository),
        current = () => {
          const grant = this.store.lifecycle.authority.inspect(actual.grant)
          return (
            open &&
            !context.signal.aborted &&
            !input.signal.aborted &&
            context.current() &&
            Date.now() < Math.min(Date.parse(context.deadline), Date.parse(input.deadline)) &&
            grant.status === 'active' &&
            grant.digest === authority.digest &&
            grant.grant.effects.includes('source.read') &&
            grant.grant.repositories.some((r) => r.repository === repository)
          )
        }
      if (
        !retained ||
        !candidate ||
        !declared ||
        !Number.isFinite(Date.parse(input.deadline)) ||
        !current()
      )
        throw new DeliveryRunnerError('environment-repository-read-unavailable')
      const args = repositoryDiffArguments(read, declared.base, candidate.head)
      let invocation = ''
      this.store.files.locked(() => {
        const original = this.read()
        if (
          !original ||
          original.binding.operations.length + original.binding.reads.length >= 1000 ||
          !current()
        )
          throw new DeliveryRunnerError('environment-stage-read-capacity')
        invocation = contractDigest({
          stage: this.invocation,
          ...(this.phase ? { phase: this.phase } : {}),
          read: original.binding.reads.length,
          kind: 'repository.diff',
          repository,
          operation: read,
          case: input.invocation,
        })
        original.binding.reads.push(invocation)
        this.store.files.atomic(this.path, `${JSON.stringify(original.binding)}\n`)
      })
      const manager = new ManagedRunnerProcess(this.store.files, invocation),
        abort = new AbortController(),
        cancel = () => abort.abort()
      for (const signal of [context.signal, input.signal])
        signal.addEventListener('abort', cancel, { once: true })
      try {
        if (context.signal.aborted || input.signal.aborted) abort.abort()
        const result = await manager.invoke('git', args, '', {
          cwd: candidate.path,
          env: { ...assemblyGitEnvironment(this.store.files.root), GIT_NO_REPLACE_OBJECTS: '1' },
          timeoutMs: Math.max(
            1,
            Math.min(
              5000,
              Date.parse(context.deadline) - Date.now(),
              Date.parse(input.deadline) - Date.now(),
            ),
          ),
          signal: abort.signal,
          current,
          started: (pid) => registerRoot(`pid-${pid}`),
        })
        if (!current()) throw new DeliveryRunnerError('environment-stage-fenced')
        return {
          ...result,
          binding: {
            repository,
            path: candidate.path,
            base: declared.base,
            head: candidate.head,
            snapshot: candidate.snapshot,
          },
        }
      } finally {
        for (const signal of [context.signal, input.signal])
          signal.removeEventListener('abort', cancel)
      }
    }
    try {
      return await operation(wrapped, repositoryRead)
    } finally {
      open = false
    }
  }
  /** Return captured inputs without rereading mutable worktrees or granting another execution. */
  originalPreparation() {
    return structuredClone(this.read()?.binding.preparation)
  }
  /** Expose original control bindings without changing existing observation digests. */
  origin() {
    const retained = this.read()
    if (!retained) return undefined
    const { request, plan, stage, invocation, deadline, environment, identity, provenance } =
      retained.binding
    return { request, plan, stage, invocation, deadline, environment, identity, provenance }
  }
  inspect() {
    const retained = this.read()
    if (!retained)
      return {
        invocationState: 'unknown' as const,
        evidence: contractDigest({ invocation: this.invocation, missing: true }),
        operations: [],
        reads: [],
        provenance: 'fixture' as const,
      }
    const observed = retained.operations.inspect(),
      operations = selectEnvironmentObservations(retained.binding.operations, observed),
      // One common process-table observation avoids a subprocess per retained read.
      // The existing batch reader preserves exact nonces and fails closed as a group.
      reads = ManagedRunnerProcess.observeAll(this.store.files, retained.binding.reads),
      closed =
        operations.every((o) => o && ['stopped', 'not-started'].includes(o.status)) &&
        reads.every((r) => ['stopped', 'not-started'].includes(r.invocationState))
    return {
      invocationState:
        closed && operations.length + reads.length ? ('stopped' as const) : ('unknown' as const),
      evidence: contractDigest({ binding: retained.binding, operations, reads }),
      operations,
      reads,
      provenance: retained.binding.provenance,
    }
  }
  /** Cancellation covers all persisted owners; it grants no aggregate QA verdict. */
  cancelAll() {
    if (this.phase) throw new DeliveryRunnerError('environment-stage-root-scope-required')
    const scopes: RunnerEnvironmentScope[] = [],
      errors: unknown[] = [],
      directory = this.store.files.path(`delivery/runner-environments/${this.invocation}`)
    if (
      existsSync(this.store.files.path(this.path)) ||
      existsSync(this.store.files.path(`${this.path}.consumed`))
    )
      scopes.push(this)
    if (existsSync(directory)) {
      const names = readdirSync(directory).sort(),
        phases = new Set<string>()
      if (names.length > 2000) errors.push('capacity')
      for (const name of names.slice(0, 2000)) {
        const match = /^([a-f0-9]{64})\.json(?:\.consumed)?$/.exec(name)
        if (!match?.[1]) {
          errors.push('entry')
          continue
        }
        phases.add(match[1])
      }
      for (const phase of [...phases].sort())
        scopes.push(new RunnerEnvironmentScope(this.store, this.invocation, phase))
    }
    if (!scopes.length) throw new DeliveryRunnerError('environment-stage-original-unresolved')
    // A lost locator must not prevent cancellation of other known private owners.
    for (const scope of scopes) {
      try {
        scope.cancel()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) throw new DeliveryRunnerError('environment-stage-cancellation-unresolved')
  }
  cancel() {
    const retained = this.read()
    if (!retained) throw new DeliveryRunnerError('environment-stage-original-unresolved')
    for (const operation of retained.binding.operations) {
      const directory = `delivery/environment-operations/${retained.binding.environment}/${operation.id}`
      retained.operations.cancel({
        operation: operation.id,
        nonce: operation.nonce,
        cancel: this.store.files.path(`${directory}/cancel.json`),
        outcome: this.store.files.path(`${directory}/outcome.json`),
        started: () => {
          throw new DeliveryRunnerError('environment-inspection-cannot-start')
        },
      })
    }
    for (const read of retained.binding.reads)
      new ManagedRunnerProcess(this.store.files, read).requestCancellation()
  }
}
