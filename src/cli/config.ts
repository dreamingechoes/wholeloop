// `wl config`: shows the resolved configuration and where each value came from.
import { loadConfig } from '../config/load.js'
import { CONFIG_SCHEMA } from '../config/schema.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

export function configCommand(
  action: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (positional.length)
    throw new CliError('Configuration commands do not take positional arguments')
  if (action === 'schema') {
    if (Object.keys(options).length) throw new CliError('config schema does not take options')
    emitCommand(
      'config schema',
      { schema: 'wholeloop/config-schema@1', configSchema: CONFIG_SCHEMA },
      io,
      json,
    )
    return EXIT.ok
  }
  try {
    const config = loadConfig({
      root,
      ...(typeof options['--initiative-config'] === 'string'
        ? { initiativeFile: options['--initiative-config'] }
        : {}),
      ...(typeof options['--run-config'] === 'string' ? { runFile: options['--run-config'] } : {}),
    })
    const payload = {
      schema: 'wholeloop/config-show@1',
      values: config.values,
      ...(options['--explain'] ? { sources: config.sources } : {}),
    }
    emitCommand('config show', payload, io, json)
    return EXIT.ok
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error))
  }
}
