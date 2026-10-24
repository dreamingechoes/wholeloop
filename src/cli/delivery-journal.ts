import { resolve } from 'node:path'
import {
  DELIVERY_EVENT_SCHEMA,
  DELIVERY_FACET_SCHEMAS,
  DELIVERY_PAYLOAD_SCHEMAS,
  DELIVERY_STATE_SCHEMA,
  DeliveryJournalError,
} from '../delivery/events.js'
import { DeliveryLifecycle } from '../delivery/lifecycle.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

export function deliveryJournalCommand(
  command: string,
  { options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  const emit = (value: unknown) => io.out(JSON.stringify(value, null, json ? undefined : 2))
  if (command === 'delivery state-schema') {
    emit({
      schema: 'wholeloop/delivery-state-schema@1',
      eventSchema: DELIVERY_EVENT_SCHEMA,
      payloadSchemas: DELIVERY_PAYLOAD_SCHEMAS,
      stateSchema: DELIVERY_STATE_SCHEMA,
      facetSchemas: DELIVERY_FACET_SCHEMAS,
    })
    return EXIT.ok
  }
  const integer = (name: string, fallback: number, minimum: number, maximum: number) => {
    const value = options[name]
    if (value === undefined) return fallback
    if (typeof value !== 'string' || !/^\d{1,16}$/.test(value))
      throw new CliError(`Provide a bounded integer for ${name}`, EXIT.input)
    const number = Number(value)
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum)
      throw new CliError(`Provide a bounded integer for ${name}`, EXIT.input)
    return number
  }
  try {
    const store = options['--store']
    const lifecycle = new DeliveryLifecycle(
      typeof store === 'string' ? resolve(root, store) : undefined,
    )
    const journal = lifecycle.journal
    if (command === 'delivery rebuild') {
      emit({
        schema: 'wholeloop/delivery-rebuild@1',
        ...journal.rebuild(),
        authority: 'not-restored',
        effects: 'not-performed',
      })
      return EXIT.ok
    }
    const run = options['--run']
    if (typeof run !== 'string') throw new CliError('Provide --run <delivery-id>', EXIT.input)
    if (command === 'delivery events') {
      journal.get(run)
      const after = integer('--after', 0, 0, Number.MAX_SAFE_INTEGER)
      const limit = integer('--limit', 100, 1, 1000)
      const matching = journal
        .events()
        .filter((event) => event.run === run && event.sequence > after)
      const events = matching.slice(0, limit)
      emit({
        schema: 'wholeloop/delivery-events@1',
        run,
        events,
        nextCursor: matching.length > events.length ? (events.at(-1)?.sequence ?? null) : null,
      })
      return EXIT.ok
    }
    if (command === 'delivery track') {
      const revision = options['--revision']
      const envelope = options['--envelope']
      const grant = options['--grant']
      if (revision === undefined && typeof envelope !== 'string')
        throw new CliError('Provide --revision <number> or --envelope <digest>', EXIT.input)
      lifecycle.track({
        run,
        ...(revision !== undefined ? { revision: integer('--revision', 1, 1, 9999) } : {}),
        ...(typeof envelope === 'string' ? { envelope } : {}),
        ...(typeof grant === 'string' ? { grant } : {}),
      })
    }
    const state = journal.get(run)
    emit({
      schema: 'wholeloop/delivery-status@1',
      state,
      projectionCache: journal.cacheStatus(state),
      authority: 'not-implied',
      effects: 'not-performed',
    })
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    if (error instanceof DeliveryJournalError) throw new CliError(error.message, EXIT.precondition)
    throw new CliError(
      'Delivery journal failed; preserve the external store; contents omitted',
      EXIT.precondition,
    )
  }
}
