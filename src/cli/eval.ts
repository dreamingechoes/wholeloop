// `wl eval` for definitions and gates: scores predictions against a corpus without enforcing a
// threshold.
import { readFileSync } from 'node:fs'
import { definitionReport, loadDefinitionCorpus, parsePredictions } from '../definition/eval.js'
import {
  gateEvaluationInputs,
  gateEvaluationReport,
  loadGateCorpus,
  parseGatePredictions,
} from '../gates/eval.js'

import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function evalCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  json: boolean,
  io: Io,
): number {
  if (positional.length !== 1)
    throw new CliError('Provide one definition corpus manifest', EXIT.input)
  const corpus = loadDefinitionCorpus(positional[0] ?? '')
  const file = options['--predictions']
  const predictions =
    typeof file === 'string'
      ? parsePredictions(JSON.parse(readFileSync(file, 'utf8')), corpus)
      : undefined
  const report = definitionReport(corpus, predictions)
  io.out(JSON.stringify(report, null, json ? undefined : 2))
  // Misses are measurements, not runner errors. Callers can assert a chosen threshold from this report.
  return EXIT.ok
}

export function gateEvalCommand(
  { positional, options }: ReturnType<typeof parseArguments>,
  json: boolean,
  io: Io,
): number {
  if (positional.length !== 1) throw new CliError('Provide one gate corpus manifest', EXIT.input)
  const corpus = loadGateCorpus(positional[0] ?? '')
  if (options['--inputs'] === true) {
    if (options['--predictions']) throw new CliError('Choose blind inputs or scoring, not both')
    io.out(JSON.stringify(gateEvaluationInputs(corpus), null, json ? undefined : 2))
  } else {
    const file = options['--predictions']
    if (typeof file !== 'string')
      throw new CliError(
        'Supply observed --predictions; the runner does not invent reviewer output',
        EXIT.input,
      )
    const predictions = parseGatePredictions(JSON.parse(readFileSync(file, 'utf8')), corpus)
    io.out(JSON.stringify(gateEvaluationReport(corpus, predictions), null, json ? undefined : 2))
  }
  return EXIT.ok
}
