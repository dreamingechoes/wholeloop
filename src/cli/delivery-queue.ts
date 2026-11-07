// `wl delivery enqueue`: admits planned delivery work to the queue.
import { resolve } from 'node:path'
import type { BrokerRole } from '../delivery/broker.js'
import { DeliveryJournalError } from '../delivery/events.js'
import { DeliveryQueue } from '../delivery/queue.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryQueueCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const run = options['--run'],
    store = options['--store']
  if (typeof run !== 'string') throw new CliError('Provide --run <delivery-id>', EXIT.input)
  try {
    const queue = new DeliveryQueue(typeof store === 'string' ? resolve(root, store) : undefined)
    if (command === 'delivery enqueue') {
      const unit = options['--unit'],
        role = options['--role'],
        cell = options['--cell'],
        priority = options['--priority']
      if (typeof unit !== 'string') throw new CliError('Provide --unit <work-id>', EXIT.input)
      if (
        role !== undefined &&
        (typeof role !== 'string' ||
          !['builder', 'researcher', 'verifier', 'reviewer', 'refuter'].includes(role))
      )
        throw new CliError('Use a supported queue role', EXIT.input)
      if (
        priority !== undefined &&
        (typeof priority !== 'string' ||
          !/^-?\d{1,3}$/.test(priority) ||
          Math.abs(Number(priority)) > 100)
      )
        throw new CliError('Use an integer priority between -100 and 100', EXIT.input)
      queue.enqueue(run, {
        unit,
        ...(typeof role === 'string' ? { role: role as BrokerRole } : {}),
        ...(typeof cell === 'string' ? { cell } : {}),
        ...(typeof priority === 'string' ? { priority: Number(priority) } : {}),
      })
    }
    const state = queue.lifecycle.journal.get(run)
    io.out(
      JSON.stringify(
        {
          schema: 'wholeloop/delivery-queue-status@1',
          run,
          state: state.state,
          plan: state.basis.digest,
          entries: queue.inspect(run),
          workers: 'not-started-by-this-command',
          effects: 'not-performed',
        },
        null,
        json ? undefined : 2,
      ),
    )
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    if (error instanceof DeliveryJournalError) throw new CliError(error.message, EXIT.precondition)
    throw new CliError(
      'Delivery queue failed; inspect the external store and exact basis; contents omitted',
      EXIT.precondition,
    )
  }
}
