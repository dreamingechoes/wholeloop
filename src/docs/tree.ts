import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Tree } from './check.js'

const IGNORED = new Set(['.git', 'node_modules', 'dist', 'coverage', '.tmp'])

function markdownFiles(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED.has(entry.name)) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(root, path)
    return entry.name.endsWith('.md') ? [relative(root, path).split(sep).join('/')] : []
  })
}

export function readTree(root: string): Tree {
  const files = new Map(
    markdownFiles(root).map((file) => [file, readFileSync(join(root, file), 'utf8')] as const),
  )
  return { files, exists: (path) => existsSync(join(root, path)) }
}

export function readNavYaml(root: string): string {
  return readFileSync(join(root, 'docs', 'nav.yml'), 'utf8')
}

export function writeFile(root: string, file: string, content: string): void {
  writeFileSync(join(root, file), content)
}
