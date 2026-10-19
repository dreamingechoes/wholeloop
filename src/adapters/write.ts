import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { canonicalPath, inside } from '../state/paths.js'
import type { generateAdapter } from './generate.js'
import { artifactDigest } from './generate.js'

/** Replace only an unchanged owned artifact tree; preserve its previous version in an obvious backup. */
export function writeAdapter(output: string, generated: ReturnType<typeof generateAdapter>) {
  const requested = resolve(output)
  try {
    if (lstatSync(requested).isSymbolicLink()) throw new Error('Adapter output cannot be a symlink')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const root = join(canonicalPath(dirname(requested)), basename(requested))
  let previous: unknown
  if (existsSync(root)) {
    try {
      const manifest = join(root, 'wholeloop-artifacts.json')
      const stat = lstatSync(manifest)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
        throw new Error('Unsafe ownership manifest')
      previous = JSON.parse(readFileSync(manifest, 'utf8'))
    } catch {
      throw new Error(
        'Output exists without an owned artifact manifest; choose a new --out directory',
      )
    }
    if (
      !isObject(previous) ||
      previous.schema !== 'wholeloop/adapter-artifacts@1' ||
      previous.target !== generated.manifest.target ||
      !Array.isArray(previous.files)
    )
      throw new Error('Output is not owned by this target; choose a new --out directory')
    for (const entry of previous.files) {
      if (
        !isObject(entry) ||
        typeof entry.path !== 'string' ||
        typeof entry.sha256 !== 'string' ||
        !['644', '755'].includes(Number(entry.mode).toString(8))
      )
        throw new Error('Invalid previous artifact manifest')
      const file = join(root, entry.path)
      if (
        !inside(root, canonicalPath(file)) ||
        !existsSync(file) ||
        !lstatSync(file).isFile() ||
        lstatSync(file).isSymbolicLink() ||
        artifactDigest(readFileSync(file, 'utf8')) !== entry.sha256 ||
        (lstatSync(file).mode & 0o777) !== entry.mode
      )
        throw new Error(
          'Generated output contains changed/missing/unsafe files; preserve it and choose a new --out directory',
        )
    }
    if (
      readFileSync(join(root, 'wholeloop-artifacts.json'), 'utf8') ===
      generated.files.get('wholeloop-artifacts.json')?.content
    )
      return { output: root, status: 'already-correct' as const, backup: null }
  }
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
