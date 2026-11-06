import { describe, expect, it, vi } from 'vitest'
import { safeSourceText } from '../../../src/delivery/input.js'
import { validateDeliveryShape } from '../../../src/delivery/plan.js'
import { validActor, validRationale } from '../../../src/state/attribution.js'

describe('bounded text validity without UTF-8 round-trip buffers', () => {
  it.each([100, 400])('allocates no encoding buffers for %i bounded validation inputs', (count) => {
    const values = Array.from({ length: count }, () => 'a'.repeat(1024)),
      rule = { type: 'array', items: { type: 'string', maxLength: 2048 } },
      actor = {
        kind: 'agent',
        name: 'Fixture',
        client: {
          client: 'codex',
          version: 'v'.repeat(128),
          model: 'm'.repeat(256),
          source: 'declared',
        },
      },
      rationale = 'r'.repeat(1024),
      from = vi.spyOn(Buffer, 'from')
    let calls: number, bytes: number
    try {
      validateDeliveryShape(values, rule)
      safeSourceText('Ordinary source text without credentials.')
      for (let index = 0; index < count; index++) {
        if (!validActor(actor, 'state') || !validRationale({ kind: 'operator' }, rationale, true))
          throw new Error('Invalid bounded text fixture')
      }
      calls = from.mock.calls.length
      bytes = from.mock.calls.reduce(
        (total, [value]) => total + (typeof value === 'string' ? Buffer.byteLength(value) : 0),
        0,
      )
    } finally {
      from.mockRestore()
    }
    console.info('UTF-8 validation buffers:', JSON.stringify({ count, calls, bytes }))
    expect(calls).toBe(0)
  })
  it('retains byte-first quotas, invalid binary inputs, surrogate refusal and valid Unicode', () => {
    const body = 'a'.repeat(9)
    expect(() => safeSourceText(body, 8)).toThrow('oversized')
    expect(() => safeSourceText('\ud800', 0)).toThrow('oversized')
    expect(() => safeSourceText('\ud800')).toThrow('invalid-input')
    expect(() => safeSourceText('\udfff')).toThrow('invalid-input')
    expect(() => safeSourceText('before\0after')).toThrow('invalid-input')
    expect(() => safeSourceText(Buffer.from('body') as unknown as string)).toThrow('invalid-input')
    for (const text of [
      'plain text',
      'replacement \ufffd',
      'astral \u{1f680}',
      'before\ud800\udc00after',
    ])
      expect(() => safeSourceText(text)).not.toThrow()
    expect(validRationale({ kind: 'operator' }, '\ud800', true)).toBe(false)
    expect(() => validateDeliveryShape('unpaired \ud800', { type: 'string' })).toThrow(
      'invalid-text',
    )
  })
})
