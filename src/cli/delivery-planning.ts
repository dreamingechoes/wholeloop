// `wl delivery` planning commands: plan schema, envelopes and plan inspection.
import { resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { readSourceFile } from '../delivery/input.js'
import {
  DELIVERY_ENVELOPE_SCHEMA,
  DELIVERY_PLAN_SCHEMA,
  DELIVERY_PLAN_V2_SCHEMA,
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
  const version = options['--schema-version'] ?? '1'
  if (version !== '1' && version !== '2')
    throw new CliError('Provide --schema-version 1 or 2', EXIT.input)
  const expected = `wholeloop/delivery-plan@${version}`
  if (command === 'delivery plan-schema') {
    io.out(
      JSON.stringify(
        {
          schema: `wholeloop/delivery-planning-schema@${version}`,
          planSchema: version === '2' ? DELIVERY_PLAN_V2_SCHEMA : DELIVERY_PLAN_SCHEMA,
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
      const retained = planning.getPlan(run, Number(revision))
      if (retained.plan.schema !== expected)
        throw new CliError('Select the exact plan with --schema-version 1 or 2', EXIT.precondition)
      receipt = retained
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
      // Refuse before preparation: selecting an older wire contract must not
      // persist a newer proposal and then fail to describe it to that caller.
      if (command !== 'delivery envelope' && (!isObject(value) || value.schema !== expected))
        throw new CliError('Select the exact plan with --schema-version 1 or 2', EXIT.precondition)
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
