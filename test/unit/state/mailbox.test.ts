import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { event, type StateEvent } from '../../../src/state/events.js'
import { read, send } from '../../../src/state/mailbox.js'
import { CONTEXT_BYTES, contextPack } from '../../../src/state/resume.js'
import { StateStore } from '../../../src/state/store.js'

describe('durable mailbox', () => {
  it('keeps cursors per reader and role across restarts and rebuilds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-mail-'))
    try {
      let store = new StateStore(dir)
      const item = store.create({ kind: 'slice', title: 'Filter orders', owner: 'Alex', body: '' })
      const first = send(store, item.id, {
        to: 'builder',
        from: 'conductor',
        kind: 'contract',
        body: 'GET /orders returns a cursor.',
      })
      send(store, item.id, {
        to: 'verifier',
        from: 'conductor',
        kind: 'handoff',
        body: 'Verify behavior.',
      })
      expect(read(store, 'builder', 'reader-a', true)).toEqual([first])
      expect(read(store, 'builder', 'reader-a')).toEqual([first])
      store = new StateStore(dir)
      expect(read(store, 'builder', 'reader-a')).toEqual([])
      expect(read(store, 'builder', 'reader-b')).toEqual([first])
      expect(read(store, 'verifier', 'reader-a')).toHaveLength(1)
      const next = send(store, item.id, {
        to: 'builder',
        from: 'conductor',
        kind: 'note',
        body: 'Preserve the old endpoint.',
      })
      const mailbox = store.files.read(`mailbox/${item.id}.ndjson`)
      const cursors = store.files.read('cursors.json')
      store.rebuild()
      expect(store.files.read(`mailbox/${item.id}.ndjson`)).toBe(mailbox)
      expect(store.files.read('cursors.json')).toBe(cursors)
      expect(read(new StateStore(dir), 'builder', 'reader-a')).toEqual([next])
      expect(read(store, 'builder', 'reader-b')).toEqual([next])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects invalid message and cursor data without partial writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wholeloop-mail-'))
    try {
      const store = new StateStore(dir)
      const item = store.create({ kind: 'slice', title: 'Filter orders', owner: 'Alex', body: '' })
      const before = store.events()
      expect(() =>
        send(store, item.id, { to: '../escape', from: 'conductor', kind: 'note', body: 'invalid' }),
      ).toThrow('Invalid')
      expect(() =>
        store.transaction((_events, append) => {
          append(item.id, {
            type: 'msg.read',
            data: {
              reader: 'a',
              role: 'builder',
              through: 'ev-00000000-0000-0000-0000-000000000000',
            },
          })
        }),
      ).toThrow('Invalid mailbox cursor')
      expect(store.events()).toEqual(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('context packs', () => {
  function fixture(): StateEvent[] {
    const events: StateEvent[] = [
      event(
        'init-00000000',
        {
          type: 'item.created',
          data: {
            kind: 'initiative',
            title: 'Better search',
            owner: 'Alex',
            body: 'A very large artifact is intentionally omitted.',
          },
        },
        '2026-10-18T00:00:00.000Z',
      ),
    ]
    for (let index = 1; index <= 50; index++)
      events.push(
        event(
          `slice-${index.toString(16).padStart(8, '0')}`,
          {
            type: 'item.created',
            data: {
              kind: 'slice',
              title: `Filter orders ${index}`,
              owner: 'Alex',
              body: 'x'.repeat(10000),
              parent: 'init-00000000',
            },
          },
          '2026-10-18T00:00:00.000Z',
        ),
      )
    return events
  }
  it('summarizes 50 descendants deterministically within its UTF-8 byte ceiling', () => {
    const pack = contextPack(fixture(), 'init-00000000')
    expect(pack.totalItems).toBe(51)
    expect(pack.truncated).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(pack))).toBeLessThanOrEqual(CONTEXT_BYTES)
    expect(pack).toMatchSnapshot()
  })
  it('bounds Unicode-heavy titles by bytes and does not consume unread messages', () => {
    const events = fixture()
    for (const entry of events)
      if (entry.type === 'item.created') entry.data.title = '界'.repeat(10000)
    events.push(
      event(
        'init-00000000',
        {
          type: 'msg.sent',
          data: { to: 'conductor', from: 'builder', kind: 'status', body: 'DONE' },
        },
        '2026-10-18T00:01:00.000Z',
      ),
    )
    const pack = contextPack(events)
    expect(Buffer.byteLength(JSON.stringify(pack))).toBeLessThanOrEqual(CONTEXT_BYTES)
    expect(pack.unreadCount).toBe(1)
    expect(contextPack(events).unreadCount).toBe(1)
    expect(JSON.stringify(pack)).not.toContain('A very large artifact')
  })
})
