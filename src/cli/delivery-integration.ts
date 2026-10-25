import { resolve } from 'node:path'
import { readSourceFile } from '../delivery/input.js'
import { INTEGRATION_REQUEST_SCHEMA, IntegrationError } from '../integration/contracts.js'
import {
  INTEGRATION_CANDIDATE_SCHEMA,
  INTEGRATION_RECORD_SCHEMA,
  IntegrationCandidates,
} from '../integration/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

function required(options: ReturnType<typeof parseArguments>['options'], name: string) {
  const value = options[name]
  if (typeof value !== 'string') throw new CliError(`Provide ${name}`, EXIT.input)
  return value
}
export function deliveryIntegrationCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
) {
  try {
    let receipt: unknown,
      code: number = EXIT.ok
    if (command === 'delivery integration-schema')
      receipt = {
        schema: 'wholeloop/integration-schema@1',
        contracts: {
          request: INTEGRATION_REQUEST_SCHEMA,
          candidate: INTEGRATION_CANDIDATE_SCHEMA,
          record: INTEGRATION_RECORD_SCHEMA,
        },
        executed: false,
      }
    else {
      const store = new IntegrationCandidates(
        typeof options['--store'] === 'string' ? resolve(root, options['--store']) : undefined,
      )
      if (command === 'delivery integration-candidate') {
        try {
          const boundary =
            typeof options['--root'] === 'string' ? resolve(root, options['--root']) : root
          const record = store.prepare(
            JSON.parse(readSourceFile(boundary, required(options, '--file'), 2 * 1024 * 1024)),
          )
          receipt = {
            schema: 'wholeloop/integration-prepared@1',
            status: 'prepared',
            reason: 'complete-committed-candidate-observed',
            record,
            authority: 'not-granted',
            executed: false,
          }
        } catch (error) {
          if (error instanceof CliError) throw error
          receipt = {
            schema: 'wholeloop/integration-prepared@1',
            status: 'blocked',
            reason:
              error instanceof IntegrationError ? error.problem : 'invalid-or-unavailable-inputs',
            authority: 'not-granted',
            executed: false,
          }
          code = EXIT.precondition
        }
      } else if (command === 'delivery integration-compare') {
        const before = required(options, '--before'),
          after = required(options, '--after')
        receipt = {
          schema: 'wholeloop/integration-comparison@1',
          before,
          after,
          ...store.compare(before, after),
          executed: false,
        }
      } else {
        const inspected = store.inspect(required(options, '--digest'))
        receipt = {
          schema: 'wholeloop/integration-inspection@1',
          record: store.get(inspected.digest),
          status: inspected.status,
          reason: inspected.reason,
          authority: inspected.authority,
          executed: false,
        }
        if (inspected.status !== 'current') code = EXIT.precondition
      }
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return code
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      'Integration unavailable; inspect the approved basis, committed vectors and protected inputs; contents omitted',
      EXIT.precondition,
    )
  }
}
