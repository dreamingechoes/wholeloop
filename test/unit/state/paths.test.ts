import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreFiles } from '../../../src/state/files.js'
import { canonicalPath } from '../../../src/state/paths.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, realpathSync: vi.fn(fs.realpathSync) }
})
const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
afterEach(() => vi.mocked(realpathSync).mockReset().mockImplementation(actual.realpathSync))

function fixture(run: (root: string, files: StoreFiles, lock: string) => void) {
  const root = actual.realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-path-race-'))),
    files = new StoreFiles(join(root, 'state')),
    lock = join(files.root, '.lock')
  mkdirSync(lock, { recursive: true })
  try {
    vi.mocked(realpathSync).mockClear()
    run(root, files, lock)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('canonical path observations across a concurrent lock release', () => {
  it('resolves the remaining parent when the selected existing ancestor disappears', () =>
    fixture((_root, _files, lock) => {
      vi.mocked(realpathSync).mockImplementationOnce((...args) => {
        rmSync(lock, { recursive: true })
        return Reflect.apply(actual.realpathSync, undefined, args)
      })
      expect(canonicalPath(lock)).toBe(lock)
    }))

  it('rechecks a replacement alias instead of authorizing a write through the old path', () =>
    fixture((root, files, lock) => {
      const foreign = join(root, 'foreign')
      mkdirSync(foreign)
      vi.mocked(realpathSync).mockImplementationOnce((...args) => {
        rmSync(lock, { recursive: true })
        try {
          return Reflect.apply(actual.realpathSync, undefined, args)
        } finally {
          symlinkSync(foreign, lock)
        }
      })
      expect(() => files.atomic('.lock/owner.json', 'public fixture')).toThrow('escapes its root')
      expect(existsSync(join(foreign, 'owner.json'))).toBe(false)
    }))

  it.each(['EACCES', 'ELOOP'])('never retries %s as a disappearing ancestor', (code) =>
    fixture((_root, _files, lock) => {
      vi.mocked(realpathSync).mockImplementation(() => {
        throw Object.assign(new Error('Unresolvable fixture path'), { code })
      })
      expect(() => canonicalPath(lock)).toThrow('Unresolvable fixture path')
      expect(realpathSync).toHaveBeenCalledTimes(1)
    }),
  )

  it('refuses repeated disappearance after three complete observations', () =>
    fixture((_root, _files, lock) => {
      vi.mocked(realpathSync).mockImplementation((...args) => {
        rmSync(lock, { recursive: true })
        try {
          return Reflect.apply(actual.realpathSync, undefined, args)
        } finally {
          mkdirSync(lock)
        }
      })
      expect(() => canonicalPath(lock)).toThrow()
      expect(realpathSync).toHaveBeenCalledTimes(3)
    }))
})
