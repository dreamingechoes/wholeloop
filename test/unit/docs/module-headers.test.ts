// Enforces the source convention that every module opens with a header comment saying why it
// exists (P7-12), so a reader learns a file's purpose before reading its imports.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function modules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return modules(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('source module headers', () => {
  it('opens every module in src with a header comment', () => {
    const missing = modules('src').filter((path) => {
      const first = readFileSync(path, 'utf8')
        .split('\n')
        .find((line) => line.trim())
      return !first?.startsWith('// ') && !first?.startsWith('/**')
    })
    expect(missing).toEqual([])
  })

  it('keeps each header short', () => {
    const long = modules('src').filter((path) => {
      const lines = readFileSync(path, 'utf8').split('\n')
      let count = 0
      while (lines[count]?.startsWith('//')) count++
      return count > 6
    })
    expect(long).toEqual([])
  })
})
