import { describe, expect, it } from 'vitest'
import { syncClosed, syncProofs, syncReady, syncState } from '../../../src/sync/contracts.js'

function fixture(count: number) {
  const state = syncState([])
  const scope = 'scope-00000000'
  const slices: string[] = [],
    proofs: string[] = []
  state.items.set(scope, { kind: 'scope', status: 'open' })
  for (let index = 0; index < count; index++) {
    const suffix = index.toString(16).padStart(8, '0')
    const slice = `slice-${suffix}`,
      part = `part-${suffix}`,
      merge = `merge-${suffix}`
    state.items.set(slice, { kind: 'slice', parent: scope, status: 'closed' })
    state.items.set(part, { kind: 'part', parent: slice, status: 'closed' })
    state.merged.set(part, {
      event: merge,
      plan: `plan-${suffix}`,
      pr: {
        url: `https://github.com/example/product/pull/${index + 1}`,
        repository: 'https://github.com/example/product',
        head: `wl/${part}`,
        base: 'main',
        sha: 'a'.repeat(40),
        draft: false,
        merged: true,
        state: 'merged',
      },
    })
    state.closures.set(part, { event: `closed-${part}`, proofs: [merge] })
    state.closures.set(slice, { event: `closed-${slice}`, proofs: [merge] })
    slices.push(slice)
    proofs.push(merge)
  }
  state.deliveries.set(scope, { event: 'delivery-ready', slices, proofs })
  return { state, scope }
}

describe('fresh sync proof selection', () => {
  it.each([100, 400])(
    'does not rescan the entire tree for each of %i delivered slices',
    (count) => {
      const { state, scope } = fixture(count)
      let fields = 0
      for (const [id, item] of state.items)
        state.items.set(
          id,
          new Proxy(item, {
            get(target, key, receiver) {
              fields++
              return Reflect.get(target, key, receiver)
            },
          }),
        )
      expect(syncReady(state, scope)).toBe(true)
      console.info('Ready tree item fields:', JSON.stringify({ count, fields }))
      expect(fields).toBeLessThanOrEqual(30 * count)
    },
  )
  it('keeps missing receipts, reopened parts and stale closure/delivery proofs unready', () => {
    const { state, scope } = fixture(3)
    expect(syncReady(state, scope)).toBe(true)
    const closure = state.closures.get('part-00000001')
    if (!closure) throw new Error('Missing fixture closure')
    state.closures.delete('part-00000001')
    expect(syncReady(state, scope)).toBe(false)
    state.closures.set('part-00000001', closure)
    const item = state.items.get('part-00000001')
    if (!item) throw new Error('Missing fixture part')
    item.status = 'open'
    expect(syncReady(state, scope)).toBe(false)
    item.status = 'closed'
    closure.proofs = ['stale-merge']
    expect(syncReady(state, scope)).toBe(false)
    closure.proofs = ['merge-00000001']
    expect(syncReady(state, scope)).toBe(true)
    const delivery = state.deliveries.get(scope)
    if (!delivery) throw new Error('Missing fixture delivery')
    delivery.proofs = ['stale-delivery']
    expect(syncReady(state, scope)).toBe(false)
  })
  it('includes direct slice and every part proof, and refreshes changed parents', () => {
    const { state, scope } = fixture(2)
    const original = state.merged.get('part-00000000')
    if (!original) throw new Error('Missing fixture merge')
    state.merged.set('slice-00000000', { ...original, event: 'slice-merge' })
    expect(syncProofs(state, 'slice-00000000')).toEqual(['merge-00000000', 'slice-merge'])
    expect(syncClosed(state, 'slice-00000000')).toBe(false)
    const closure = state.closures.get('slice-00000000')
    if (!closure) throw new Error('Missing fixture closure')
    closure.proofs = ['merge-00000000', 'slice-merge']
    expect(syncClosed(state, 'slice-00000000')).toBe(true)
    const part = state.items.get('part-00000001')
    if (!part) throw new Error('Missing fixture part')
    part.parent = 'slice-00000000'
    expect(syncProofs(state, 'slice-00000000')).toEqual([
      'merge-00000000',
      'merge-00000001',
      'slice-merge',
    ])
    expect(syncReady(state, scope)).toBe(false)
  })
})
