import { describe, expect, it } from 'vitest'
import { type Layer, resolveConfig, type Scope } from '../../../src/config/resolve.js'
import { validate } from '../../../src/config/schema.js'

describe('layered configuration', () => {
  it.each([
    { scopes: [], personal: 'built-in', team: 'built-in' },
    { scopes: ['project'], personal: 'project', team: 'project' },
    { scopes: ['user'], personal: 'user', team: 'user' },
    { scopes: ['user', 'project'], personal: 'user', team: 'project' },
    { scopes: ['project', 'user', 'initiative'], personal: 'initiative', team: 'initiative' },
    { scopes: ['run', 'project', 'user', 'initiative'], personal: 'run', team: 'run' },
  ])('uses deterministic precedence for $scopes', ({ scopes, personal, team }) => {
    const layers: Layer[] = scopes.map((scope) => ({
      scope: scope as Scope,
      file: `${scope}.yml`,
      values: { profile: { language: scope }, providers: { docs: scope } },
    }))
    const result = resolveConfig(layers)
    expect(result.sources['profile.language']?.scope).toBe(personal)
    expect(result.sources['gates.verify.rounds']?.scope).toBe('built-in')
    expect(result.sources['providers.docs']?.scope ?? 'built-in').toBe(team)
    expect(resolveConfig([...layers].reverse())).toEqual(result)
  })

  it('merges dynamic slot keys, while arrays replace instead of concatenate', () => {
    const result = resolveConfig([
      {
        scope: 'user',
        values: {
          slots: { 'build.frontend': 'user-ui', 'verify.suite': 'test' },
          lenses: { add: ['a'] },
        },
      },
      {
        scope: 'project',
        values: { slots: { 'build.frontend': 'project-ui' }, lenses: { add: ['b'] } },
      },
    ])
    expect(result.values.slots).toEqual({ 'build.frontend': 'project-ui', 'verify.suite': 'test' })
    expect(result.values.lenses).toEqual({ add: ['b'] })
    expect(result.sources['slots.build.frontend']?.scope).toBe('project')
  })

  it.each([
    { gates: { verify: { rounds: 0 } } },
    { gates: { review: { rounds: 1.2 } } },
    { profile: { pace: 'fast' } },
    { flow: { decisions: { remove: ['approve-spec'] } } },
    { profile: null },
    { providers: { sources: 'web' } },
    { targets: ['unsupported'] },
    { lenses: { add: ['a', 'a'] } },
    JSON.parse('{"slots":{"__proto__":"bad"}}'),
    { unknown: true },
    { version: 2 },
  ])('rejects the whole invalid layer: %j', (values) => {
    expect(() => resolveConfig([{ scope: 'run', file: 'bad.yml', values }])).toThrow(/bad.yml/)
  })

  it('reports the path, rejected value and expected type', () => {
    expect(validate({ gates: { verify: { rounds: 'four' } } })).toEqual([
      'config.gates.verify.rounds: "four"; expected integer',
    ])
  })

  it('rejects duplicate layers instead of depending on input order', () => {
    expect(() =>
      resolveConfig([
        { scope: 'run', values: {} },
        { scope: 'run', values: {} },
      ]),
    ).toThrow('Duplicate')
  })
})
