import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DeliveryEvent } from '../../../src/delivery/events.js'
import {
  cursorPrefix,
  decodeCursor,
  encodeCursor,
  journalPosition,
} from '../../../src/overview/cursor.js'
import type { StateEvent } from '../../../src/state/events.js'

const state = JSON.parse(
    readFileSync('test/fixtures/state/attribution-legacy.json', 'utf8'),
  ) as StateEvent[],
  delivery = JSON.parse(
    readFileSync('test/fixtures/state/delivery-attribution-legacy.json', 'utf8'),
  ) as DeliveryEvent[]
const raw = (value: unknown) => `v1.${Buffer.from(JSON.stringify(value)).toString('base64url')}`

describe('opaque overview journal cursor', () => {
  it('identifies both exact prefixes independently of projected files and segment names', () => {
    const position = journalPosition(state, delivery),
      cursor = encodeCursor(position),
      original = JSON.stringify({ state, delivery })
    expect(decodeCursor(cursor)).toEqual(position)
    expect(position.state).toMatchObject({ count: state.length, tip: state.at(-1)?.id })
    expect(position.delivery).toEqual({
      sequence: delivery.length,
      digest: delivery.at(-1)?.digest,
    })
    expect(cursorPrefix(cursor, state, delivery)).toEqual(position)
    expect(cursorPrefix(encodeCursor(journalPosition([], [])), state, delivery)).toEqual(
      journalPosition([], []),
    )
    expect(JSON.stringify({ state, delivery })).toBe(original)
  })
  it('resumes an earlier prefix while retaining later committed events', () => {
    const prior = journalPosition(state.slice(0, 1), delivery.slice(0, 1))
    expect(cursorPrefix(encodeCursor(prior), state, delivery)).toEqual(prior)
  })
  it.each(['changed-state', 'truncated-state', 'changed-delivery', 'truncated-delivery'])(
    'refuses %s instead of accepting a counter alone',
    (kind) => {
      const cursor = encodeCursor(journalPosition(state, delivery)),
        changedState = structuredClone(state),
        changedDelivery = structuredClone(delivery)
      if (kind === 'changed-state' && changedState[0])
        changedState[0].ts = '2026-11-05T00:00:00.000Z'
      if (kind === 'truncated-state') changedState.pop()
      const last = changedDelivery.at(-1)
      if (kind === 'changed-delivery' && last) last.digest = 'a'.repeat(64)
      if (kind === 'truncated-delivery') changedDelivery.pop()
      expect(() => cursorPrefix(cursor, changedState, changedDelivery)).toThrow('cursor-diverged')
    },
  )
  it.each([
    '',
    'v2.AA',
    `v1.${'A'.repeat(1025)}`,
    'v1.not_json',
    `${encodeCursor(journalPosition([], []))}=`,
    raw({ ...journalPosition([], []), extra: true }),
    raw({ ...journalPosition([], []), version: 2 }),
    raw({ ...journalPosition([], []), state: { count: -1, tip: null, digest: 'a'.repeat(64) } }),
  ])('refuses malformed or unknown cursor input %# without echoing it', (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow('invalid-cursor; contents omitted')
  })
  it('requires canonical object order and byte encoding', () => {
    const position = journalPosition(state, delivery)
    expect(() =>
      decodeCursor(raw({ delivery: position.delivery, state: position.state, version: 1 })),
    ).toThrow('invalid-cursor')
  })
})
