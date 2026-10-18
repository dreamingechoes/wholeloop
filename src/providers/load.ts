import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { isObject } from '../config/schema.js'
import { installedPackageRoot, mergeManifest } from '../extensions/common.js'
import { inside } from '../state/paths.js'
import { BUILTIN_GUIDANCE, BUILTINS } from './builtins.js'
import { PROVIDER_ID, type Provider, validateProvider } from './manifest.js'

interface Candidate {
  id: string
  value: Record<string, unknown>
  origin: string
  priority: number
  directory?: string
}
export interface LoadedProvider {
  manifest: Provider
  origin: string
  guidance: Record<string, string>
  guidanceText: Record<string, string>
}
export interface Registry {
  providers: LoadedProvider[]
  problems: { file: string; message: string }[]
}

export function loadProviders(options: {
  root: string
  user: string
  packages?: readonly string[]
}): Registry {
  const candidates: Candidate[] = BUILTINS.map((value) => ({
    id: value.id,
    value: structuredClone(value) as unknown as Record<string, unknown>,
    origin: `builtin:${value.id}`,
    priority: 0,
  }))
  const problems: Registry['problems'] = []
  function directory(root: string, priority: number): void {
    if (!existsSync(root)) return
    for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (!entry.isDirectory() || !PROVIDER_ID.test(entry.name)) continue
      const providerRoot = join(root, entry.name)
      const files = ['provider.yml', 'provider.yaml', 'provider.json'].filter((file) =>
        existsSync(join(providerRoot, file)),
      )
      if (files.length !== 1) {
        problems.push({
          file: providerRoot,
          message: 'Expected exactly one provider.yml, provider.yaml or provider.json',
        })
        continue
      }
      const file = join(providerRoot, files[0] ?? '')
      try {
        const value: unknown = parse(readFileSync(file, 'utf8'))
        if (
          !isObject(value) ||
          typeof value.id !== 'string' ||
          value.id !== entry.name ||
          !PROVIDER_ID.test(value.id)
        )
          throw new Error('Manifest id must match its directory')
        candidates.push({ id: value.id, value, priority, origin: file, directory: providerRoot })
      } catch {
        problems.push({ file, message: 'Invalid provider manifest or id; contents omitted' })
      }
    }
  }
  for (const [index, spec] of (options.packages ?? []).entries()) {
    try {
      const root = installedPackageRoot(options.root, spec)
      directory(join(root, 'providers'), 1 + index / ((options.packages?.length ?? 0) + 1))
    } catch {
      problems.push({
        file: 'extensions',
        message:
          'Install the declared manifest package with npm first; package code is never executed',
      })
    }
  }
  directory(join(options.user, 'providers'), 2)
  directory(join(options.root, '.wholeloop/providers'), 3)

  const resolving = new Set<string>()
  const resources = new Map<string, Record<string, string>>()
  const contents = new Map<string, Record<string, string>>()
  function materialize(candidate: Candidate): Provider {
    if (resolving.has(candidate.origin)) throw new Error('Provider inheritance cycle')
    resolving.add(candidate.origin)
    try {
      let value = candidate.value
      let inherited: Record<string, string> = {}
      let inheritedText: Record<string, string> = {}
      if (typeof value.extends === 'string') {
        const ref = value.extends
        const id = ref.replace(/^builtin:/, '')
        const bases = candidates
          .filter(
            (other) =>
              other.id === id &&
              other !== candidate &&
              (ref.startsWith('builtin:')
                ? other.priority === 0
                : id === candidate.id
                  ? other.priority < candidate.priority
                  : true),
          )
          .sort((a, b) => b.priority - a.priority)
        const base = bases[0]
        if (!base) throw new Error('Missing provider inheritance base')
        value = mergeManifest(materialize(base) as unknown as Record<string, unknown>, value)
        inherited = resources.get(base.origin) ?? {}
        inheritedText = contents.get(base.origin) ?? {}
      }
      validateProvider(value)
      const guidance: Record<string, string> = {}
      const guidanceText: Record<string, string> = {}
      for (const [name, operation] of Object.entries(value.operations))
        if (operation.guidance) {
          const rawOperation = isObject(candidate.value.operations)
            ? candidate.value.operations[name]
            : undefined
          const own = isObject(rawOperation) && Object.hasOwn(rawOperation, 'guidance')
          const file =
            !own && inherited[name]
              ? inherited[name]
              : candidate.directory
                ? join(candidate.directory, operation.guidance)
                : undefined
          const embedded =
            !own && inheritedText[name]
              ? inheritedText[name]
              : candidate.priority === 0
                ? BUILTIN_GUIDANCE[candidate.id]?.[name]
                : undefined
          if (embedded !== undefined) {
            if (embedded.trimEnd().split('\n').length > 30)
              throw new Error('Guidance exceeds its 30-line budget')
            guidanceText[name] = embedded
            if (inherited[name]) guidance[name] = inherited[name]
            continue
          }
          if (
            !file ||
            !existsSync(file) ||
            (own &&
              candidate.directory &&
              !inside(realpathSync(candidate.directory), realpathSync(file)))
          )
            throw new Error('Guidance is missing or escapes its provider directory')
          if (
            readFileSync(file, 'utf8')
              .split('\n')
              .filter((_, index, lines) => index < lines.length - 1 || lines[index] !== '').length >
            30
          )
            throw new Error('Guidance exceeds its 30-line budget')
          guidance[name] = file
          guidanceText[name] = readFileSync(file, 'utf8')
        }
      resources.set(candidate.origin, guidance)
      contents.set(candidate.origin, guidanceText)
      return value
    } finally {
      resolving.delete(candidate.origin)
    }
  }

  const providers: LoadedProvider[] = []
  for (const id of [...new Set(candidates.map((candidate) => candidate.id))].sort()) {
    const matches = candidates
      .filter((candidate) => candidate.id === id)
      .sort((a, b) => b.priority - a.priority)
    for (const candidate of matches) {
      try {
        providers.push({
          manifest: materialize(candidate),
          origin: candidate.origin,
          guidance: resources.get(candidate.origin) ?? {},
          guidanceText: contents.get(candidate.origin) ?? {},
        })
        break
      } catch (error) {
        problems.push({
          file: candidate.origin,
          message: error instanceof Error ? error.message : 'Invalid provider',
        })
      }
    }
  }
  return { providers, problems }
}

export function resolveProvider(
  registry: Registry,
  operation: string,
  configured?: string,
): LoadedProvider {
  const id =
    configured ??
    (operation.startsWith('docs.')
      ? 'local-docs'
      : operation.startsWith('tracker.')
        ? 'local-tracker'
        : operation === 'source.web.query'
          ? 'native-web'
          : operation === 'source.code.query'
            ? 'native-code'
            : undefined)
  const provider = registry.providers.find((provider) => provider.manifest.id === id)
  if (!provider || !Object.hasOwn(provider.manifest.operations, operation))
    throw new Error(`No configured provider supports ${operation}`)
  return provider
}
