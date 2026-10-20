import { isObject } from '../config/schema.js'
import type { Command } from './commands.js'

/** A command declaration is incomplete when consumers cannot find its output variant. */
export function checkCommandSchemas(
  commands: readonly Pick<Command, 'path' | 'schema'>[],
  output: unknown,
): string[] {
  const versioned = /^wholeloop\/[a-z][a-z0-9-]*@[1-9]\d*$/
  if (
    !isObject(output) ||
    output.$id !== 'wholeloop/cli-output@1' ||
    !Array.isArray(output.required) ||
    !output.required.includes('schema') ||
    !Array.isArray(output.oneOf) ||
    !output.oneOf.length
  )
    return ['Require the versioned output envelope with a schema discriminator and variants']
  const problems: string[] = []
  const ids = new Set<string>()
  for (const variant of output.oneOf) {
    const id =
      isObject(variant) && isObject(variant.properties) && isObject(variant.properties.schema)
        ? variant.properties.schema.const
        : undefined
    if (typeof id !== 'string' || !versioned.test(id)) {
      problems.push('Every output variant needs one exact versioned schema discriminator')
      continue
    }
    if (ids.has(id)) problems.push(`Duplicate output variant: ${id}`)
    ids.add(id)
  }
  for (const command of commands) {
    if (!versioned.test(command.schema))
      problems.push(`Unversioned command output: ${command.path}`)
    else if (!ids.has(command.schema)) problems.push(`Missing command output: ${command.schema}`)
  }
  return [...new Set(problems)]
}
