// Admits and runs behaviour jobs in Docker with proof of how each process closed.
import { contractDigest } from '../contracts/compatibility.js'
import {
  DockerEnvironmentError,
  type DockerProcessObservation,
  type DockerTransport,
  dockerJson,
} from '../environment/docker-command.js'
import {
  DOCKER_HELPER_CPUS,
  DOCKER_HELPER_MEMORY_MIB,
  DOCKER_PROXY_MEMORY_MIB,
  dockerImage,
} from '../environment/docker-policy.js'
import { TCP_READY } from '../environment/docker-readiness.js'
import { DockerResources } from '../environment/docker-resources.js'
import { EnvironmentOperations } from '../environment/operations.js'
import type { EnvironmentCommand, EnvironmentRecipe } from '../environment/recipe.js'
import { EnvironmentRecipes } from '../environment/recipe-store.js'
import {
  type EnvironmentResource,
  EnvironmentResources,
  type EnvironmentRuntime,
} from '../environment/runtime.js'
import { AcceptanceError } from './contracts.js'
import type { DeliveryAcceptance } from './store.js'

export function admitBehaviorJob(
  recipe: EnvironmentRecipe,
  sequence: number,
  record: EnvironmentRuntime,
  resource: EnvironmentResource,
) {
  const containers = record.resources.filter((r) => r.kind === 'container')
  const proxies = recipe.services.reduce(
    (n, s) => n + s.ports.filter((p) => p.publish === 'loopback').length,
    0,
  )
  let memory =
    recipe.services.reduce((n, s) => n + s.memoryMiB, 0) + proxies * DOCKER_PROXY_MEMORY_MIB
  let cpus = recipe.services.reduce((n, s) => n + s.cpus, 0) + proxies * DOCKER_HELPER_CPUS
  for (const job of [...containers, resource]) {
    if (
      ['service', 'proxy'].includes(job.purpose) ||
      ['exited', 'stopped', 'retired'].includes(job.status)
    )
      continue
    const service = recipe.services.find((s) => s.id === job.service)
    memory +=
      job.purpose === 'test'
        ? (service?.memoryMiB ?? recipe.limits.memoryMiB)
        : DOCKER_HELPER_MEMORY_MIB
    cpus += DOCKER_HELPER_CPUS
  }
  if (memory > recipe.limits.memoryMiB || cpus > recipe.limits.cpus)
    throw new AcceptanceError('behavior-capacity')
  // Reserve cleanup observations before admitting more jobs; a full history must not strand resources.
  if (sequence + 12 + containers.length * 4 + record.resources.length * 2 + 20 >= 1000)
    throw new AcceptanceError('behavior-history-capacity')
}

