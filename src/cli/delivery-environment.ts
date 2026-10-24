import { resolve } from 'node:path'
import { readSourceFile } from '../delivery/input.js'
import { ENVIRONMENT_RECIPE_SCHEMA } from '../environment/recipe.js'
import {
  discoverEnvironment,
  ENVIRONMENT_RECORD_SCHEMA,
  EnvironmentRecipes,
} from '../environment/recipe-store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryEnvironmentCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  try {
    let receipt: unknown
    const boundary = typeof options['--root'] === 'string' ? resolve(root, options['--root']) : root
    if (command === 'delivery environment-schema')
      receipt = {
        schema: 'wholeloop/environment-schema@1',
        recipeSchema: ENVIRONMENT_RECIPE_SCHEMA,
        recordSchema: ENVIRONMENT_RECORD_SCHEMA,
        executed: false,
      }
    else if (command === 'delivery environment-discover') receipt = discoverEnvironment(boundary)
    else {
      const recipes = new EnvironmentRecipes(
        typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
      )
      if (command === 'delivery environment-inspect') {
        if (typeof options['--digest'] !== 'string')
          throw new CliError('Provide --digest <recipe-sha256>', EXIT.input)
        receipt = recipes.inspect(options['--digest'])
      } else {
        if (typeof options['--file'] !== 'string')
          throw new CliError('Provide --file <recipe.json>', EXIT.input)
        receipt = recipes.prepare(
          JSON.parse(readSourceFile(boundary, options['--file'], 8 * 1024 * 1024)),
        )
      }
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      'Environment planning refused; inspect bounded non-secret inputs and explicit origins; contents omitted',
      EXIT.precondition,
    )
  }
}
