// `wl delivery grant` and `revoke`: operator grants for autonomous delivery.
import { resolve } from 'node:path'
import {
  AUTHORIZATION_REQUEST_SCHEMA,
  DeliveryAuthority,
  DeliveryAuthorityError,
  REVOCATION_REQUEST_SCHEMA,
} from '../delivery/authority.js'
import { BROKER_RECEIPT_SCHEMA, BROKER_REQUEST_SCHEMA } from '../delivery/broker.js'
import { readSourceFile } from '../delivery/input.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryAuthorityCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (command === 'delivery authority-schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delivery-authority-schema@1',
          authorizationSchema: AUTHORIZATION_REQUEST_SCHEMA,
          revocationSchema: REVOCATION_REQUEST_SCHEMA,
          brokerSchema: BROKER_REQUEST_SCHEMA,
          brokerReceiptSchema: BROKER_RECEIPT_SCHEMA,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  const store = options['--store'],
    boundary = options['--root'],
    file = options['--file'],
    id = options['--id']
  try {
    const authority = new DeliveryAuthority(
      typeof store === 'string' ? resolve(root, store) : undefined,
    )
    let receipt: ReturnType<DeliveryAuthority['inspect']>
    if (command === 'delivery grant') {
      if (typeof id !== 'string') throw new CliError('Provide --id <authorization-id>', EXIT.input)
      receipt = authority.inspect(id)
    } else {
      if (typeof file !== 'string')
        throw new CliError('Provide --file <operator-request.json>', EXIT.input)
      let value: unknown
      try {
        value = JSON.parse(
          readSourceFile(typeof boundary === 'string' ? resolve(root, boundary) : root, file),
        )
      } catch {
        throw new CliError('Use one bounded regular UTF-8 operator request; contents omitted')
      }
      receipt = command === 'delivery revoke' ? authority.revoke(value) : authority.authorize(value)
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    if (error instanceof DeliveryAuthorityError)
      throw new CliError(error.message, EXIT.precondition)
    throw new CliError(
      'Delivery authorization failed; inspect the explicit basis and private control store; contents omitted',
      EXIT.precondition,
    )
  }
}
