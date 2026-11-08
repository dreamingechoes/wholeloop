// ADR-0209: Codex reports its subscription window without a model call; the controller reads it
// before dispatch. Anything it cannot read stays unknown and never delays a run.
import { describe, expect, it } from 'vitest'
import { codexUsageWindow } from '../../../src/delivery/native-usage-window.js'

const at = (seconds: number) => new Date(seconds * 1000).toISOString()
const limits = (rateLimits: unknown) => ({ rateLimits })

describe('Codex usage window', () => {
  it.each([
    [
      'available below 100 percent',
      limits({ primary: { usedPercent: 96, resetsAt: 1794517974 }, secondary: null }),
      { state: 'available' },
    ],
    [
      'exhausted at 100 percent until that reset',
      limits({ primary: { usedPercent: 100, resetsAt: 1794517974 }, secondary: null }),
      { state: 'exhausted', resetsAt: at(1794517974) },
    ],
    [
      'exhausted until the latest full window',
      limits({
        primary: { usedPercent: 100, resetsAt: 1794500000 },
        secondary: { usedPercent: 100, resetsAt: 1794517974 },
      }),
      { state: 'exhausted', resetsAt: at(1794517974) },
    ],
    [
      'exhausted when the client says a limit is reached',
      limits({
        primary: { usedPercent: 40, resetsAt: 1794500000 },
        rateLimitReachedType: 'primary',
      }),
      { state: 'exhausted', resetsAt: at(1794500000) },
    ],
    ['unknown without windows', limits({ primary: null, secondary: null }), { state: 'unknown' }],
    ['unknown for an error', { code: -32600 }, { state: 'unknown' }],
    [
      'unknown for a malformed reset',
      limits({ primary: { usedPercent: 100, resetsAt: 'soon' } }),
      { state: 'unknown' },
    ],
  ])('%s', (_, result, expected) => {
    expect(codexUsageWindow(result)).toEqual(expected)
  })
})
