import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  flagBridgeConfig,
  flagReadPlan,
  remoteFlagHost,
} from '../../../src/providers/flag-bridge.js'
import { loadProviders } from '../../../src/providers/load.js'
import { postHogFlag, postHogFlagId } from '../../../src/providers/posthog.js'
import { flagEvidence } from '../../../src/ramp/evidence.js'

const config = {
  schema: 'wholeloop/posthog-flag-bridge@1',
  provider: 'posthog',
  baseUrl: 'https://eu.posthog.example/prefix/',
  project: '42',
  environment: 'production',
  tokenEnv: 'WL_FIXTURE_PH_KEY',
}
const call = {
  provider: 'posthog',
  operation: 'flags.read-state',
  tool: 'wholeloop.flags.read-state',
  args: { flag: 'orders', environment: 'production', service: 'posthog' },
  guidance: '',
}
function flag(): Record<string, unknown> {
  return {
    id: 17,
    key: 'orders',
    active: true,
    deleted: false,
    archived: false,
    version: 7,
    ensure_experience_continuity: false,
    is_remote_configuration: false,
    evaluation_runtime: 'all',
    bucketing_identifier: 'distinct_id',
    evaluation_contexts: [],
    experiment_set: [],
    filters: { groups: [{ properties: [], rollout_percentage: 29.5 }] },
  }
}
const page = () => ({ count: 1, next: null, previous: null, results: [{ id: 17, key: 'orders' }] })
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const decode = (value: unknown) => postHogFlag(value, 'orders', 'production', '42')

