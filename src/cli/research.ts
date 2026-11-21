// `wl research`: plans and records research rounds.
import { FlowEngine } from '../flow/engine.js'
import { readRegularText } from '../fs/regular-file.js'
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
      })
    } else if (command === 'research complete') payload = workflow.complete(subject)
    else {
      const file = options['--file']
      if (typeof file !== 'string') throw new CliError('Provide --file <json-report>', EXIT.input)
      // A linked report is still accepted, as before; the check and the read share one descriptor.
      const report = readRegularText(file, 1024 * 1024, { follow: true })
      if (report === undefined)
        throw new CliError('Research reports must be regular files under 1 MiB')
      const value: unknown = JSON.parse(report)
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
