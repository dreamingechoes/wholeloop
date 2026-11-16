// Writes an owned artifact tree, replacing only an unchanged previous version and keeping a backup.
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, posix, resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { readRegularFile, readRegularText } from '../fs/regular-file.js'
import { canonicalPath, inside } from '../state/paths.js'
import type { RenderedFile } from './contracts.js'
import { artifactDigest } from './generate.js'

export interface OwnedArtifacts {
  manifest: { schema: string; target: string }
  files: ReadonlyMap<string, RenderedFile>
}

function assertKnownTree(root: string, files: ReadonlySet<string>) {
  const parents = new Set<string>()
  for (const file of files) {
    let parent = posix.dirname(file)
    while (parent !== '.') {
      parents.add(parent)
      parent = posix.dirname(parent)
    }
  }
  const walk = (relative = '') => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name
      if (
        entry.isSymbolicLink() ||
        (entry.isDirectory() ? !parents.has(path) : !entry.isFile() || !files.has(path))
      )
        throw new Error(
          'Generated output contains unowned or unsafe entries; preserve it and choose a new --out directory',
        )
      if (entry.isDirectory()) walk(path)
    }
  }
  walk()
}

/** Replace only an unchanged owned artifact tree; preserve its previous version in an obvious backup. */
export function writeOwnedArtifacts(output: string, generated: OwnedArtifacts, dryRun = false) {
  const requested = resolve(output)
  try {
    if (lstatSync(requested).isSymbolicLink()) throw new Error('Adapter output cannot be a symlink')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const root = join(canonicalPath(dirname(requested)), basename(requested))
  let previous: unknown
  if (existsSync(root)) {
    // Read once: the same bytes are parsed here and compared with the new manifest below.
    const manifest = readRegularText(join(root, 'wholeloop-artifacts.json'), 1024 * 1024)
    try {
      if (manifest === undefined) throw new Error('Unsafe ownership manifest')
      previous = JSON.parse(manifest)
    } catch {
      throw new Error(
        'Output exists without an owned artifact manifest; choose a new --out directory',
      )
    }
    if (
      !isObject(previous) ||
      previous.schema !== generated.manifest.schema ||
      previous.target !== generated.manifest.target ||
      !Array.isArray(previous.files)
    )
      throw new Error('Output is not owned by this target; choose a new --out directory')
    const known = new Set(['wholeloop-artifacts.json'])
    for (const entry of previous.files) {
      if (
        !isObject(entry) ||
        typeof entry.path !== 'string' ||
        typeof entry.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !['644', '755'].includes(Number(entry.mode).toString(8))
      )
        throw new Error('Invalid previous artifact manifest')
      if (
        entry.path.length > 1024 ||
        posix.isAbsolute(entry.path) ||
        posix.normalize(entry.path) !== entry.path ||
        entry.path.split('/').some((part) => !part || part === '.' || part === '..') ||
        /[\\\0]/.test(entry.path)
      )
        throw new Error('Invalid previous artifact manifest: unsafe path')
      known.add(entry.path)
      const file = join(root, entry.path)
      // Digest and mode come from the descriptor that was read, so they describe the same file.
      const owned = inside(root, canonicalPath(file))
        ? readRegularFile(file, Number.MAX_SAFE_INTEGER)
        : undefined
      if (
        !owned ||
        artifactDigest(owned.bytes.toString('utf8')) !== entry.sha256 ||
        owned.mode !== entry.mode
      )
        throw new Error(
          'Generated output contains changed/missing/unsafe files; preserve it and choose a new --out directory',
        )
    }
    assertKnownTree(root, known)
    if (manifest === generated.files.get('wholeloop-artifacts.json')?.content)
      return {
        output: root,
        status: dryRun ? ('planned' as const) : ('already-correct' as const),
        backup: null,
      }
  }
  if (dryRun) return { output: root, status: 'planned' as const, backup: null }
  const temporary = join(dirname(root), `.wholeloop-build-${randomUUID()}`)
  mkdirSync(temporary, { recursive: true, mode: 0o755 })
  for (const [path, file] of generated.files) {
    if (!inside(temporary, resolve(temporary, path)))
      throw new Error('Generated path escapes output')
    const destination = join(temporary, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, file.content, { flag: 'wx', mode: file.mode })
    chmodSync(destination, file.mode)
  }
  const backup = existsSync(root) ? `${root}.backup-${randomUUID()}` : null
  if (backup) renameSync(root, backup)
  try {
    renameSync(temporary, root)
  } catch (error) {
    if (backup && !existsSync(root)) renameSync(backup, root)
    throw error
  }
  return { output: root, status: 'written' as const, backup }
}
