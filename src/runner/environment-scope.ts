import { existsSync, readdirSync } from 'node:fs'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile, safeSourceText } from '../delivery/input.js'
import type { DockerCallOptions, DockerTransport } from '../environment/docker-command.js'
import { EnvironmentOperations } from '../environment/operations.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { withWorkerOwnership } from '../fanout/ownership.js'
import type { RunnerStageContext } from './engine.js'
import { ManagedRunnerProcess } from './native-process.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerStore } from './store.js'

interface EnvironmentStageBinding {
  version: 1 | 2
  phase?: string
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
  private identity(environment: string) {
    const { record } = new EnvironmentResources(this.store.files).get(environment)
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
        (this.phase
          ? 'deadline,environment,identity,invocation,operations,phase,plan,provenance,reads,request,stage,version'
          : 'deadline,environment,identity,invocation,operations,plan,provenance,reads,request,stage,version') ||
      binding.version !== (this.phase ? 2 : 1) ||
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
    const request = this.store.get(binding.request),
      stage = this.store
        .record(binding.request)
        .stages.find((s) => s.id === binding.stage && s.invocation === binding.invocation),
      environment = this.identity(binding.environment),
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
    const operations = new EnvironmentOperations(
        this.store.files,
        binding.environment,
        binding.provenance,
      ),
      retained = operations.list()
    for (const operation of binding.operations) {
      const original = retained.find((o) => o.id === operation.id)
      if (
        Object.keys(operation).sort().join(',') !== 'command,id,nonce' ||
        !original ||
        original.nonce !== operation.nonce ||
        original.command !== operation.command ||
        original.provenance !== binding.provenance
      )
        throw new DeliveryRunnerError('environment-stage-operation-binding')
    }
    for (const operation of binding.operations) {
      const original = retained.find((o) => o.id === operation.id),
        claim = JSON.parse(
          readSourceFile(
            this.store.files.root,
            `delivery/runner-environment-claims/${operation.id}.json`,
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
    return { binding, operations }
  }
  async run<T>(
    context: RunnerStageContext,
    environment: string,
    driver: DockerTransport,
    operation: (driver: DockerTransport) => Promise<T>,
  ): Promise<T> {
    const request = contractDigest(context.request),
      actual = this.store.get(request),
      record = this.store.stage(request, context.stage.id),
      basis = this.store.basis(actual),
      selected = this.identity(environment),
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
      version: this.phase ? 2 : 1,
      ...(this.phase ? { phase: this.phase } : {}),
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
    const wrapped: DockerTransport = {
      provenance: driver.provenance,
      call: async (args, options: DockerCallOptions = {}) => {
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
        const current = this.read()
        if (!current) throw new DeliveryRunnerError('environment-stage-original-unresolved')
        const registration = options.registration
        let allowance = remaining
        if (registration) {
          const original = current.operations.list().find((o) => o.id === registration.operation),
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
        } else if (
          !(
            args.length >= 1 &&
            (['info', 'version'].includes(args[0] ?? '') ||
              (['container', 'image', 'network', 'volume'].includes(args[0] ?? '') &&
                args[1] === 'inspect') ||
              (args[0] === 'container' && ['logs', 'wait'].includes(args[1] ?? '')))
          )
        )
          throw new DeliveryRunnerError('environment-stage-unregistered-operation')
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
            ...(registration
              ? {
                  registration: {
                    ...registration,
                    started: (pid: number) => {
                      if (
                        !open ||
                        abort.signal.aborted ||
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
                  },
                }
              : {}),
          }
          // Effect wrappers keep their actual PID. Nesting another wrapper
          // would break their original started/outcome identity. Inert reads
          // have no environment operation and need a separate native owner.
          if (registration) return await driver.call(args, optionsForDriver)
          let reader: ManagedRunnerProcess | undefined
          this.store.files.locked(() => {
            const retained = this.read()
            if (
              !retained ||
              retained.binding.operations.length + retained.binding.reads.length >= 1000
            )
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
    try {
      return await operation(wrapped)
    } finally {
      open = false
    }
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
      operations = retained.binding.operations.map((o) =>
        observed.find((actual) => actual.operation.id === o.id),
      ),
      reads = retained.binding.reads.map((id) =>
        new ManagedRunnerProcess(this.store.files, id).observe(),
      ),
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
