import { randomUUID } from 'node:crypto'
import { contractDigest } from '../contracts/compatibility.js'
import { DockerEnvironmentError, type DockerTransport, dockerJson } from './docker-command.js'
import {
  type ContainerSpec,
  containerArguments,
  containerPolicy,
  dockerObjects,
  observedContainerPolicy,
} from './docker-policy.js'
import type { EnvironmentResource, EnvironmentResources } from './runtime.js'

/** Every creation/start has a retained intent. A name or a successful CLI exit never establishes ownership. */
export class DockerResources {
  constructor(
    readonly records: EnvironmentResources,
    readonly environment: string,
    readonly driver: DockerTransport,
    readonly current: () => void,
    readonly signal: AbortSignal,
    readonly outputBytes = 1024 * 1024,
  ) {}
  labels(resource: EnvironmentResource) {
    const record = this.records.get(this.environment).record
    return {
      'org.wholeloop.environment': record.id,
      'org.wholeloop.run': record.run,
      'org.wholeloop.recipe': record.recipe,
      'org.wholeloop.resource': resource.token,
      'org.wholeloop.slot': resource.slot,
    }
  }
  async volume(slot: string, purpose: 'workspace' | 'data' | 'input') {
    const resource = this.intent('volume', slot, purpose)
    const args = ['volume', 'create', '--driver', 'local']
    for (const [key, value] of Object.entries(this.labels(resource)))
      args.push('--label', `${key}=${value}`)
    args.push(resource.name)
    this.current()
    return this.created(resource, await this.driver.call(args, { signal: this.signal }))
  }
  async network(ingress = false) {
    const resource = this.intent(
      'network',
      ingress ? 'ingress' : 'network',
      ingress ? 'ingress' : 'network',
    )
    const args = [
      'network',
      'create',
      '--driver',
      'bridge',
      '--opt',
      'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
    ]
    if (!ingress)
      args.push('--internal', '--opt', 'com.docker.network.bridge.gateway_mode_ipv4=isolated')
    for (const [key, value] of Object.entries(this.labels(resource)))
      args.push('--label', `${key}=${value}`)
    args.push(resource.name)
    this.current()
    return this.created(resource, await this.driver.call(args, { signal: this.signal }))
  }
  async container(
    slot: string,
    purpose: EnvironmentResource['purpose'],
    spec: ContainerSpec,
    service?: string,
  ) {
    const resources = this.records.get(this.environment).record.resources
    for (const mount of spec.mounts) {
      const volume = resources.find((entry) => entry.kind === 'volume' && entry.id === mount.source)
      if (!volume) throw new DockerEnvironmentError('unowned-volume')
      await this.owned(volume)
    }
    for (const name of [spec.network, ...(spec.networks ?? [])]) {
      if (name === 'none') continue
      const target = name.startsWith('container:')
        ? resources.find(
            (entry) =>
              entry.kind === 'container' &&
              entry.purpose === 'service' &&
              entry.id === name.slice(10),
          )
        : resources.find((entry) => entry.kind === 'network' && entry.name === name)
      if (!target) throw new DockerEnvironmentError('unowned-network')
      await this.owned(target)
    }
    const resource = this.intent(
      'container',
      slot,
      purpose,
      service,
      contractDigest(containerPolicy(spec)),
    )
    this.current()
    return this.created(
      resource,
      await this.driver.call(containerArguments(spec, resource.name, this.labels(resource)), {
        signal: this.signal,
      }),
    )
  }
  async start(resource: EnvironmentResource) {
    if (resource.kind !== 'container') throw new DockerEnvironmentError('invalid-start-resource')
    this.current()
    await this.owned(resource)
    this.observation(
      'start-issued',
      'issued',
      contractDigest({ resource: resource.id }),
      resource.slot,
    )
    this.current()
    const started = await this.driver.call(['container', 'start', this.id(resource)], {
      signal: this.signal,
    })
    const value = await this.owned(resource)
    const state = this.object(value.State)
    if (
      started.status !== 'succeeded' ||
      state.Running !== true ||
      typeof state.StartedAt !== 'string' ||
      state.StartedAt.startsWith('0001-')
    )
      throw new DockerEnvironmentError('service-start-failed')
    const ports = this.ports(value)
    const expectedPorts = Object.keys(
      (value.HostConfig as { PortBindings?: Record<string, unknown> }).PortBindings ?? {},
    )
    if (ports.length !== expectedPorts.length)
      throw new DockerEnvironmentError('published-port-unobserved')
    this.records.update(this.environment, (record) => {
      const entry = this.resource(record.resources, resource.slot)
      entry.status = 'started'
      entry.ports = ports
    })
    this.current()
    return this.refresh(resource)
  }
  async job(resource: EnvironmentResource, input: string, timeoutMs: number) {
    if (resource.kind !== 'container') throw new DockerEnvironmentError('invalid-job-resource')
    this.current()
    await this.owned(resource)
    this.observation(
      'start-issued',
      'issued',
      contractDigest({ resource: resource.id }),
      resource.slot,
    )
    const args = ['container', 'start', '--attach', '--interactive', this.id(resource)]
    this.current()
    const result = await this.driver.call(args, {
      input,
      timeoutMs,
      signal: this.signal,
      outputBytes: this.outputBytes,
    })
    let value = await this.owned(resource)
    let state = this.object(value.State)
    // Killing a Docker client does not stop its daemon-side process. Stop this exact owned job and observe it again.
    if (state.Running === true) {
      await this.owned(resource)
      await this.driver.call(['container', 'stop', '--time', '1', this.id(resource)], {
        timeoutMs: 5000,
      })
      value = await this.owned(resource)
      state = this.object(value.State)
    }
    if (
      state.Running !== false ||
      state.Status !== 'exited' ||
      typeof state.StartedAt !== 'string' ||
      state.StartedAt.startsWith('0001-') ||
      !Number.isInteger(state.ExitCode) ||
      Number(state.ExitCode) < 0 ||
      Number(state.ExitCode) > 255
    )
      throw new DockerEnvironmentError('job-outcome-unknown')
    this.records.update(this.environment, (record) => {
      const entry = this.resource(record.resources, resource.slot)
      entry.status = 'exited'
      entry.exit = Number(state.ExitCode)
    })
    this.observation(
      resource.purpose,
      `${result.status}-exit-${state.ExitCode}`,
      result.digest,
      resource.slot,
    )
    this.current()
    if (result.status !== 'succeeded' || state.ExitCode !== 0)
      throw new DockerEnvironmentError(
        result.failure === 'output-limit' || result.status === 'overflow'
          ? 'command-output-limit'
          : result.status === 'timeout'
            ? 'command-timeout'
            : result.status === 'cancelled'
              ? 'command-cancelled'
              : 'command-failed',
      )
    return result
  }
  async owned(resource: EnvironmentResource, policy = true): Promise<Record<string, unknown>> {
    const latest = this.refresh(resource)
    const values = dockerObjects(
      dockerJson(await this.driver.call([latest.kind, 'inspect', this.id(latest)])),
    )
    const value = values[0]
    if (
      !value ||
      values.length !== 1 ||
      !this.matches(latest, value) ||
      this.stamp(latest, value) !== latest.stamp
    )
      throw new DockerEnvironmentError('resource-identity-changed')
    if (
      policy &&
      latest.kind === 'container' &&
      (!latest.policy || contractDigest(observedContainerPolicy(value)) !== latest.policy)
    )
      throw new DockerEnvironmentError('container-policy-changed')
    if (
      policy &&
      latest.kind === 'volume' &&
      (value.Driver !== 'local' ||
        (value.Options !== null && Object.keys(this.object(value.Options)).length))
    )
      throw new DockerEnvironmentError('volume-policy-changed')
    if (
      policy &&
      latest.kind === 'network' &&
      (value.Driver !== 'bridge' ||
        value.Internal !== (latest.purpose !== 'ingress') ||
        (latest.purpose !== 'ingress' &&
          this.object(value.Options)['com.docker.network.bridge.gateway_mode_ipv4'] !== 'isolated'))
    )
      throw new DockerEnvironmentError('network-policy-changed')
    if (policy && latest.kind === 'container')
      for (const mount of dockerObjects(value.Mounts)) {
        const owned = this.records
          .get(this.environment)
          .record.resources.find((entry) => entry.kind === 'volume' && entry.id === mount.Name)
        if (!owned) throw new DockerEnvironmentError('unowned-mounted-volume')
        await this.owned(owned)
      }
    return value
  }
  observation(stage: string, status: string, evidence: string, resource?: string) {
    this.records.update(this.environment, (record) =>
      record.observations.push({
        stage,
        status,
        evidence,
        at: new Date().toISOString(),
        ...(resource ? { resource } : {}),
      }),
    )
  }
  private intent(
    kind: EnvironmentResource['kind'],
    slot: string,
    purpose: EnvironmentResource['purpose'],
    service?: string,
    policy?: string,
  ) {
    this.current()
    const resource: EnvironmentResource = {
      kind,
      slot,
      purpose,
      name: `wl-${this.environment.slice(12)}-${slot}`,
      token: randomUUID(),
      status: 'intent',
      ...(service ? { service } : {}),
      ...(policy ? { policy } : {}),
    }
    if (!/^[a-z][a-z0-9_-]{0,95}$/.test(slot) || resource.name.length > 128)
      throw new DockerEnvironmentError('invalid-resource-slot')
    this.records.update(this.environment, (record) => {
      if (record.resources.some((entry) => entry.slot === slot))
        throw new DockerEnvironmentError('resource-already-issued')
      record.resources.push(resource)
    })
    return resource
  }
  private async created(
    resource: EnvironmentResource,
    result: Awaited<ReturnType<DockerTransport['call']>>,
  ) {
    if (result.status !== 'succeeded') {
      this.records.update(this.environment, (record) => {
        this.resource(record.resources, resource.slot).status = 'unknown'
      })
      this.observation('create', result.status, result.digest, resource.slot)
      throw new DockerEnvironmentError('resource-create-unknown')
    }
    const id = result.stdout.trim()
    if (resource.kind === 'volume' ? id !== resource.name : !/^[a-f0-9]{64}$/.test(id))
      throw new DockerEnvironmentError('invalid-resource-id')
    const values = dockerObjects(dockerJson(await this.driver.call([resource.kind, 'inspect', id])))
    const value = values[0]
    const observed = { ...resource, id }
    if (!value || values.length !== 1 || !this.matches(observed, value))
      throw new DockerEnvironmentError('created-resource-unowned')
    this.records.update(this.environment, (record) => {
      const entry = this.resource(record.resources, resource.slot)
      entry.id = id
      entry.stamp = this.stamp(observed, value)
      entry.status = 'observed'
    })
    const current = this.refresh(resource)
    await this.owned(current)
    this.current()
    return current
  }
  private matches(resource: EnvironmentResource, value: Record<string, unknown>) {
    const labels = resource.kind === 'container' ? this.object(value.Config).Labels : value.Labels
    const expected = this.labels(resource)
    if (
      !labels ||
      typeof labels !== 'object' ||
      Object.entries(expected).some(([key, v]) => (labels as Record<string, unknown>)[key] !== v)
    )
      return false
    return resource.kind === 'volume'
      ? value.Name === resource.id && value.Name === resource.name
      : value.Id === resource.id &&
          (resource.kind === 'network' ? value.Name : String(value.Name).replace(/^\//, '')) ===
            resource.name
  }
  private stamp(resource: EnvironmentResource, value: Record<string, unknown>) {
    return contractDigest({
      kind: resource.kind,
      id: resource.id,
      created: resource.kind === 'volume' ? value.CreatedAt : value.Created,
      driver: resource.kind === 'container' ? value.Image : value.Driver,
      ...(resource.kind === 'volume' ? { mountpoint: value.Mountpoint } : {}),
    })
  }
  private ports(value: Record<string, unknown>) {
    const bindings = this.object(this.object(value.NetworkSettings).Ports ?? {})
    return Object.entries(bindings).flatMap(([key, entries]) => {
      if (entries === null) return []
      return dockerObjects(entries).map((binding) => {
        const host = Number(binding.HostPort),
          container = Number(key.split('/')[0])
        if (binding.HostIp !== '127.0.0.1' || !Number.isInteger(host) || host < 1 || host > 65535)
          throw new DockerEnvironmentError('invalid-owned-port')
        return { container, host }
      })
    })
  }
  private refresh(resource: EnvironmentResource) {
    return this.resource(this.records.get(this.environment).record.resources, resource.slot)
  }
  private id(resource: EnvironmentResource) {
    if (!resource.id) throw new DockerEnvironmentError('resource-id-unobserved')
    return resource.id
  }
  private resource(values: EnvironmentResource[], slot: string) {
    const resource = values.find((entry) => entry.slot === slot)
    if (!resource) throw new DockerEnvironmentError('unknown-resource')
    return resource
  }
  private object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new DockerEnvironmentError('invalid-resource-observation')
    return value as Record<string, unknown>
  }
}
