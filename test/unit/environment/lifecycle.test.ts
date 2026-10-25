import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import type { DockerTransport } from '../../../src/environment/docker-command.js'
import { DockerResources } from '../../../src/environment/docker-resources.js'
import {
  EnvironmentLifecycle,
  type EnvironmentLifecycleRequest,
} from '../../../src/environment/lifecycle.js'
import { EnvironmentOperations } from '../../../src/environment/operations.js'
import { EnvironmentRecipes } from '../../../src/environment/recipe-store.js'
import { EnvironmentResources, type EnvironmentRuntime } from '../../../src/environment/runtime.js'
import { entry, fixture } from '../../support/delivery.js'
import { environmentRecipe } from '../../support/environment.js'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture object')
  return value
}
async function lifecycleFixture(
  run: (context: {
    lifecycle: EnvironmentLifecycle
    records: EnvironmentResources
    request: (action?: EnvironmentLifecycleRequest['action']) => EnvironmentLifecycleRequest
    objects: Map<string, Record<string, unknown>>
    calls: string[][]
    dir: string
    operations: EnvironmentOperations
  }) => Promise<void>,
) {
  await fixture(async ({ root, dir, planning }) => {
    const app = 'Fixture application.\n'
    writeFileSync(join(root, 'app.cjs'), app)
    const recipe = new EnvironmentRecipes(planning.sources.files.root).prepare(
      environmentRecipe(root, app),
    )
    const records = new EnvironmentResources(planning.sources.files)
    const now = new Date().toISOString()
    const record: EnvironmentRuntime = {
      schema: 'wholeloop/environment-runtime@1',
      id: `environment-${'a'.repeat(32)}`,
      run: `delivery-${'a'.repeat(16)}`,
      basis: 'b'.repeat(64),
      recipe: recipe.digest,
      key: 'fixture',
      grant: `authorization-${'d'.repeat(16)}`,
      grantDigest: 'e'.repeat(64),
      token: 'fixture-owner',
      effect: `effect-${'f'.repeat(32)}`,
      invocation: `invocation-${'f'.repeat(16)}`,
      createdAt: now,
      deadline: new Date(Date.now() + 60000).toISOString(),
      lifetimeDeadline: new Date(Date.now() + 120000).toISOString(),
      state: 'provisioning',
      provenance: 'fixture',
      helperImage: entry(environmentRecipe(root, app).services, 0).image,
      host: { os: 'fixture', architecture: 'arm64' },
      daemon: {
        id: 'fixture-daemon',
        version: '29.9.2',
        os: 'linux',
        architecture: 'arm64',
        cpus: 8,
        memoryBytes: 8 * 1024 ** 3,
      },
      candidates: [],
      resources: [],
      observations: [],
      acceptance: 'not-established',
      publication: 'not-performed',
    }
    records.create(record)
    const operations = new EnvironmentOperations(records.files, record.id, 'fixture')
    operations.activateProvisioning()
    const objects = new Map<string, Record<string, unknown>>(),
      calls: string[][] = []
    const driver: DockerTransport = {
      provenance: 'fixture',
      async call(args) {
        calls.push(args)
        let stdout = ''
        if (args[0] === 'info') stdout = JSON.stringify({ ID: 'fixture-daemon' })
        else if (args[1] === 'ls') {
          const filter = entry(args, args.indexOf('--filter') + 1)
          const values = [...objects.entries()]
            .filter(([, value]) => value.kind === args[0])
            .filter(([id, value]) =>
              filter.startsWith('id=')
                ? id === filter.slice(3)
                : String(value.Name).replace(/^\//, '') === filter.slice(5),
            )
            .map(([id, value]) => ({
              ID: id,
              Name: String(value.Name).replace(/^\//, ''),
              Names: String(value.Name).replace(/^\//, ''),
            }))
          stdout = values.map((value) => JSON.stringify(value)).join('\n')
        } else if (args[1] === 'inspect') {
          const value = objects.get(entry(args, args.length - 1))
          if (!value) return { status: 'crashed', stdout: '', code: 1, digest: 'f'.repeat(64) }
          stdout = JSON.stringify([value])
        } else if (args[1] === 'stop') {
          const value = required(objects.get(entry(args, args.length - 1)))
          value.State = { Running: false, Restarting: false, Paused: false }
          stdout = entry(args, args.length - 1)
        } else if (args[1] === 'rm') {
          objects.delete(entry(args, args.length - 1))
          stdout = entry(args, args.length - 1)
        } else throw Error('Unexpected fixture operation')
        return { status: 'succeeded', stdout, code: 0, digest: contractDigest({ args, stdout }) }
      },
    }
    const owned = new DockerResources(
      records,
      record.id,
      driver,
      () => {},
      new AbortController().signal,
    )
    const resources = [
      {
        kind: 'container' as const,
        slot: 'web',
        purpose: 'service' as const,
        name: 'wl-fixture-web',
        id: '1'.repeat(64),
        token: 'fixture-container',
      },
      {
        kind: 'network' as const,
        slot: 'network',
        purpose: 'network' as const,
        name: 'wl-fixture-network',
        id: '2'.repeat(64),
        token: 'fixture-network',
      },
      {
        kind: 'volume' as const,
        slot: 'data',
        purpose: 'data' as const,
        name: 'wl-fixture-data',
        id: 'wl-fixture-data',
        token: 'fixture-volume',
      },
    ]
    for (const resource of resources) {
      const labels = owned.labels({ ...resource, status: 'intent' })
      const value = {
        kind: resource.kind,
        Id: resource.id,
        Name: resource.name,
        Created: now,
        CreatedAt: now,
        Driver: resource.kind === 'network' ? 'bridge' : 'local',
        Image: 'sha256:fixture',
        Mountpoint: '/fixture/data',
        Options: {},
        Internal: true,
        Labels: labels,
        Config: { Labels: labels },
        State: { Running: true, Restarting: false, Paused: false },
      }
      objects.set(resource.id, value)
      const stamp = contractDigest({
        kind: resource.kind,
        id: resource.id,
        created: now,
        driver: resource.kind === 'container' ? value.Image : value.Driver,
        ...(resource.kind === 'volume' ? { mountpoint: value.Mountpoint } : {}),
      })
      records.update(record.id, (current) =>
        current.resources.push({ ...resource, stamp, status: 'observed' }),
      )
    }
    records.update(record.id, (current) => {
      current.state = 'failed'
    })
    const lifecycle = new EnvironmentLifecycle(records.files, driver)
    let n = 0
    await run({
      lifecycle,
      records,
      objects,
      calls,
      dir,
      operations,
      request: (action = 'stop') => ({
        schema: 'wholeloop/environment-lifecycle-request@1',
        id: `fixture-${++n}`,
        environment: record.id,
        expected: records.get(record.id).digest,
        action,
        reason: 'Review exact disposable fixture resources.',
      }),
    })
  })
}
it('stops failed services, retains data/evidence and makes an exact repeated request inert', () =>
  lifecycleFixture(async ({ lifecycle, records, objects, calls, request }) => {
    const input = request(),
      before = records.get(input.environment)
    const receipt = await lifecycle.execute(input)
    expect(receipt).toMatchObject({ state: 'retained', clients: 'stopped', provenance: 'fixture' })
    expect(objects.size).toBe(3)
    expect(calls.filter((args) => args[1] === 'stop')).toHaveLength(1)
    expect(calls.some((args) => args[1] === 'rm')).toBe(false)
    expect(
      records
        .get(input.environment)
        .record.observations.slice(0, before.record.observations.length),
    ).toEqual(before.record.observations)
    const count = calls.length
    expect(await lifecycle.execute(input)).toEqual(receipt)
    expect(calls).toHaveLength(count)
    await expect(lifecycle.execute({ ...input, reason: 'Changed review.' })).rejects.toThrow(
      'lifecycle-request-conflict',
    )
  }))
it('requires a current review and explicit retirement, observes absence and retains immutable receipts', () =>
  lifecycleFixture(async ({ lifecycle, records, objects, calls, request, dir }) => {
    const stale = request('retire')
    records.update(stale.environment, (r) => {
      r.reason = 'updated-evidence'
    })
    await expect(lifecycle.execute(stale)).rejects.toThrow('stale-lifecycle-review')
    expect(calls).toEqual([])
    const receipt = await lifecycle.execute(request('retire'))
    expect(receipt.state).toBe('retired')
    expect(objects.size).toBe(0)
    expect(calls.filter((a) => a[1] === 'rm').map((a) => a[0])).toEqual([
      'container',
      'network',
      'volume',
    ])
    expect(
      records.get(receipt.environment).record.resources.every((r) => r.status === 'retired'),
    ).toBe(true)
    expect(
      existsSync(
        join(dir, 'state', 'delivery', 'environment-control', receipt.environment, 'receipts'),
      ),
    ).toBe(true)
  }))
it.each(['labels', 'stamp', 'daemon', 'provenance'] as const)(
  'refuses changed %s without deleting an unrelated resource',
  (kind) =>
    lifecycleFixture(async ({ lifecycle, objects, calls, request }) => {
      const input = request('retire'),
        value = required(objects.get('1'.repeat(64)))
      if (kind === 'labels') value.Config = { Labels: {} }
      if (kind === 'stamp') value.Created = '2020-01-01T00:00:00.000Z'
      if (kind === 'daemon') {
        const original = lifecycle.driver.call
        lifecycle.driver.call = async (args, o) =>
          args[0] === 'info'
            ? { status: 'succeeded', stdout: '{"ID":"foreign"}', code: 0, digest: 'f'.repeat(64) }
            : original(args, o)
      }
      if (kind === 'provenance') {
        await expect(
          new EnvironmentLifecycle(lifecycle.files, {
            ...lifecycle.driver,
            provenance: 'host-observed',
          }).execute(input),
        ).rejects.toThrow('lifecycle-provenance-mismatch')
      } else expect((await lifecycle.execute(input)).state).toBe('unknown')
      expect(objects.size).toBe(3)
      expect(calls.some((a) => a[1] === 'rm')).toBe(false)
    }),
)
it('recovers a lost removal response through positive absence without issuing that removal twice', () =>
  lifecycleFixture(async ({ lifecycle, objects, calls, request }) => {
    const input = request('retire'),
      original = lifecycle.driver.call
    let interrupted = false
    lifecycle.driver.call = async (args, options) => {
      const result = await original(args, options)
      if (!interrupted && args[0] === 'container' && args[1] === 'rm') {
        interrupted = true
        throw Error('Controller lost its response after the daemon removed the container.')
      }
      return result
    }
    expect((await lifecycle.execute(input)).state).toBe('unknown')
    expect(objects.has('1'.repeat(64))).toBe(false)
    expect(
      (await new EnvironmentLifecycle(lifecycle.files, lifecycle.driver).execute(input)).state,
    ).toBe('retired')
    expect(calls.filter((a) => a[0] === 'container' && a[1] === 'rm')).toHaveLength(1)
  }))
it('retains incomplete legacy startup and refuses to infer stopped client proof or undo', () =>
  lifecycleFixture(async ({ lifecycle, records, objects, calls, request, operations }) => {
    // A separately retained pre-tracking history is deliberately not upgraded by recovery.
    const { rmSync } = await import('node:fs')
    rmSync(
      operations.files.path(
        `delivery/environment-operations/${operations.environment}/provision.json`,
      ),
    )
    const receipt = await lifecycle.execute(request('retire'))
    expect(receipt).toMatchObject({ state: 'unknown', clients: 'unknown' })
    expect(objects.size).toBe(3)
    expect(calls.some((a) => a[1] === 'rm')).toBe(false)
    expect(records.get(receipt.environment).record.resources.some((r) => r.kind === 'volume')).toBe(
      true,
    )
  }))
it('blocks a second controller while a recorded lifecycle owner is still alive', () =>
  lifecycleFixture(async ({ lifecycle, request, calls }) => {
    const input = request(),
      base = `delivery/environment-control/${input.environment}`
    lifecycle.files.atomic(
      `${base}/claim.json`,
      JSON.stringify({
        schema: 'wholeloop/environment-lifecycle-claim@1',
        id: '01234567-89ab-cdef-0123-456789abcdef',
        environment: input.environment,
        request: 'a'.repeat(64),
        pid: process.pid,
        at: new Date().toISOString(),
      }),
    )
    await expect(lifecycle.execute(input)).rejects.toThrow(
      'lifecycle-controller-not-confirmed-stopped',
    )
    expect(calls).toEqual([])
  }))
it('keeps unknown same-name intents and refuses adoption without the full token tuple', () =>
  lifecycleFixture(async ({ lifecycle, records, objects, calls, request }) => {
    const record = entry(records.list(), 0).record
    records.update(record.id, (r) =>
      r.resources.push({
        kind: 'volume',
        slot: 'lost',
        purpose: 'data',
        name: 'wl-lost',
        token: 'exact-lost-token',
        status: 'unknown',
      }),
    )
    objects.set('wl-lost', {
      kind: 'volume',
      Name: 'wl-lost',
      Labels: {},
      CreatedAt: new Date().toISOString(),
      Driver: 'local',
      Options: {},
      Mountpoint: '/foreign',
    })
    expect((await lifecycle.execute(request('retire'))).state).toBe('unknown')
    expect(objects.has('wl-lost')).toBe(true)
    expect(calls.some((a) => a[1] === 'rm')).toBe(false)
  }))

it('binds a lost volume ID only from the original full intent tuple and observed creation identity', () =>
  lifecycleFixture(async ({ lifecycle, records, objects, request }) => {
    const record = entry(records.list(), 0).record
    const intent = {
      kind: 'volume' as const,
      slot: 'lost-owned',
      purpose: 'data' as const,
      name: 'wl-lost-owned',
      token: 'lost-owned-token',
      status: 'unknown' as const,
    }
    records.update(record.id, (r) => r.resources.push(intent))
    const owner = new DockerResources(
      records,
      record.id,
      lifecycle.driver,
      () => {},
      new AbortController().signal,
    )
    objects.set(intent.name, {
      kind: 'volume',
      Name: intent.name,
      Labels: owner.labels(intent),
      CreatedAt: new Date().toISOString(),
      Driver: 'local',
      Options: {},
      Mountpoint: '/fixture/lost-owned',
    })
    expect((await lifecycle.execute(request('retire'))).state).toBe('retired')
    const recovered = records.get(record.id).record.resources.find((r) => r.slot === intent.slot)
    expect(recovered).toMatchObject({ id: intent.name, status: 'retired' })
    expect(recovered?.stamp).toMatch(/^[a-f0-9]{64}$/)
  }))
it('does not turn malformed, truncated or unavailable listings into absence', () =>
  lifecycleFixture(async ({ lifecycle, calls, objects, request }) => {
    const call = lifecycle.driver.call
    lifecycle.driver.call = async (args, options) =>
      args[1] === 'ls'
        ? { status: 'succeeded', stdout: '{"ID":"truncated"}', code: 0, digest: 'f'.repeat(64) }
        : call(args, options)
    expect((await lifecycle.execute(request('retire'))).state).toBe('unknown')
    expect(objects.size).toBe(3)
    expect(calls.some((args) => args[1] === 'rm')).toBe(false)
  }))
it('observes actual applied removal despite a failed client exit and never infers ledger or topic actions', () =>
  lifecycleFixture(async ({ lifecycle, calls, objects, request }) => {
    const call = lifecycle.driver.call
    lifecycle.driver.call = async (args, options) => {
      const result = await call(args, options)
      return args[1] === 'rm' ? { ...result, status: 'crashed', code: 1 } : result
    }
    expect((await lifecycle.execute(request('retire'))).state).toBe('retired')
    expect(objects.size).toBe(0)
    expect(
      calls.every((args) => ['info', 'container', 'network', 'volume'].includes(args[0] ?? '')),
    ).toBe(true)
  }))

it('rejects recognizable credential metadata before persisting any lifecycle request or fence', () =>
  lifecycleFixture(async ({ lifecycle, request, operations, calls }) => {
    const input = request()
    const credentialText = ['password', String.fromCharCode(120).repeat(12)].join('=')
    await expect(lifecycle.execute({ ...input, reason: credentialText })).rejects.toThrow(
      'credential-bearing',
    )
    expect(() => operations.fence('invalid-metadata', credentialText)).toThrow('credential-bearing')
    expect(
      existsSync(
        lifecycle.files.path(`delivery/environment-control/${input.environment}/requests`),
      ),
    ).toBe(false)
    expect(
      existsSync(
        lifecycle.files.path(`delivery/environment-control/${input.environment}/fence.json`),
      ),
    ).toBe(false)
    expect(calls).toEqual([])
  }))
