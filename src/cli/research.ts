import { readFileSync, statSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import { ResearchWorkflow } from '../research/workflow.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function researchCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (positional.length)
    throw new CliError('Research commands take --for <brief-id>, not positional arguments')
  const subject = options['--for']
  if (typeof subject !== 'string') throw new CliError('Provide --for <brief-id>', EXIT.input)
  const workflow = new ResearchWorkflow(new FlowEngine(new StateStore(), root))
  try {
    let payload: unknown
    if (command === 'research plan') payload = workflow.plan(subject)
    else if (command === 'research complete') payload = workflow.complete(subject)
    else {
      const file = options['--file']
      if (typeof file !== 'string') throw new CliError('Provide --file <json-report>', EXIT.input)
      if (!statSync(file).isFile() || statSync(file).size > 1024 * 1024)
        throw new CliError('Research reports must be regular files under 1 MiB')
      const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
      payload =
        command === 'research submit'
          ? workflow.submit(subject, value)
          : workflow.examine(subject, value)
    }
    io.out(JSON.stringify(payload, null, json ? undefined : 2))
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(error instanceof Error ? error.message : 'Research command failed')
  }
}
