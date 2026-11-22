// Measurement choices validate real manifests without treating configuration as authentication.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { bundledCanonical } from '../../../src/adapters/canonical.js'
import { ADAPTERS, generateAdapter } from '../../../src/adapters/generate.js'
import { FlowEngine } from '../../../src/flow/engine.js'
import { parseSpec } from '../../../src/spec/contract.js'
import {
  checkMetricProviders,
  metricProviderOffers,
  metricRegistry,
  metricSourceContext,
} from '../../../src/spec/providers.js'
import { withClientAttribution } from '../../../src/state/attribution-context.js'
import { StateStore } from '../../../src/state/store.js'
import { installSpecProvider } from '../../support/spec-providers.js'

const artifact = readFileSync(new URL('../../fixtures/spec/spec.md', import.meta.url), 'utf8')
const capability = 'source.product-analytics'
function fixture(action: (value: ReturnType<typeof context>) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'wholeloop-metric-providers-'))
  try {
    action(context(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
function context(dir: string) {
  const root = join(dir, 'repo'),
    home = join(dir, 'home'),
    userFile = join(dir, 'config/wholeloop/config.yml')
  mkdirSync(root)
  mkdirSync(home)
  const engine = new FlowEngine(new StateStore(join(dir, 'store')), root, userFile, home)
  const options = { root, home, userFile, client: 'codex', env: {}, path: '' }
  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }
  const begin = () => {
    const begun = engine.begin('write-spec', {
      input: 'Find orders',
      owner: 'Alex',
      impact: 'Reduce retrieval time',
    })
    if (!('metricProviders' in begun.payload)) throw new Error('Expected measurement offers')
    return begun.payload
  }
  return { dir, root, home, userFile, engine, options, write, begin }
}

it.each([
  ['invented-provider', 'source.product-analytics.query', 'unknown provider'],
  ['sentry', 'source.product-analytics.query', 'does not offer'],
  ['posthog', 'source.product-analytics.missing', 'does not offer'],
])('rejects %s with an unsupported measurement operation', (provider, operation, message) =>
  fixture(({ root, userFile }) => {
    const metrics = parseSpec(artifact).metrics.map((metric) => ({
      ...metric,
      source: { ...metric.source, provider, operation },
    }))
    expect(
      checkMetricProviders(metrics, metricRegistry(root, userFile)).problems.join(' '),
    ).toContain(message)
  }),
)

it('warns for a registered undetected provider without claiming a connection or blocking the plan', () =>
  fixture(({ options, userFile }) => {
    installSpecProvider(dirname(userFile))
    const source = metricSourceContext(options)
    const checked = checkMetricProviders(
      parseSpec(artifact).metrics,
      source.registry,
      source.candidates,
    )
    expect(checked.problems).toEqual([])
    expect(checked.warnings.join(' ')).toContain('not detected in the current client')
    expect(checked.warnings.join(' ')).toContain('authentication remain unverified')
    const offers = metricProviderOffers(source, {})
    expect(offers.capabilities.every((entry) => entry.selected === null)).toBe(true)
    expect(
      offers.capabilities.find((entry) => entry.capability === capability)?.providers,
    ).toContainEqual(
      expect.objectContaining({ id: 'analytics', access: 'unavailable', available: false }),
    )
  }))

const clients = {
  claude: ['.claude.json', 'mcpServers'],
  codex: ['.codex/config.toml', 'mcp_servers'],
  opencode: ['.config/opencode/opencode.json', 'mcp'],
  copilot: ['.copilot/mcp-config.json', 'mcpServers'],
  gemini: ['.gemini/settings.json', 'mcpServers'],
  cursor: ['.cursor/mcp.json', 'mcpServers'],
  antigravity: ['.gemini/config/mcp_config.json', 'mcpServers'],
} as const
it.each(Object.entries(clients))(
  'keeps measurement detection scoped to %s',
  (client, [file, field]) =>
    fixture(({ home, options, write }) => {
      write(
        join(home, file),
        field === 'mcp_servers'
          ? '[mcp_servers.posthog]\ncommand = "fixture-never-executed"\n'
          : JSON.stringify({ [field]: { posthog: { command: 'fixture-never-executed' } } }),
      )
      const current = metricSourceContext({ ...options, client }),
        foreign = metricSourceContext({
          ...options,
          client: client === 'codex' ? 'claude' : 'codex',
        }),
        metrics = parseSpec(artifact).metrics.map((metric) => ({
          ...metric,
          source: { ...metric.source, provider: 'posthog' },
        }))
      expect(current.candidates.find(({ id }) => id === 'posthog')).toMatchObject({
        access: 'available in this client',
        available: true,
      })
      expect(foreign.candidates.find(({ id }) => id === 'posthog')).toMatchObject({
        access: 'configured in another client',
        available: false,
      })
      expect(checkMetricProviders(metrics, current.registry, current.candidates).warnings).toEqual(
        [],
      )
      expect(JSON.stringify(current)).not.toContain('fixture-never-executed')
    }),
)

it('remembers an explicit repository choice, permits an undetected choice and refuses invalid writes', () =>
  fixture(({ engine, root, begin }) => {
    const initial = begin().metricProviders
    expect(
      initial?.capabilities.find((entry) => entry.capability === capability)?.selected,
    ).toBeNull()
    engine.answer(`metric:${capability}`, 'posthog', { scope: 'project' })
    const file = join(root, '.wholeloop/config.yml'),
      saved = readFileSync(file, 'utf8'),
      remembered = begin().metricProviders
    expect(saved).toContain('metric:source.product-analytics: posthog')
    expect(
      remembered?.capabilities.find((entry) => entry.capability === capability)?.selected,
    ).toBe('posthog')
    for (const [qid, provider] of [
      [`metric:${capability}`, 'invented-provider'],
      [`metric:${capability}`, 'sentry'],
      ['metric:docs', 'posthog'],
    ])
      expect(() => engine.answer(qid ?? '', provider ?? '', { scope: 'project' })).toThrow()
    expect(readFileSync(file, 'utf8')).toBe(saved)
  }))

it('leaves invalid remembered preferences unselected and does not scan providers before required answers', () =>
  fixture(({ options, engine, root, write }) => {
    const offers = metricProviderOffers(metricSourceContext(options), {
      [`metric:${capability}`]: 'sentry',
    })
    expect(offers.capabilities.find((entry) => entry.capability === capability)).toMatchObject({
      selected: null,
      warning: expect.stringContaining('choose again'),
    })
    write(join(root, '.wholeloop/providers/broken/provider.json'), '{}')
    expect(engine.begin('write-spec', {}).payload.missing).toEqual(['input', 'owner', 'impact'])
    expect(engine.store.list()).toEqual([])
    expect(() => metricSourceContext(options)).toThrow('registry problems')
  }))

it('refuses adapter impersonation and malformed current-client configuration', () =>
  fixture(({ options, home, write }) => {
    expect(() => metricSourceContext({ ...options, client: 'invented-client' })).toThrow('Unknown')
    expect(() =>
      withClientAttribution({ client: 'claude', source: 'declared' }, () =>
        metricSourceContext(options),
      ),
    ).toThrow('executing adapter')
    write(join(home, '.codex/config.toml'), '[invalid')
    expect(() => metricSourceContext(options)).toThrow('MCP configuration problems')
  }))

it('cannot bypass provider validation through completion and preserves historical replay after removal', () =>
  fixture(({ engine, userFile, begin }) => {
    const id = begin().subject?.id ?? '',
      before = engine.store.events()
    expect(() => engine.complete('write-spec', id, artifact)).toThrow('unknown provider analytics')
    expect(engine.store.events()).toEqual(before)
    installSpecProvider(dirname(userFile))
    engine.complete('write-spec', id, artifact)
    rmSync(join(dirname(userFile), 'providers'), { recursive: true })
    engine.store.rebuild()
    expect(engine.plan(id).pending.map(({ id }) => id)).toContain('approve-spec')
  }))

it('checks actual CLI files, exposes nonblocking warnings and never persists detection as a preference', () =>
  fixture(({ dir, root, home }) => {
    const file = join(dir, 'spec.md'),
      env = {
        HOME: home,
        PATH: process.env.PATH,
        XDG_CONFIG_HOME: join(dir, 'config'),
        XDG_STATE_HOME: join(dir, 'cli-state'),
        WL_WORKSPACE: '',
      }
    const cli = () => {
      const response = spawnSync(
        process.execPath,
        [resolve('dist/wl.mjs'), 'spec', 'check', file, '--client', 'codex', '--json'],
        { cwd: root, env, encoding: 'utf8' },
      )
      return { code: response.status, value: JSON.parse(response.stdout) }
    }
    writeFileSync(file, artifact)
    expect(cli()).toMatchObject({
      code: 4,
      value: {
        problems: expect.arrayContaining([expect.stringContaining('unknown provider analytics')]),
      },
    })
    writeFileSync(file, artifact.replaceAll('provider: analytics', 'provider: sentry'))
    expect(cli()).toMatchObject({
      code: 4,
      value: { problems: expect.arrayContaining([expect.stringContaining('does not offer')]) },
    })
    writeFileSync(file, artifact.replaceAll('provider: analytics', 'provider: posthog'))
    expect(cli()).toMatchObject({
      code: 0,
      value: {
        problems: [],
        warnings: expect.arrayContaining([expect.stringContaining('not detected')]),
      },
    })
    expect(existsSync(join(root, '.wholeloop/config.yml'))).toBe(false)
  }))

it.each(ADAPTERS)('renders measurement choice and explicit repository memory for %s', (adapter) => {
  const generated = generateAdapter(
    adapter.id,
    bundledCanonical(),
    '#!/usr/bin/env node\n',
    '0.0.0',
  )
  const skill = generated.files.get(adapter.paths('skill', 'write-spec'))
  expect(skill?.content).toContain('metricProviders')
  expect(skill?.content).toContain('--remember project')
  expect(skill?.content).toContain('ask where each metric lives')
})
