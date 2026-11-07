import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { artifactDigest } from '../adapters/generate.js'
import type { StoreFiles } from '../state/files.js'
import { canonicalPath, inside } from '../state/paths.js'
import type { Component, OwnedFile } from './contracts.js'
import type { InstalledFile } from './plan.js'

export function exists(path: string) {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
export function bytes(file: OwnedFile) {
  const stat = lstatSync(file.path)
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 4 * 1024 * 1024 ||
    canonicalPath(file.path) !== file.path
  )
    throw new Error('An installed file is unsafe; preserve it before continuing')
  return { content: readFileSync(file.path, 'utf8'), mode: stat.mode & 0o777 }
}
export function matches(file: OwnedFile) {
  const current = bytes(file)
  return current.mode === file.mode && artifactDigest(current.content) === file.sha256
}
function walk(root: string): string[] {
  if (!exists(root)) return []
  const stat = lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink() || canonicalPath(root) !== root)
    throw new Error('An installation directory is unsafe; preserve it before continuing')
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('An installation contains an unexpected symlink')
    return stat.isDirectory() ? [path, ...walk(path)] : [path]
  })
}
function privateDirectories(component: Component) {
  return [
    component.artifact,
    ...(component.locations.plugin ? [component.locations.plugin] : []),
    ...component.files
      .filter(
        (file) => file.path.endsWith('/SKILL.md') && inside(component.locations.skills, file.path),
      )
      .map((file) => dirname(file.path)),
  ]
}
export function checkPrivate(components: readonly Component[]) {
  const known = components.flatMap((component) => component.files.map((file) => file.path))
  for (const directory of new Set(components.flatMap(privateDirectories)))
    for (const path of walk(directory))
      if (!known.includes(path) && !known.some((file) => inside(path, file)))
        throw new Error(
          'Unowned files or directories exist in an installation; preserve them before continuing',
        )
}
export function checkOwned(components: readonly Component[], allowMissing = false) {
  checkPrivate(components)
  const paths = new Map<string, OwnedFile[]>()
  for (const component of components)
    for (const file of component.files)
      paths.set(file.path, [...(paths.get(file.path) ?? []), file])
  for (const [path, versions] of paths) {
    if (!exists(path)) {
      if (allowMissing) continue
      throw new Error(
        'An owned installation file is missing; inspect it before changing the installation',
      )
    }
    if (!versions.some(matches))
      throw new Error('An installed file was edited; preserve it before changing the installation')
  }
  return paths
}
export function missingDirectories(files: readonly InstalledFile[], identity: string) {
  const directories = new Set<string>()
  for (const file of files) {
    let path = dirname(file.path)
    while (!exists(path)) {
      if (path === identity || path === dirname(path))
        throw new Error('The installation scope root must already exist')
      directories.add(path)
      path = dirname(path)
    }
  }
  return [...directories]
}
/** Native file replacements pass here; dry-run uses the same complete preflight but never enters it. */
export function writeOwned(file: InstalledFile, previous: readonly OwnedFile[]) {
  if (canonicalPath(file.path) !== file.path)
    throw new Error('Native output path changed during installation')
  const current = exists(file.path)
  if (current && !previous.some(matches))
    throw new Error('Native output changed during installation; preserve the pending receipt')
  if (!current && previous.length)
    throw new Error('Native output disappeared during installation; preserve the pending receipt')
  mkdirSync(dirname(file.path), { recursive: true })
  const temporary = join(dirname(file.path), `.wholeloop-install-${randomUUID()}.tmp`)
  const fd = openSync(temporary, 'wx', file.mode)
  try {
    try {
      writeFileSync(fd, file.content)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    chmodSync(temporary, file.mode)
    if (current) {
      if (!previous.some(matches)) throw new Error('Native output changed before replacement')
      renameSync(temporary, file.path)
    } else {
      linkSync(temporary, file.path)
      unlinkSync(temporary)
    }
  } finally {
    if (exists(temporary)) unlinkSync(temporary)
  }
}
export function archive(
  store: StoreFiles,
  prefix: string,
  paths: ReadonlyMap<string, OwnedFile[]>,
) {
  // Every backup lands in one directory and is durable before any removal, so
  // that directory is flushed once for the whole set rather than per file.
  store.atomicBatch((write) => {
    for (const [path, versions] of paths)
      if (exists(path)) {
        const file = versions.find(matches)
        if (!file) throw new Error('An owned file changed before backup')
        const key = `${prefix}/${artifactDigest(path)}-${file.sha256}`
        const existing = store.read(key)
        if (existing === undefined) write(key, bytes(file).content)
        else if (artifactDigest(existing) !== file.sha256)
          throw new Error('An installation backup changed; preserve it before continuing')
      }
  })
}
