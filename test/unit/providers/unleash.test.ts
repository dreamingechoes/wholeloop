import { getEventListeners } from 'node:events'
import { describe, expect, it } from 'vitest'
import { flagReadPlan, remoteFlagHost } from '../../../src/providers/flag-bridge.js'
import { loadProviders } from '../../../src/providers/load.js'
import { unleashFlag } from '../../../src/providers/unleash.js'
import { flagEvidence } from '../../../src/ramp/evidence.js'

const config = {
  schema: 'wholeloop/flag-bridge@1',
  provider: 'unleash',
  baseUrl: 'https://unleash.example.com/prefix/',
  project: 'store',
  tokenEnv: 'WL_FIXTURE_UNLEASH_KEY',
}
const call = {
  provider: 'unleash',
  operation: 'flags.read-state',
  tool: 'wholeloop.flags.read-state',
  args: { flag: 'orders', environment: 'production', service: 'unleash' },
  guidance: '',
}
function flag() {
  return {
    name: 'orders',
    project: 'store',
    archived: false,
    dependencies: [] as unknown[],
    environments: [
      {
        name: 'production',
        featureName: 'orders',
        enabled: true,
        variants: [] as unknown[],
        strategies: [
          {
            id: 'strategy-123',
            name: 'flexibleRollout',
            featureName: 'orders',
            disabled: false,
            constraints: [] as unknown[],
            segments: [] as unknown[],
            variants: [] as unknown[],
            parameters: { rollout: '25', stickiness: 'default', groupId: 'orders' } as Record<
              string,
              unknown
            >,
          },
        ],
      },
    ],
  }
}
function selected(input = flag()) {
  const environment = input.environments[0],
    strategy = environment?.strategies[0]
  if (!environment || !strategy) throw new Error('Missing synthetic Unleash environment/strategy')
  return { input, environment, strategy }
}

