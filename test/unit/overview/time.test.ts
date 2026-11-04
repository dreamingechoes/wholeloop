import { describe, expect, it } from 'vitest'
import { recordedTime } from '../../../src/overview/time.js'

describe('recorded observation time', () => {
  it.each([
    ['2026-11-04T20:00:00.000Z', '2026-11-04T20:00:00.000Z'],
    ['2026-11-04T21:00:00+01:00', '2026-11-04T20:00:00.000Z'],
    ['2026-11-04T20:00:00', null],
    ['2026-11-04', null],
    ['November 4 2026 20:00', null],
    ['PRIVATE_LEGACY_TIME', null],
    ['2026-11-04T20:00:00+99:99', null],
  ])('normalizes an explicit zone or keeps %s unknown', (input, expected) => {
    expect(recordedTime(input)).toBe(expected)
  })
})
