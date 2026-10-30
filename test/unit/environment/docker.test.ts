import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import {
  DockerCli,
  DockerEnvironmentError,
  type DockerTransport,
} from '../../../src/environment/docker-command.js'
import {
  type ContainerSpec,
  containerArguments,
  containerPolicy,
  DOCKER_REFERENCE_HELPER,
  dockerImage,
  dockerPreflight,
  observedContainerPolicy,
} from '../../../src/environment/docker-policy.js'
import { DockerResources } from '../../../src/environment/docker-resources.js'
import {
  DeliveryEnvironments,
  type EnvironmentProvisionRequest,
} from '../../../src/environment/provision.js'
import { validateEnvironmentRecipe } from '../../../src/environment/recipe.js'
import { EnvironmentResources, type EnvironmentRuntime } from '../../../src/environment/runtime.js'
import { workspaceSnapshot } from '../../../src/gates/snapshot.js'
import { StoreFiles } from '../../../src/state/files.js'
import inspector from '../../fixtures/environment/container-inspect.json' with { type: 'json' }
import { authorization, entry, fixture, git } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'

type Inspector = Omit<typeof inspector, 'HostConfig'> & {
  HostConfig: Omit<typeof inspector.HostConfig, 'CapAdd'> & { CapAdd: string[] | null }
}
const recipe = () => environmentRecipe('/fixture/app', 'Fixture application.')
const image = {
  ref: DOCKER_REFERENCE_HELPER,
  manifest: `sha256:${'d'.repeat(64)}`,
  id: `sha256:${'a'.repeat(64)}`,
  os: 'linux',
  architecture: 'arm64',
  env: inspector.Config.Env,
  entrypoint: ['docker-entrypoint.sh'],
  command: ['node'],
}
function preflightDriver(
  overrides: {
    endpoint?: string
    os?: string
    architecture?: string
    version?: string
    cpus?: number
    memory?: number
    command?: unknown
    missing?: readonly string[]
  } = {},
) {
  const calls: string[][] = []
  const driver: DockerTransport = {
    provenance: 'fixture',
    async call(args) {
      calls.push(args)
      let value: unknown
      if (args[0] === 'context') value = overrides.endpoint ?? 'unix:///fixture/docker.sock'
      else if (args[0] === 'version') value = { Server: { Version: overrides.version ?? '29.9.2' } }
      else if (args[0] === 'info')
        value = {
          ID: 'fixture-daemon',
          OSType: overrides.os ?? 'linux',
          Architecture: overrides.architecture ?? 'aarch64',
          NCPU: overrides.cpus ?? 8,
          MemTotal: overrides.memory ?? 8 * 1024 ** 3,
        }
      else if (args[0] === 'image') {
        if (overrides.missing?.includes(args.at(-1) ?? ''))
          return { status: 'crashed', stdout: '', code: 1, digest: 'f'.repeat(64) }
        value = [
          {
            Id: args.includes('--platform') ? image.manifest : image.id,
            Descriptor: {
              mediaType: args.includes('--platform')
                ? 'application/vnd.oci.image.manifest.v1+json'
                : 'application/vnd.oci.image.index.v1+json',
              digest: args.includes('--platform') ? image.manifest : image.id,
            },
            Os: image.os,
            Architecture: image.architecture,
            Config: {
              Env: [...image.env, 'NON_SECRET_MARKER=fixture-value'],
              Entrypoint: image.entrypoint,
              Cmd: Object.hasOwn(overrides, 'command') ? overrides.command : image.command,
            },
          },
        ]
      } else throw new Error('Read-only preflight must perform no backend mutation')
      return {
        status: 'succeeded',
        stdout: JSON.stringify(value),
        code: 0,
        digest: contractDigest(value),
      }
    },
  }
  return { driver, calls }
}
const spec = (): ContainerSpec => ({
  image,
  command: {
    argv: ['node', '/workspace/app/app.cjs'],
    cwd: '/workspace/app',
    origin: { kind: 'file', file: 'server' },
  },
  mounts: [
    { source: 'fixture-workspace', target: '/workspace/app', write: false },
    { source: 'fixture-data', target: '/data/db', write: true },
  ],
  network: 'fixture-network',
  alias: 'web',
  ports: [],
  user: '65532:65532',
  memoryMiB: 128,
  cpus: 1,
})
const values = (args: string[], key: string) =>
  args.flatMap((arg, index) => (arg === key ? [args[index + 1]] : []))

