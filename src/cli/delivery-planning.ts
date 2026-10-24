import { resolve } from 'node:path'
import { readSourceFile } from '../delivery/input.js'
import {
  DELIVERY_ENVELOPE_SCHEMA,
  DELIVERY_PLAN_SCHEMA,
  DeliveryPlanError,
} from '../delivery/plan.js'
import { DeliveryPlanning } from '../delivery/planning-store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryPlanningCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (command === 'delivery plan-schema') {
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delivery-planning-schema@1',
          planSchema: DELIVERY_PLAN_SCHEMA,
          envelopeSchema: DELIVERY_ENVELOPE_SCHEMA,
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  }
  const selectedStore = options['--store'],
    selectedRoot = options['--root'],
    file = options['--file']
  try {
    const planning = new DeliveryPlanning(
      typeof selectedStore === 'string' ? resolve(root, selectedStore) : undefined,
    )
    let receipt: unknown
    if (command === 'delivery inspect-plan') {
      const run = options['--run'],
        revision = options['--revision']
      if (
        typeof run !== 'string' ||
        typeof revision !== 'string' ||
        !/^[1-9]\d{0,3}$/.test(revision)
      )
        throw new CliError('Provide --run <delivery-id> --revision <number>', EXIT.input)
      receipt = planning.getPlan(run, Number(revision))
    } else {
      if (typeof file !== 'string') throw new CliError('Provide --file <proposal.json>', EXIT.input)
      let value: unknown
      try {
        value = JSON.parse(
          readSourceFile(
            typeof selectedRoot === 'string' ? resolve(root, selectedRoot) : root,
            file,
            8 * 1024 * 1024,
          ),
        )
      } catch {
        throw new CliError(
          'Provide one bounded regular UTF-8 proposal file under the selected root; contents omitted',
        )
      }
      receipt =
        command === 'delivery envelope'
          ? {
              schema: 'wholeloop/delivery-envelope-prepared@1',
              ...planning.prepareEnvelope(value),
              authority: 'not-granted',
              workers: 'not-started',
            }
          : planning.preparePlan(value)
    }
    io.out(JSON.stringify(receipt, null, json ? undefined : 2))
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    if (error instanceof DeliveryPlanError) throw new CliError(error.message, EXIT.precondition)
    throw new CliError(
      'Delivery planning failed; inspect the external store and explicit repository bindings; contents omitted',
      EXIT.precondition,
    )
  }
}
