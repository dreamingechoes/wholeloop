import { describe, expect, it, vi } from 'vitest'
import { type Schema, validate } from '../../../src/config/schema.js'
import { SOURCE_LIMIT, validateSourceShape } from '../../../src/delivery/input.js'
import { validNativeRuntime } from '../../../src/delivery/native-runtime.js'
import { validateDeliveryShape } from '../../../src/delivery/plan.js'
import { validActor, validRationale } from '../../../src/state/attribution.js'

function expandedCharacters(operation: () => void) {
  const iterator = String.prototype[Symbol.iterator]
  let characters = 0
  const observed = vi.spyOn(String.prototype, Symbol.iterator).mockImplementation(function (
    this: string,
  ) {
    const original = iterator.call(this)
    return {
      next() {
        const step = original.next()
        if (!step.done) characters++
        return step
      },
      [Symbol.iterator]() {
        return this
      },
    }
  })
  try {
    operation()
  } finally {
    observed.mockRestore()
  }
  return characters
}

const runtime = (client = '/fixture/client', ref = 'unit-check') => ({
  schema: 'wholeloop/native-runtime@1',
  clients: [{ target: 'codex', client, store: '/fixture/store' }],
  repositories: [
    {
      repository: 'app',
      recipe: 'a'.repeat(64),
      helperImage: `node@sha256:${'b'.repeat(64)}`,
      suite: { refs: [ref], mapping: { [ref]: 'unit-check' }, timeoutMs: 1000 },
    },
  ],
})

describe('fresh schema validation without repeated allocations', () => {
  it.each([100, 400])('formats no diagnostic enum for %i valid values', (count) => {
    const values = ['on', 'off'],
      map = vi.spyOn(values, 'map'),
      rule: Schema = { type: 'array', items: { type: 'string', enum: values } }
    try {
      expect(
        validate(
          Array.from({ length: count }, () => 'on'),
          rule,
        ),
      ).toEqual([])
      expect(map).not.toHaveBeenCalled()
      expect(validate(['other'], rule)).toEqual(['config[0]: "other"; expected on | off'])
      expect(map).toHaveBeenCalledTimes(1)
    } finally {
      map.mockRestore()
    }
  })
  it.each([100, 400])('compiles one exact pattern across %i repeated validations', (count) => {
    const pattern = `^fixture-${count}-[0-9]+$`,
      original = RegExp
    let compilations = 0
    class ObservedRegExp extends original {
      constructor(pattern: string | RegExp, flags?: string) {
        super(pattern, flags)
        compilations++
      }
    }
    vi.stubGlobal('RegExp', ObservedRegExp)
    try {
      const rule: Schema = { type: 'string', pattern }
      for (let index = 0; index < count; index++)
        expect(validate(`fixture-${count}-${index}`, rule)).toEqual([])
      expect(compilations).toBe(1)
      rule.pattern = `^changed-${count}$`
      expect(validate(`fixture-${count}-0`, rule)).toHaveLength(1)
      expect(compilations).toBe(2)
      rule.pattern = pattern
      expect(validate(`fixture-${count}-0`, rule)).toEqual([])
      expect(compilations).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('bounds retained patterns and refuses invalid expressions without caching them', () => {
    const original = RegExp
    let compilations = 0
    class ObservedRegExp extends original {
      constructor(pattern: string | RegExp, flags?: string) {
        super(pattern, flags)
        compilations++
      }
    }
    vi.stubGlobal('RegExp', ObservedRegExp)
    try {
      for (let index = 0; index < 256; index++)
        expect(
          validate(`eviction-${index}`, { type: 'string', pattern: `^eviction-${index}$` }),
        ).toEqual([])
      expect(compilations).toBe(256)
      expect(validate('eviction-0', { type: 'string', pattern: '^eviction-0$' })).toEqual([])
      expect(compilations).toBe(257)
      const large = `^${'a'.repeat(4097)}$`
      expect(validate('a'.repeat(4097), { type: 'string', pattern: large })).toEqual([])
      expect(validate('a'.repeat(4097), { type: 'string', pattern: large })).toEqual([])
      expect(compilations).toBe(259)
      const rule: Schema = { type: 'string', pattern: '[' }
      expect(() => validate('value', rule)).toThrow(SyntaxError)
      rule.pattern = '^repaired$'
      expect(validate('repaired', rule)).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it.each([100, 400])('expands no characters into arrays for %i valid bounded strings', (count) => {
    const values = Array.from({ length: count }, () => 'a'.repeat(1024)),
      rule = { type: 'array', items: { type: 'string', maxLength: 2048 } }
    const characters = expandedCharacters(() => {
      validateDeliveryShape(values, rule)
      validateSourceShape(values, rule)
    })
    console.info('Validation character expansion:', JSON.stringify({ count, characters }))
    expect(characters).toBe(0)
  })
  it.each([100, 400])('expands no characters for %i native/attribution validations', (count) => {
    const document = runtime(`/fixture/${'a'.repeat(1000)}`, 'r'.repeat(128)),
      rationale = 'r'.repeat(1024),
      agent = {
        kind: 'agent',
        name: 'Fixture',
        client: { client: 'codex', version: '1.0.0', model: 'fixture', source: 'declared' },
      }
    const characters = expandedCharacters(() => {
      for (let index = 0; index < count; index++) {
        if (
          !validNativeRuntime(document) ||
          !validRationale({ kind: 'operator' }, rationale, true) ||
          !validActor(agent, 'state')
        )
          throw new Error('Invalid allocation fixture')
      }
    })
    console.info('Native/attribution character expansion:', JSON.stringify({ count, characters }))
    expect(characters).toBe(0)
  })
  it('retains distinct control policies, multiline source bodies and Unicode refusals', () => {
    const text = { type: 'string', maxLength: 2048 },
      body = { type: 'string', maxLength: SOURCE_LIMIT }
    for (let code = 0; code < 128; code++) {
      const value = `before${String.fromCharCode(code)}after`
      if (code < 32 && ![9, 10, 13].includes(code))
        expect(() => validateDeliveryShape(value, text)).toThrow('invalid-text')
      else expect(() => validateDeliveryShape(value, text)).not.toThrow()
      if (code < 32 || code === 127)
        expect(() => validateSourceShape(value, text)).toThrow('invalid-input')
      else expect(() => validateSourceShape(value, text)).not.toThrow()
      expect(() => validateSourceShape(value, body)).not.toThrow()
      expect(validRationale({ kind: 'operator' }, value, true)).toBe(
        (code >= 32 && code !== 127) || [9, 10, 13].includes(code),
      )
      expect(validNativeRuntime(runtime('/fixture/client', value))).toBe(code >= 32 && code !== 127)
    }
    expect(() => validateDeliveryShape('valid astral \u{1f680}', text)).not.toThrow()
    expect(() => validateDeliveryShape('unpaired \ud800', text)).toThrow('invalid-text')
  })
})
