import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSourceFile } from '../../../src/delivery/input.js'
import { StoreFiles } from '../../../src/state/files.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, existsSync: vi.fn(fs.existsSync), realpathSync: vi.fn(fs.realpathSync) }
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

  it('reads a resolved store file with one canonicalization and keeps its refusals', () => {
    const { base, root } = deepStore(2),
      files = new StoreFiles(root)
    writeFileSync(join(root, 'delivery', 'record.json'), '{}\n')
    vi.mocked(realpathSync).mockClear()
    expect(readSourceFile(files.root, 'delivery/record.json')).toBe('{}\n')
    expect(vi.mocked(realpathSync)).toHaveBeenCalledTimes(1)
    // Any other root keeps the complete alias and identity proof.
    mkdirSync(join(base, 'source'))
    writeFileSync(join(base, 'source', 'file.txt'), 'text\n')
    vi.mocked(realpathSync).mockClear()
    expect(readSourceFile(join(base, 'source'), 'file.txt')).toBe('text\n')
    expect(vi.mocked(realpathSync)).toHaveBeenCalledTimes(3)
    writeFileSync(join(base, 'secret.txt'), 'outside\n')
    symlinkSync(join(base, 'secret.txt'), join(root, 'delivery', 'link.json'))
    expect(() => readSourceFile(files.root, 'delivery/link.json')).toThrow()
    execFileSync('mkfifo', [join(root, 'delivery', 'pipe.json')])
    expect(() => readSourceFile(files.root, 'delivery/pipe.json')).toThrow()
  })
})
