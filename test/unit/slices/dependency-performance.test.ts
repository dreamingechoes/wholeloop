import { describe, expect, it } from 'vitest'
import { checkDependencies } from '../../../src/slices/contract.js'

function chain(count: number) {
  return new Map(
    Array.from({ length: count }, (_, index) => [
      `unit-${index}`,
      index + 1 < count ? [`unit-${index + 1}`] : [],
    ]),
  )
}

function additions(run: () => void) {
  const original = Set.prototype.add
  let count = 0
  Set.prototype.add = function <T>(this: Set<T>, value: T): Set<T> {
    count++
    return original.call(this, value)
  }
  try {
    run()
  } finally {
    Set.prototype.add = original
  }
  return count
}

describe('current dependency branch traversal', () => {
  it.each([100, 400])('avoids ancestor copies for a chain of %i nodes', (count) => {
    const graph = chain(count),
      before = [...graph].map(([id, after]) => [id, [...after]]),
      writes = additions(() => checkDependencies(graph))
    console.info('Dependency branch additions:', JSON.stringify({ count, writes }))
    expect(writes).toBe(count * 2)
    expect([...graph]).toEqual(before)
  })
  it('retires a completed sibling before visiting a shared descendant', () => {
    const graph = new Map([
      ['root', ['left', 'right', 'external']],
      ['left', ['shared']],
      ['right', ['shared']],
      ['shared', []],
    ])
    expect(() => checkDependencies(graph)).not.toThrow()
    expect(() => checkDependencies(new Map([...graph].reverse()))).not.toThrow()
    graph.set('shared', ['root'])
    expect(() => checkDependencies(graph)).toThrow('Slice dependencies contain a cycle')
  })
  it('keeps depth-first read order, missing leaves and early cycle refusal', () => {
    const graph = new Map([
        ['root', ['left', 'right']],
        ['left', ['outside']],
        ['right', ['root']],
        ['unvisited', []],
      ]),
      get = graph.get.bind(graph),
      observed: string[] = []
    graph.get = (id) => {
      observed.push(id)
      return get(id)
    }
    expect(() => checkDependencies(graph)).toThrow('Slice dependencies contain a cycle')
    expect(observed).toEqual(['root', 'left', 'outside', 'right'])
    graph.set('right', [])
    observed.length = 0
    expect(() => checkDependencies(graph)).not.toThrow()
    expect(observed).toEqual(['root', 'left', 'outside', 'right', 'unvisited'])
  })
  it.each([
    new Map<string, string[]>(),
    new Map([['single', []]]),
    new Map([['self', ['self']]]),
    new Map([['repeated', ['leaf', 'leaf']]]),
    new Map([
      ['left', ['right']],
      ['right', ['left']],
    ]),
  ])('does not retain a previous invocation branch', (graph) => {
    const run = () => {
      try {
        checkDependencies(graph)
        return 'accepted'
      } catch (error) {
        return (error as Error).message
      }
    }
    expect(run()).toBe(run())
    expect(() => checkDependencies(chain(3))).not.toThrow()
  })
})
