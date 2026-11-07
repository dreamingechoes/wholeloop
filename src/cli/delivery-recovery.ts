// `wl delivery` recovery commands: checkpoints, effects and writer-lock status and repair.
import { resolve } from 'node:path'
import {
  CHECKPOINT_MANIFEST_SCHEMA,
  CHECKPOINT_REQUEST_SCHEMA,
  DeliveryCheckpoints,
} from '../delivery/checkpoints.js'
import { DeliveryEffects } from '../delivery/effects.js'
import { DeliveryJournalError } from '../delivery/events.js'
import { readSourceFile } from '../delivery/input.js'
import { DeliveryLockRecovery } from '../delivery/lock-recovery.js'
import { DeliveryRecovery } from '../delivery/recovery.js'
import intentSchema from '../delivery/schemas/effect-intent-v1.json' with { type: 'json' }
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryRecoveryCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const emit = (value: unknown) => io.out(JSON.stringify(value, null, json ? undefined : 2))
  if (command === 'delivery recovery-schema') {
    emit({
      schema: 'wholeloop/delivery-recovery-schema@1',
      checkpointRequestSchema: CHECKPOINT_REQUEST_SCHEMA,
      checkpointManifestSchema: CHECKPOINT_MANIFEST_SCHEMA,
      effectIntentSchema: intentSchema,
    })
    return EXIT.ok
  }
  try {
    const store = options['--store'],
      selected = typeof store === 'string' ? resolve(root, store) : undefined
    if (['delivery lock-status', 'delivery repair-lock'].includes(command)) {
      const recovery = new DeliveryLockRecovery(selected)
      let repair: ReturnType<DeliveryLockRecovery['repair']> | null = null
      if (command === 'delivery repair-lock') {
        const digest = options['--owner-digest']
        if (typeof digest !== 'string')
          throw new CliError('Provide the exact --owner-digest from lock-status', EXIT.input)
        repair = recovery.repair(digest)
      }
      emit({
        schema: 'wholeloop/delivery-lock-status@1',
        inspection: recovery.inspect(),
        repair,
        processes: 'not-signalled',
        authority: 'not-restored',
      })
      return EXIT.ok
    }
    const run = options['--run']
    if (typeof run !== 'string') throw new CliError('Provide --run <delivery-id>', EXIT.input)
    if (command === 'delivery effects') {
      emit({
        schema: 'wholeloop/delivery-effects-status@1',
        run,
        records: new DeliveryEffects(selected).inspect(run),
        effects: 'not-invoked',
        observation: 'retained-local-records',
      })
      return EXIT.ok
    }
    const checkpoints = new DeliveryCheckpoints(selected)
    if (command === 'delivery checkpoint') {
      const file = options['--file'],
        boundary = options['--root']
      if (typeof file !== 'string')
        throw new CliError('Provide --file <checkpoint.json>', EXIT.input)
      let value: unknown
      try {
        value = JSON.parse(
          readSourceFile(typeof boundary === 'string' ? resolve(root, boundary) : root, file),
        )
      } catch {
        throw new CliError(
          'Provide one bounded UTF-8 checkpoint request; contents omitted',
          EXIT.input,
        )
      }
      checkpoints.capture(run, value)
    }
    emit({
      schema: 'wholeloop/delivery-checkpoints-status@1',
      run,
      checkpoints: checkpoints.inspect(run),
      authority: 'not-implied',
      effects: 'not-invoked',
    })
    return EXIT.ok
  } catch (error) {
    return fail(error)
  }
}

export async function deliveryRecoverCommand(
  { options, positional }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): Promise<number> {
  if (positional.length) throw new CliError('Unexpected argument for delivery recover', EXIT.input)
  const run = options['--run'],
    store = options['--store']
  if (typeof run !== 'string') throw new CliError('Provide --run <delivery-id>', EXIT.input)
  try {
    const result = await new DeliveryRecovery(
      typeof store === 'string' ? resolve(root, store) : undefined,
    ).recover(run, { resume: options['--resume'] === true })
    io.out(
      JSON.stringify(
        { schema: 'wholeloop/delivery-recovery-result@1', ...result },
        null,
        json ? undefined : 2,
      ),
    )
    return result.ready ? EXIT.ok : EXIT.precondition
  } catch (error) {
    return fail(error)
  }
}
function fail(error: unknown): never {
  if (error instanceof CliError) throw error
  if (error instanceof DeliveryJournalError) throw new CliError(error.message, EXIT.precondition)
  throw new CliError(
    'Delivery recovery refused; retain the external store and inspect exact inputs/ownership; contents omitted',
    EXIT.precondition,
  )
}
