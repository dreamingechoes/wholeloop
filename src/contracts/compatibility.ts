// Fingerprints the frozen version-one contracts so a release cannot change a schema, command or
// exit code silently.
import { createHash } from 'node:crypto'
import type { Command } from '../cli/commands.js'
import { isObject } from '../config/schema.js'

/** Ignore object-key/formatting changes, but conservatively preserve every declared constraint. */
export function contractDigest(value: unknown): string {
  const ordered = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(ordered)
    if (isObject(value))
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, ordered(value[key])]),
      )
    return value
  }
  return createHash('sha256')
    .update(JSON.stringify(ordered(value)))
    .digest('hex')
}

export function schemaContracts(schemas: readonly unknown[]) {
  const declarations = new Map<string, string>()
  const record = (role: string, name: unknown, declaration: unknown) => {
    if (typeof name !== 'string' || !/^wholeloop\/[a-z][a-z0-9-]*@[1-9]\d*$/.test(name))
      throw new Error('Contract declaration needs a versioned identity')
    const key = `${role}:${name}`
    if (declarations.has(key)) throw new Error(`Duplicate contract declaration: ${key}`)
    declarations.set(key, contractDigest(declaration))
  }
  for (const schema of schemas) {
    if (!isObject(schema)) throw new Error('Contract schema must be an object')
    if (schema.$id === 'wholeloop/cli-output@1') {
      const { oneOf, ...envelope } = schema
      record('schema', schema.$id, envelope)
      if (!Array.isArray(oneOf)) throw new Error('Output contract needs explicit variants')
      for (const variant of oneOf) {
        const id =
          isObject(variant) && isObject(variant.properties) && isObject(variant.properties.schema)
            ? variant.properties.schema.const
            : undefined
        // Input and output declarations may intentionally have the same ID but distinct roles.
        if (typeof id !== 'string') throw new Error('Output variant needs an exact identity')
        record('output', id, variant)
      }
    } else record('schema', schema.$id, schema)
  }
  return declarations
}

export interface CompatibilityBaseline {
  contracts: Record<string, string>
  commands: readonly Pick<Command, 'path' | 'arguments' | 'schema' | 'options'>[]
  exitCodes: Readonly<Record<string, number>>
}

/** New identities are additive; an existing identity must retain its complete declaration. */
export function checkCompatibility(
  baseline: CompatibilityBaseline,
  current: {
    contracts: ReadonlyMap<string, string>
    commands: CompatibilityBaseline['commands']
    exitCodes: CompatibilityBaseline['exitCodes']
  },
) {
  const problems: string[] = []
  for (const [id, digest] of Object.entries(baseline.contracts)) {
    const actual = current.contracts.get(id)
    if (actual === undefined) problems.push(`Missing contract: ${id}`)
    else if (actual !== digest) problems.push(`Changed contract under existing identity: ${id}`)
  }
  for (const command of baseline.commands) {
    const actual = current.commands.find((entry) => entry.path === command.path)
    if (!actual) problems.push(`Removed command: ${command.path}`)
    else if (
      actual.schema !== command.schema ||
      actual.arguments !== command.arguments ||
      !command.options.every((option) => actual.options.includes(option))
    )
      problems.push(`Changed command contract: ${command.path}`)
  }
  for (const [name, code] of Object.entries(baseline.exitCodes))
    if (current.exitCodes[name] !== code) problems.push(`Changed exit code: ${name}`)
  return problems
}
