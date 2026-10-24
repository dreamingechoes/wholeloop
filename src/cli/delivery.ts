import { resolve } from 'node:path'
import { readSourceFile, SOURCE_REQUEST_SCHEMA, SourceInputError } from '../delivery/input.js'
import { DeliverySources } from '../delivery/source.js'
import type { parseArguments } from './arguments.js'
import { deliveryAuthorityCommand } from './delivery-authority.js'
import { deliveryPlanningCommand } from './delivery-planning.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (
    [
      'delivery authority-schema',
      'delivery authorize',
      'delivery revoke',
      'delivery grant',
    ].includes(command)
  )
    return deliveryAuthorityCommand(command, { options, positional: [] }, root, json, io)
  if (!['delivery source', 'delivery source-schema'].includes(command))
    return deliveryPlanningCommand(command, { options, positional: [] }, root, json, io)
  if (command === 'delivery source-schema') {
    io.out(
      JSON.stringify(
        { schema: 'wholeloop/delivery-source-schema@1', requestSchema: SOURCE_REQUEST_SCHEMA },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  const file = options['--file'],
    boundary = options['--root'],
    store = options['--store']
  if (typeof file !== 'string') throw new CliError('Provide --file <request.json>', EXIT.input)
  const selectedRoot = typeof boundary === 'string' ? resolve(root, boundary) : root
  try {
    let value: unknown
    try {
      value = JSON.parse(readSourceFile(selectedRoot, file, 8 * 1024 * 1024))
    } catch (error) {
      if (error instanceof SourceInputError) throw error
      throw new SourceInputError('invalid-input')
    }
    const snapshot = new DeliverySources(
      typeof store === 'string' ? resolve(root, store) : undefined,
    ).capture(value, selectedRoot)
    const { body: _body, ...source } = snapshot
    const receipt = {
      schema: 'wholeloop/delivery-source-intake@1',
      status: 'stored',
      source,
      problems: [],
      workers: 'not-started',
    }
    io.out(
      json
        ? JSON.stringify(receipt)
        : `Stored delivery source ${source.id}\nRevision: ${source.revision}\nNo worker started; no execution authority granted.`,
    )
    return EXIT.ok
  } catch (error) {
    if (!(error instanceof SourceInputError))
      throw new CliError(
        'Delivery source storage failed; inspect the external store; contents omitted',
        EXIT.precondition,
      )
    const receipt = {
      schema: 'wholeloop/delivery-source-intake@1',
      status: 'missing-input',
      source: null,
      problems: [error.problem],
      workers: 'not-started',
    }
    io.out(json ? JSON.stringify(receipt) : error.message)
    return EXIT.precondition
  }
}