describe('observed Docker preflight', () => {
  it('accepts optional omitted OCI image commands while refusing malformed command metadata', async () => {
    const omitted = preflightDriver({ command: undefined })
    expect((await dockerImage(omitted.driver, DOCKER_REFERENCE_HELPER, 'arm64'))?.command).toEqual(
      [],
    )
    const malformed = preflightDriver({ command: 'node' })
    await expect(dockerImage(malformed.driver, DOCKER_REFERENCE_HELPER, 'arm64')).rejects.toThrow()
  })
  it('keeps declarations and image configuration hashes distinct from execution or raw image environment', async () => {
    const { driver, calls } = preflightDriver()
    const result = await dockerPreflight(driver, recipe(), DOCKER_REFERENCE_HELPER)
    expect(result).toMatchObject({
      available: true,
      executed: false,
      provenance: 'fixture',
      daemon: { os: 'linux', architecture: 'aarch64' },
    })
    expect(result.images[0]?.id).toBe(image.id)
    expect(result.images[0]?.manifest).toBe(image.manifest)
    expect(result.images[0]?.configuration).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toContain('fixture-value')
    expect(JSON.stringify(result)).not.toContain('NON_SECRET_MARKER')
    expect(
      calls.every((args) => ['context', 'version', 'info', 'image'].includes(args[0] ?? '')),
    ).toBe(true)
  })
  it.each([
    [{ endpoint: 'ssh://fixture' }, 'local-unix-daemon-required'],
    [{ os: 'windows' }, 'linux-daemon-required'],
    [{ architecture: 'x86_64' }, 'emulation-not-authorized'],
    [{ version: '27.0.0' }, 'docker-version-unverified'],
    [{ version: 'unknown' }, 'docker-version-unverified'],
    [{ cpus: 1 }, 'capacity-unavailable'],
    [{ memory: 128 * 1024 ** 2 }, 'capacity-unavailable'],
    [{ missing: [DOCKER_REFERENCE_HELPER] }, 'helper-image-not-cached'],
  ] as const)('refuses unavailable backend observations %j', async (overrides, reason) => {
    const { driver } = preflightDriver({
      ...overrides,
      ...('missing' in overrides ? { missing: [...overrides.missing] } : {}),
    })
    expect(await dockerPreflight(driver, recipe(), DOCKER_REFERENCE_HELPER)).toMatchObject({
      available: false,
      reason,
    })
  })
  it('refuses scoped egress, unknown helper images and secret delivery before any Docker command', async () => {
    const { driver, calls } = preflightDriver()
    const input = recipe()
    input.network = { setup: 'scoped', runtime: 'internal', destinations: ['example.test:443'] }
    expect((await dockerPreflight(driver, input, DOCKER_REFERENCE_HELPER)).reason).toBe(
      'scoped-egress-unavailable',
    )
    expect((await dockerPreflight(driver, recipe(), `node@sha256:${'f'.repeat(64)}`)).reason).toBe(
      'unverified-helper-image',
    )
    const secrets = recipe()
    entry(secrets.services, 0).secrets = [
      { name: 'FIXTURE_AUTH', provider: 'os-keyring', ref: 'fixture/service' },
    ]
    expect((await dockerPreflight(driver, secrets, DOCKER_REFERENCE_HELPER)).reason).toBe(
      'secret-delivery-unavailable',
    )
    expect(calls).toEqual([])
  })
  it('distinguishes explicit image acquisition from cache-only refusal without pulling at preflight', async () => {
    const input = recipe(),
      service = entry(input.services, 0)
    service.image = `example.invalid/app@sha256:${'c'.repeat(64)}`
    const { driver, calls } = preflightDriver({ missing: [service.image] })
    expect((await dockerPreflight(driver, input, DOCKER_REFERENCE_HELPER)).reason).toBe(
      'image-not-cached',
    )
    service.acquisition = 'explicit-pull'
    expect(await dockerPreflight(driver, input, DOCKER_REFERENCE_HELPER)).toMatchObject({
      available: true,
      missing: [service.image],
    })
    expect(calls.some((args) => args.includes('pull'))).toBe(false)
  })
  it('reserves helper/proxy peak capacity and refuses unavailable offline publication', async () => {
    const { driver } = preflightDriver()
    const input = recipe()
    input.limits.memoryMiB = 256
    expect((await dockerPreflight(driver, input, DOCKER_REFERENCE_HELPER)).reason).toBe(
      'job-capacity-unavailable',
    )
    input.network.runtime = 'none'
    expect((await dockerPreflight(driver, input, DOCKER_REFERENCE_HELPER)).reason).toBe(
      'offline-published-port-unavailable',
    )
  })
})

