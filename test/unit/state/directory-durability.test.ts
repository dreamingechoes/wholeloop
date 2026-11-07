import { fsyncSync, mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreFiles } from '../../../src/state/files.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, fsyncSync: vi.fn(fs.fsyncSync), openSync: vi.fn(fs.openSync) }
})
afterEach(() => vi.clearAllMocks())

/** Paths flushed since the last clear, relative to the directory that holds the store.
 * Descriptors are reused after close, so each flush maps to the latest earlier open. */
function flushed(files: StoreFiles): string[] {
  const opens = vi.mocked(openSync).mock,
    flushes = vi.mocked(fsyncSync).mock
  return flushes.calls.map(([fd], index) => {
    const order = flushes.invocationCallOrder[index] ?? 0
    let path = '?'
    opens.calls.forEach(([opened], at) => {
      if (opens.results[at]?.value === fd && (opens.invocationCallOrder[at] ?? 0) < order)
        path = String(opened)
    })
    return relative(dirname(files.root), path)
  })
}

function fixture(run: (files: StoreFiles) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-directory-durability-'))
  try {
    run(new StoreFiles(join(root, 'state')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('durable entries for directories the store creates (ADR-0242)', () => {
  it('flushes the parent of every directory a committed fact creates, once', () =>
    fixture((files) => {
      files.locked(() => {})
      vi.clearAllMocks()
      files.atomic('delivery/runner-native/one/intent.json', '{}')
      const temporary = flushed(files)[0] ?? ''
      expect(temporary).toMatch(/^state\/delivery\/runner-native\/one\/intent\.json\..+\.tmp$/)
      expect(flushed(files).slice(1)).toEqual([
        'state/delivery/runner-native/one',
        'state/delivery/runner-native',
        'state/delivery',
        'state',
      ])
      // Existing directories add nothing: file and directory only.
      vi.clearAllMocks()
      files.atomic('delivery/runner-native/one/started.json', '{}')
      expect(flushed(files).slice(1)).toEqual(['state/delivery/runner-native/one'])
    }))

  it('makes a pre-created directory durable before facts are written into it', () =>
    fixture((files) => {
      files.locked(() => {})
      vi.clearAllMocks()
      expect(files.directory('delivery/runner-native/two')).toBe(
        files.path('delivery/runner-native/two'),
      )
      expect(flushed(files)).toEqual(['state/delivery/runner-native', 'state/delivery', 'state'])
      vi.clearAllMocks()
      files.directory('delivery/runner-native/two')
      expect(fsyncSync).not.toHaveBeenCalled()
    }))

  it('keeps view bytes unflushed but makes the directories a view creates durable', () =>
    fixture((files) => {
      files.locked(() => {})
      vi.clearAllMocks()
      files.project('items/init-00000001/initiative.md', 'view')
      expect(flushed(files)).toEqual(['state/items', 'state'])
      vi.clearAllMocks()
      files.project('items/init-00000001/initiative.md', 'changed view')
      expect(fsyncSync).not.toHaveBeenCalled()
    }))

  it('makes a new store root durable before the first fact, and a lock adds nothing', () =>
    fixture((files) => {
      mkdirSync(dirname(files.root), { recursive: true })
      files.locked(() => {})
      expect(flushed(files)).toEqual([''])
      vi.clearAllMocks()
      files.locked(() => {})
      expect(fsyncSync).not.toHaveBeenCalled()
    }))
})
