import { describe, expect, it } from 'vitest'
import { syncBasis, syncClosed, syncReady, syncState } from '../../../src/sync/contracts.js'

describe('missing synchronization receipts', () => {
  it('does not traverse a work tree when the required direct receipt is absent', () => {
    const measurements = [100, 400].map((size) => {
      const state = syncState([])
      let fields = 0
      for (let index = 0; index < size; index++)
        state.items.set(
          `slice-${index.toString(16).padStart(8, '0')}`,
          new Proxy(
            { kind: 'slice', parent: 'scope-00000000', status: 'open' },
            {
              get(target, key, receiver) {
                fields++
                return Reflect.get(target, key, receiver)
              },
            },
          ),
        )
      const closed = syncClosed(state, 'slice-00000000'),
        ready = syncReady(state, 'scope-00000000'),
        basis = syncBasis(state, 'slice-00000000'),
        reads = fields
      expect([closed, ready, basis]).toEqual([false, false, undefined])
      return { size, reads }
    })
    console.info('Missing sync receipt item reads:', JSON.stringify(measurements))
    for (const measurement of measurements) expect(measurement.reads).toBe(0)
  })
})
