import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  flagBridgeConfig,
  flagReadPlan,
  launchDarklyFlag,
  remoteFlagHost,
} from '../../../src/providers/flag-bridge.js'
import { loadProviders } from '../../../src/providers/load.js'
import { flagEvidence } from '../../../src/ramp/evidence.js'

const config = {
  schema: 'wholeloop/flag-bridge@1',
  provider: 'launchdarkly',
  baseUrl: 'https://app.launchdarkly.com/',
  project: 'store',
  tokenEnv: 'WL_FIXTURE_LD_KEY',
}
const call = {
  provider: 'launchdarkly',
  operation: 'flags.read-state',
  tool: 'wholeloop.flags.read-state',
  args: { flag: 'orders', environment: 'production', service: 'launchdarkly' },
  guidance: '',
}
function flag() {
  return {
    key: 'orders',
    kind: 'boolean',
    archived: false,
    variations: [{ value: true }, { value: false }],
    environments: {
      production: {
        on: true,
        archived: false,
        version: 7,
        targets: [] as unknown[],
        contextTargets: [] as unknown[],
        rules: [] as unknown[],
        prerequisites: [] as unknown[],
        offVariation: 1,
        fallthrough: {
          rollout: {
            kind: 'rollout',
            contextKind: 'user',
            bucketBy: 'key',
            variations: [
              { variation: 0, weight: 10000 },
              { variation: 1, weight: 90000 },
            ],
          },
        },
      },
    },
  }
}
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
const secret = 'fixture-only-noncredential'

describe('non-secret flag read planning', () => {
  it('binds exact HTTPS resource/environment without resolving credentials or performing I/O', () => {
    const plan = flagReadPlan(config, 'orders', 'production')
    expect(plan).toMatchObject({
      status: 'planned',
      effects: 'not-performed',
      request: {
        method: 'GET',
        url: 'https://app.launchdarkly.com/api/v2/flags/store/orders?env=production',
        credentialEnv: 'WL_FIXTURE_LD_KEY',
      },
    })
    expect(
      flagReadPlan(
        { ...config, baseUrl: 'https://app.eu.launchdarkly.com/' },
        'orders',
        'production',
      ).request.url,
    ).toContain('https://app.eu.launchdarkly.com/')
  })
  it.each([
    'plaintext-token',
    'invalid-url',
    'foreign-origin',
    'url-auth',
    'query',
    'project-path',
    'credential-name',
    'moving-service',
  ])('refuses %s configuration without exposing imported contents', (kind) => {
    const input: Record<string, unknown> = { ...config }
    if (kind === 'plaintext-token') input.token = secret
    if (kind === 'invalid-url') input.baseUrl = secret
    if (kind === 'foreign-origin') input.baseUrl = 'https://example.com/'
    if (kind === 'url-auth') input.baseUrl = `https://${secret}@app.launchdarkly.com/`
    if (kind === 'query') input.baseUrl = 'https://app.launchdarkly.com/?key=private'
    if (kind === 'project-path') input.project = '../other'
    if (kind === 'credential-name') input.tokenEnv = 'not a reference'
    if (kind === 'moving-service') input.provider = 'other'
    expect(() => flagReadPlan(input, 'orders', 'production')).toThrow()
    try {
      flagReadPlan(input, 'orders', 'production')
    } catch (error) {
      expect(String(error)).not.toContain(secret)
    }
  })
  it('requires exact bounded identifiers and a supported service without changing configuration', () => {
    expect(flagBridgeConfig(config)).toEqual(config)
    for (const value of ['', '../flag', 'space value', 'a'.repeat(129)])
      expect(() => flagReadPlan(config, value, 'production')).toThrow()
  })
})