describe('PostHog exact lookup and explicitly configured environment', () => {
  it('plans filtered bounded lookup and reveals the environment mapping without I/O', () => {
    expect(flagBridgeConfig(config)).toEqual(config)
    expect(flagReadPlan(config, 'orders', 'production')).toMatchObject({
      effects: 'not-performed',
      request: {
        url: 'https://eu.posthog.example/prefix/api/projects/42/feature_flags/?key=orders&archived=false&limit=2&offset=0',
        environmentBasis: 'configured-project-mapping',
        detailRead: 'unique-exact-id',
      },
    })
  })
  it.each([
    'generic-schema',
    'missing-environment',
    'wrong-environment',
    'wrong-project',
    'wrong-provider',
    'secret-field',
  ])('refuses %s before credential lookup or network access', async (kind) => {
    const input: Record<string, unknown> = { ...config }
    if (kind === 'generic-schema') {
      input.schema = 'wholeloop/flag-bridge@1'
      delete input.environment
    }
    if (kind === 'missing-environment') delete input.environment
    if (kind === 'wrong-environment') input.environment = 'staging'
    if (kind === 'wrong-project') input.project = 'my-project'
    if (kind === 'wrong-provider') input.provider = 'growthbook'
    if (kind === 'secret-field') input.token = 'fixture-only-noncredential'
    const secret = vi.fn(),
      fetch = vi.fn()
    await expect(async () =>
      remoteFlagHost(input, { secret, fetch }).invoke(call),
    ).rejects.toThrow()
    expect(secret).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    'missing-count',
    'next',
    'previous',
    'empty',
    'duplicate',
    'wrong-case',
    'missing-id',
    'bad-id',
  ])('refuses incomplete or ambiguous %s lookup', (kind) => {
    const input: Record<string, unknown> = page()
    if (kind === 'missing-count') delete input.count
    if (kind === 'next') input.next = 'https://foreign.example/steal'
    if (kind === 'previous') input.previous = 'https://foreign.example/steal'
    if (kind === 'empty') input.results = []
    if (kind === 'duplicate') {
      input.count = 2
      input.results = [page().results[0], page().results[0]]
    }
    if (kind === 'wrong-case') input.results = [{ key: 'ORDERS', id: 17 }]
    if (kind === 'missing-id') input.results = [{ key: 'orders' }]
    if (kind === 'bad-id') input.results = [{ key: 'orders', id: 1.5 }]
    expect(() => postHogFlagId(input, 'orders')).toThrow(/remains unknown/)
  })
  it('normalizes decimal, zero, full and inactive state while making project scope explicit', () => {
    const input = flag()
    expect(decode(input).observation).toEqual({
      flag: 'orders',
      environment: 'production',
      enabled: true,
      exposure: 29.5,
      audience: 'persons with distinct_id',
      project: '42',
      environmentBasis: 'configured-project-mapping',
    })
    for (const percentage of [0, 100]) {
      input.filters = { groups: [{ properties: [], rollout_percentage: percentage }] }
      expect(decode(input).observation.exposure).toBe(percentage)
    }
    input.active = false
    expect(decode(input).observation).toMatchObject({ enabled: false, exposure: 0 })
  })
  it('binds revisions to service version and controls without leaking service prose', () => {
    const input = flag(),
      first = decode(input)
    input.name = 'private name'
    input.created_by = { email: 'private@example.com' }
    expect(decode(input).revision).toBe(first.revision)
    input.version = 8
    expect(decode(input).revision).not.toBe(first.revision)
    expect(JSON.stringify(first)).not.toMatch(/private|created_by|filters/)
  })
  it.each([
    'key',
    'id',
    'active',
    'deleted',
    'archived',
    'version',
    'continuity',
    'remote-config',
    'runtime',
    'bucket',
    'contexts',
    'missing-contexts',
    'experiment',
    'missing-experiments',
    'missing-filters',
    'groups',
    'empty-groups',
    'multivariate',
    'group-aggregation',
    'enrollment',
    'holdout',
    'super-groups',
    'unknown-filter',
    'properties',
    'missing-properties',
    'percentage',
    'missing-percentage',
    'nan-percentage',
    'variant',
    'aggregation',
    'freeze',
    'unknown-group',
  ])('keeps %s unsupported rather than flattening targeting', (kind) => {
    const input = flag(),
      group: Record<string, unknown> = { properties: [], rollout_percentage: 29.5 },
      filters: Record<string, unknown> = { groups: [group] }
    input.filters = filters
    const fields: Record<string, [string, unknown]> = {
      key: ['key', 'other'],
      id: ['id', 0],
      active: ['active', 'true'],
      deleted: ['deleted', true],
      archived: ['archived', true],
      version: ['version', null],
      continuity: ['ensure_experience_continuity', true],
      'remote-config': ['is_remote_configuration', true],
      runtime: ['evaluation_runtime', 'server'],
      bucket: ['bucketing_identifier', 'device_id'],
      contexts: ['evaluation_contexts', ['production']],
      experiment: ['experiment_set', [1]],
      'missing-filters': ['filters', null],
    }
    const change = fields[kind]
    if (change) input[change[0]] = change[1]
    if (kind === 'missing-contexts') delete input.evaluation_contexts
    if (kind === 'missing-experiments') delete input.experiment_set
    if (kind === 'groups') filters.groups = [group, group]
    if (kind === 'empty-groups') filters.groups = []
    if (kind === 'multivariate') filters.multivariate = { variants: [] }
    if (kind === 'group-aggregation') filters.aggregation_group_type_index = 0
    if (kind === 'enrollment') filters.feature_enrollment = true
    if (kind === 'holdout') filters.holdout = {}
    if (kind === 'super-groups') filters.super_groups = []
    if (kind === 'unknown-filter') filters.new_control = true
    if (kind === 'properties') group.properties = [{ type: 'flag', key: '1' }]
    if (kind === 'missing-properties') delete group.properties
    if (kind === 'percentage') group.rollout_percentage = 101
    if (kind === 'missing-percentage') delete group.rollout_percentage
    if (kind === 'nan-percentage') group.rollout_percentage = Number.NaN
    if (kind === 'variant') group.variant = 'test'
    if (kind === 'aggregation') group.aggregation_group_type_index = 0
    if (kind === 'freeze') group.exposure_frozen = true
    if (kind === 'unknown-group') group.new_control = true
    expect(() => decode(input)).toThrow(/remains unknown/)
  })
  it('looks up then reads the exact ID with one deadline and feeds the built-in ramp normalizer', async () => {
    const requests: string[] = [],
      signals: (AbortSignal | null | undefined)[] = []
    const host = remoteFlagHost(config, {
      secret: () => 'fixture-only-noncredential',
      fetch: async (url, init) => {
        requests.push(String(url))
        signals.push(init?.signal)
        expect(init).toMatchObject({
          method: 'GET',
          redirect: 'error',
          credentials: 'omit',
          headers: {
            Authorization: 'Bearer fixture-only-noncredential',
            Accept: 'application/json',
          },
        })
        expect(init?.body).toBeUndefined()
        return response(String(url).includes('?') ? page() : flag())
      },
    })
    const registry = loadProviders({ root: '/nonexistent-fixture', user: '/nonexistent-user' })
    const plan = {
      schema: 'wholeloop/ramp-plan@1' as const,
      flag: 'orders',
      environment: 'production',
      confirmedBy: 'Alex',
      stages: [],
    }
    expect(await flagEvidence(plan, registry, 'posthog', host)).toMatchObject({
      status: 'observed',
      exposure: 29.5,
      audience: 'persons with distinct_id',
      ref: 'https://eu.posthog.example/prefix/api/projects/42/feature_flags/17/',
    })
    expect(requests).toHaveLength(2)
    expect(signals[0]).toBe(signals[1])
  })
  it.each(['foreign-next', 'detail-id', 'detail-key', 'detail-failure', 'cancel-between'])(
    'redacts %s failures without following server URLs or retrying',
    async (kind) => {
      const controller = new AbortController(),
        requests: string[] = []
      const host = remoteFlagHost(config, {
        signal: controller.signal,
        secret: () => 'fixture-only-noncredential',
        fetch: async (url) => {
          requests.push(String(url))
          if (requests.length === 1) {
            if (kind === 'foreign-next')
              return response({ ...page(), next: 'https://foreign.example/secret' })
            if (kind === 'cancel-between') controller.abort()
            return response(page())
          }
          if (kind === 'detail-failure')
            throw new Error('fixture-only-noncredential private raw service failure')
          return response({ ...flag(), ...(kind === 'detail-id' ? { id: 18 } : { key: 'other' }) })
        },
      })
      await expect(host.invoke(call)).rejects.toThrow(
        'Flag service read failed or configuration is unsupported; state remains unknown; diagnostics omitted',
      )
      expect(requests).toHaveLength(['foreign-next', 'cancel-between'].includes(kind) ? 1 : 2)
      expect(requests.every((url) => url.startsWith(config.baseUrl))).toBe(true)
    },
  )
  it('runs the compiled CLI preview without a credential or remote I/O', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-posthog-preview-')))
    try {
      const file = join(root, 'bridge.json')
      writeFileSync(file, JSON.stringify(config))
      const result = spawnSync(
        process.execPath,
        [
          'dist/wl.mjs',
          'provider',
          'read-flags',
          '--bridge',
          file,
          '--flag',
          'orders',
          '--environment',
          'production',
          '--json',
        ],
        { encoding: 'utf8', env: { ...process.env, [config.tokenEnv]: '' } },
      )
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'planned',
        effects: 'not-performed',
        request: { environmentBasis: 'configured-project-mapping' },
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