const mutations: [string, (value: Inspector) => void][] = [
  [
    'selected platform manifest',
    (value) => {
      value.ImageManifestDescriptor.digest = `sha256:${'e'.repeat(64)}`
    },
  ],
  [
    'selected image architecture',
    (value) => {
      value.ImageManifestDescriptor.platform.architecture = 'amd64'
    },
  ],
  [
    'root user',
    (value) => {
      value.Config.User = '0:0'
    },
  ],
  [
    'writable root',
    (value) => {
      value.HostConfig.ReadonlyRootfs = false
    },
  ],
  [
    'privilege',
    (value) => {
      value.HostConfig.Privileged = true
    },
  ],
  [
    'capabilities',
    (value) => {
      value.HostConfig.CapAdd = ['SYS_ADMIN']
    },
  ],
  [
    'missing capability drop',
    (value) => {
      value.HostConfig.CapDrop = []
    },
  ],
  [
    'missing no-new-privileges',
    (value) => {
      value.HostConfig.SecurityOpt = []
    },
  ],
  [
    'host network',
    (value) => {
      value.HostConfig.NetworkMode = 'host'
    },
  ],
  [
    'host PID namespace',
    (value) => {
      value.HostConfig.PidMode = 'host'
    },
  ],
  [
    'host IPC namespace',
    (value) => {
      value.HostConfig.IpcMode = 'host'
    },
  ],
  [
    'host cgroups',
    (value) => {
      value.HostConfig.CgroupnsMode = 'host'
    },
  ],
  [
    'unbounded memory',
    (value) => {
      value.HostConfig.Memory = 0
    },
  ],
  [
    'unbounded processes',
    (value) => {
      value.HostConfig.PidsLimit = 0
    },
  ],
  [
    'unbounded CPU',
    (value) => {
      value.HostConfig.NanoCpus = 0
    },
  ],
  [
    'automatic restart',
    (value) => {
      value.HostConfig.RestartPolicy.Name = 'always'
    },
  ],
  [
    'automatic removal',
    (value) => {
      value.HostConfig.AutoRemove = true
    },
  ],
  [
    'writable implementation',
    (value) => {
      const mount = value.Mounts.find((mount) => mount.Destination === '/workspace/app')
      if (!mount) throw new Error('Missing fixture mount')
      mount.RW = true
    },
  ],
  [
    'foreign actual volume',
    (value) => {
      entry(value.Mounts, 0).Name = 'foreign-volume'
    },
  ],
  [
    'injected environment',
    (value) => {
      value.Config.Env.push('NON_SECRET_MARKER=injected')
    },
  ],
  [
    'extra network',
    (value) => {
      Object.assign(value.NetworkSettings.Networks, { foreign: {} })
    },
  ],
  [
    'image health command',
    (value) => {
      value.Config.Healthcheck.Test = ['CMD', 'unexpected']
    },
  ],
  [
    'changed image',
    (value) => {
      value.Image = `sha256:${'e'.repeat(64)}`
    },
  ],
]
it('uses actual-inspect-shaped data and a closed creation recipe with no bind or ambient environment flags', () => {
  expect(observedContainerPolicy(structuredClone(inspector))).toEqual(containerPolicy(spec()))
  const args = containerArguments(spec(), 'fixture-service', {
    'org.wholeloop.environment': 'fixture',
  })
  expect(values(args, '--mount').every((value) => value?.startsWith('type=volume,'))).toBe(true)
  expect(values(args, '--env')).toEqual(['HOME=/tmp/home', 'TMPDIR=/tmp'])
  expect(values(args, '--pull')).toEqual(['never'])
  expect(args).not.toContain('--privileged')
  expect(args).not.toContain('--use-api-socket')
})
it.each(mutations)(
  'rejects observed %s instead of weakening the requested policy',
  (name, mutate) => {
    expect(observedContainerPolicy(structuredClone(inspector))).toEqual(containerPolicy(spec()))
    const changed: Inspector = structuredClone(inspector)
    mutate(changed)
    let different = false
    try {
      different =
        contractDigest(observedContainerPolicy(changed)) !== contractDigest(containerPolicy(spec()))
    } catch (error) {
      expect(error).toBeInstanceOf(DockerEnvironmentError)
      different = true
    }
    expect(different, name).toBe(true)
  },
)
it('refuses authority before Docker startup or source selection', () =>
  fixture(async ({ planning, plan }) => {
    const { driver, calls } = preflightDriver()
    planning.preparePlan(plan)
    const environments = new DeliveryEnvironments(planning.sources.files.root, driver)
    await expect(
      environments.provision({
        schema: 'wholeloop/environment-provision-request@1',
        run: plan.run,
        key: 'fixture',
        recipe: 'a'.repeat(64),
        helperImage: DOCKER_REFERENCE_HELPER,
        workspaces: [
          {
            repository: 'app',
            path: '/fixture/candidate',
            head: 'a'.repeat(40),
            snapshot: 'b'.repeat(64),
          },
        ],
      }),
    ).rejects.toThrow('unknown-run')
    expect(calls).toEqual([])
  }))
