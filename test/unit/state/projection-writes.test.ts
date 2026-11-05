import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { StateStore } from '../../../src/state/store.js'

function fixture(run: (store: StateStore, ids: string[]) => void, count = 2) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-projection-refresh-')),
    store = new StateStore(join(root, 'state'))
  const ids = Array.from({ length: count }, (_, i) => `init-${i.toString(16).padStart(8, '0')}`)
  try {
    store.transaction((_events, append) => {
      for (const id of ids)
        append(id, {
          type: 'item.created',
          data: { kind: 'initiative', title: 'Fixture idea', owner: 'Fixture Owner', body: '' },
        })
    })
    run(store, ids)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('projection refresh for basic item mutations', () => {
  it.each([8, 32])('writes only the changed view of one note among %i existing items', (count) =>
    fixture((store, ids) => {
      const atomic = vi.spyOn(store.files, 'atomic')
      store.note(ids[0] ?? '', 'One fixture note')
      const paths = atomic.mock.calls.map(([path]) => path)
      expect(paths).toHaveLength(3)
      expect(paths.filter((path) => path.startsWith('items/'))).toEqual([
        `items/${ids[0]}/initiative.md`,
      ])
      expect(paths).toContain('.lock/owner.json')
      expect(paths.some((path) => /^journal\/\d{4}-\d{2}\.ndjson$/.test(path))).toBe(true)
      expect(store.get(ids[0] ?? '').notes).toHaveLength(1)
    }, count),
  )

  it('retains journal truth after a failed cache write and repairs unrelated stale views explicitly', () =>
    fixture((store, ids) => {
      const path = `items/${ids[0]}/initiative.md`,
        before = store.files.read(path),
        atomic = store.files.atomic.bind(store.files)
      const fail = vi.spyOn(store.files, 'atomic').mockImplementation((selected, content) => {
        if (selected === path) throw new Error('Fixture cache failure')
        return atomic(selected, content)
      })
      expect(() => store.note(ids[0] ?? '', 'Committed fixture note')).toThrow(
        'Fixture cache failure',
      )
      fail.mockRestore()
      expect(store.get(ids[0] ?? '').notes).toHaveLength(1)
      store.note(ids[1] ?? '', 'Another fixture note')
      expect(store.files.read(path)).toBe(before)
      expect(store.get(ids[0] ?? '').notes).toHaveLength(1)
      store.rebuild()
      expect(store.files.read(path)).toContain('Committed fixture note')
    }))

  it('retains complete projection refresh for workflow events', () =>
    fixture((store, ids) => {
      const path = `items/${ids[0]}/initiative.md`
      store.files.atomic(path, 'Fixture stale projection')
      store.transaction((_events, append) =>
        append(ids[1] ?? '', {
          type: 'step.started',
          data: {
            step: 'frame-problem',
            run: 'run-0000000000000001',
            mode: 'standalone',
            input: 'Fixture idea',
          },
        }),
      )
      expect(store.files.read(path)).toContain('Fixture idea')
    }))

  it('still checks every planned path before committing even an unchanged peer projection', () =>
    fixture((store, ids) => {
      const directory = store.files.path(`items/${ids[1]}`),
        target = join(dirname(store.files.root), 'repo')
      mkdirSync(join(target, '.git'), { recursive: true })
      renameSync(directory, `${directory}.saved`)
      symlinkSync(target, directory)
      const events = store.events()
      expect(() => store.note(ids[0] ?? '', 'Must not commit')).toThrow('escapes its root')
      expect(store.events()).toEqual(events)
    }))
})
