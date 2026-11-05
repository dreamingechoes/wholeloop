import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DockerTransport } from '../../../src/environment/docker-command.js'
import {
  type ContainerSpec,
  DOCKER_REFERENCE_HELPER,
  observedContainerPolicy,
} from '../../../src/environment/docker-policy.js'
import { DockerResources } from '../../../src/environment/docker-resources.js'
import { type EnvironmentResource, EnvironmentResources } from '../../../src/environment/runtime.js'
import { StoreFiles } from '../../../src/state/files.js'
import inspector from '../../fixtures/environment/container-inspect.json' with { type: 'json' }

afterEach(() => vi.restoreAllMocks())

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Fixture resource missing')
  return value
}
async function setup(
  run: (input: {
    owned: DockerResources
    objects: Map<string, Record<string, unknown>>
    calls: string[][]
    mode(value: string): void
  }) => Promise<void>,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-owned-snapshot-')))
  try {
    const records = new EnvironmentResources(new StoreFiles(root)),
      id = `environment-${'a'.repeat(32)}`,
      now = new Date().toISOString(),
      objects = new Map<string, Record<string, unknown>>(),
      calls: string[][] = []
    let mode = 'valid'
    records.create({
      schema: 'wholeloop/environment-runtime@1',
      id,
      run: `delivery-${'a'.repeat(16)}`,
      basis: 'b'.repeat(64),
      recipe: 'c'.repeat(64),
      key: 'snapshot',
      grant: `authorization-${'d'.repeat(16)}`,
      grantDigest: 'e'.repeat(64),
      token: 'fixture-owner',
      effect: `effect-${'f'.repeat(32)}`,
      createdAt: now,
      deadline: new Date(Date.now() + 60000).toISOString(),
      lifetimeDeadline: new Date(Date.now() + 120000).toISOString(),
      state: 'ready',
      provenance: 'fixture',
      helperImage: DOCKER_REFERENCE_HELPER,
      host: { os: 'fixture', architecture: 'arm64' },
      candidates: [],
      resources: [],
      observations: [],
      acceptance: 'not-established',
      publication: 'not-performed',
    })
    const driver: DockerTransport = {
        provenance: 'fixture',
        call: async (args) => {
          calls.push(args)
          if (args[1] !== 'inspect') throw new Error('Snapshot must only inspect')
          const values = args
            .slice(2)
            .map((key) => objects.get(key))
            .reverse()
          if (mode === 'missing') values.pop()
          if (mode === 'extra') values.push({ Id: 'f'.repeat(64) })
          if (mode === 'duplicate' && values.length > 1) values[1] = values[0]
          return {
            status: 'succeeded',
            stdout: JSON.stringify(values),
            code: 0,
            digest: contractDigest(values),
          }
        },
      },
      owned = new DockerResources(records, id, driver, () => {}, new AbortController().signal)
    const values = [
      {
        kind: 'container',
        slot: 'web',
        purpose: 'service',
        name: 'fixture-service',
        id: inspector.Id,
        token: 'web',
      },
      {
        kind: 'volume',
        slot: 'data',
        purpose: 'data',
        name: 'fixture-data',
        id: 'fixture-data',
        token: 'data',
      },
      {
        kind: 'volume',
        slot: 'workspace',
        purpose: 'workspace',
        name: 'fixture-workspace',
        id: 'fixture-workspace',
        token: 'workspace',
      },
      {
        kind: 'network',
        slot: 'network',
        purpose: 'network',
        name: 'fixture-network',
        id: 'c'.repeat(64),
        token: 'network',
      },
    ] satisfies Omit<EnvironmentResource, 'status'>[]
    const resources: EnvironmentResource[] = []
    for (const value of values) {
      const resource: EnvironmentResource = { ...value, status: 'observed' },
        labels = owned.labels(resource)
      const observed: Record<string, unknown> =
        value.kind === 'container'
          ? {
              ...structuredClone(inspector),
              Config: { ...structuredClone(inspector.Config), Labels: labels },
            }
          : {
              Id: value.id,
              Name: value.name,
              Created: now,
              CreatedAt: now,
              Driver: value.kind === 'network' ? 'bridge' : 'local',
              Mountpoint: `/fixture/${value.slot}`,
              Internal: true,
              Options:
                value.kind === 'network'
                  ? { 'com.docker.network.bridge.gateway_mode_ipv4': 'isolated' }
                  : null,
              Labels: labels,
            }
      if (value.kind === 'container')
        resource.policy = contractDigest(observedContainerPolicy(observed))
      resource.stamp = contractDigest({
        kind: value.kind,
        id: value.id,
        created: value.kind === 'volume' ? observed.CreatedAt : observed.Created,
        driver: value.kind === 'container' ? observed.Image : observed.Driver,
        ...(value.kind === 'volume' ? { mountpoint: observed.Mountpoint } : {}),
      })
      resources.push(resource)
      objects.set(value.id, observed)
    }
    records.update(id, (record) => {
      record.resources = resources
    })
    await run({
      owned,
      objects,
      calls,
      mode: (value) => {
        mode = value
      },
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const mountedSpec = (): ContainerSpec => ({
  image: {
    ref: DOCKER_REFERENCE_HELPER,
    id: `sha256:${'a'.repeat(64)}`,
    manifest: `sha256:${'b'.repeat(64)}`,
    os: 'linux',
    architecture: 'arm64',
    env: [],
    entrypoint: [],
    command: [],
  },
  command: { argv: ['node', 'suite.cjs'], cwd: '/workspace/app', origin: { kind: 'recipe' } },
  mounts: [
    { source: 'fixture-workspace', target: '/workspace/app', write: false },
    { source: 'fixture-data', target: '/data/db', write: true },
    { source: 'fixture-data', target: '/data/again', write: false },
  ],
  network: 'fixture-network',
  ports: [],
  user: '65532:65532',
  memoryMiB: 128,
  cpus: 1,
})
describe('fresh batched owned environment observation', () => {
  it('validates reordered complete tuples and mounted volumes with one query per kind', async () => {
    await setup(async ({ owned, objects, calls }) => {
      const reads = vi.spyOn(owned.records, 'get')
      const snapshot = await owned.ownedSnapshot()
      expect(reads).toHaveBeenCalledTimes(4)
      reads.mockRestore()
      expect(snapshot).toHaveLength(4)
      expect(calls).toHaveLength(3)
      expect(calls.find((args) => args[0] === 'volume')?.length).toBe(4)
      for (const entry of snapshot)
        expect(entry.observed).toEqual(objects.get(entry.resource.id ?? ''))
      required(objects.get('fixture-data')).CreatedAt = '2026-01-01T00:00:00.000Z'
      await expect(owned.ownedSnapshot()).rejects.toThrow('resource-identity-changed')
    })
  })
  it.each([1, 2, 3])(
    'revalidates local ownership history after backend response %i',
    async (query) => {
      await setup(async ({ owned, calls }) => {
        const original = owned.driver.call.bind(owned.driver)
        vi.spyOn(owned.driver, 'call').mockImplementation(async (...args) => {
          const response = await original(...args)
          if (calls.length === query)
            owned.records.files.atomic(
              `delivery/environments/${owned.environment}/0001.json`,
              '{}\n',
            )
          return response
        })
        await expect(owned.ownedSnapshot()).rejects.toThrow()
        expect(calls).toHaveLength(query)
      })
    },
  )
  it('never carries a validated ownership snapshot into the next inspection', async () => {
    await setup(async ({ owned, calls }) => {
      expect(await owned.ownedSnapshot()).toHaveLength(4)
      owned.records.files.atomic(`delivery/environments/${owned.environment}/0001.json`, '{}\n')
      await expect(owned.ownedSnapshot()).rejects.toThrow()
      expect(calls).toHaveLength(3)
    })
  })
  it('retains fresh single-container mount validation in one owned volume query', async () => {
    await setup(async ({ owned, objects, calls }) => {
      const app = required(
        owned.records.get(owned.environment).record.resources.find((r) => r.kind === 'container'),
      )
      expect(await owned.owned(app)).toEqual(objects.get(inspector.Id))
      expect(calls).toHaveLength(2)
      expect(calls[1]?.slice(0, 2)).toEqual(['volume', 'inspect'])
      required(objects.get('fixture-workspace')).Options = { device: '/foreign/path' }
      await expect(owned.owned(app)).rejects.toThrow('volume-policy-changed')
    })
  })
  it('freshly validates all mount dependencies in one bounded query before each create', async () => {
    await setup(async ({ owned, calls, objects }) => {
      await expect(owned.container('candidate', 'test', mountedSpec())).rejects.toThrow(
        'Snapshot must only inspect',
      )
      expect(calls[0]).toEqual(['volume', 'inspect', 'fixture-workspace', 'fixture-data'])
      expect(calls[1]?.slice(0, 2)).toEqual(['network', 'inspect'])
      expect(calls[2]?.slice(0, 2)).toEqual(['container', 'create'])
      calls.length = 0
      required(objects.get('fixture-data')).Labels = {}
      await expect(owned.container('later', 'test', mountedSpec())).rejects.toThrow(
        'resource-identity-changed',
      )
      expect(calls).toEqual([['volume', 'inspect', 'fixture-workspace', 'fixture-data']])
      expect(
        owned.records.get(owned.environment).record.resources.some((r) => r.slot === 'later'),
      ).toBe(false)
    })
  })
  it.each(['missing', 'extra', 'duplicate'])(
    'refuses %s mount observations before recording container intent',
    async (value) => {
      await setup(async ({ owned, mode, calls }) => {
        mode(value)
        await expect(owned.container('refused', 'test', mountedSpec())).rejects.toThrow(
          'resource-identity-changed',
        )
        expect(calls).toHaveLength(1)
        expect(
          owned.records.get(owned.environment).record.resources.some((r) => r.slot === 'refused'),
        ).toBe(false)
      })
    },
  )
  it('bounds growing resource histories to sixteen IDs per fresh inspect', async () => {
    await setup(async ({ owned, objects, calls }) => {
      const template = required(objects.get('fixture-data'))
      const additional: EnvironmentResource[] = []
      for (let index = 0; index < 17; index++) {
        const name = `fixture-extra-${index}`,
          resource: EnvironmentResource = {
            kind: 'volume',
            slot: `extra-${index}`,
            purpose: 'data',
            name,
            id: name,
            token: `extra-${index}`,
            status: 'observed',
          },
          value: Record<string, unknown> = {
            ...structuredClone(template),
            Name: name,
            Labels: owned.labels(resource),
          }
        resource.stamp = contractDigest({
          kind: 'volume',
          id: name,
          created: value.CreatedAt,
          driver: value.Driver,
          mountpoint: value.Mountpoint,
        })
        additional.push(resource)
        objects.set(name, value)
      }
      owned.records.update(owned.environment, (record) => {
        record.resources.push(...additional)
      })
      const reads = vi.spyOn(owned.records, 'get')
      expect(await owned.ownedSnapshot()).toHaveLength(21)
      expect(reads).toHaveBeenCalledTimes(5)
      expect(calls).toHaveLength(4)
      expect(calls.every((args) => args.length <= 18)).toBe(true)
    })
  })
  it('refuses duplicated retained resource identities before querying Docker', async () => {
    await setup(async ({ owned, calls }) => {
      owned.records.update(owned.environment, (record) => {
        const original = required(record.resources.find((r) => r.kind === 'volume'))
        record.resources.push({ ...original, slot: 'duplicate-slot', token: 'duplicate-token' })
      })
      await expect(owned.ownedSnapshot()).rejects.toThrow('duplicate-owned-resource')
      expect(calls).toEqual([])
    })
  })
  it('preserves the earlier retained-history refusal for duplicated slots', async () => {
    await setup(async ({ owned, calls }) => {
      expect(() =>
        owned.records.update(owned.environment, (record) => {
          const original = required(record.resources.find((r) => r.kind === 'volume'))
          record.resources.push({
            ...original,
            id: 'fixture-other',
            name: 'fixture-other',
            token: 'other-token',
          })
        }),
      ).toThrow('duplicate-environment-resource')
      expect(owned.records.get(owned.environment).record.resources).toHaveLength(4)
      expect(calls).toEqual([])
    })
  })
  it.each(['missing', 'extra', 'duplicate'])(
    'refuses %s batch results rather than guessing ordering',
    async (mode) => {
      await setup(async ({ owned, mode: select }) => {
        select(mode)
        await expect(owned.ownedSnapshot()).rejects.toThrow('resource-identity-changed')
      })
    },
  )
  it.each(['foreign-label', 'volume-policy', 'container-policy', 'foreign-mount'])(
    'retains %s ownership refusal',
    async (mode) => {
      await setup(async ({ owned, objects }) => {
        const app = required(objects.get(inspector.Id)),
          data = required(objects.get('fixture-data'))
        if (mode === 'foreign-label') data.Labels = {}
        if (mode === 'volume-policy') data.Options = { device: '/foreign/path' }
        if (mode === 'container-policy')
          (app.HostConfig as { Privileged: boolean }).Privileged = true
        if (mode === 'foreign-mount')
          required((app.Mounts as { Name: string }[])[0]).Name = 'foreign-volume'
        await expect(owned.ownedSnapshot()).rejects.toThrow()
      })
    },
  )
})