export class DockerBehaviorRuntime {
  readonly records: EnvironmentResources
  readonly recipe: EnvironmentRecipe
  readonly resources: DockerResources
  private sequence = 0
  constructor(
    readonly acceptance: DeliveryAcceptance,
    readonly environment: string,
    readonly invocation: string,
    readonly driver: DockerTransport,
    readonly current: () => void,
    readonly signal: AbortSignal,
    readonly deadline: string,
  ) {
    this.records = new EnvironmentResources(acceptance.planning.sources.files)
    this.recipe = new EnvironmentRecipes(this.records.files.root).get(
      this.records.get(environment).record.recipe,
    ).recipe
    this.resources = new DockerResources(
      this.records,
      environment,
      driver,
      current,
      signal,
      this.recipe.limits.outputBytes,
      (record, resource) =>
        admitBehaviorJob(this.recipe, this.records.get(environment).sequence, record, resource),
    )
  }
  remaining(maximum = 10000) {
    this.current()
    return Math.max(1, Math.min(maximum, Date.parse(this.deadline) - Date.now()))
  }
  service(id: string) {
    const service = this.recipe.services.find((s) => s.id === id)
    const resource = this.records
      .get(this.environment)
      .record.resources.find(
        (r) => r.kind === 'container' && r.purpose === 'service' && r.service === id,
      )
    if (!service || !resource?.id) throw new AcceptanceError('unknown-behavior-service')
    return { service, resource }
  }
  async origin(id: string, requested?: number) {
    this.current()
    const { service, resource } = this.service(id)
    const ports = service.ports.filter((p) => p.publish === 'loopback')
    const port = requested ?? (ports.length === 1 ? ports[0]?.container : undefined)
    if (!port || !ports.some((p) => p.container === port))
      throw new AcceptanceError('undeclared-behavior-port')
    const record = this.records.get(this.environment).record
    const proxy = record.resources.find(
      (r) =>
        r.purpose === 'proxy' && r.service === id && r.ports?.some((p) => p.container === port),
    )
    const network = record.resources.find((r) => r.kind === 'network' && r.purpose === 'network')
    if (!proxy?.id || !network?.id) throw new AcceptanceError('unobserved-behavior-endpoint')
    await this.resources.owned(network)
    const app = await this.resources.owned(resource),
      published = await this.resources.owned(proxy)
    const appState = app.State as { Running?: unknown }
    const proxyState = published.State as { Running?: unknown }
    const networks = (
      app.NetworkSettings as { Networks: Record<string, { NetworkID: string; IPAddress: string }> }
    ).Networks
    const target = networks[network.name]
    const argv = (published.Config as { Cmd: string[] }).Cmd
    let bound: { host?: unknown; port?: unknown; deadline?: unknown }
    try {
      bound = JSON.parse(argv.at(-1) ?? '')
    } catch {
      throw new AcceptanceError('invalid-proxy-target')
    }
    const binding = (
      published.NetworkSettings as { Ports: Record<string, { HostIp: string; HostPort: string }[]> }
    ).Ports[`${port}/tcp`]
    const actual = binding?.[0]
    const saved = proxy.ports?.find((p) => p.container === port)
    if (
      appState.Running !== true ||
      proxyState.Running !== true ||
      target?.NetworkID !== network.id ||
      !target.IPAddress ||
      bound.host !== target.IPAddress ||
      bound.port !== port ||
      bound.deadline !== Date.parse(record.lifetimeDeadline) ||
      binding?.length !== 1 ||
      actual?.HostIp !== '127.0.0.1' ||
      Number(actual.HostPort) !== saved?.host
    )
      throw new AcceptanceError('changed-behavior-origin')
    this.current()
    return `http://127.0.0.1:${saved.host}`
  }
  async command(serviceId: string, commandId: string, input = '', maximum = 600000) {
    const { service, resource } = this.service(serviceId)
    const declared = this.recipe.commands.find(
      (c) => c.id === commandId && c.service === serviceId && c.phase === 'test',
    )
    if (!declared) throw new AcceptanceError('undeclared-behavior-command')
    const image = await dockerImage(this.driver, service.image, this.recipe.backend.architecture)
    const owned = await this.resources.owned(resource)
    if (
      !image ||
      owned.Image !== image.id ||
      (owned.ImageManifestDescriptor as { digest?: unknown })?.digest !== image.manifest
    )
      throw new AcceptanceError('changed-behavior-image')
    const record = this.records.get(this.environment).record
    const mounts = service.mounts.map((mount) => {
      const volume = record.resources.find(
        (r) => r.kind === 'volume' && r.slot === `${mount.kind}-${mount.source}`,
      )
      if (!volume?.id) throw new AcceptanceError('unobserved-behavior-volume')
      return {
        source: volume.id,
        target: mount.target,
        write: mount.kind === 'data' && mount.access === 'write',
      }
    })
    const job = await this.resources.container(
      this.slot(),
      'test',
      {
        image,
        command: declared.command,
        mounts,
        network: `container:${resource.id}`,
        ports: [],
        user: '65532:65532',
        memoryMiB: service.memoryMiB,
        cpus: DOCKER_HELPER_CPUS,
        interactive: true,
      },
      serviceId,
    )
    return this.observeJob(
      job,
      declared.command,
      image.ref,
      input,
      Math.min(maximum, declared.timeoutMs),
    )
  }
  /** Source-only jobs retain the same native close and daemon-exit proof as declared commands. */
  async observeJob(
    job: EnvironmentResource,
    command: EnvironmentCommand,
    image: string,
    input: string,
    maximum: number,
  ) {
    const stdout: Buffer[] = [],
      stderr: Buffer[] = []
    let process: DockerProcessObservation | undefined
    const observedDriver: DockerTransport = {
      provenance: this.driver.provenance,
      call: (args, options) =>
        this.driver.call(
          args,
          args[0] === 'container' &&
            args[1] === 'start' &&
            args.includes('--attach') &&
            args.at(-1) === job.id
            ? {
                ...options,
                observe: (stream, bytes) =>
                  (stream === 'stdout' ? stdout : stderr).push(Buffer.from(bytes)),
                process: (value) => {
                  process = value
                },
              }
            : options,
        ),
    }
    const jobs = new DockerResources(
      this.records,
      this.environment,
      observedDriver,
      this.current,
      this.signal,
      this.recipe.limits.outputBytes,
    )
    try {
      await jobs.job(job, input, this.remaining(maximum))
    } catch (error) {
      // A deliberate negative case may expect a nonzero application exit. Timeouts and overflow never qualify.
      if (!(error instanceof DockerEnvironmentError) || error.problem !== 'command-failed')
        throw error
    }
    const value = await jobs.owned(job)
    const state = value.State as {
      Running: unknown
      ExitCode: unknown
      StartedAt: unknown
      FinishedAt: unknown
    }
    if (
      state.Running !== false ||
      !Number.isInteger(state.ExitCode) ||
      typeof state.StartedAt !== 'string' ||
      typeof state.FinishedAt !== 'string' ||
      !Number.isFinite(Date.parse(state.FinishedAt)) ||
      state.FinishedAt.startsWith('0001-')
    )
      throw new AcceptanceError('unobserved-application-exit')
    const completion = process
      ? new EnvironmentOperations(
          this.records.files,
          this.environment,
          this.driver.provenance,
        ).completion(['container', 'start', '--attach', '--interactive', job.id ?? ''], process.pid)
      : undefined
    if (
      !completion ||
      completion.code !== state.ExitCode ||
      process?.signal ||
      process?.code !== (completion.code === 0 ? 0 : 1)
    )
      throw new AcceptanceError('unobserved-command-completion')
    return {
      application: {
        code: Number(state.ExitCode),
        stdout: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout)),
        stderr: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stderr)),
      },
      ...(process ? { process } : {}),
      execution: {
        controllerOperation: completion.operation,
        clientExit: completion.code,
        container: job.id,
        image,
        argv: command.argv,
        cwd: command.cwd,
        startedAt: state.StartedAt,
        endedAt: state.FinishedAt,
        applicationPid: 'not-observed',
        applicationSignal: 'not-observed',
      },
    }
  }
  async restart(id: string) {
    const { service, resource } = this.service(id)
    if (service.readiness.kind !== 'tcp' || !service.readiness.port)
      throw new AcceptanceError('restart-readiness-unavailable')
    this.current()
    await this.resources.owned(resource)
    const stopped = await this.driver.call(
      ['container', 'stop', '--time', '1', resource.id ?? ''],
      { signal: this.signal, timeoutMs: this.remaining(5000) },
    )
    const state = (await this.resources.owned(resource)).State as { Running?: unknown }
    if (stopped.status !== 'succeeded' || state.Running !== false)
      throw new AcceptanceError('restart-stop-unobserved')
    await this.resources.start(resource)
    const record = this.records.get(this.environment).record
    const helper = await dockerImage(
      this.driver,
      record.helperImage,
      this.recipe.backend.architecture,
    )
    if (!helper) throw new AcceptanceError('readiness-helper-unavailable')
    for (let attempt = 0; attempt < 10; attempt++) {
      const job = await this.resources.container(
        this.slot(),
        'readiness',
        {
          image: helper,
          command: { argv: ['node', '-e', TCP_READY], cwd: '/tmp', origin: { kind: 'recipe' } },
          mounts: [],
          network: `container:${resource.id}`,
          ports: [],
          user: '65532:65532',
          memoryMiB: DOCKER_HELPER_MEMORY_MIB,
          cpus: DOCKER_HELPER_CPUS,
          interactive: true,
        },
        id,
      )
      try {
        await this.resources.job(
          job,
          JSON.stringify({ port: service.readiness.port }),
          this.remaining(2000),
        )
        return
      } catch (error) {
        if (!(error instanceof DockerEnvironmentError) || error.problem !== 'command-failed')
          throw error
      }
    }
    throw new AcceptanceError('restart-not-ready')
  }
  private slot() {
    return `behavior-${contractDigest(this.invocation).slice(0, 20)}-${++this.sequence}`
  }
  async daemon() {
    const value = dockerJson(await this.driver.call(['info', '--format', '{{json .}}'])) as {
      ID?: unknown
    }
    if (value.ID !== this.records.get(this.environment).record.daemon?.id)
      throw new AcceptanceError('changed-behavior-daemon')
  }
}
