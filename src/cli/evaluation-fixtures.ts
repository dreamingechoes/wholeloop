import { resolve } from 'node:path'
import {
  EVALUATION_CATALOG_SCHEMA,
  EVALUATION_ORACLE_SCHEMA,
  EvaluationFixtureError,
  evaluationCatalogSummary,
  loadEvaluationCatalog,
} from '../evaluation/catalog.js'
import {
  EVALUATION_SEED_RECORD_SCHEMA,
  EVALUATION_SEED_SCHEMA,
  EvaluationSeeds,
} from '../evaluation/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function evaluationFixturesCommand(
  command: string,
  { options, positional }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  try {
    let receipt: unknown,
      code: number = EXIT.ok
    if (command === 'eval delivery-schema')
      receipt = {
        schema: 'wholeloop/evaluation-schema@1',
        contracts: {
          catalog: EVALUATION_CATALOG_SCHEMA,
          oracle: EVALUATION_ORACLE_SCHEMA,
          seed: EVALUATION_SEED_SCHEMA,
          record: EVALUATION_SEED_RECORD_SCHEMA,
        },
        executed: false,
      }
    else {
      const argument = positional[0]
      if (positional.length !== 1 || !argument)
        throw new CliError('Provide one catalog manifest or seed digest', EXIT.input)
      if (command === 'eval delivery-catalog')
        receipt = evaluationCatalogSummary(loadEvaluationCatalog(resolve(root, argument)))
      else {
        const store = new EvaluationSeeds(
          typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
        )
        if (command === 'eval delivery-inspect') receipt = store.inspect(argument)
        else {
          const scenario = options['--scenario'],
            key = options['--key'],
            variant = options['--variant'] ?? 'baseline'
          if (
            typeof scenario !== 'string' ||
            typeof key !== 'string' ||
            !['baseline', 'reference'].includes(String(variant))
          )
            throw new CliError(
              'Provide --scenario and --key; choose baseline or reference',
              EXIT.input,
            )
          const loaded = loadEvaluationCatalog(resolve(root, argument))
          receipt = store.seed(loaded, {
            schema: 'wholeloop/evaluation-seed-request@1',
            catalog: loaded.digest,
            scenario,
            key,
            variant,
          })
        }
        if ((receipt as { status: string }).status !== 'ready') code = EXIT.precondition
      }
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return code
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      `Evaluation fixtures unavailable${error instanceof EvaluationFixtureError ? `: ${error.problem}` : ''}; preserve pinned standards and existing workspaces; contents omitted`,
      EXIT.precondition,
    )
  }
}
