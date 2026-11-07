// `wl eval grounding`: runs the grounding evaluation.
import { readFileSync } from 'node:fs'
import { groundingEval, groundingInputs } from '../grounding/eval.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export async function groundingCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  json: boolean,
  io: Io,
) {
  if (positional.length !== 1) throw new CliError('Provide one grounding corpus JSON file')
  if (options['--inputs'] === true) {
    if (options['--predictions']) throw new CliError('Choose blind inputs or scoring, not both')
    io.out(JSON.stringify(groundingInputs(positional[0] ?? ''), null, json ? undefined : 2))
    return EXIT.ok
  }
  let predictions: unknown
  if (typeof options['--predictions'] === 'string') {
    try {
      predictions = JSON.parse(readFileSync(options['--predictions'], 'utf8'))
    } catch {
      throw new Error('Cannot read grounding predictions; contents omitted')
    }
  }
  const report = await groundingEval(positional[0] ?? '', predictions)
  io.out(JSON.stringify(report, null, json ? undefined : 2))
  return report.passed ? EXIT.ok : EXIT.shape
}
