// Reads the canonical harness tree for checks.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { HarnessTree } from './files.js'

function walk(root: string, dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(root, path)
    return [relative(root, path).split(sep).join('/')]
  })
}

export function readHarnessTree(root: string): HarnessTree {
  const files = new Map(
    walk(root, join(root, 'harness')).map(
      (file) => [file, readFileSync(join(root, file), 'utf8')] as const,
    ),
  )
  return {
    files,
    read: (path) =>
      existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined,
  }
}
