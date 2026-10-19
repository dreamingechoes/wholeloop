import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectProvider } from '../../../src/providers/detect.js'
import { providerFixtures } from '../../../src/providers/fixtures.js'
import { loadProviders } from '../../../src/providers/load.js'
import { validateProvider } from '../../../src/providers/manifest.js'
import { rolloutHost } from '../../../src/providers/rollout.js'
import { StateStore } from '../../../src/state/store.js'

const ids = [
  'slack',
  'microsoft-teams',
  'email',
  'launchdarkly',
  'unleash',
  'growthbook',
  'config-flags',
  'posthog',
  'mixpanel',
  'amplitude',
  'metabase',
  'grafana',
  'datadog',
  'figma',
]
const corpus = (id: string) =>
  JSON.parse(readFileSync(resolve(`test/fixtures/providers/rollout/${id}.json`), 'utf8'))
async function fixture(run: (root: string, store: StateStore) => void | Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-rollout-provider-'))
  const root = join(dir, 'repo')
  mkdirSync(root)
  try {
    await run(root, new StateStore(join(dir, 'state')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const registry = () =>
  loadProviders({ root: '/nonexistent-wholeloop-fixture', user: '/nonexistent-wholeloop-user' })

describe('rollout provider boundaries', () => {
  it.each(ids)(
    '%s passes every declared operation against explicit offline fixtures',
    async (id) => {
      const provider = registry().providers.find((entry) => entry.manifest.id === id)
      if (!provider) throw new Error('Missing rollout provider')
      expect(await providerFixtures(provider, corpus(id))).toMatchObject({
        passed: true,
        remoteProbed: false,
        mode: 'offline-fixtures',
      })
    },
  )

  it('does not offer remote sources merely because their provider also stores native handoffs', () => {
    for (const id of ['posthog', 'mixpanel', 'amplitude', 'metabase', 'grafana']) {
      const provider = registry().providers.find((entry) => entry.manifest.id === id)
      if (!provider) throw new Error('Missing mixed provider')
      expect(detectProvider(provider.manifest, [], '').available).toBe(false)
      const server = provider.manifest.access.mcp?.server
      if (!server) throw new Error('Missing MCP declaration contract')
      expect(
        detectProvider(
          provider.manifest,
          [{ target: 'codex', server, file: 'fixture', enabled: true }],
          '',
        ).available,
      ).toBe(true)
    }
  })

  it('requires full fixture coverage and fails changed bindings or invented normalized results', async () => {
    const provider = registry().providers.find((entry) => entry.manifest.id === 'config-flags')
    if (!provider) throw new Error('Missing fixture provider')
    const data = corpus('config-flags')
    data.cases.pop()
    await expect(providerFixtures(provider, data)).rejects.toThrow('every declared')
    const bad = corpus('config-flags')
    bad.cases[0].calls[0].tool = 'toggle'
    expect((await providerFixtures(provider, bad)).passed).toBe(false)
    const invalid = corpus('config-flags')
    invalid.cases[0].calls[0].result.status = 'observed'
    expect((await providerFixtures(provider, invalid)).passed).toBe(false)
  })

  it('stores unsent drafts and unapplied proposals idempotently without invoking external tools', async () =>
    fixture(async (root, store) => {
      let delegated = 0
      const host = rolloutHost(store.files, root, {
        invoke: async () => {
          delegated++
          throw new Error('Unexpected external operation')
        },
      })
      const draft = {
        provider: 'slack',
        operation: 'comms.draft',
        tool: 'wholeloop.comms.draft',
        guidance: '',
        args: {
          body: 'Pilot is ready for review.',
          audience: 'internal',
          draft: true,
          send: false,
        },
      }
      const first = await host.invoke(draft)
      const again = await host.invoke(draft)
      expect(again).toEqual(first)
      expect(JSON.parse(first.body ?? '')).toMatchObject({
        draft: true,
        sent: false,
        destination: 'slack',
      })
      expect(readFileSync(first.ref, 'utf8')).toContain('Pilot is ready for review.')
      const proposal = await host.invoke({
        provider: 'launchdarkly',
        operation: 'flags.propose-change',
        tool: 'wholeloop.flags.propose-change',
        guidance: '',
        args: {
          flag: 'orders',
          environment: 'disposable',
          desired: { enabled: true, exposure: 10, audience: 'all' },
          apply: false,
          proposalOnly: true,
        },
      })
      expect(proposal.status).toBe('pending')
      expect(JSON.parse(proposal.body ?? '')).toMatchObject({
        applied: false,
        manualActionRequired: true,
      })
      expect(delegated).toBe(0)
      await expect(host.invoke({ ...draft, args: { ...draft.args, send: true } })).rejects.toThrow(
        'unsent',
      )
    }))

  it('keeps dashboard creation a pending metric-linked handoff rather than claiming remote charts', async () =>
    fixture(async (root, store) => {
      const host = rolloutHost(store.files, root)
      const input = {
        provider: 'grafana',
        operation: 'dashboards.create',
        tool: 'wholeloop.dashboard.handoff',
        guidance: '',
        args: {
          body: JSON.stringify({
            metric: { id: 'latency', source: { query: 'p95 latency' } },
            metricRef: 'items/scope-12345678/measurement.json#/metrics/0',
          }),
        },
      }
      const result = await host.invoke(input)
      expect(result.status).toBe('pending')
      expect(JSON.parse(result.body ?? '')).toMatchObject({
        createdRemotely: false,
        manualActionRequired: true,
        spec: { metricRef: 'items/scope-12345678/measurement.json#/metrics/0' },
      })
      await expect(
        host.invoke({ ...input, args: { body: '{"title":"invented chart"}' } }),
      ).rejects.toThrow('exact metric')
    }))

  it('reads explicit config flags without changing repository bytes and refuses incomplete/escaping data', async () =>
    fixture(async (root, store) => {
      const file = join(root, 'wholeloop.flags.json')
      const content = JSON.stringify({
        schema: 'wholeloop/config-flags@1',
        flags: [
          {
            flag: 'orders',
            environment: 'disposable',
            enabled: true,
            exposure: 10,
            audience: 'all',
          },
        ],
      })
      writeFileSync(file, content)
      const call = {
        provider: 'config-flags',
        operation: 'flags.read-state',
        tool: 'wholeloop.config-flags.read-state',
        guidance: '',
        args: { file: 'wholeloop.flags.json', flag: 'orders', environment: 'disposable' },
      }
      const host = rolloutHost(store.files, root)
      const result = await host.invoke(call)
      expect(result).toMatchObject({ complete: true, status: 'succeeded' })
      expect(JSON.parse(result.body ?? '')).toMatchObject({ exposure: 10 })
      expect(readFileSync(file, 'utf8')).toBe(content)
      await expect(
        host.invoke({ ...call, args: { ...call.args, file: '../outside.json' } }),
      ).rejects.toThrow()
      writeFileSync(
        file,
        '{"schema":"wholeloop/config-flags@1","flags":[{"flag":"orders","environment":"disposable","enabled":true}]}',
      )
      await expect(host.invoke(call)).rejects.toThrow('explicit enabled/exposure/audience')
    }))

  it('leaves absent remote flag bridges unavailable and blocks recognized toggles even on read mappings', async () =>
    fixture(async (root, store) => {
      await expect(
        rolloutHost(store.files, root).invoke({
          provider: 'launchdarkly',
          operation: 'flags.read-state',
          tool: 'wholeloop.flags.read-state',
          args: { flag: 'orders', environment: 'disposable' },
          guidance: '',
        }),
      ).rejects.toThrow('host bridge')
      const original = registry().providers.find(
        (entry) => entry.manifest.id === 'launchdarkly',
      )?.manifest
      if (!original) throw new Error('Missing fixture provider')
      for (const tool of ['toggle', 'setFlag', 'updateFlag'])
        expect(() =>
          validateProvider({
            ...original,
            operations: { ...original.operations, 'flags.read-state': { tool } },
          }),
        ).toThrow('toggle/apply')
    }))

  it('executes compiled provider fixture tests while metadata-only inspection remains explicitly unprobed', async () =>
    fixture((root, store) => {
      const env = {
        ...process.env,
        XDG_CONFIG_HOME: join(store.files.root, 'config'),
        XDG_STATE_HOME: join(store.files.root, 'cli-state'),
      }
      for (const id of ids) {
        const result = spawnSync(
          process.execPath,
          [
            resolve('dist/wl.mjs'),
            'provider',
            'test',
            id,
            '--fixtures',
            resolve(`test/fixtures/providers/rollout/${id}.json`),
            '--json',
          ],
          { cwd: root, env, encoding: 'utf8' },
        )
        expect(result.status, result.stderr || result.stdout).toBe(0)
        expect(JSON.parse(result.stdout)).toMatchObject({ passed: true, remoteProbed: false })
      }
      const metadata = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'provider', 'test', 'slack', '--json'],
        { cwd: root, env, encoding: 'utf8' },
      )
      expect(metadata.status, metadata.stderr || metadata.stdout).toBe(0)
      expect(JSON.parse(metadata.stdout).probe).toContain('Not performed')
    }))
})
