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
const EMPTY_PROPERTIES = Object.freeze({})
let patterns: Map<string, RegExp> | undefined

function matchesPattern(value: string, pattern: string): boolean {
  const prior = patterns?.get(pattern)
  if (prior) return prior.test(value)
  // These expressions have no flags or externally mutable lastIndex. Cache
  // exact strings only, never schema objects or validation outcomes. Bound
  // retention because extension-supplied schemas need not be a finite set.
  const expression = new RegExp(pattern)
  if (pattern.length <= 4096) {
    patterns ??= new Map()
    if (patterns.size >= 128) {
      const oldest = patterns.keys().next().value
      if (oldest !== undefined) patterns.delete(oldest)
    }
    patterns.set(pattern, expression)
  }
  return expression.test(value)
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invalid(value: unknown, rule: Schema, path: string, problems: string[]): void {
  const expected = rule.enum?.map(String).join(' | ') ?? rule.type
  problems.push(`${path}: ${JSON.stringify(value)}; expected ${expected}`)
}

function validateInto(value: unknown, rule: Schema, path: string, problems: string[]): void {
  if (rule.const !== undefined && value !== rule.const) {
    invalid(value, rule, path, problems)
    return
  }
  if (rule.enum && !rule.enum.includes(value)) {
    invalid(value, rule, path, problems)
    return
  }
  switch (rule.type) {
    case 'object': {
      if (!isObject(value)) {
        invalid(value, rule, path, problems)
        return
      }
      // File versions are checked by readConfig; in-memory run overrides are partial.
      const required = rule === CONFIG_SCHEMA ? undefined : rule.required
      if (required) {
        for (let index = 0, length = required.length; index < length; index++) {
          if (!(index in required)) continue
          const key = required[index] as string
          if (!Object.hasOwn(value, key)) problems.push(`${path}.${key}: required field`)
        }
      }
      // Keep the existing key/value snapshot: streaming keys would let a child
      // getter change which sibling value is selected during this validation.
      for (const [key, child] of Object.entries(value)) {
        if (UNSAFE_KEYS.has(key)) {
          problems.push(`${path}.${key}: forbidden key`)
          continue
        }
        const childRule = Object.hasOwn(rule.properties ?? EMPTY_PROPERTIES, key)
          ? rule.properties?.[key]
          : rule.additionalProperties
        if (!childRule || childRule === true) {
          if (childRule !== true)
            problems.push(
              `${path}.${key}: ${JSON.stringify(child)}; expected a known configuration key`,
            )
        } else validateInto(child, childRule, `${path}.${key}`, problems)
      }
      return
    }
    case 'array': {
      if (!Array.isArray(value)) {
        invalid(value, rule, path, problems)
        return
      }
      if (value.length < (rule.minItems ?? 0)) {
        problems.push(`${path}: expected at least ${rule.minItems} items`)
        return
      }
      if (rule.uniqueItems) {
        const keys = new Set<string | undefined>()
        // Serialize every original position before deciding: early duplicate
        // refusal would hide a later JSON error, while holes count as undefined.
        for (let index = 0, length = value.length; index < length; index++)
          keys.add(index in value ? JSON.stringify(value[index]) : undefined)
        if (keys.size !== value.length) {
          problems.push(`${path}: expected unique items`)
          return
        }
      }
      // flatMap skips absent slots, includes inherited ones and reads every
      // present value even without an items rule. Preserve those semantics.
      for (let index = 0, length = value.length; index < length; index++) {
        if (!(index in value)) continue
        const item = value[index]
        if (rule.items) validateInto(item, rule.items, `${path}[${index}]`, problems)
      }
      return
    }
    case 'boolean':
      if (typeof value !== 'boolean') invalid(value, rule, path, problems)
      return
    case 'number':
      if (
        !(
          typeof value === 'number' &&
          Number.isFinite(value) &&
          (rule.minimum === undefined || value >= rule.minimum) &&
          (rule.maximum === undefined || value <= rule.maximum)
        )
      )
        invalid(value, rule, path, problems)
      return
    case 'integer':
      if (
        !(
          typeof value === 'number' &&
          Number.isSafeInteger(value) &&
          (rule.minimum === undefined || value >= rule.minimum) &&
          (rule.maximum === undefined || value <= rule.maximum)
        )
      )
        invalid(value, rule, path, problems)
      return
    case 'string':
      if (
        !(
          typeof value === 'string' &&
          value.length >= (rule.minLength ?? 0) &&
          (!rule.pattern || matchesPattern(value, rule.pattern))
        )
      )
        invalid(value, rule, path, problems)
      return
    default:
      throw new Error(`Unsupported configuration schema type: ${rule.type}`)
  }
}

/** Only the vocabulary used by our schema is needed; no runtime dependency. */
export function validate(value: unknown, rule: Schema = CONFIG_SCHEMA, path = 'config'): string[] {
  const problems: string[] = []
  validateInto(value, rule, path, problems)
  return problems
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
