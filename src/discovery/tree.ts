import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { StoreFiles } from '../state/files.js'
import { canonicalPath, inside } from '../state/paths.js'
import { fileKind, scan } from './scan.js'
import type { CapabilityMap } from './types.js'

const IGNORE = new Set([
  '.git',
  'node_modules',
  'vendor',
  '.venv',
  'venv',
  'dist',
  'build',
  'target',
  'coverage',
  '.next',
  '.cache',
  '.tmp',
  '.tox',
  '.yarn',
])
const TOOL_DIRS = ['.agents', '.claude', '.codex', '.opencode', '.gemini', '.cursor', '.github']

export function readInventory(
  root: string,
  starts: readonly string[] = ['.'],
): { files: Map<string, string>; warnings: string[] } {
  const files = new Map<string, string>()
  const warnings: string[] = []
  const seen = new Set<string>()
  const boundary = canonicalPath(root)
  function walk(directory: string): void {
    if (!existsSync(directory)) return
    const actual = realpathSync(directory)
    if (!inside(boundary, actual)) {
      warnings.push(`Skipped external symlink: ${relative(root, directory)}`)
      return
    }
    if (seen.has(actual)) return
    seen.add(actual)
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (IGNORE.has(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (entry.isSymbolicLink()) {
        if (!existsSync(path)) {
          warnings.push(`Skipped broken symlink: ${relative(root, path)}`)
          continue
        }
        if (!inside(boundary, realpathSync(path))) {
          warnings.push(`Skipped external symlink: ${relative(root, path)}`)
          continue
        }
        if (statSync(path).isDirectory()) {
          walk(path)
          continue
        }
      }
      const name = relative(root, path).split(sep).join('/')
      if (!fileKind(name) || !statSync(path).isFile()) continue
      if (statSync(path).size > 1024 * 1024) {
        warnings.push(`Skipped file larger than 1 MiB: ${name}`)
        continue
      }
      files.set(name, readFileSync(path, 'utf8'))
    }
  }
  for (const start of starts) walk(join(root, start))
  return { files, warnings }
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export function discover(root: string, store: StoreFiles, home = homedir()) {
  const repo = readInventory(root)
  const user = readInventory(
    home,
    TOOL_DIRS.map((tool) => `${tool}/skills`),
  )
  const fingerprint = hash(
    JSON.stringify({
      v: 1,
      repo: [...repo.files],
      user: [...user.files],
      warnings: [...repo.warnings, ...user.warnings],
    }),
  )
  const file = `cache/discovery/${hash(`${canonicalPath(root)}\n${canonicalPath(home)}`)}.json`
  return store.locked(() => {
    const content = store.read(file)
    if (content) {
      try {
        const cached = JSON.parse(content) as {
          fingerprint: string
          repo: CapabilityMap
          user: CapabilityMap
          checksum: string
        }
        if (
          cached.fingerprint === fingerprint &&
          cached.checksum === hash(JSON.stringify([cached.repo, cached.user]))
        ) {
          return {
            repo: cached.repo,
            user: cached.user,
            fingerprint,
            cached: true,
            warnings: [...repo.warnings, ...user.warnings],
          }
        }
      } catch {
        /* A cache is disposable; never treat it as source of truth. */
      }
    }
    const repoMap = scan(repo.files)
    const userMap = scan(
      new Map(
        [...user.files]
          .filter(([path]) => fileKind(path) === 'skill')
          .map(([path, content]) => [join(home, path).split(sep).join('/'), content]),
      ),
    )
    store.atomic(
      file,
      `${JSON.stringify({ fingerprint, repo: repoMap, user: userMap, checksum: hash(JSON.stringify([repoMap, userMap])) })}\n`,
    )
    return {
      repo: repoMap,
      user: userMap,
      fingerprint,
      cached: false,
      warnings: [...repo.warnings, ...user.warnings],
    }
  })
}
