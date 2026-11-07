// `wl frame`: framing drafts and their schema.
import { lstatSync, readFileSync } from 'node:fs'
import { FlowEngine } from '../flow/engine.js'
import {
  FRAME_DECISION_SCHEMA,
  FRAME_REVIEW_SCHEMA,
  finalizeFrame,
  prepareFrame,
} from '../framing/finalize.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import type { Io } from './io.js'

export function frameCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (positional.length) throw new CliError('Frame commands use named options')
  if (command === 'frame schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/frame-schema@1',
          decisionSchema: FRAME_DECISION_SCHEMA,
          reviewSchema: FRAME_REVIEW_SCHEMA,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return 0
  }
  const subject = options['--for'],
    artifact = options['--artifact'],
    file = options['--file']
  if (typeof subject !== 'string' || typeof artifact !== 'string' || typeof file !== 'string')
    throw new CliError(
      'Provide --for <initiative> --artifact <draft.md> --file <decision-or-review.json>',
    )
  const read = (path: string, limit: number) => {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw new Error()
    const bytes = readFileSync(path)
    if (bytes.length > limit) throw new Error()
    return bytes.toString('utf8')
  }
  let content: string, input: unknown
  try {
    content = read(artifact, 1024 * 1024)
    input = JSON.parse(read(file, 65536))
  } catch {
    throw new CliError('Use regular bounded draft and non-secret JSON files; contents omitted')
  }
  const engine = new FlowEngine(new StateStore(), root)
  try {
    const output =
      command === 'frame draft'
        ? prepareFrame(engine, subject, content, input)
        : finalizeFrame(engine, subject, content, input)
    io.out(JSON.stringify(output, null, json ? undefined : 2))
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : 'Invalid final framing review')
  }
  return 0
}
