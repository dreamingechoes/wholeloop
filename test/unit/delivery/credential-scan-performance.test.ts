import { afterEach, describe, expect, it, vi } from 'vitest'
import { rejectSourceCredentials } from '../../../src/delivery/input.js'

afterEach(() => vi.restoreAllMocks())

describe('credential scans of identical text (ADR-0235)', () => {
  it('scans a large clean text once and never remembers a refusal', () => {
    const clean = `${'{"status":"passed","evidence":"abcdef"}\n'.repeat(64)}unique-${Math.random()}`,
      bearing = `${'x'.repeat(2048)}\nAuthorization: Bearer ${'a'.repeat(32)}\n${Math.random()}`,
      test = vi.spyOn(RegExp.prototype, 'test')
    rejectSourceCredentials(clean)
    const first = test.mock.calls.length
    expect(first).toBe(3)
    for (let index = 0; index < 10; index++) rejectSourceCredentials(clean)
    expect(test.mock.calls.length).toBe(first)
    for (let index = 0; index < 3; index++)
      expect(() => rejectSourceCredentials(bearing)).toThrow('credential-bearing')
    // Small texts are cheaper to scan than to hash and are always scanned.
    test.mockClear()
    rejectSourceCredentials('short clean text')
    rejectSourceCredentials('short clean text')
    expect(test.mock.calls.length).toBe(6)
  })
})
