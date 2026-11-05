import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { discover } from '../../../src/discovery/tree.js'
import { StoreFiles } from '../../../src/state/files.js'

describe('discovery cache reads without writer work', () => {
  it('reads a cold inventory without creating a disposable cache and reuses warm caches without locks', () => {
    const directory = mkdtempSync(join(tmpdir(), 'wholeloop-discovery-cache-read-'))
    try {
      const root = join(directory, 'repo'),
        home = join(directory, 'home'),
        files = new StoreFiles(join(directory, 'state'))
      mkdirSync(root)
      mkdirSync(home)
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ scripts: { test: 'node --test' } }),
      )
      const locked = vi.spyOn(files, 'locked')
      const cold = discover(root, files, home, { persist: false })
      expect(cold.cached).toBe(false)
      expect(cold.repo.commands).toHaveLength(1)
      expect(locked).not.toHaveBeenCalled()
      expect(existsSync(files.root)).toBe(false)
      const populated = discover(root, files, home)
      expect(populated.repo).toEqual(cold.repo)
      locked.mockClear()
      expect(discover(root, files, home).cached).toBe(true)
      expect(discover(root, files, home, { persist: false }).cached).toBe(true)
      expect(locked).not.toHaveBeenCalled()
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ scripts: { check: 'node --test' } }),
      )
      const changed = discover(root, files, home, { persist: false })
      expect(changed.cached).toBe(false)
      expect(changed.fingerprint).not.toBe(cold.fingerprint)
      expect(locked).not.toHaveBeenCalled()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