describe('conservative LaunchDarkly boolean observations', () => {
  it('preserves exact default user rollout weights and off state with a content/version revision', () => {
    const input = flag(),
      result = launchDarklyFlag(input, 'orders', 'production')
    expect(result.observation).toEqual({
      flag: 'orders',
      environment: 'production',
      enabled: true,
      exposure: 10,
      audience: 'all',
    })
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/)
    input.environments.production.on = false
    expect(launchDarklyFlag(input, 'orders', 'production').observation).toMatchObject({
      enabled: false,
      exposure: 0,
    })
    input.environments.production.version++
    expect(launchDarklyFlag(input, 'orders', 'production').revision).not.toBe(result.revision)
    expect(JSON.stringify(result)).not.toContain('prerequisites')
  })
  it('supports direct boolean fallthrough and reversed variation order without assuming true is first', () => {
    const input: Record<string, unknown> = flag()
    const environments = input.environments as Record<string, Record<string, unknown>>
    const environment = environments.production
    if (!environment) throw new Error('Missing fixture environment')
    environment.fallthrough = { variation: 0 }
    expect(launchDarklyFlag(input, 'orders', 'production').observation.exposure).toBe(100)
    input.variations = [{ value: false }, { value: true }]
    environment.offVariation = 0
    environment.fallthrough = { variation: 1 }
    expect(launchDarklyFlag(input, 'orders', 'production').observation.exposure).toBe(100)
  })
  it.each([
    'rules',
    'targets',
    'contextTargets',
    'prerequisites',
    'missing-field',
    'nonboolean',
    'duplicate-values',
    'wrong-flag',
    'missing-environment',
    'archived',
    'off-true',
    'missing-version',
    'invalid-total',
    'duplicate-rollout',
    'experiment',
    'group-context',
    'custom-bucket',
    'fractional-weight',
    'untracked',
  ])('keeps %s configuration unknown', (kind) => {
    const input = flag(),
      env = input.environments.production,
      rollout = env.fallthrough.rollout
    if (['rules', 'targets', 'contextTargets', 'prerequisites'].includes(kind))
      (env as Record<string, unknown>)[kind] = [{}]
    if (kind === 'missing-field') Reflect.deleteProperty(env, 'rules')
    if (kind === 'nonboolean') (input.variations[0] as Record<string, unknown>).value = 'true'
    if (kind === 'duplicate-values') input.variations = [{ value: true }, { value: true }]
    if (kind === 'wrong-flag') input.key = 'different'
    if (kind === 'missing-environment') Reflect.deleteProperty(input.environments, 'production')
    if (kind === 'archived') input.archived = true
    if (kind === 'off-true') env.offVariation = 0
    if (kind === 'missing-version') Reflect.deleteProperty(env, 'version')
    if (kind === 'invalid-total')
      rollout.variations = [
        { variation: 0, weight: 10 },
        { variation: 1, weight: 20 },
      ]
    if (kind === 'duplicate-rollout')
      rollout.variations = [
        { variation: 0, weight: 10000 },
        { variation: 0, weight: 90000 },
      ]
    if (kind === 'experiment') rollout.kind = 'experiment'
    if (kind === 'group-context') rollout.contextKind = 'organization'
    if (kind === 'custom-bucket') rollout.bucketBy = 'customAttribute'
    if (kind === 'fractional-weight')
      rollout.variations = [
        { variation: 0, weight: 0.1 },
        { variation: 1, weight: 99999.9 },
      ]
    if (kind === 'untracked') Object.assign(rollout.variations[0] ?? {}, { untracked: true })
    expect(() => launchDarklyFlag(input, 'orders', 'production')).toThrow(/remains unknown/)
  })
})