describe('Unleash explicit resource and configured rollout', () => {
  it('preserves configured HTTPS subpaths and requests environment variants explicitly', () => {
    const plan = flagReadPlan(config, 'orders', 'production')
    expect(plan).toMatchObject({
      status: 'planned',
      effects: 'not-performed',
      provider: 'unleash',
      request: {
        method: 'GET',
        url: 'https://unleash.example.com/prefix/api/admin/projects/store/features/orders?variantEnvironments=true',
      },
    })
  })
  it('normalizes exact unfiltered default-stickiness rollout and disabled environment without raw fields', () => {
    const { input, environment } = selected()
    const result = unleashFlag(input, 'orders', 'production', 'store')
    expect(result.observation).toEqual({
      flag: 'orders',
      environment: 'production',
      enabled: true,
      exposure: 25,
      audience: 'all',
    })
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/)
    environment.enabled = false
    expect(unleashFlag(input, 'orders', 'production', 'store').observation).toMatchObject({
      enabled: false,
      exposure: 0,
    })
    expect(JSON.stringify(result)).not.toMatch(/strategy-123|constraints|dependencies/)
  })
  it('supports default strategy, exact zero/full rollout and documented absent disabled=false default', () => {
    const { input, strategy } = selected()
    strategy.parameters.rollout = '0'
    expect(unleashFlag(input, 'orders', 'production', 'store').observation.exposure).toBe(0)
    strategy.parameters.rollout = '100'
    Reflect.deleteProperty(strategy, 'disabled')
    expect(unleashFlag(input, 'orders', 'production', 'store').observation.exposure).toBe(100)
    strategy.name = 'default'
    strategy.parameters = {}
    expect(unleashFlag(input, 'orders', 'production', 'store').observation.exposure).toBe(100)
  })
  it('binds revisions to the consumed strategy while omitting unrelated private prose', () => {
    const { input, strategy } = selected(),
      first = unleashFlag(input, 'orders', 'production', 'store')
    Object.assign(input, { description: 'private text' })
    expect(unleashFlag(input, 'orders', 'production', 'store').revision).toBe(first.revision)
    strategy.parameters.groupId = 'new-hash-group'
    expect(unleashFlag(input, 'orders', 'production', 'store').revision).not.toBe(first.revision)
  })
  it.each([
    'flag',
    'project',
    'archived',
    'dependency',
    'missing-dependencies',
    'environment',
    'duplicate-environment',
    'missing-variants',
    'variant',
    'multiple-strategies',
    'missing-strategies',
    'constraints',
    'segments',
    'strategy-variants',
    'disabled-strategy',
    'wrong-strategy-flag',
    'custom-stickiness',
    'invalid-percentage',
    'decimal-percentage',
    'unknown-parameter',
    'missing-group',
    'custom-strategy',
    'release-plan',
    'safeguard',
  ])('keeps %s unknown instead of flattening targeting', (kind) => {
    const { input, environment, strategy } = selected()
    if (kind === 'flag') input.name = 'other'
    if (kind === 'project') input.project = 'other'
    if (kind === 'archived') input.archived = true
    if (kind === 'dependency') input.dependencies = [{}]
    if (kind === 'missing-dependencies') Reflect.deleteProperty(input, 'dependencies')
    if (kind === 'environment') environment.name = 'development'
    if (kind === 'duplicate-environment') input.environments.push(structuredClone(environment))
    if (kind === 'missing-variants') Reflect.deleteProperty(environment, 'variants')
    if (kind === 'variant') environment.variants = [{}]
    if (kind === 'multiple-strategies') environment.strategies.push(structuredClone(strategy))
    if (kind === 'missing-strategies') environment.strategies = []
    if (kind === 'constraints') strategy.constraints = [{}]
    if (kind === 'segments') strategy.segments = [1]
    if (kind === 'strategy-variants') strategy.variants = [{}]
    if (kind === 'disabled-strategy') strategy.disabled = true
    if (kind === 'wrong-strategy-flag') strategy.featureName = 'other'
    if (kind === 'custom-stickiness') strategy.parameters.stickiness = 'sessionId'
    if (kind === 'invalid-percentage') strategy.parameters.rollout = '101'
    if (kind === 'decimal-percentage') strategy.parameters.rollout = '0.5'
    if (kind === 'unknown-parameter') strategy.parameters.context = 'custom'
    if (kind === 'missing-group') Reflect.deleteProperty(strategy.parameters, 'groupId')
    if (kind === 'custom-strategy') strategy.name = 'userWithId'
    if (kind === 'release-plan') Object.assign(environment, { releasePlans: [{}] })
    if (kind === 'safeguard') Object.assign(environment, { safeguards: [{}] })
    expect(() => unleashFlag(input, 'orders', 'production', 'store')).toThrow(/remains unknown/)
  })
  it('forwards in-flight cancellation and releases native signal listeners on success and failure', async () => {
    for (const cancelled of [false, true]) {
      const controller = new AbortController()
      const host = remoteFlagHost(config, {
        secret: () => 'fixture-only-noncredential',
        signal: controller.signal,
        fetch: async (_url, init) => {
          expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1)
          if (!cancelled)
            return new Response(JSON.stringify(flag()), {
              headers: { 'Content-Type': 'application/json' },
            })
          const waiting = new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener(
              'abort',
              () => reject(new Error('Synthetic cancellation')),
              { once: true },
            ),
          )
          controller.abort()
          return waiting
        },
      })
      const pending = host.invoke(call)
      if (cancelled) await expect(pending).rejects.toThrow(/state remains unknown/)
      else expect(await pending).toMatchObject({ status: 'succeeded' })
      expect(getEventListeners(controller.signal, 'abort')).toEqual([])
    }
  })
  it('feeds the exact built-in Unleash request through bounded GET and the existing ramp normalizer', async () => {
    const requests: { url: string; method?: string; body?: unknown }[] = []
    const host = remoteFlagHost(config, {
      secret: (name) => (name === config.tokenEnv ? 'fixture-only-noncredential' : undefined),
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          ...(init?.method ? { method: init.method } : {}),
          ...(init?.body ? { body: init.body } : {}),
        })
        expect(init?.headers).toEqual({
          Authorization: 'fixture-only-noncredential',
          Accept: 'application/json',
        })
        return new Response(JSON.stringify(flag()), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    const result = await host.invoke(call)
    expect(result).toMatchObject({
      status: 'succeeded',
      complete: true,
      ref: 'https://unleash.example.com/prefix/api/admin/projects/store/features/orders',
    })
    const plan = {
      schema: 'wholeloop/ramp-plan@1' as const,
      flag: 'orders',
      environment: 'production',
      confirmedBy: 'Alex',
      stages: [],
    }
    const registry = loadProviders({ root: '/nonexistent-fixture', user: '/nonexistent-user' })
    expect(await flagEvidence(plan, registry, 'unleash', host)).toMatchObject({
      status: 'observed',
      exposure: 25,
      audience: 'all',
    })
    expect(requests).toHaveLength(2)
    expect(
      requests.every(
        (request) =>
          request.method === 'GET' &&
          !request.body &&
          request.url.endsWith('?variantEnvironments=true'),
      ),
    ).toBe(true)
    const complex = flag()
    complex.dependencies = [{}]
    expect(
      await flagEvidence(
        plan,
        registry,
        'unleash',
        remoteFlagHost(config, {
          secret: () => 'fixture-only-noncredential',
          fetch: async () =>
            new Response(JSON.stringify(complex), {
              headers: { 'Content-Type': 'application/json' },
            }),
        }),
      ),
    ).toMatchObject({ status: 'unknown' })
  })
})
