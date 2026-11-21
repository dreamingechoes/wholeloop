// `wl spec`: checks a specification document.
import { readFileSync } from 'node:fs'
import { checkShape } from '../flow/registry.js'
import { checkSpec, SPEC_SCHEMA, SPEC_SECTIONS } from '../spec/contract.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitStep } from './presentation.js'

export function specCommand(
  command: string,
  { positional }: ReturnType<typeof parseArguments>,
  json: boolean,
  io: Io,
): number {
  if (positional.length !== (command === 'spec schema' ? 0 : 1))
    throw new CliError(
      command === 'spec schema' ? 'spec schema takes no arguments' : 'Provide one spec artifact',
      EXIT.input,
    )
  if (command === 'spec schema') {
    emitStep(
      command,
      { schema: 'wholeloop/spec-schema@1', specSchema: SPEC_SCHEMA },
      io,
      json,
      positional,
    )
    return EXIT.ok
  }
  const content = readFileSync(positional[0] ?? '', 'utf8')
  const problems = [...checkShape(content, SPEC_SECTIONS), ...checkSpec(content)]
  emitStep(command, { schema: 'wholeloop/spec-check@1', problems }, io, json, positional)
  return problems.length ? EXIT.shape : EXIT.ok
}
