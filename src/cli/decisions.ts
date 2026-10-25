import { resolve } from 'node:path'
import { DECISION_RUBRIC_SCHEMA, DelegatedDecisionError } from '../decisions/policy.js'
import { DECISION_SCHEMAS, DelegatedDecisions } from '../decisions/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function delegatedDecisionsCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  if (command === 'delivery decision-schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delegated-decision-schema@1',
          contracts: { ...DECISION_SCHEMAS, rubric: DECISION_RUBRIC_SCHEMA },
          executed: false,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  try {
    const store = new DelegatedDecisions(
      typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
    )
    let receipt: unknown,
      code: number = EXIT.ok
    if (command === 'delivery decision-inspect') {
      if (typeof options['--digest'] !== 'string')
        throw new CliError('Provide --digest <sha256>', EXIT.input)
      receipt = store.inspect(options['--digest'])
      if ((receipt as { status: string }).status !== 'current') code = EXIT.precondition
    } else if (command === 'delivery decision-pin') {
      if (typeof options['--grant'] !== 'string')
        throw new CliError('Provide --grant <authorization-id>', EXIT.input)
      receipt = store.pin(options['--grant'])
    } else {
      const run = options['--run'],
        revision = Number(options['--revision']),
        grant = options['--grant']
      if (
        typeof run !== 'string' ||
        typeof grant !== 'string' ||
        !Number.isSafeInteger(revision) ||
        revision < 1
      )
        throw new CliError('Provide --run, --revision and --grant', EXIT.input)
      receipt = store.preflight({ run, revision, grant })
      if ((receipt as { status: string }).status !== 'ready') code = EXIT.precondition
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return code
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      `Delegated decisions unavailable${error instanceof DelegatedDecisionError ? `: ${error.problem}` : ''}; retain original grants and observations; contents omitted`,
      EXIT.precondition,
    )
  }
}
