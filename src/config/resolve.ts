import { PRESETS, type Preset } from '../profile/presets.js'
import { configKeys, isObject, type Key, validate } from './schema.js'

export type Scope = 'user' | 'project' | 'initiative' | 'run'
export interface Layer {
  scope: Scope
  values: unknown
  file?: string
}
export interface Source {
  value: unknown
  scope: Scope | 'built-in'
  file?: string
}
export interface Configuration {
  values: Record<string, unknown>
  sources: Record<string, Source>
}

function at(value: unknown, path: readonly string[]): unknown {
  for (const key of path) {
    if (!isObject(value) || !Object.hasOwn(value, key)) return undefined
    value = value[key]
  }
  return value
}

function assign(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  const [key, ...rest] = path
  if (!key) return
  if (!rest.length) target[key] = structuredClone(value)
  else {
    const child = target[key]
    const object = isObject(child) ? child : {}
    target[key] = object
    assign(object, rest, value)
  }
}

export function resolveConfig(layers: readonly Layer[]): Configuration {
  const problems = layers.flatMap((layer) =>
    validate(layer.values, undefined, layer.file ?? layer.scope),
  )
  if (problems.length) throw new Error(problems.join('\n'))
  layers = layers.map((layer) => {
    if (
      !isObject(layer.values) ||
      !isObject(layer.values.profile) ||
      typeof layer.values.profile.preset !== 'string'
    )
      return layer
    return {
      ...layer,
      values: {
        ...layer.values,
        profile: { ...PRESETS[layer.values.profile.preset as Preset], ...layer.values.profile },
      },
    }
  })
  for (const scope of ['user', 'project', 'initiative', 'run']) {
    if (layers.filter((layer) => layer.scope === scope).length > 1)
      throw new Error(`Duplicate configuration layer: ${scope}`)
  }
  const values: Record<string, unknown> = {}
  const sources: Record<string, Source> = {}
  function resolveKey(key: Key): void {
    const precedence: Scope[] =
      key.kind === 'personal'
        ? ['project', 'user', 'initiative', 'run']
        : ['user', 'project', 'initiative', 'run']
    let source: Source | undefined =
      key.rule.default === undefined ? undefined : { value: key.rule.default, scope: 'built-in' }
    for (const scope of precedence) {
      const layer = layers.find((candidate) => candidate.scope === scope)
      const value = at(layer?.values, key.path)
      if (value !== undefined)
        source = { value, scope, ...(layer?.file ? { file: layer.file } : {}) }
    }
    if (source) {
      assign(values, key.path, source.value)
      sources[key.path.join('.')] = structuredClone(source)
    }
  }
  for (const key of configKeys()) {
    if (key.rule.type === 'object' && typeof key.rule.additionalProperties === 'object') {
      const dynamic = new Set(
        layers.flatMap((layer) => Object.keys(at(layer.values, key.path) ?? {})),
      )
      for (const name of [...dynamic].sort())
        resolveKey({ ...key, path: [...key.path, name], rule: key.rule.additionalProperties })
    } else resolveKey(key)
  }
  values.version = 1
  return { values, sources }
}
