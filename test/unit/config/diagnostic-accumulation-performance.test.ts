import { describe, expect, it, vi } from 'vitest'
import { type Schema, validate } from '../../../src/config/schema.js'

const rule: Schema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'enabled', 'values'],
    properties: {
      id: { type: 'string', pattern: '^item-[0-9]+$' },
      enabled: { type: 'boolean' },
      values: { type: 'array', minItems: 2, items: { type: 'integer', minimum: 0 } },
    },
  },
}

describe('schema diagnostic accumulation', () => {
  it.each([100, 400])(
    'does not materialize %i uniqueness keys in an intermediate vector',
    (count) => {
      const values = Array.from({ length: count }, (_, index) => index),
        map = vi.spyOn(values, 'map')
      try {
        expect(
          validate(values, { type: 'array', uniqueItems: true, items: { type: 'integer' } }),
        ).toEqual([])
        console.info(
          'Uniqueness key vectors:',
          JSON.stringify({ count, maps: map.mock.calls.length }),
        )
        expect(map).not.toHaveBeenCalled()
      } finally {
        map.mockRestore()
      }
    },
  )
  it.each([100, 400])(
    'shares only an immutable empty fallback for %i unknown property rules',
    (count) => {
      const value = Object.fromEntries(
          Array.from({ length: count }, (_, index) => [`field-${index}`, index]),
        ),
        shape: Schema = { type: 'object', additionalProperties: true },
        hasOwn = vi.spyOn(Object, 'hasOwn')
      let selections: Set<unknown>
      try {
        expect(validate(value, shape)).toEqual([])
        selections = new Set(
          hasOwn.mock.calls
            .filter(([, key]) => String(key).startsWith('field-'))
            .map(([target]) => target),
        )
      } finally {
        hasOwn.mockRestore()
      }
      console.info(
        'Empty property fallback identities:',
        JSON.stringify({ count, objects: selections.size }),
      )
      expect(selections.size).toBe(1)
      shape.properties = { 'field-0': { type: 'boolean' } }
      expect(validate(value, shape)).toEqual(['config.field-0: 0; expected boolean'])
    },
  )
  it.each([100, 400])('merges no temporary diagnostic vectors for %i valid objects', (count) => {
    const values = Array.from({ length: count }, (_, index) => ({
        id: `item-${index}`,
        enabled: true,
        values: [index, index + 1],
      })),
      filter = vi.spyOn(Array.prototype, 'filter'),
      map = vi.spyOn(Array.prototype, 'map'),
      flatMap = vi.spyOn(Array.prototype, 'flatMap')
    let result: string[], calls: { filter: number; map: number; flatMap: number }
    try {
      result = validate(values, rule)
      calls = {
        filter: filter.mock.calls.length,
        map: map.mock.calls.length,
        flatMap: flatMap.mock.calls.length,
      }
    } finally {
      filter.mockRestore()
      map.mockRestore()
      flatMap.mockRestore()
    }
    console.info('Diagnostic vector passes:', JSON.stringify({ count, ...calls }))
    expect(result).toEqual([])
    expect(calls).toEqual({ filter: 0, map: 0, flatMap: 0 })
  })
  it('preserves complete diagnostic order, exact text and first-failure array boundaries', () => {
    const shape: Schema = {
        type: 'object',
        additionalProperties: false,
        required: ['required-a', 'required-b'],
        properties: {
          choice: { type: 'string', enum: ['on', 'off'] },
          items: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'integer' } },
          nested: {
            type: 'object',
            additionalProperties: false,
            required: ['id'],
            properties: { id: { type: 'integer' } },
          },
        },
      },
      value = JSON.parse(
        '{"choice":"other","items":[1,1],"nested":{"id":"wrong","constructor":"bad","extra":2},"unknown":null}',
      )
    expect(validate(value, shape, 'fixture')).toEqual([
      'fixture.required-a: required field',
      'fixture.required-b: required field',
      'fixture.choice: "other"; expected on | off',
      'fixture.items: expected unique items',
      'fixture.nested.id: "wrong"; expected integer',
      'fixture.nested.constructor: forbidden key',
      'fixture.nested.extra: 2; expected a known configuration key',
      'fixture.unknown: null; expected a known configuration key',
    ])
    expect(
      validate([], {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: { type: 'unsupported' },
      }),
    ).toEqual(['config: expected at least 1 items'])
    expect(() => validate([1], { type: 'array', items: { type: 'unsupported' } })).toThrow(
      'Unsupported configuration schema type: unsupported',
    )
    expect(
      validate([1, 1], { type: 'array', uniqueItems: true, items: { type: 'unsupported' } }),
    ).toEqual(['config: expected unique items'])
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    expect(() =>
      validate([1, 1, cyclic], { type: 'array', uniqueItems: true, items: { type: 'integer' } }),
    ).toThrow(/circular/i)
  })
  it('preserves sparse/inherited array positions and present getters without an items rule', () => {
    const values: unknown[] = Array(3),
      parent = Object.create(Array.prototype)
    parent[1] = 'inherited'
    values[2] = 'own'
    Object.setPrototypeOf(values, parent)
    expect(validate(values, { type: 'array', items: { type: 'integer' } })).toEqual([
      'config[1]: "inherited"; expected integer',
      'config[2]: "own"; expected integer',
    ])
    expect(
      validate(Array(1), { type: 'array', uniqueItems: true, items: { type: 'integer' } }),
    ).toEqual([])
    expect(
      validate(Array(2), { type: 'array', uniqueItems: true, items: { type: 'integer' } }),
    ).toEqual(['config: expected unique items'])
    const observed: unknown[] = Array(1)
    Object.defineProperty(observed, 0, {
      get() {
        throw new Error('fixture-array-read')
      },
    })
    expect(() => validate(observed, { type: 'array' })).toThrow('fixture-array-read')
  })
  it('keeps independent results, required-own checks and partial default overrides', () => {
    const first = validate({}),
      second = validate({})
    first.push('local caller mutation')
    expect(second).toEqual([])
    expect(
      validate(Object.create({ id: 1 }), {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
      }),
    ).toEqual(['config.id: required field'])
    const properties = Object.create({ inherited: { type: 'integer' } })
    expect(
      validate({ inherited: 1 }, { type: 'object', properties, additionalProperties: false }),
    ).toEqual(['config.inherited: 1; expected a known configuration key'])
  })
  it('keeps object value snapshots and original array bounds across child getters', () => {
    const value: { first: object; second: unknown } = { first: {}, second: 1 }
    Object.defineProperty(value.first, 'id', {
      enumerable: true,
      get() {
        value.second = 'changed'
        return 1
      },
    })
    expect(
      validate(value, {
        type: 'object',
        properties: {
          first: { type: 'object', properties: { id: { type: 'integer' } } },
          second: { type: 'integer' },
        },
      }),
    ).toEqual([])
    expect(value.second).toBe('changed')
    const growing: unknown[] = Array(1)
    Object.defineProperty(growing, 0, {
      get() {
        growing.push('late')
        return 1
      },
    })
    expect(validate(growing, { type: 'array', items: { type: 'integer' } })).toEqual([])
    expect(growing).toHaveLength(2)
    const serialized: unknown[] = []
    serialized.push(
      {
        toJSON() {
          serialized.push(3)
          return 1
        },
      },
      2,
    )
    expect(
      validate(serialized, { type: 'array', uniqueItems: true, items: { type: 'integer' } }),
    ).toEqual(['config: expected unique items'])
    expect(serialized).toHaveLength(3)
  })
})
