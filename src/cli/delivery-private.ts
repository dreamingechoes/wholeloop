// `wl delivery private-*`: private acceptance definitions, plans and sensitivity.
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { privateEvaluatorSource } from '../acceptance/docker-private.js'
import { MUTATION_COUNTER_SCHEMA } from '../acceptance/mutation.js'
import {
  PRIVATE_ACCEPTANCE_SCHEMA,
  PRIVATE_CASE_INPUT_SCHEMA,
} from '../acceptance/private-input.js'
import { PrivateAcceptance } from '../acceptance/private-plan.js'
import observationSchema from '../acceptance/schemas/private-observation-v1.json' with {
  type: 'json',
}
import {
  acceptanceSensitivity,
  SENSITIVITY_REQUEST_SCHEMA,
  SENSITIVITY_SCHEMA,
} from '../acceptance/sensitivity.js'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { readSourceFile } from '../delivery/input.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

type Options = ReturnType<typeof parseArguments>['options']
function required(options: Options, name: string) {
  const value = options[name]
  if (typeof value !== 'string') throw new CliError(`Provide ${name}`, EXIT.input)
  return value
}
function context(options: Options, root: string) {
  return {
    acceptance: new DeliveryAcceptance(
      typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
    ),
    boundary: typeof options['--root'] === 'string' ? resolve(root, options['--root']) : root,
  }
}
function failure(error: unknown): never {
  if (error instanceof CliError) throw error
  throw new CliError(
    'Private acceptance unavailable; inspect pinned definitions and observed owned evidence; contents omitted',
    EXIT.precondition,
  )
}
export function deliveryPrivateCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  try {
    let receipt: unknown
    if (command === 'delivery private-schema')
      receipt = {
        schema: 'wholeloop/private-acceptance-schema@1',
        contracts: {
          plan: PRIVATE_ACCEPTANCE_SCHEMA,
          input: PRIVATE_CASE_INPUT_SCHEMA,
          observation: observationSchema,
          sensitivityRequest: SENSITIVITY_REQUEST_SCHEMA,
          sensitivity: SENSITIVITY_SCHEMA,
          mutation: MUTATION_COUNTER_SCHEMA,
        },
        runner: createHash('sha256').update(privateEvaluatorSource()).digest('hex'),
        executed: false,
      }
    else {
      const { acceptance, boundary } = context(options, root),
        store = new PrivateAcceptance(acceptance)
      const result =
        command === 'delivery private-plan'
          ? store.prepare(
              JSON.parse(readSourceFile(boundary, required(options, '--file'), 1024 * 1024)),
            )
          : store.get(required(options, '--digest'))
      receipt = {
        schema:
          command === 'delivery private-plan'
            ? 'wholeloop/private-acceptance-prepared@1'
            : 'wholeloop/private-acceptance-inspection@1',
        digest: result.digest,
        run: result.plan.run,
        revision: result.plan.revision,
        plan: result.plan.plan,
        source: result.plan.source,
        case: result.plan.case,
        requests: result.plan.behavior.steps?.length ?? 0,
        assertions: result.plan.assertions.length,
        privacy: 'controller-only',
        executed: false,
        acceptance: 'not-established',
        publication: 'not-performed',
      }
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return EXIT.ok
  } catch (error) {
    return failure(error)
  }
}
export async function deliveryPrivateAsyncCommand(
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  try {
    const { acceptance, boundary } = context(options, root),
      request = JSON.parse(readSourceFile(boundary, required(options, '--file'), 65536))
    const receipt = await acceptanceSensitivity(acceptance, request)
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return ['proven', 'not-applicable'].includes(receipt.status) ? EXIT.ok : EXIT.precondition
  } catch (error) {
    return failure(error)
  }
}