it('retains the issued provisioning key when its caller changes input during preflight', () =>
  fixture(async ({ planning, plan, root, dir }) => {
    const app = 'process.stdout.write("Pinned provisioning input.")\n'
    writeFileSync(join(root, 'app.cjs'), app)
    git(root, ['add', 'app.cjs'])
    git(root, [
      'commit',
      '-m',
      'test: pin a provisioning request fixture',
      '-m',
      'Observe input aliasing across asynchronous backend reads.',
    ])
    entry(plan.repositories, 0).base = git(root, ['rev-parse', 'HEAD'])
    const prepared = planning.preparePlan(plan),
      original = preflightDriver(),
      request: EnvironmentProvisionRequest = {
        schema: 'wholeloop/environment-provision-request@1',
        run: plan.run,
        key: 'original-input',
        recipe: '',
        helperImage: DOCKER_REFERENCE_HELPER,
        workspaces: [],
      },
      driver: DockerTransport = {
        provenance: 'fixture',
        call: async (args) => {
          request.key = 'replaced-input'
          if (['context', 'version', 'info', 'image'].includes(args[0] ?? ''))
            return original.driver.call(args)
          return { status: 'crashed', stdout: '', code: 7, digest: 'f'.repeat(64) }
        },
      },
      environments = new DeliveryEnvironments(planning.sources.files.root, driver),
      grant = environments.effects.lifecycle.authority.authorize(
        authorization(plan, prepared.digest),
      )
    environments.effects.lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
    environments.effects.lifecycle.transition(plan.run, {
      to: 'queued',
      reason: 'Observe original request identity through failed fixture setup.',
    })
    const candidate = join(dir, 'candidate')
    git(root, ['worktree', 'add', '-b', 'wl/provision-input', candidate, 'HEAD'])
    const snapshot = workspaceSnapshot(candidate)
    request.recipe = environments.recipes.prepare(environmentRecipe(root, app)).digest
    request.workspaces = [
      { repository: 'app', path: candidate, head: snapshot.head, snapshot: snapshot.digest },
    ]
    const result = await environments.provision(request)
    expect(result.status).not.toBe('ready')
    expect(request.key).toBe('replaced-input')
    expect(result.environment?.record.key).toBe('original-input')
    expect(environments.resources.list()).toHaveLength(1)
    expect(environments.effects.inspect(plan.run)[0]?.intent.key).toBe('environment-original-input')
  }))
