import { describe, expect, it } from 'vitest'
import { flagReadPlan, remoteFlagHost } from '../../../src/providers/flag-bridge.js'
import { coveragePercentage, growthBookFlag } from '../../../src/providers/growthbook.js'
import { loadProviders } from '../../../src/providers/load.js'
import { flagEvidence } from '../../../src/ramp/evidence.js'

const config = {
  schema: 'wholeloop/flag-bridge@1',
  provider: 'growthbook',
  baseUrl: 'https://api.growthbook.io/api/',
  project: 'store',
  tokenEnv: 'WL_FIXTURE_GROWTHBOOK_KEY',
}
const call = {
  provider: 'growthbook',
  operation: 'flags.read-state',
  tool: 'wholeloop.flags.read-state',
  args: { flag: 'orders', environment: 'production', service: 'growthbook' },
  guidance: '',
}
function rule() {
  return {
    id: 'rule-1',
    description: 'Synthetic rule',
    enabled: true,
    type: 'rollout',
    value: 'true',
    coverage: 0.29,
    hashAttribute: 'id',
    seed: 'orders',
    hashVersion: 2,
  } as Record<string, unknown>
}
function flag() {
  return {
    feature: {
      id: 'orders',
      project: 'store',
      archived: false,
      valueType: 'boolean',
      defaultValue: 'false',
      prerequisites: [] as unknown[],
      revision: { version: 7, date: '2026-10-20T09:00:00.000Z' },
      environments: {
        production: {
          enabled: true,
          defaultValue: 'false',
          rules: [rule()],
          definition: JSON.stringify({
            defaultValue: false,
            rules: [
              { force: true, coverage: 0.29, hashAttribute: 'id', seed: 'orders', hashVersion: 2 },
            ],
          }),
        },
      },
    },
  }
}
function selected() {
  const input = flag(),
    environment = input.feature.environments.production,
    entry = environment.rules[0]
  if (!entry) throw new Error('Missing synthetic rule')
  return { input, environment, entry }
}