describe('explicit bounded read-only remote transport', () => {
  it('calls only the bound GET, keeps the token in memory, and returns no raw response fields', async () => {
    const lookup = vi.fn(() => secret),
      fetcher = vi.fn<typeof fetch>(async (_url, init) => {
        expect(init?.method).toBe('GET')
        expect(init?.body).toBeUndefined()
        expect(init?.redirect).toBe('error')
        expect(init?.credentials).toBe('omit')
        expect(init?.headers).toEqual({ Authorization: secret, Accept: 'application/json' })
        return response({ ...flag(), description: 'private service prose' })
      })
    const result = await remoteFlagHost(config, { secret: lookup, fetch: fetcher }).invoke(call)
    expect(lookup).toHaveBeenCalledExactlyOnceWith('WL_FIXTURE_LD_KEY')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      status: 'succeeded',
      complete: true,
      ref: 'https://app.launchdarkly.com/api/v2/flags/store/orders',
    })
    expect(JSON.parse(result.body ?? '')).toMatchObject({ exposure: 10, audience: 'all' })
    expect(JSON.stringify(result)).not.toMatch(
      /fixture-only-noncredential|private service prose|description/,
    )
  })
  it.each([
    'proposal',
    'other-provider',
    'other-tool',
    'extra-write-argument',
    'wrong-service',
    'cancelled',
  ])('refuses %s before credentials or network', async (kind) => {
    const controller = new AbortController(),
      lookup = vi.fn(() => secret),
      fetcher = vi.fn<typeof fetch>()
    const input = structuredClone(call)
    if (kind === 'proposal') input.operation = 'flags.propose-change'
    if (kind === 'other-provider') input.provider = 'posthog'
    if (kind === 'other-tool') input.tool = 'toggle_flag'
    if (kind === 'extra-write-argument') Object.assign(input.args, { apply: true })
    if (kind === 'wrong-service') input.args.service = 'other'
    if (kind === 'cancelled') controller.abort()
    await expect(
      remoteFlagHost(config, { secret: lookup, fetch: fetcher, signal: controller.signal }).invoke(
        input,
      ),
    ).rejects.toThrow(/diagnostics omitted/)
    expect(lookup).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('cancels a rejected service body without reading or exposing it', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
    })
    const host = remoteFlagHost(config, {
      secret: () => secret,
      fetch: async () => new Response(body, { status: 403 }),
    })
    await expect(host.invoke(call)).rejects.toThrow(/state remains unknown/)
    expect(cancelled).toBe(true)
  })
  it.each([
    'missing-token',
    'unsafe-token',
    'denied',
    'redirect',
    'html',
    'invalid-json',
    'large-body',
    'complex',
    'private-error',
  ])('redacts %s failures and never returns observed disabled state', async (kind) => {
    const fetcher: typeof fetch = async () => {
      if (kind === 'private-error') throw new Error(secret)
      if (kind === 'denied') return new Response(secret, { status: 403 })
      if (kind === 'html') return new Response(secret, { headers: { 'Content-Type': 'text/html' } })
      if (kind === 'invalid-json')
        return new Response(secret, { headers: { 'Content-Type': 'application/json' } })
      if (kind === 'large-body')
        return new Response(' '.repeat(1024 * 1024 + 1), {
          headers: { 'Content-Type': 'application/json' },
        })
      if (kind === 'complex') {
        const input = flag()
        input.environments.production.rules = [{}]
        return response(input)
      }
      const result = response(flag())
      if (kind === 'redirect') Object.defineProperty(result, 'redirected', { value: true })
      return result
    }
    const host = remoteFlagHost(config, {
      fetch: fetcher,
      secret: () =>
        kind === 'missing-token' ? undefined : kind === 'unsafe-token' ? `${secret}\n` : secret,
    })
    await expect(host.invoke(call)).rejects.toThrow('state remains unknown; diagnostics omitted')
    try {
      await host.invoke(call)
    } catch (error) {
      expect(String(error)).not.toContain(secret)
    }
  })
  it('feeds actual ramp normalization through the existing manifest binding, while complex targeting remains unknown', async () => {
    const registry = loadProviders({ root: '/nonexistent-fixture', user: '/nonexistent-user' })
    const plan = {
      schema: 'wholeloop/ramp-plan@1' as const,
      flag: 'orders',
      environment: 'production',
      confirmedBy: 'Alex',
      stages: [],
    }
    const host = remoteFlagHost(config, {
      secret: () => secret,
      fetch: async () => response(flag()),
    })
    expect(await flagEvidence(plan, registry, 'launchdarkly', host)).toMatchObject({
      status: 'observed',
      exposure: 10,
      audience: 'all',
    })
    const complex = flag()
    complex.environments.production.rules = [{}]
    expect(
      await flagEvidence(
        plan,
        registry,
        'launchdarkly',
        remoteFlagHost(config, { secret: () => secret, fetch: async () => response(complex) }),
      ),
    ).toMatchObject({ status: 'unknown' })
  })
  it('runs compiled default previews and missing-credential refusal without network or HOME writes', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-flag-read-'))),
      file = join(root, 'bridge.json'),
      home = join(root, 'home')
    mkdirSync(home)
    writeFileSync(file, JSON.stringify(config))
    const run = (bridge = file, extra: string[] = []) =>
      spawnSync(
        process.execPath,
        [
          resolve('dist/wl.mjs'),
          'provider',
          'read-flags',
          '--bridge',
          bridge,
          '--flag',
          'orders',
          '--environment',
          'production',
          ...extra,
          '--json',
        ],
        { cwd: root, env: { HOME: home }, encoding: 'utf8', timeout: 10000 },
      )
    try {
      const result = run()
      expect(result.status, result.stdout + result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'planned',
        effects: 'not-performed',
      })
      const missing = run(file, ['--live'])
      expect(missing.status).not.toBe(0)
      expect(JSON.parse(missing.stdout).message).toContain('state remains unknown')
      symlinkSync(file, join(root, 'alias'))
      expect(run(join(root, 'alias')).status).not.toBe(0)
      expect(readFileSync(file, 'utf8')).toBe(JSON.stringify(config))
      expect(readdirSync(home)).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
