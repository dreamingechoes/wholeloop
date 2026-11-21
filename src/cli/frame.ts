// `wl frame`: framing drafts and their schema.
import { FlowEngine } from '../flow/engine.js'
import {
  FRAME_DECISION_SCHEMA,
  FRAME_REVIEW_SCHEMA,
  finalizeFrame,
  prepareFrame,
} from '../framing/finalize.js'
import { readRegularText } from '../fs/regular-file.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'
import { jsonInput } from './json-input.js'
import { emitStep } from './presentation.js'

export function frameCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (positional.length) throw new CliError('Frame commands use named options')
  if (command === 'frame schema') {
    emitStep(
      command,
      {
        schema: 'wholeloop/frame-schema@1',
        decisionSchema: FRAME_DECISION_SCHEMA,
        reviewSchema: FRAME_REVIEW_SCHEMA,
      },
      io,
      json,
      positional,
    )
    return 0
  }
  const subject = options['--for'],
    artifact = options['--artifact'],
    file = options['--file']
  if (
    typeof subject !== 'string' ||
    typeof artifact !== 'string' ||
    (typeof file !== 'string' && options['--stdin'] !== true)
  )
    throw new CliError(
      'Provide --for <initiative> --artifact <draft.md> --file <decision-or-review.json>',
    )
  const read = (path: string, limit: number) => {
    const text = readRegularText(path, limit)
    if (text === undefined) throw new Error()
    return text
  }
  let content: string, input: unknown
  try {
    content = read(artifact, 1024 * 1024)
    input = jsonInput(options, { limit: 65536, readFile: (path) => read(path, 65536) })
  } catch {
    throw new CliError('Use regular bounded draft and non-secret JSON files; contents omitted')
  }
  const engine = new FlowEngine(new StateStore(), root)
  try {
    const output =
      command === 'frame draft'
        ? prepareFrame(engine, subject, content, input)
        : finalizeFrame(engine, subject, content, input)
    emitStep(command, output, io, json, positional)
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : 'Invalid final framing review')
  }
  return 0
}
