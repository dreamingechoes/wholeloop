import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { environmentEntries, environmentReceipt } from '../../../src/environment/ledger.js'
import { event, replay, type StateEvent } from '../../../src/state/events.js'
import { projections } from '../../../src/state/projections.js'

const ts = '2026-11-01T00:00:00.000Z'
const id = (i: number) => `init-${i.toString(16).padStart(8, '0')}`
function created(i: number, parent?: number) {
  return event(
    id(i),
    {
      type: 'item.created',
      data: {
        kind: 'initiative',
        title: `Fixture ${i}`,
        owner: 'Fixture Owner',
        body: '',
        ...(parent === undefined ? {} : { parent: id(parent) }),
      },
    },
    ts,
  )
}
function declaration(owner: number, key: string) {
  return event(
    id(owner),
    {
      type: 'env.declared',
      data: {
        key,
        resource: `fixture:${key}`,
        effect: 'Declare a fixture resource',
        undo: { cwd: '/fixture', argv: ['fixture-tool', 'remove', key] },
        by: 'Fixture Owner',
      },
    },
    ts,
  )
}
function stable(events: StateEvent[]) {
  return events.map((entry, i) => ({
    ...entry,
    id: `ev-00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
  }))
}

describe('environment projections from one complete current event view', () => {
  it('retains global declaration order, shared ancestors, descendants and sibling exclusion', () => {
    const events = stable([
        created(0),
        created(1, 0),
        created(2, 1),
        created(3, 0),
        created(4),
        declaration(2, 'leaf'),
        declaration(4, 'unrelated'),
        declaration(0, 'root'),
        declaration(3, 'sibling'),
        declaration(1, 'branch'),
      ]),
      files = projections(replay(events), events)
    const expected = [
      ['leaf', 'root', 'sibling', 'branch'],
      ['leaf', 'root', 'branch'],
      ['leaf', 'root', 'branch'],
      ['root', 'sibling'],
      ['unrelated'],
    ]
    for (let i = 0; i < expected.length; i++) {
      const entries = JSON.parse(files.get(`items/${id(i)}/environment.json`) ?? '[]')
      expect(entries.map((entry: { write: { key: string } }) => entry.write.key)).toEqual(
        expected[i],
      )
      expect(environmentEntries(events, id(i)).map((entry) => entry.write.key)).toEqual(expected[i])
      expect(files.get(`items/${id(i)}/environment.md`)).toBe(
        `# Environment receipt\n\n${environmentReceipt(events, id(i))}`,
      )
    }
    const digest = createHash('sha256')
      .update(JSON.stringify([...files].sort(([a], [b]) => a.localeCompare(b))))
      .digest('hex')
    // Retain the complete original formatted bytes, including declaration order.
    expect(digest).toBe('38a862ab24160a3e4801ebf4651a45a68b0eb78c5d29d1a3826af72d2c05c7c9')
  })

  it.each(['none', 'shared-root', 'deep-leaf'] as const)(
    'keeps event traversal linear for %s declarations while rendering every required file',
    (mode) => {
      const counts: number[] = []
      for (const count of [100, 400]) {
        const events = Array.from({ length: count }, (_, i) =>
          created(i, i === 0 ? undefined : mode === 'deep-leaf' ? i - 1 : 0),
        )
        if (mode !== 'none')
          events.push(declaration(mode === 'shared-root' ? 0 : count - 1, 'resource'))
        const items = replay(events)
        let reads = 0
        const observed = events.map(
          (entry) =>
            new Proxy(entry, {
              get(target, key, receiver) {
                if (['type', 'subject', 'data'].includes(String(key))) reads++
                return Reflect.get(target, key, receiver)
              },
            }),
        )
        const files = projections(items, observed)
        expect(files.size).toBe(count * (mode === 'none' ? 1 : 3) + 2)
        counts.push(reads)
      }
      expect(counts[1]).toBeLessThan((counts[0] ?? 0) * 5)
    },
  )

  it('still rejects duplicate immutable declarations before returning a projection', () => {
    const events = [created(0), declaration(0, 'duplicate'), declaration(0, 'duplicate')]
    expect(() => projections(replay([events[0] as StateEvent]), events)).toThrow('immutable within')
  })
})
