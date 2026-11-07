import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadProviders } from '../../../src/providers/load.js'
import { type OperationCall, performOperation } from '../../../src/providers/operations.js'
import { rolloutHost } from '../../../src/providers/rollout.js'
import { querySource } from '../../../src/providers/sources.js'
import {
  type ClientMcpInventory,
  clientMcpInventory,
  clientProviderHost,
  planProviderTransport,
} from '../../../src/providers/transport.js'
import { flagEvidence } from '../../../src/ramp/evidence.js'
import { StateStore } from '../../../src/state/store.js'

const provider = (id = 'posthog') => {
  const entry = loadProviders({
    root: '/nonexistent-transport-repo',
    user: '/nonexistent-transport-user',
  }).providers.find((entry) => entry.manifest.id === id)
  if (!entry) throw new Error('Missing fixture provider')
  return entry
}
const inventory = (
  tool = 'execute-sql',
  bindings?: Record<string, string>,
): ClientMcpInventory => ({
  schema: 'wholeloop/client-mcp@1',
  server: 'posthog',
  tools: [
    { name: tool, inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
  ],
  ...(bindings ? { bindings } : {}),
})
const observed = {
  status: 'succeeded' as const,
  ref: 'https://example.invalid/observed',
  body: 'Observed fixture result',
  complete: true,
}
const dashboard = {
  title: 'Fixture dashboard',
  body: JSON.stringify({ metric: { id: 'fixture-metric' }, metricRef: 'fixture:metric' }),
}

describe('client-owned provider transport', () => {
  it('prefers the client MCP tool without invoking the available native host', async () => {
    const calls: OperationCall[] = []
    let native = 0
    const host = clientProviderHost(provider(), {
      mcp: {
        inventory: inventory(),
        invoke: async (call) => {
          calls.push(call)
          return observed
        },
      },
      native: {
        invoke: async () => {
          native++
          return observed
        },
      },
    })
    expect(
      await performOperation(
        provider(),
        'source.product-analytics.query',
        { query: 'SELECT 1' },
        host,
      ),
    ).toEqual(observed)
    expect(calls.map((call) => call.tool)).toEqual(['execute-sql'])
    expect(native).toBe(0)
  })

  it.each(['missing', 'wrong-server', 'tool-absent'])(
    '%s MCP access does not select an available native host',
    async (kind) => {
      let native = 0
      const metadata =
        kind === 'missing'
          ? undefined
          : kind === 'wrong-server'
            ? { ...inventory(), server: 'other' }
            : inventory('another-tool')
      const host = clientProviderHost(provider(), {
        ...(metadata ? { mcp: { inventory: metadata, invoke: async () => observed } } : {}),
        native: {
          invoke: async () => {
            native++
            return observed
          },
        },
      })
      await expect(
        performOperation(provider(), 'source.product-analytics.query', { query: 'SELECT 1' }, host),
      ).rejects.toThrow('unavailable')
      expect(native).toBe(0)
    },
  )

  it('does not fall back after a potentially completed MCP write and redacts its error', async () => {
    let fallback = 0
    const host = clientProviderHost(provider(), {
      mcp: {
        inventory: inventory('fixture-create', { 'dashboards.create': 'fixture-create' }),
        invoke: async () => {
          throw new Error('private-error-payload')
        },
      },
      native: {
        invoke: async () => {
          fallback++
          return observed
        },
      },
    })
    await expect(
      performOperation(provider(), 'dashboards.create', dashboard, host),
    ).rejects.toThrow('without switching transports')
    expect(fallback).toBe(0)
  })

  it('has no HTTP transport and never turns an explicit native choice into MCP', async () => {
    let mcp = 0
    const host = (transport: string) =>
      clientProviderHost(provider(), {
        transport: transport as 'native',
        mcp: {
          inventory: inventory(),
          invoke: async () => {
            mcp++
            return observed
          },
        },
      })
    expect(() =>
      planProviderTransport(provider(), 'source.product-analytics.query', {
        transport: 'http' as 'native',
      }),
    ).toThrow('Unknown provider transport')
    await expect(
      performOperation(
        provider(),
        'source.product-analytics.query',
        { query: 'SELECT 1' },
        host('http'),
      ),
    ).rejects.toThrow('Unknown provider transport')
    await expect(
      performOperation(
        provider(),
        'source.product-analytics.query',
        { query: 'SELECT 1' },
        host('native'),
      ),
    ).rejects.toThrow('unavailable')
    expect(mcp).toBe(0)
    expect(
      planProviderTransport(provider(), 'dashboards.create', { transport: 'native' }),
    ).toMatchObject({ transport: 'native', effects: 'not-performed' })
  })

  it('lets an observed reviewed MCP dashboard binding precede the native handoff', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-mcp-routing-'))
    try {
      const calls: OperationCall[] = []
      const store = new StateStore(join(dir, 'state'))
      const remote = clientProviderHost(provider(), {
        mcp: {
          inventory: inventory('fixture-create', { 'dashboards.create': 'fixture-create' }),
          invoke: async (call) => {
            calls.push(call)
            return observed
          },
        },
      })
      const result = await performOperation(
        provider(),
        'dashboards.create',
        dashboard,
        rolloutHost(store.files, dir, remote),
      )
      expect(result).toEqual(observed)
      expect(calls[0]).toMatchObject({
        operation: 'dashboards.create',
        tool: 'fixture-create',
        args: dashboard,
      })
      expect(store.files.read('providers/rollout/posthog')).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps an unbound Amplitude operation as a real pending handoff', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-mcp-handoff-'))
    try {
      const amplitude = provider('amplitude')
      let invoked = 0
      const host = clientProviderHost(amplitude, {
        mcp: {
          inventory: { ...inventory('fixture-create'), server: 'amplitude' },
          invoke: async () => {
            invoked++
            return observed
          },
        },
      })
      const result = await performOperation(
        amplitude,
        'dashboards.create',
        dashboard,
        rolloutHost(new StateStore(join(dir, 'state')).files, dir, host),
      )
      expect(result.status).toBe('pending')
      expect(JSON.parse(readFileSync(result.ref, 'utf8'))).toMatchObject({
        createdRemotely: false,
        manualActionRequired: true,
      })
      expect(invoked).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not turn a missing source connection into evidence', async () => {
    const result = await querySource(
      provider(),
      {
        operation: 'source.product-analytics.query',
        query: 'SELECT 1',
        owner: 'Fixture Owner',
        window: { start: '2026-10-01T00:00:00Z', end: '2026-10-02T00:00:00Z', timezone: 'UTC' },
      },
      clientProviderHost(provider()),
    )
    expect(result).toMatchObject({ status: 'open-question', evidence: null })
  })

  it('routes an explicitly bound read-only flag operation through the client', async () => {
    const calls: OperationCall[] = []
    await performOperation(
      provider(),
      'flags.read-state',
      { flag: 'fixture', environment: 'test' },
      clientProviderHost(provider(), {
        mcp: {
          inventory: inventory('fixture-read', { 'flags.read-state': 'fixture-read' }),
          invoke: async (call) => {
            calls.push(call)
            return observed
          },
        },
      }),
    )
    expect(calls[0]).toMatchObject({
      tool: 'fixture-read',
      args: { flag: 'fixture', environment: 'test', service: 'posthog' },
    })
  })

  it.each(['observed', 'wrong-identity', 'pending', 'failed'])(
    'preserves ramp evidence semantics for an MCP %s read',
    async (kind) => {
      const registry = { providers: [provider()], problems: [] }
      const host = clientProviderHost(provider(), {
        mcp: {
          inventory: inventory('fixture-read', { 'flags.read-state': 'fixture-read' }),
          invoke: async () => {
            if (kind === 'failed') throw new Error('Synthetic permission failure')
            return {
              status: kind === 'pending' ? 'pending' : 'succeeded',
              ref: 'https://example.invalid/fixture-flag',
              revision: 'fixture-revision',
              complete: true,
              body: JSON.stringify({
                flag: kind === 'wrong-identity' ? 'other' : 'fixture',
                environment: 'test',
                enabled: false,
                exposure: 0,
                audience: 'fixture-persons',
              }),
            }
          },
        },
      })
      const evidence = await flagEvidence(
        {
          schema: 'wholeloop/ramp-plan@1',
          flag: 'fixture',
          environment: 'test',
          confirmedBy: 'Fixture Owner',
          stages: [],
        },
        registry,
        'posthog',
        host,
      )
      expect(evidence.status).toBe(kind === 'observed' ? 'observed' : 'unknown')
      if (kind === 'observed') expect(evidence).toMatchObject({ exposure: 0, enabled: false })
    },
  )

  it.each(['comms.draft', 'flags.propose-change'])(
    'preserves native-only %s whatever transport is selected',
    (operation) => {
      const entry = provider(operation === 'comms.draft' ? 'slack' : 'posthog')
      expect(planProviderTransport(entry, operation)).toMatchObject({ transport: 'native' })
      expect(planProviderTransport(entry, operation, { transport: 'native' })).toMatchObject({
        transport: 'native',
      })
      expect(() =>
        planProviderTransport(entry, operation, {
          inventory: {
            ...inventory('fixture-tool', { [operation]: 'fixture-tool' }),
            server: 'slack',
          },
        }),
      ).toThrow('remain native')
    },
  )

  it.each([
    { ...inventory(), credentials: true },
    { ...inventory(), tools: [{ name: 'execute-sql' }] },
    { ...inventory(), tools: [...inventory().tools, ...inventory().tools] },
    { ...inventory(), tools: [{ name: 'fixture', inputSchema: { type: 'string' } }] },
    {
      ...inventory(),
      tools: Array.from({ length: 257 }, (_, i) => ({
        name: `fixture-${i}`,
        inputSchema: { type: 'object' },
      })),
    },
  ])('rejects invalid or ambiguous inventory without echoing its contents', (value) => {
    expect(() => clientMcpInventory(value)).toThrow('Invalid client MCP inventory')
  })

  it('rejects undeclared operations, known toggle tools and foreign identities', async () => {
    expect(() => planProviderTransport(provider(), 'flags.toggle')).toThrow('declared')
    expect(() =>
      planProviderTransport(provider(), 'flags.read-state', {
        inventory: inventory('flags.toggle', { 'flags.read-state': 'flags.toggle' }),
      }),
    ).toThrow('proposal-only')
    expect(() =>
      planProviderTransport(provider(), 'flags.read-state', {
        inventory: inventory('fixture-read', { 'flags.toggle': 'fixture-read' }),
      }),
    ).toThrow('declared')
    await expect(
      clientProviderHost(provider()).invoke({
        provider: 'other',
        operation: 'dashboards.create',
        tool: 'wholeloop.dashboard.handoff',
        args: {},
        guidance: '',
      }),
    ).rejects.toThrow('identity')
  })

  it('snapshots inventory so later host mutations cannot change a planned binding', async () => {
    const metadata = inventory()
    const host = clientProviderHost(provider(), {
      mcp: { inventory: metadata, invoke: async () => observed },
    })
    metadata.tools.length = 0
    expect(
      await performOperation(
        provider(),
        'source.product-analytics.query',
        { query: 'SELECT 1' },
        host,
      ),
    ).toEqual(observed)
  })

  it('plans compiled CLI transport without invoking a client, resolving credentials or writing state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-provider-plan-'))
    try {
      const file = join(dir, 'mcp.json')
      writeFileSync(file, JSON.stringify(inventory()))
      const cli = (...args: string[]) =>
        spawnSync(
          process.execPath,
          [resolve('dist/wl.mjs'), 'provider', 'plan', ...args, '--json'],
          {
            cwd: dir,
            encoding: 'utf8',
            env: {
              ...process.env,
              XDG_CONFIG_HOME: join(dir, 'config'),
              XDG_STATE_HOME: join(dir, 'state'),
            },
          },
        )
      const planned = cli('posthog', 'source.product-analytics.query', '--mcp', file)
      expect(planned.status, planned.stdout + planned.stderr).toBe(0)
      expect(JSON.parse(planned.stdout)).toMatchObject({
        schema: 'wholeloop/provider-transport@1',
        transport: 'mcp',
        tool: 'execute-sql',
        effects: 'not-performed',
        authentication: 'client-owned-unverified',
      })
      const unavailable = cli('posthog', 'source.product-analytics.query')
      expect(unavailable.status).toBe(3)
      expect(JSON.parse(unavailable.stdout).transport).toBe('unavailable')
      expect(JSON.parse(cli('amplitude', 'dashboards.create').stdout)).toMatchObject({
        transport: 'native',
        degrade: 'handoff-artifact',
      })
      expect(cli('posthog', 'source.product-analytics.query', '--transport', 'http').status).toBe(4)
      symlinkSync(file, join(dir, 'linked.json'))
      expect(
        cli('posthog', 'source.product-analytics.query', '--mcp', join(dir, 'linked.json')).status,
      ).toBe(4)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('plans flag reads through client MCP, a local file or an open question without reading', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wl-read-flags-'))
    try {
      const file = join(dir, 'mcp.json')
      writeFileSync(
        file,
        JSON.stringify(inventory('fixture-read', { 'flags.read-state': 'fixture-read' })),
      )
      const env = {
        ...process.env,
        XDG_CONFIG_HOME: join(dir, 'config'),
        XDG_STATE_HOME: join(dir, 'state'),
        FIXTURE_FLAG_TOKEN: 'never-read',
      }
      const cli = (...args: string[]) =>
        spawnSync(process.execPath, [resolve('dist/wl.mjs'), 'provider', 'read-flags', ...args], {
          cwd: dir,
          encoding: 'utf8',
          env,
        })
      const read = (...args: string[]) => {
        const result = cli(...args, '--flag', 'orders', '--environment', 'production', '--json')
        expect(result.status, result.stderr).toBe(0)
        return JSON.parse(result.stdout)
      }
      expect(read('posthog', '--mcp', file)).toMatchObject({
        schema: 'wholeloop/flag-read@2',
        status: 'planned',
        transport: 'mcp',
        server: 'posthog',
        tool: 'fixture-read',
        args: { flag: 'orders', environment: 'production', service: 'posthog' },
        effects: 'not-performed',
        authentication: 'client-owned-unverified',
      })
      for (const id of ['posthog', 'launchdarkly', 'growthbook', 'unleash']) {
        const unknown = read(id)
        expect(unknown).toMatchObject({ status: 'open-question', transport: 'unavailable' })
        expect(unknown.question).toContain('unknown')
      }
      expect(read('config-flags')).toMatchObject({
        status: 'local',
        transport: 'native',
        args: { file: 'wholeloop.flags.json' },
      })
      for (const retired of [
        ['posthog', '--bridge', file, '--flag', 'orders', '--environment', 'production'],
        ['posthog', '--live', '--flag', 'orders', '--environment', 'production'],
        ['posthog', '--flag', '../orders', '--environment', 'production'],
        ['--flag', 'orders', '--environment', 'production'],
      ])
        expect(cli(...retired).status).toBe(4)
      expect(existsSync(join(dir, 'state'))).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
