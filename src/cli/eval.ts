import { readFileSync } from 'node:fs'
import { definitionReport, loadDefinitionCorpus, parsePredictions } from '../definition/eval.js'
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
