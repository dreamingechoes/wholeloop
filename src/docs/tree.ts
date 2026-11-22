// Reads the documentation tree for checks and generation.
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

/** Illustrative step sessions are plain text, so the Markdown tree does not include them. */
export function readSessions(root: string): Map<string, string> {
  const dir = join(root, 'docs/assets/terminal/sessions')
  if (!existsSync(dir)) return new Map()
  return new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith('.txt'))
      .sort()
      .map((name) => [
        `docs/assets/terminal/sessions/${name}`,
        readFileSync(join(dir, name), 'utf8'),
      ]),
  )
}

export function readNavYaml(root: string): string {
  return readFileSync(join(root, 'docs', 'nav.yml'), 'utf8')
}

export function writeFile(root: string, file: string, content: string): void {
  writeFileSync(join(root, file), content)
}

/** Optional for unrelated documentation trees; expanded delivery requires it. */
export function readEnforcementYaml(root: string): string | undefined {
  const file = join(root, 'enforcement.yml')
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}