it('rejects changed runtime identities before adding a corrupt snapshot and preserves prior observations', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-resources-')))
  try {
    const resources = new EnvironmentResources(new StoreFiles(dir))
    const record: EnvironmentRuntime = {
      schema: 'wholeloop/environment-runtime@1',
      id: `environment-${'a'.repeat(32)}`,
      run: `delivery-${'a'.repeat(16)}`,
      basis: 'b'.repeat(64),
      recipe: 'c'.repeat(64),
      key: 'fixture',
      grant: `authorization-${'d'.repeat(16)}`,
      grantDigest: 'e'.repeat(64),
      token: 'fixture-owner',
      effect: `effect-${'f'.repeat(32)}`,
      createdAt: '2026-10-25T00:00:00.000Z',
      deadline: '2026-10-25T00:01:00.000Z',
      lifetimeDeadline: '2026-10-25T04:00:00.000Z',
      state: 'planned',
      provenance: 'fixture',
      helperImage: DOCKER_REFERENCE_HELPER,
      host: { os: 'fixture', architecture: 'arm64' },
      candidates: [],
      resources: [],
      observations: [],
      acceptance: 'not-established',
      publication: 'not-performed',
    }
    const first = resources.create(record)
    expect(() =>
      resources.update(record.id, (value) => {
        value.grantDigest = 'a'.repeat(64)
      }),
    ).toThrow('changed-environment-identity')
    expect(resources.get(record.id)).toEqual(first)
    resources.update(record.id, (value) =>
      value.resources.push({
        kind: 'volume',
        slot: 'data',
        purpose: 'data',
        name: 'fixture-data',
        token: 'fixture-volume',
        id: 'fixture-data',
        stamp: 'a'.repeat(64),
        status: 'observed',
      }),
    )
    const before = resources.get(record.id)
    expect(resources.snapshot(record.id, first.digest)).toEqual(first)
    expect(resources.snapshot(record.id, before.digest)).toEqual(before)
    expect(() => resources.snapshot(record.id, '0'.repeat(64))).toThrow('unknown-runtime-snapshot')
    expect(() => resources.snapshot(record.id, '../outside')).toThrow('invalid-runtime-snapshot')
    expect(() =>
      resources.update(record.id, (value) => {
        entry(value.resources, 0).id = 'foreign'
      }),
    ).toThrow('changed-resource-identity')
    expect(resources.get(record.id)).toEqual(before)
    const runtime = new DockerResources(
      resources,
      record.id,
      {
        provenance: 'fixture',
        async call() {
          throw new Error('No backend action expected')
        },
      },
      () => {},
      new AbortController().signal,
    )
    await expect(runtime.start(entry(before.record.resources, 0))).rejects.toThrow(
      'invalid-start-resource',
    )
    const suffix = resources.files.path(`delivery/environments/${record.id}/0002.json`),
      original = readFileSync(suffix)
    try {
      writeFileSync(suffix, '{}')
      expect(() => resources.snapshot(record.id, first.digest)).toThrow()
    } finally {
      writeFileSync(suffix, original)
    }
    expect(resources.snapshot(record.id, first.digest)).toEqual(first)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

it('bounds actual synthetic client output at the requested lower limit', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-docker-output-')))
  try {
    const binary = join(dir, 'fixture-docker')
    writeFileSync(binary, `#!${process.execPath}\nprocess.stdout.write('x'.repeat(2048))\n`, {
      mode: 0o700,
    })
    const result = await new DockerCli(binary, { PATH: process.env.PATH, HOME: dir }).call(
      ['info'],
      { outputBytes: 1024 },
    )
    expect(result).toMatchObject({ status: 'crashed', failure: 'output-limit', stdout: '' })
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
it('keeps ordinary gate snapshot bytes compatible while bounding environment snapshot reads', () =>
  fixture(({ root }) => {
    const before = workspaceSnapshot(root)
    expect(
      workspaceSnapshot(root, {
        maxFileBytes: 1024,
        maxBytes: 2048,
        maxFiles: 5,
        denySymlinks: true,
      }),
    ).toEqual(before)
    writeFileSync(join(root, 'oversized.bin'), Buffer.alloc(2049))
    expect(() =>
      workspaceSnapshot(root, {
        maxFileBytes: 1024,
        maxBytes: 2048,
        maxFiles: 5,
        denySymlinks: true,
      }),
    ).toThrow()
  }))

it('preserves old input-file planning contracts while advertising the directory backend layout explicitly', async () => {
  const input = recipe(),
    service = entry(input.services, 0)
  service.mounts = [{ kind: 'input', source: 'server', target: '/inputs/server', access: 'read' }]
  service.start = {
    argv: ['node', '/inputs/server'],
    cwd: '/tmp',
    origin: { kind: 'file', file: 'server' },
  }
  expect(validateEnvironmentRecipe(input)).toEqual(input)
  const { driver, calls } = preflightDriver()
  expect((await dockerPreflight(driver, input, DOCKER_REFERENCE_HELPER)).reason).toBe(
    'legacy-input-file-mount-unavailable',
  )
  expect(calls).toEqual([])
  service.start.argv = ['node', '/inputs/server/app.cjs']
  expect(validateEnvironmentRecipe(input)).toEqual(input)
  expect((await dockerPreflight(driver, input, DOCKER_REFERENCE_HELPER)).available).toBe(true)
})

it('reserves immutable history space for observed stop and retirement before starting many setup jobs', async () => {
  const input = recipe()
  input.commands = Array.from({ length: 110 }, (_, index) => ({
    id: `seed-${index}`,
    service: 'web',
    phase: 'seed' as const,
    command: {
      argv: ['node', '-e', 'process.exit(0)'],
      cwd: '/tmp',
      origin: { kind: 'recipe' as const },
    },
    timeoutMs: 1000,
  }))
  const { driver, calls } = preflightDriver()
  const result = await dockerPreflight(driver, input, DOCKER_REFERENCE_HELPER)
  expect(result).toMatchObject({
    available: false,
    reason: 'resource-history-capacity',
    executed: false,
  })
  expect(
    calls.every((args) => ['context', 'info', 'version', 'image'].includes(args[0] ?? '')),
  ).toBe(true)
})
