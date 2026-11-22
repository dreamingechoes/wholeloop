// `wl research`: plans and records research rounds.

import { FlowEngine } from '../flow/engine.js'
import { readRegularText } from '../fs/regular-file.js'
import { ResearchWorkflow } from '../research/workflow.js'
import { StateStore } from '../state/store.js'
import { checkRigor } from '../workers/rigor.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { hasJsonInput, jsonInput } from './json-input.js'
import { emitStep } from './presentation.js'

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
    if (command === 'research plan') {
      const raw = options['--sources']
      let sources: string[] | undefined
      if (typeof raw === 'string') {
        const value: unknown = raw.trim().startsWith('[')
          ? JSON.parse(raw)
          : raw.split(',').map((id) => id.trim())
        if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.trim()))
          throw new CliError(
            'Sources must be a comma-separated list of provider IDs or a JSON array',
          )
        sources = value
      }
      payload = workflow.plan(subject, {
        ...(sources !== undefined ? { sources } : {}),
        ...(typeof options['--remember'] === 'string' ? { remember: options['--remember'] } : {}),
        ...(typeof options['--client'] === 'string' ? { client: options['--client'] } : {}),
        ...(typeof options['--rigor'] === 'string'
          ? { rigor: checkRigor(options['--rigor']) }
          : {}),
      })
    } else if (command === 'research complete') {
      if (
        options['--stdin'] === true &&
        ['--answer', '--recommendation', '--basis'].some((key) => options[key] !== undefined)
      )
        throw new CliError('Use --stdin or conclusion answer options, not both')
      const supplied = ['--answer', '--recommendation', '--basis'].some(
        (key) => options[key] !== undefined,
      )
      payload = workflow.complete(
        subject,
        options['--stdin'] === true
          ? jsonInput(options)
          : supplied
            ? {
                schema: 'wholeloop/research-conclusion@1',
                basis: options['--basis'],
                answer: options['--answer'],
                recommendation: options['--recommendation'],
              }
            : undefined,
      )
    } else {
      if (!hasJsonInput(options))
        throw new CliError('Provide --file <json-report> or --stdin', EXIT.input)
      const value = jsonInput(options, {
        limit: 1024 * 1024,
        readFile: (file) => {
          const report = readRegularText(file, 1024 * 1024, { follow: true })
          if (report === undefined)
            throw new CliError('Research reports must be regular files under 1 MiB')
          return report
        },
      })
      payload =
        command === 'research submit'
          ? workflow.submit(subject, value)
          : workflow.examine(subject, value)
    }
    emitStep(command, payload, io, json, positional)
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(error instanceof Error ? error.message : 'Research command failed')
  }
}
