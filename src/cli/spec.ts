// `wl spec`: checks a specification document.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { userConfigPath } from '../config/load.js'
import { checkShape } from '../flow/registry.js'
import { checkSpec, parseSpec, SPEC_SCHEMA, SPEC_SECTIONS } from '../spec/contract.js'
import { checkMetricProviders, metricSourceContext } from '../spec/providers.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitStep } from './presentation.js'

export function specCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
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
  const warnings: string[] = []
  if (!problems.length) {
    const metrics = parseSpec(content).metrics
    if (metrics.length) {
      const context = metricSourceContext({
          root,
          userFile: userConfigPath(),
          home: homedir(),
          ...(typeof options['--client'] === 'string' ? { client: options['--client'] } : {}),
        }),
        checked = checkMetricProviders(metrics, context.registry, context.candidates)
      problems.push(...checked.problems)
      warnings.push(...checked.warnings)
    }
  }
  emitStep(command, { schema: 'wholeloop/spec-check@1', problems, warnings }, io, json, positional)
  return problems.length ? EXIT.shape : EXIT.ok
}
