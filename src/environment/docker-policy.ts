import { arch, platform } from 'node:os'
import { posix } from 'node:path'
import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import { DockerEnvironmentError, type DockerTransport, dockerJson } from './docker-command.js'
import { type EnvironmentCommand, validateEnvironmentRecipe } from './recipe.js'
import type { EnvironmentRuntime } from './runtime.js'

export const DOCKER_HELPER_MEMORY_MIB = 256
export const DOCKER_HELPER_CPUS = 0.25
export const DOCKER_REFERENCE_HELPER =
  'node@sha256:925de64a85319052d6971ae81ef2417da956e8a3a2c4a0fac732327970f017f5'
export const DOCKER_PROXY_MEMORY_MIB = 128
export const DOCKER_IMAGE = /^[a-z0-9][a-z0-9./:_-]*@sha256:[a-f0-9]{64}$/
export interface DockerImage {
  ref: string
  id: string
  manifest: string
  os: string
  architecture: string
  env: string[]
  entrypoint: string[]
  command: string[]
}
export interface DockerPreflight {
  schema: 'wholeloop/environment-backend-preflight@1'
  available: boolean
  reason?: string
  provenance: DockerTransport['provenance']
  host: EnvironmentRuntime['host']
  daemon?: NonNullable<EnvironmentRuntime['daemon']>
  images: (Pick<DockerImage, 'ref' | 'id' | 'manifest' | 'os' | 'architecture'> & {
    configuration: string
  })[]
  missing: string[]
  evidence: string
  executed: false
}
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new DockerEnvironmentError('invalid-docker-object')
  return value
}
export function dockerObjects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((entry) => !isObject(entry)))
    throw new DockerEnvironmentError('invalid-docker-list')
  return value as Record<string, unknown>[]
}
function strings(value: unknown): string[] {
  if (value === null) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string'))
    throw new DockerEnvironmentError('invalid-docker-strings')
  return value as string[]
}
export async function dockerImage(
  driver: DockerTransport,
  ref: string,
  architecture?: string,
): Promise<DockerImage | undefined> {
  if (!DOCKER_IMAGE.test(ref)) throw new DockerEnvironmentError('mutable-image')
  const read = await driver.call([
    'image',
    'inspect',
    ...(architecture ? ['--platform', `linux/${architecture}`] : []),
    ref,
  ])
  if (read.status !== 'succeeded') return undefined
  const image = dockerObjects(dockerJson(read))[0]
  if (!image) throw new DockerEnvironmentError('missing-image-observation')
  const root = dockerObjects(dockerJson(await driver.call(['image', 'inspect', ref])))[0]
  const descriptor = object(image.Descriptor)
  if (
    !root ||
    typeof root.Id !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(root.Id) ||
    ![
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.v2+json',
    ].includes(String(descriptor.mediaType)) ||
    typeof descriptor.digest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(descriptor.digest)
  )
    throw new DockerEnvironmentError('platform-manifest-unobserved')
  const config = object(image.Config)
  if (
    typeof image.Id !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(image.Id) ||
    typeof image.Os !== 'string' ||
    typeof image.Architecture !== 'string'
  )
    throw new DockerEnvironmentError('invalid-image-observation')
  return {
    ref,
    id: root.Id,
    manifest: descriptor.digest,
    os: image.Os,
    architecture: image.Architecture,
    env: strings(config.Env),
    entrypoint: strings(config.Entrypoint),
    command: strings(config.Cmd),
  }
}
export async function dockerPreflight(
  driver: DockerTransport,
  value: unknown,
  helperImage: string,
): Promise<DockerPreflight> {
  const recipe = validateEnvironmentRecipe(value)
  const result: DockerPreflight = {
    schema: 'wholeloop/environment-backend-preflight@1',
    available: false,
    provenance: driver.provenance,
    host: { os: platform(), architecture: arch() },
    images: [],
    missing: [],
    evidence: contractDigest({ recipe, helperImage }),
    executed: false,
  }
  try {
    if (
      ![DOCKER_REFERENCE_HELPER, `docker.io/library/${DOCKER_REFERENCE_HELPER}`].includes(
        helperImage,
      )
    )
      throw new DockerEnvironmentError('unverified-helper-image')
    if (recipe.limits.outputBytes > 1024 * 1024)
      throw new DockerEnvironmentError('output-limit-unavailable')
    if (recipe.network.setup === 'scoped' || recipe.network.runtime === 'scoped')
      throw new DockerEnvironmentError('scoped-egress-unavailable')
    for (const service of recipe.services)
      for (const command of [
        service.start,
        ...(service.readiness.command ? [service.readiness.command] : []),
        ...recipe.commands
          .filter((step) => step.service === service.id)
          .map((step) => step.command),
      ]) {
        const file = recipe.files.find((file) => file.id === command.origin.file)
        const input =
          file && service.mounts.find((mount) => mount.kind === 'input' && mount.source === file.id)
        const workspace =
          file &&
          service.mounts.find(
            (mount) => mount.kind === 'workspace' && mount.source === file.repository,
          )
        if (
          command.origin.kind === 'file' &&
          input &&
          !workspace &&
          command.argv.includes(input.target) &&
          !command.argv.includes(`${input.target}/${posix.basename(file.ref)}`)
        )
          throw new DockerEnvironmentError('legacy-input-file-mount-unavailable')
      }
    if (recipe.services.some((service) => service.secrets.length))
      throw new DockerEnvironmentError('secret-delivery-unavailable')
    if (
      recipe.network.runtime === 'none' &&
      recipe.services.some((service) => service.ports.some((port) => port.publish === 'loopback'))
    )
      throw new DockerEnvironmentError('offline-published-port-unavailable')
    const context = await driver.call([
      'context',
      'inspect',
      '--format',
      '{{json .Endpoints.docker.Host}}',
    ])
    const endpoint = dockerJson(context)
    if (
      typeof endpoint !== 'string' ||
      !endpoint.startsWith('unix:///') ||
      /[\r\n\0]/.test(endpoint)
    )
      throw new DockerEnvironmentError('local-unix-daemon-required')
    const version = object(dockerJson(await driver.call(['version', '--format', '{{json .}}'])))
    const server = object(version.Server)
    const info = object(dockerJson(await driver.call(['info', '--format', '{{json .}}'])))
    if (
      typeof info.ID !== 'string' ||
      typeof info.OSType !== 'string' ||
      typeof info.Architecture !== 'string' ||
      typeof info.NCPU !== 'number' ||
      typeof info.MemTotal !== 'number' ||
      typeof server.Version !== 'string'
    )
      throw new DockerEnvironmentError('invalid-daemon-observation')
    result.daemon = {
      id: info.ID,
      os: info.OSType,
      architecture: info.Architecture,
      cpus: info.NCPU,
      memoryBytes: info.MemTotal,
      version: server.Version,
    }
    if (info.OSType !== 'linux') throw new DockerEnvironmentError('linux-daemon-required')
    if (!/^\d+\.\d+\.\d+/.test(server.Version) || Number(server.Version.split('.')[0]) < 28)
      throw new DockerEnvironmentError('docker-version-unverified')
    const actualArch =
      info.Architecture === 'aarch64'
        ? 'arm64'
        : info.Architecture === 'x86_64'
          ? 'amd64'
          : info.Architecture
    if (actualArch !== recipe.backend.architecture && recipe.backend.emulation !== 'allow')
      throw new DockerEnvironmentError('emulation-not-authorized')
    if (recipe.limits.memoryMiB * 1024 * 1024 > info.MemTotal || recipe.limits.cpus > info.NCPU)
      throw new DockerEnvironmentError('capacity-unavailable')
    const memory = recipe.services.reduce((sum, service) => sum + service.memoryMiB, 0)
    const cpus = recipe.services.reduce((sum, service) => sum + service.cpus, 0)
    const jobServices = recipe.services.filter(
      (service) =>
        service.readiness.kind === 'exec' ||
        recipe.commands.some((step) => step.service === service.id),
    )
    const jobMemory = Math.max(
      DOCKER_HELPER_MEMORY_MIB,
      ...jobServices.map((service) => service.memoryMiB),
    )
    const jobCpus = DOCKER_HELPER_CPUS
    const proxies = recipe.services.reduce(
      (sum, service) => sum + service.ports.filter((port) => port.publish === 'loopback').length,
      0,
    )
    if (
      memory + proxies * DOCKER_PROXY_MEMORY_MIB + jobMemory > recipe.limits.memoryMiB ||
      cpus + proxies * DOCKER_HELPER_CPUS + jobCpus > recipe.limits.cpus
    )
      throw new DockerEnvironmentError('job-capacity-unavailable')
    for (const ref of new Set([helperImage, ...recipe.services.map((service) => service.image)])) {
      const image = await dockerImage(driver, ref, recipe.backend.architecture)
      if (!image) {
        result.missing.push(ref)
        continue
      }
      if (image.os !== 'linux' || image.architecture !== recipe.backend.architecture)
        throw new DockerEnvironmentError('image-platform-mismatch')
      result.images.push({
        ref: image.ref,
        id: image.id,
        manifest: image.manifest,
        os: image.os,
        architecture: image.architecture,
        configuration: contractDigest({
          env: image.env,
          entrypoint: image.entrypoint,
          command: image.command,
        }),
      })
    }
    if (result.missing.includes(helperImage))
      throw new DockerEnvironmentError('helper-image-not-cached')
    if (
      result.missing.some((ref) =>
        recipe.services.some(
          (service) => service.image === ref && service.acquisition === 'cache-only',
        ),
      )
    )
      throw new DockerEnvironmentError('image-not-cached')
    // Reserve immutable snapshot capacity for initial startup, observed stop and
    // one complete retirement as well as ten readiness attempts per service.
    const volumes = recipe.repositories.length + recipe.data.length + recipe.files.length
    const containers =
      1 +
      recipe.commands.filter((command) => command.phase !== 'test').length +
      recipe.services.length * 11 +
      proxies
    const networks = (recipe.network.runtime === 'internal' ? 1 : 0) + (proxies ? 1 : 0)
    if (20 + volumes * 4 + containers * 8 + networks * 4 + recipe.services.length * 2 > 900)
      throw new DockerEnvironmentError('resource-history-capacity')
    result.available = true
  } catch (error) {
    result.reason = error instanceof DockerEnvironmentError ? error.problem : 'backend-unavailable'
  }
  result.evidence = contractDigest({ ...result, evidence: null })
  return result
}
export interface ContainerSpec {
  image: DockerImage
  command: EnvironmentCommand
  mounts: { source: string; target: string; write: boolean }[]
  network: string
  networks?: string[]
  alias?: string
  ports: number[]
  user: '0:0' | '65532:65532'
  memoryMiB: number
  cpus: number
  interactive?: boolean
}
function environment(image: DockerImage) {
  const values = new Map(
    image.env.map((value) => {
      const index = value.indexOf('=')
      return [value.slice(0, index), value.slice(index + 1)]
    }),
  )
  values.set('HOME', '/tmp/home')
  values.set('TMPDIR', '/tmp')
  return [...values].map(([key, value]) => `${key}=${value}`).sort()
}
export function containerPolicy(spec: ContainerSpec) {
  return {
    interactive: spec.interactive === true,
    image: spec.image.id,
    manifest: spec.image.manifest,
    platform: { os: spec.image.os, architecture: spec.image.architecture },
    user: spec.user,
    entrypoint: spec.command.argv.length ? [spec.command.argv[0]] : spec.image.entrypoint,
    command: spec.command.argv.length ? spec.command.argv.slice(1) : spec.image.command,
    cwd: spec.command.cwd,
    env: environment(spec.image),
    network: spec.network,
    networks: spec.network.startsWith('container:')
      ? []
      : [spec.network, ...(spec.networks ?? [])].sort(),
    aliases: spec.alias ? [spec.alias] : [],
    mounts: spec.mounts
      .map((mount) => ({
        source: mount.source,
        target: mount.target,
        write: mount.write,
        type: 'volume',
        noCopy: true,
      }))
      .sort((a, b) => a.target.localeCompare(b.target)),
    ports: spec.ports.slice().sort((a, b) => a - b),
    health: ['NONE'],
    readonly: true,
    privileged: false,
    capDrop: ['ALL'],
    capAdd: [],
    security: ['no-new-privileges'],
    pids: 128,
    memory: spec.memoryMiB * 1024 * 1024,
    swap: spec.memoryMiB * 1024 * 1024,
    cpus: spec.cpus * 1e9,
    ipc: 'private',
    pid: '',
    cgroup: 'private',
    devices: [],
    extraHosts: [],
    restart: 'no',
    autoRemove: false,
    init: true,
    tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=64m,mode=1777' },
    log: { Type: 'local', Config: { 'max-size': '1m', 'max-file': '2' } },
  }
}
export function containerArguments(
  spec: ContainerSpec,
  name: string,
  labels: Record<string, string>,
) {
  const args = [
    'container',
    'create',
    '--name',
    name,
    '--platform',
    `linux/${spec.image.architecture}`,
    '--pull',
    'never',
    '--read-only',
    '--user',
    spec.user,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '128',
    '--memory',
    `${spec.memoryMiB}m`,
    '--memory-swap',
    `${spec.memoryMiB}m`,
    '--cpus',
    String(spec.cpus),
    '--ipc',
    'private',
    '--cgroupns',
    'private',
    '--restart',
    'no',
    '--init',
    '--stop-timeout',
    '5',
    '--log-driver',
    'local',
    '--log-opt',
    'max-size=1m',
    '--log-opt',
    'max-file=2',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777',
    '--env',
    'HOME=/tmp/home',
    '--env',
    'TMPDIR=/tmp',
    '--network',
    spec.network,
    '--workdir',
    spec.command.cwd,
  ]
  for (const network of spec.networks ?? []) args.push('--network', network)
  if (spec.alias) args.push('--network-alias', spec.alias)
  args.push('--no-healthcheck')
  if (spec.interactive) args.push('--interactive')
  for (const [key, value] of Object.entries(labels)) args.push('--label', `${key}=${value}`)
  for (const mount of spec.mounts)
    args.push(
      '--mount',
      `type=volume,src=${mount.source},dst=${mount.target},volume-nocopy${mount.write ? '' : ',readonly'}`,
    )
  for (const port of spec.ports) args.push('--publish', `127.0.0.1::${port}`)
  if (spec.command.argv.length) args.push('--entrypoint', spec.command.argv[0] ?? '')
  args.push(spec.image.ref, ...spec.command.argv.slice(1))
  return args
}
export function observedContainerPolicy(value: Record<string, unknown>) {
  const config = object(value.Config),
    h = object(value.HostConfig)
  const declared = dockerObjects(h.Mounts ?? [])
  const mounts = dockerObjects(value.Mounts)
  if (
    declared.length !== mounts.length ||
    mounts.some((mount) => mount.Type !== 'volume' || mount.Driver !== 'local')
  )
    throw new DockerEnvironmentError('unexpected-mount')
  const bindings = object(h.PortBindings ?? {})
  for (const entries of Object.values(bindings))
    if (dockerObjects(entries).some((binding) => binding.HostIp !== '127.0.0.1'))
      throw new DockerEnvironmentError('non-loopback-port')
  return {
    interactive: config.OpenStdin,
    image: value.Image,
    manifest: object(value.ImageManifestDescriptor).digest,
    platform: {
      os: object(object(value.ImageManifestDescriptor).platform).os,
      architecture: object(object(value.ImageManifestDescriptor).platform).architecture,
    },
    user: config.User,
    entrypoint: strings(config.Entrypoint),
    command: strings(config.Cmd),
    cwd: config.WorkingDir,
    env: strings(config.Env).sort(),
    network: h.NetworkMode,
    networks: Object.keys(object(value.NetworkSettings).Networks as Record<string, unknown>).sort(),
    aliases: [
      ...new Set(
        Object.values(object(object(value.NetworkSettings).Networks))
          .flatMap((network) => strings(object(network).Aliases))
          .filter(
            (alias) =>
              ![
                String(value.Name).replace(/^\//, ''),
                String(value.Id),
                String(value.Id).slice(0, 12),
                String(config.Hostname),
              ].includes(alias),
          ),
      ),
    ].sort(),
    mounts: mounts
      .map((mount) => {
        const declaration = declared.find((entry) => entry.Target === mount.Destination)
        if (!declaration) throw new DockerEnvironmentError('unexpected-mount')
        return {
          source: mount.Name,
          target: mount.Destination,
          write: mount.RW,
          type: mount.Type,
          noCopy: object(declaration.VolumeOptions).NoCopy,
        }
      })
      .sort((a, b) => String(a.target).localeCompare(String(b.target))),
    ports: Object.keys(bindings)
      .map((key) => Number(key.split('/')[0]))
      .sort((a, b) => a - b),
    health: strings(object(config.Healthcheck).Test),
    readonly: h.ReadonlyRootfs,
    privileged: h.Privileged,
    capDrop: strings(h.CapDrop).sort(),
    capAdd: strings(h.CapAdd).sort(),
    security: strings(h.SecurityOpt)
      .map((value) => value.replace(/:true$/, ''))
      .sort(),
    pids: h.PidsLimit,
    memory: h.Memory,
    swap: h.MemorySwap,
    cpus: h.NanoCpus,
    ipc: h.IpcMode,
    pid: h.PidMode,
    cgroup: h.CgroupnsMode,
    devices: h.Devices ?? [],
    extraHosts: h.ExtraHosts ?? [],
    restart: object(h.RestartPolicy).Name,
    autoRemove: h.AutoRemove,
    init: h.Init,
    tmpfs: h.Tmpfs,
    log: h.LogConfig,
  }
}
