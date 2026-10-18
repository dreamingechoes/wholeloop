import schema from './schema.json' with { type: 'json' }

export interface Schema {
  type: string
  properties?: Record<string, Schema>
  additionalProperties?: boolean | Schema
  items?: Schema
  enum?: readonly unknown[]
  const?: unknown
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  required?: readonly string[]
  minItems?: number
  uniqueItems?: boolean
  pattern?: string
  'x-kind'?: string
}

export const CONFIG_SCHEMA: Schema = schema
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Only the vocabulary used by our schema is needed; no runtime dependency. */
export function validate(value: unknown, rule: Schema = CONFIG_SCHEMA, path = 'config'): string[] {
  const expected = rule.enum?.map(String).join(' | ') ?? rule.type
  const fail = () => [`${path}: ${JSON.stringify(value)}; expected ${expected}`]
  if (rule.const !== undefined && value !== rule.const) return fail()
  if (rule.enum && !rule.enum.includes(value)) return fail()
  switch (rule.type) {
    case 'object': {
      if (!isObject(value)) return fail()
      // File versions are checked by readConfig; in-memory run overrides are partial.
      const problems = (rule === CONFIG_SCHEMA ? [] : (rule.required ?? []))
        .filter((key) => !Object.hasOwn(value, key))
        .map((key) => `${path}.${key}: required field`)
      for (const [key, child] of Object.entries(value)) {
        if (UNSAFE_KEYS.has(key)) {
          problems.push(`${path}.${key}: forbidden key`)
          continue
        }
        const childRule = Object.hasOwn(rule.properties ?? {}, key)
          ? rule.properties?.[key]
          : rule.additionalProperties
        if (!childRule || childRule === true) {
          if (childRule !== true)
            problems.push(
              `${path}.${key}: ${JSON.stringify(child)}; expected a known configuration key`,
            )
        } else problems.push(...validate(child, childRule, `${path}.${key}`))
      }
      return problems
    }
    case 'array': {
      if (!Array.isArray(value)) return fail()
      if (value.length < (rule.minItems ?? 0))
        return [`${path}: expected at least ${rule.minItems} items`]
      if (
        rule.uniqueItems &&
        new Set(value.map((item) => JSON.stringify(item))).size !== value.length
      )
        return [`${path}: expected unique items`]
      return value.flatMap((item, index) =>
        rule.items ? validate(item, rule.items, `${path}[${index}]`) : [],
      )
    }
    case 'boolean':
      return typeof value === 'boolean' ? [] : fail()
    case 'number':
      return typeof value === 'number' &&
        Number.isFinite(value) &&
        (rule.minimum === undefined || value >= rule.minimum) &&
        (rule.maximum === undefined || value <= rule.maximum)
        ? []
        : fail()
    case 'integer':
      return typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        (rule.minimum === undefined || value >= rule.minimum) &&
        (rule.maximum === undefined || value <= rule.maximum)
        ? []
        : fail()
    case 'string':
      return typeof value === 'string' &&
        value.length >= (rule.minLength ?? 0) &&
        (!rule.pattern || new RegExp(rule.pattern).test(value))
        ? []
        : fail()
    default:
      throw new Error(`Unsupported configuration schema type: ${rule.type}`)
  }
}

export interface Key {
  path: string[]
  rule: Schema
  kind: 'personal' | 'team'
}

export function configKeys(
  rule: Schema = CONFIG_SCHEMA,
  path: string[] = [],
  kind: Key['kind'] = 'team',
): Key[] {
  const ownKind = rule['x-kind'] === 'personal' ? 'personal' : kind
  if (rule.properties)
    return Object.entries(rule.properties).flatMap(([key, child]) =>
      configKeys(child, [...path, key], ownKind),
    )
  return [{ path, rule, kind: ownKind }]
}
