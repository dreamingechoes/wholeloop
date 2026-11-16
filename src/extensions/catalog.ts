// Loads extension manifests from the four layers into one validated catalog.
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { parse } from 'yaml'
import { isObject } from '../config/schema.js'
import { readRegularText } from '../fs/regular-file.js'
import { inside } from '../state/paths.js'
import { installedPackageRoot, MANIFEST_ID, mergeManifest } from './common.js'

export interface Manifest {
  schema: 1
  id: string
  extends?: string
}
export interface Resource {
  id: string
  field: readonly string[]
  path: string
  maxLines: number
}
export interface CatalogAdapter<T extends Manifest> {
  kind: 'templates' | 'profiles' | 'lenses'
  filename: string
  builtins: readonly T[]
  parse?: (content: string, file: string) => unknown
  validate: (value: unknown, base?: T) => T
  resources?: (value: T) => Resource[]
}
export interface CatalogEntry<T> {
  manifest: T
  origin: string
  resources: Record<string, string>
}
export interface Catalog<T> {
  entries: CatalogEntry<T>[]
  problems: { file: string; message: string }[]
}
export interface CatalogOptions {
  root: string
  user: string
  packages?: readonly string[]
}
interface Candidate {
  id: string
  value: Record<string, unknown>
  origin: string
  priority: number
  directory?: string
}

function at(value: unknown, fields: readonly string[]): unknown {
  for (const field of fields) {
    if (!isObject(value) || !Object.hasOwn(value, field)) return undefined
    value = value[field]
  }
  return value
}

export function loadCatalog<T extends Manifest>(
  adapter: CatalogAdapter<T>,
  options: CatalogOptions,
): Catalog<T> {
  const problems: Catalog<T>['problems'] = []
  const candidates: Candidate[] = adapter.builtins.map((value) => ({
    id: value.id,
    value: value as unknown as Record<string, unknown>,
    priority: 0,
    origin: `builtin:${value.id}`,
  }))
  function read(file: string, id: string, priority: number): void {
    try {
      // Read the real path that was checked, without following links, so the check holds.
      const real = realpathSync(file)
      const content = inside(realpathSync(dirname(file)), real)
        ? readRegularText(real, 1024 * 1024)
        : undefined
      if (content === undefined) throw new Error('Manifest must be a local file under 1 MiB')
      const value: unknown = adapter.parse ? adapter.parse(content, file) : parse(content)
      if (!isObject(value) || value.id !== id || !MANIFEST_ID.test(id))
        throw new Error('Manifest id must match its filename or directory')
      candidates.push({ id, value, origin: file, priority, directory: dirname(file) })
    } catch {
      problems.push({ file, message: 'Invalid manifest syntax or id; contents omitted' })
    }
  }
  function directory(root: string, priority: number): void {
    if (!existsSync(root)) return
    for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.isFile() && adapter.kind === 'templates' && entry.name.endsWith('.md'))
        read(join(root, entry.name), basename(entry.name, '.md'), priority)
      if (entry.isDirectory() && MANIFEST_ID.test(entry.name)) {
        const files = [
          adapter.filename,
          adapter.filename.replace(/\.yml$/, '.yaml'),
          adapter.filename.replace(/\.yml$/, '.json'),
        ].filter(
          (file, index, all) =>
            all.indexOf(file) === index && existsSync(join(root, entry.name, file)),
        )
        if (files.length !== 1) {
          problems.push({
            file: join(root, entry.name),
            message: `Expected exactly one ${adapter.filename} manifest`,
          })
          continue
        }
        read(join(root, entry.name, files[0] ?? ''), entry.name, priority)
      }
    }
  }
  for (const [index, spec] of (options.packages ?? []).entries()) {
    try {
      directory(
        join(installedPackageRoot(options.root, spec), adapter.kind),
        1 + index / ((options.packages?.length ?? 0) + 1),
      )
    } catch (error) {
      problems.push({
        file: 'extensions',
        message: error instanceof Error ? error.message : 'Cannot load manifest package',
      })
    }
  }
  directory(join(options.user, adapter.kind), 2)
  directory(join(options.root, '.wholeloop', adapter.kind), 3)
  const resolving = new Set<string>()
  const resourcePaths = new Map<string, Record<string, string>>()
  function materialize(candidate: Candidate): T {
    if (resolving.has(candidate.origin)) throw new Error('Manifest inheritance cycle')
    resolving.add(candidate.origin)
    try {
      let value = candidate.value
      let base: T | undefined
      let inherited: Record<string, string> = {}
      if (typeof value.extends === 'string') {
        const ref = value.extends
        const id = ref.replace(/^builtin:/, '')
        const parent = candidates
          .filter(
            (other) =>
              other !== candidate &&
              other.id === id &&
              (ref.startsWith('builtin:')
                ? other.priority === 0
                : id === candidate.id
                  ? other.priority < candidate.priority
                  : true),
          )
          .sort((a, b) => b.priority - a.priority)[0]
        if (!parent) throw new Error('Missing manifest inheritance base')
        base = materialize(parent)
        inherited = resourcePaths.get(parent.origin) ?? {}
        value = mergeManifest(base as unknown as Record<string, unknown>, value)
      }
      const manifest = adapter.validate(value, base)
      const resources: Record<string, string> = {}
      for (const resource of adapter.resources?.(manifest) ?? []) {
        if (!candidate.directory) continue
        const own = at(candidate.value, resource.field) !== undefined
        const file =
          !own && inherited[resource.id]
            ? inherited[resource.id]
            : join(candidate.directory, resource.path)
        const missing = `Resource ${resource.id} is missing or escapes its manifest directory`
        if (!file) throw new Error(missing)
        let real: string
        try {
          real = realpathSync(file)
        } catch {
          throw new Error(missing)
        }
        if (own && !inside(realpathSync(candidate.directory), real)) throw new Error(missing)
        // An inherited resource could be a link before; its real path is read the same way now.
        const content = readRegularText(real, 1024 * 1024)
        if (content === undefined)
          throw new Error(`Resource ${resource.id} must be a regular file under 1 MiB`)
        if (content.trimEnd().split('\n').length > resource.maxLines)
          throw new Error(`Resource ${resource.id} exceeds ${resource.maxLines} lines`)
        resources[resource.id] = file
      }
      resourcePaths.set(candidate.origin, resources)
      return manifest
    } finally {
      resolving.delete(candidate.origin)
    }
  }
  const entries: CatalogEntry<T>[] = []
  for (const id of [...new Set(candidates.map((candidate) => candidate.id))].sort()) {
    const matches = candidates
      .filter((candidate) => candidate.id === id)
      .sort((a, b) => b.priority - a.priority)
    const duplicatePriorities = new Set(
      matches
        .filter(
          (candidate) =>
            matches.filter((other) => other.priority === candidate.priority).length > 1,
        )
        .map((candidate) => candidate.priority),
    )
    for (const priority of duplicatePriorities)
      problems.push({
        file: adapter.kind,
        message: `Duplicate manifest id ${id} in layer ${priority}`,
      })
    for (const candidate of matches.filter(
      (candidate) => !duplicatePriorities.has(candidate.priority),
    )) {
      try {
        entries.push({
          manifest: materialize(candidate),
          origin: candidate.origin,
          resources: resourcePaths.get(candidate.origin) ?? {},
        })
        break
      } catch (error) {
        problems.push({
          file: candidate.origin,
          message: error instanceof Error ? error.message : 'Invalid manifest',
        })
      }
    }
  }
  return { entries, problems }
}
