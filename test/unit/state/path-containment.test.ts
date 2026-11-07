import { isAbsolute, relative, sep } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { inside } from '../../../src/state/paths.js'

vi.mock('node:path', async (original) => {
  const path = await original<typeof import('node:path')>()
  return { ...path, relative: vi.fn(path.relative) }
})

describe('containment of normalized absolute paths (ADR-0243)', () => {
  /** The former implementation, verbatim, as the reference for every pair. */
  function reference(root: string, path: string): boolean {
    const rel = relative(root, path)
    return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
  }
  it('answers exactly like path.relative for every generated pair', () => {
    const parts = ['', '.', '..', 'a', 'ab', '..b', '.a', 'a b']
    const paths = new Set<string>(['/', '//', 'a', './a', '../a', 'a/b'])
    for (const x of parts)
      for (const y of ['', ...parts])
        for (const trail of ['', '/']) {
          const joined = `/${y ? `${x}/${y}` : x}${trail}`
          paths.add(joined)
          paths.add(`/a${joined}`)
        }
    const list = [...paths],
      mismatches: string[] = []
    for (const root of list)
      for (const candidate of list)
        if (inside(root, candidate) !== reference(root, candidate))
          mismatches.push(`${root} -> ${candidate}`)
    expect(list.length ** 2).toBeGreaterThan(50_000)
    expect(mismatches).toEqual([])
    // Normalized pairs never reach relative(); the reference above calls it directly.
    vi.mocked(relative).mockClear()
    inside('/a/b', '/a/b/c')
    inside('/', '/x')
    inside('/a/b', '/a/bc')
    expect(relative).not.toHaveBeenCalled()
  })
})