describe('GrowthBook configured percentages', () => {
  it.each([
    [0, 0, 100],
    [1, 100, 0],
    [0.29, 29, 71],
    [0.57, 57, 43],
    [0.001, 0.1, 99.9],
    [1e-7, 0.00001, 99.99999],
  ])(
    'shifts decimal %s without introducing binary multiplication drift',
    (fraction, expected, complement) => {
      expect(coveragePercentage(fraction)).toBe(expected)
      expect(coveragePercentage(fraction, true)).toBe(complement)
    },
  )
  it('preserves small positive values and refuses invalid or unrepresentable boundary claims', () => {
    expect(coveragePercentage(Number.MIN_VALUE)).toBe(5e-322)
    for (const value of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() => coveragePercentage(value)).toThrow()
    expect(() => coveragePercentage(Number.MIN_VALUE, true)).toThrow()
  })
  it('binds the explicit resource to the configured API base without invented environment query parameters', () => {
    expect(flagReadPlan(config, 'orders', 'production')).toMatchObject({
      status: 'planned',
      effects: 'not-performed',
      request: { method: 'GET', url: 'https://api.growthbook.io/api/v1/features/orders' },
    })
    expect(
      flagReadPlan(
        { ...config, baseUrl: 'https://growthbook.example.com/subpath/api/' },
        'orders',
        'production',
      ).request.url,
    ).toBe('https://growthbook.example.com/subpath/api/v1/features/orders')
  })
  it('uses live per-environment values and revision, ignoring a contradictory private draft', () => {
    const { input, environment } = selected()
    Object.assign(environment, {
      draft: { enabled: false, defaultValue: 'true', rules: [], private: 'never emit' },
    })
    const result = growthBookFlag(input, 'orders', 'production', 'store')
    expect(result.observation).toEqual({
      flag: 'orders',
      environment: 'production',
      enabled: true,
      exposure: 29,
      audience: 'contexts with id',
    })
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toMatch(/never emit|Synthetic rule|draft/)
    const prior = result.revision
    input.feature.revision.version++
    expect(growthBookFlag(input, 'orders', 'production', 'store').revision).not.toBe(prior)
    environment.enabled = false
    expect(growthBookFlag(input, 'orders', 'production', 'store').observation).toMatchObject({
      enabled: false,
      exposure: 0,
      audience: 'all',
    })
  })
  it('supports unfiltered default and force values without assigning their results to hashed cohorts', () => {
    const { input, environment } = selected()
    environment.rules = []
    environment.definition = JSON.stringify({ defaultValue: false })
    expect(growthBookFlag(input, 'orders', 'production', 'store').observation).toMatchObject({
      exposure: 0,
      audience: 'all',
    })
    environment.defaultValue = 'true'
    environment.definition = JSON.stringify({ defaultValue: true, rules: [] })
    expect(growthBookFlag(input, 'orders', 'production', 'store').observation).toMatchObject({
      exposure: 100,
      audience: 'all',
    })
    environment.rules = [{ id: 'force-rule', enabled: true, type: 'force', value: 'false' }]
    environment.definition = JSON.stringify({ defaultValue: true, rules: [{ force: false }] })
    expect(growthBookFlag(input, 'orders', 'production', 'store').observation).toMatchObject({
      exposure: 0,
      audience: 'all',
    })
  })
  it('handles reverse rollouts exactly and distinguishes zero/full coverage from all-context force', () => {
    const { input, environment, entry } = selected()
    environment.defaultValue = 'true'
    entry.value = 'false'
    environment.definition = JSON.stringify({
      defaultValue: true,
      rules: [
        { force: false, coverage: 0.29, hashAttribute: 'id', seed: 'orders', hashVersion: 2 },
      ],
    })
    expect(growthBookFlag(input, 'orders', 'production', 'store').observation).toMatchObject({
      exposure: 71,
      audience: 'contexts with id',
    })
    for (const coverage of [0, 1]) {
      entry.coverage = coverage
      environment.definition = JSON.stringify({
        defaultValue: true,
        rules: [{ force: false, coverage, seed: 'orders', hashVersion: 2 }],
      })
      expect(growthBookFlag(input, 'orders', 'production', 'store').observation).toMatchObject({
        exposure: coverage === 0 ? 100 : 0,
        audience: coverage === 0 ? 'all' : 'contexts with id',
      })
    }
  })
  it('accepts the explicit owning project or unfiltered all-project metadata, never a different project', () => {
    for (const all of [true, false]) {
      const { input } = selected()
      Object.assign(input.feature, {
        targetingAllProjects: all,
        targetingProjects: all ? [] : ['store'],
      })
      expect(growthBookFlag(input, 'orders', 'production', 'store').observation.exposure).toBe(29)
    }
  })
  it.each([
    'flag',
    'top-status',
    'project',
    'archived',
    'value-type',
    'default-type',
    'missing-revision',
    'bad-revision',
    'missing-environment',
    'missing-enabled',
    'multiple-rules',
    'experiment',
    'disabled-rule',
    'condition',
    'groups',
    'prerequisites',
    'feature-prerequisites',
    'holdout',
    'base-config',
    'custom-hash',
    'bad-coverage',
    'schedule',
    'ramp-schedule',
    'other-projects',
    'sparse',
    'compiled-default',
    'compiled-force',
    'compiled-coverage',
    'compiled-hash',
    'compiled-experiment',
    'compiled-invalid-version',
  ])('keeps %s configuration unknown rather than guessing or using a draft', (kind) => {
    const { input, environment, entry } = selected()
    if (kind === 'flag') input.feature.id = 'other'
    if (kind === 'top-status') Object.assign(input, { status: 403 })
    if (kind === 'project') input.feature.project = 'other'
    if (kind === 'archived') input.feature.archived = true
    if (kind === 'value-type') input.feature.valueType = 'string'
    if (kind === 'default-type') environment.defaultValue = '"true"'
    if (kind === 'missing-revision') Reflect.deleteProperty(input.feature, 'revision')
    if (kind === 'bad-revision') input.feature.revision.version = -1
    if (kind === 'missing-environment')
      Reflect.deleteProperty(input.feature.environments, 'production')
    if (kind === 'missing-enabled') Reflect.deleteProperty(environment, 'enabled')
    if (kind === 'multiple-rules') environment.rules.push(rule())
    if (kind === 'experiment') entry.type = 'experiment'
    if (kind === 'disabled-rule') entry.enabled = false
    if (kind === 'condition') entry.condition = '{"country":"ES"}'
    if (kind === 'groups') entry.savedGroupTargeting = [{}]
    if (kind === 'prerequisites') entry.prerequisites = [{}]
    if (kind === 'feature-prerequisites') input.feature.prerequisites = ['parent']
    if (kind === 'holdout')
      Object.assign(input.feature, { holdout: { id: 'holdout', value: 'false' } })
    if (kind === 'base-config') Object.assign(input.feature, { baseConfig: 'config-key' })
    if (kind === 'custom-hash') entry.hashAttribute = 'country'
    if (kind === 'bad-coverage') entry.coverage = 1.1
    if (kind === 'schedule') entry.scheduleRules = [{}]
    if (kind === 'ramp-schedule') entry.rampScheduleId = 'ramp-123'
    if (kind === 'other-projects')
      Object.assign(input.feature, { targetingAllProjects: false, targetingProjects: ['other'] })
    if (kind === 'sparse') entry.sparse = true
    if (kind.startsWith('compiled-')) {
      const compiled = JSON.parse(environment.definition)
      if (kind === 'compiled-default') compiled.defaultValue = true
      if (kind === 'compiled-force') compiled.rules[0].force = false
      if (kind === 'compiled-coverage') compiled.rules[0].coverage = 0.3
      if (kind === 'compiled-hash') compiled.rules[0].hashAttribute = 'country'
      if (kind === 'compiled-experiment') compiled.rules[0].variations = [false, true]
      if (kind === 'compiled-invalid-version') compiled.rules[0].hashVersion = 3
      environment.definition = JSON.stringify(compiled)
    }
    expect(() => growthBookFlag(input, 'orders', 'production', 'store')).toThrow(/remains unknown/)
  })
  it('refuses a compiled force that introduces a hash-dependent cohort absent from its API rule', () => {
    const { input, environment } = selected()
    environment.rules = [{ id: 'force-rule', enabled: true, type: 'force', value: 'true' }]
    environment.definition = JSON.stringify({
      defaultValue: false,
      rules: [{ force: true, coverage: 1 }],
    })
    expect(() => growthBookFlag(input, 'orders', 'production', 'store')).toThrow()
  })
  it('executes only a Bearer-authenticated GET and feeds the real GrowthBook ramp binding', async () => {
    let requests = 0
    const host = remoteFlagHost(config, {
      secret: () => 'fixture-only-noncredential',
      fetch: async (url, init) => {
        requests++
        expect(String(url)).toBe('https://api.growthbook.io/api/v1/features/orders')
        expect(init?.method).toBe('GET')
        expect(init?.body).toBeUndefined()
        expect(init?.headers).toEqual({
          Authorization: 'Bearer fixture-only-noncredential',
          Accept: 'application/json',
        })
        return new Response(JSON.stringify(flag()), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    expect(await host.invoke(call)).toMatchObject({
      status: 'succeeded',
      complete: true,
      ref: 'https://api.growthbook.io/api/v1/features/orders',
    })
    const plan = {
      schema: 'wholeloop/ramp-plan@1' as const,
      flag: 'orders',
      environment: 'production',
      confirmedBy: 'Alex',
      stages: [],
    }
    expect(
      await flagEvidence(
        plan,
        loadProviders({ root: '/nonexistent-fixture', user: '/nonexistent-user' }),
        'growthbook',
        host,
      ),
    ).toMatchObject({ status: 'observed', exposure: 29, audience: 'contexts with id' })
    expect(requests).toBe(2)
  })
})
