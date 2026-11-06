import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreFiles } from '../../../src/state/files.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, existsSync: vi.fn(fs.existsSync) }
})
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function deepStore(depth: number) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-root-containment-')))
  roots.push(base)
  let root = base
  for (let level = 0; level < depth; level++) root = join(root, `level-${level}`)
  mkdirSync(join(root, 'state', 'delivery'), { recursive: true })
  return { base, root: join(root, 'state') }
}

describe('single-writer store containment (ADR-0243)', () => {
  it.each([4, 16])('checks only components below a verified root %i levels deep', (depth) => {
    const { root } = deepStore(depth),
      files = new StoreFiles(root)
    vi.mocked(existsSync).mockClear()
    files.path('delivery/record.json')
    const calls = vi.mocked(existsSync).mock.calls.length
    console.info('Store access existence checks:', JSON.stringify({ depth, calls }))
    // Missing leaf resolution plus marker probes on the root and each component below it.
    expect(calls).toBeLessThanOrEqual(8)
  })

  it('still refuses repository markers inside the store', () => {
    const { root } = deepStore(2),
      files = new StoreFiles(root)
    mkdirSync(join(root, 'delivery', '.git'))
    expect(() => files.path('delivery/record.json')).toThrow('outside git repositories')
    rmSync(join(root, 'delivery', '.git'), { recursive: true })
    for (const marker of ['HEAD', 'objects', 'refs']) mkdirSync(join(root, 'delivery', marker))
    expect(() => files.path('delivery/record.json')).toThrow('outside git repositories')
  })

  it('detects a marker above the root when the root is resolved again', () => {
    const { base, root } = deepStore(2),
      files = new StoreFiles(root)
    mkdirSync(join(base, '.git'))
    // The trusted writer keeps using its resolved root; every new resolution refuses.
    expect(files.path('delivery/record.json')).toBe(join(root, 'delivery/record.json'))
    expect(() => new StoreFiles(root)).toThrow('outside git repositories')
  })

  it('refuses a symbolic link that escapes the root', () => {
    const { base, root } = deepStore(1),
      files = new StoreFiles(root),
      outside = join(base, 'outside')
    mkdirSync(outside)
    symlinkSync(outside, join(root, 'escape'))
    expect(() => files.path('escape/record.json')).toThrow('escapes its root')
    expect(existsSync(join(outside, 'record.json'))).toBe(false)
  })
})
