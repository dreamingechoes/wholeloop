import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as learning from '../../../src/learning/contracts.js'
import * as events from '../../../src/state/events.js'
import { replayProjections } from '../../../src/state/projections.js'
import { StateStore } from '../../../src/state/store.js'

describe('fixed basic item actions', () => {
  it.each(['note', 'link', 'update', 'create'] as const)(
    'keeps exact %s journal/projection bytes with three fresh domain validations',
    (action) => {
      const root = mkdtempSync(join(tmpdir(), 'wholeloop-basic-action-count-'))
      try {
        const reference = new StateStore(join(root, 'reference')),
          current = new StateStore(join(root, 'current')),
          history = Array.from({ length: 8 }, (_, index) =>
            events.event(
              `init-${index.toString(16).padStart(8, '0')}`,
              {
                type: 'item.created',
                data: {
                  kind: 'initiative',
                  title: 'Original item.',
                  owner: 'Fixture Owner',
                  body: '',
                },
              },
              '2026-11-01T00:00:00.000Z',
            ),
          ),
          bytes = `${history.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
          subject = action === 'create' ? 'init-00000008' : 'init-00000000',
          created: events.ItemInput = {
            kind: 'initiative',
            title: 'Fixed new item.',
            owner: 'Fixture Owner',
            body: '',
          },
          patch = { title: 'Fixed updated item.' },
          input =
            action === 'note'
              ? { type: 'note.added' as const, data: { text: 'Original fixed note.' } }
              : action === 'link'
                ? {
                    type: 'link.added' as const,
                    data: { url: 'https://example.com/owned-reference' },
                  }
                : action === 'update'
                  ? { type: 'item.updated' as const, data: patch }
                  : { type: 'item.created' as const, data: created }
        for (const store of [reference, current])
          store.files.atomic('journal/2026-11.ndjson', bytes)
        const original = events.event,
          factory = vi.spyOn(events, 'event').mockImplementation((...args) => ({
            ...original(...args),
            id: 'ev-ffffffff-ffff-4fff-8fff-ffffffffffff',
          })),
          clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-06T00:00:00.000Z')),
          idFactory = vi.spyOn(events, 'itemId').mockReturnValue('init-00000008'),
          replay = vi.spyOn(learning, 'learningRuns')
        let referenceCalls: number, currentCalls: number
        try {
          reference.transaction((history, append) => {
            if (action === 'create') {
              const existing = events.replay(history)
              const id = events.itemId(created.kind)
              if (existing.has(id))
                throw new Error('Reference fixture requires its declared fresh id')
              append(id, input)
            } else append(subject, input)
          })
          const expected = reference.get(subject)
          referenceCalls = replay.mock.calls.length
          replay.mockClear()
          const actual =
            action === 'note'
              ? current.note(subject, 'Original fixed note.')
              : action === 'link'
                ? current.link(subject, 'https://example.com/owned-reference')
                : action === 'update'
                  ? current.update(subject, patch)
                  : current.create(created)
          currentCalls = replay.mock.calls.length
          expect(actual).toEqual(expected)
        } finally {
          replay.mockRestore()
          clock.mockRestore()
          factory.mockRestore()
          idFactory.mockRestore()
        }
        expect(current.files.read('journal/2026-11.ndjson')).toBe(
          reference.files.read('journal/2026-11.ndjson'),
        )
        const expectedFiles = replayProjections(reference.events())
        for (const path of expectedFiles.keys())
          expect(current.files.read(path)).toBe(reference.files.read(path))
        console.info(
          'Basic action domain validations:',
          JSON.stringify({ action, reference: referenceCalls, current: currentCalls }),
        )
        expect(currentCalls).toBe(3)
        expect(referenceCalls).toBe(action === 'create' ? 6 : 5)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
  it('bounds identifier collisions before changing the journal and can select a later unique id', () => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-item-collision-'))
    try {
      const store = new StateStore(join(root, 'state')),
        input: events.ItemInput = {
          kind: 'initiative',
          title: 'Original item.',
          owner: 'Fixture Owner',
          body: '',
        },
        original = store.create(input),
        before = store.events()
      let calls = 0
      const ids = vi.spyOn(events, 'itemId').mockImplementation(() => {
        if (++calls > 16) throw new Error('Fixture collision watchdog')
        return original.id
      })
      try {
        expect(() => store.create(input)).toThrow('Unable to allocate a unique item id')
        expect(calls).toBe(16)
        expect(store.events()).toEqual(before)
        const unique = original.id === 'init-ffffffff' ? 'init-00000000' : 'init-ffffffff'
        ids
          .mockReset()
          .mockReturnValueOnce(original.id)
          .mockReturnValueOnce(original.id)
          .mockReturnValue(unique)
        expect(store.create(input).id).toBe(unique)
        expect(ids).toHaveBeenCalledTimes(3)
      } finally {
        ids.mockRestore()
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
