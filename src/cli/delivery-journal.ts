import { resolve } from 'node:path'
import {
  DELIVERY_EVENT_SCHEMA,
  DELIVERY_FACET_SCHEMAS,
  DELIVERY_PAYLOAD_SCHEMAS,
  DELIVERY_STATE_SCHEMA,
  DeliveryJournalError,
} from '../delivery/events.js'
import { readSourceFile } from '../delivery/input.js'
import { DeliveryLifecycle } from '../delivery/lifecycle.js'
import { DeliveryPlanError } from '../delivery/plan.js'
import { continueDelivery } from '../runner/continuation.js'
import {
  deliveryDiagnostics,
  deliveryReport,
  exportRecoveryBundle,
  importRecoveryBundle,
} from '../runner/operator-report.js'
import { reviseDelivery } from '../runner/revision-impact.js'
import { DeliveryRunnerError } from '../runner/route.js'
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
    const location = typeof store === 'string' ? resolve(root, store) : undefined
    if (command === 'delivery recovery-import') {
      const bundle = options['--bundle'],
        rebind = options['--rebind']
      if (typeof bundle !== 'string') throw new CliError('Provide --bundle <directory>', EXIT.input)
      const bindings: Record<string, string> = {}
      for (const entry of typeof rebind === 'string' ? rebind.split(',') : []) {
        const [id, path] = [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id) || !path || Object.hasOwn(bindings, id))
          throw new CliError('Provide --rebind repository=path pairs', EXIT.input)
        bindings[id] = resolve(root, path)
      }
      emit(
        importRecoveryBundle(
          resolve(root, bundle),
          location ?? lifecycle.journal.files.root,
          bindings,
        ),
      )
      return EXIT.ok
    }
    const run = options['--run']
    if (typeof run !== 'string') throw new CliError('Provide --run <delivery-id>', EXIT.input)
    if (command === 'delivery revise') {
      const file = options['--file']
      if (typeof file !== 'string') throw new CliError('Provide --file <plan.json>', EXIT.input)
      let proposed: unknown
      try {
        proposed = JSON.parse(readSourceFile(root, file, 2 * 1024 * 1024))
      } catch {
        throw new CliError('Provide a readable proposed plan JSON file', EXIT.input)
      }
      const operator = options['--operator'],
        reason = options['--reason'],
        accepted = options['--accept'] === true
      if (accepted && (typeof operator !== 'string' || typeof reason !== 'string'))
        throw new CliError('Accepting a revision needs --operator and --reason', EXIT.input)
      const result = reviseDelivery(
        lifecycle,
        run,
        proposed,
        accepted
          ? {
              operator: String(operator),
              reason: String(reason),
              approveRemovals: options['--approve-removals'] === true,
            }
          : undefined,
      )
      emit({
        schema: 'wholeloop/delivery-revise@1',
        impact: result.impact,
        accepted: result.accepted,
        record: result.accepted ? result.record : null,
      })
      return EXIT.ok
    }
    if (command === 'delivery continue') {
      const value = (name: string, hint: string) => {
        const option = options[name]
        if (typeof option !== 'string' || !option.trim())
          throw new CliError(`Provide ${name} <${hint}>`, EXIT.input)
        return option
      }
      const input = {
          request: value('--request', 'sha256'),
          stage: value('--stage', 'stage-id'),
          unit: value('--unit', 'work-id'),
        },
        accepted = options['--accept'] === true
      if (!/^[a-f0-9]{64}$/.test(input.request))
        throw new CliError('Provide --request <sha256>', EXIT.input)
      const result = continueDelivery(
        lifecycle,
        run,
        input,
        accepted
          ? { operator: value('--operator', 'name'), reason: value('--reason', 'text') }
          : undefined,
      )
      emit({
        schema: 'wholeloop/delivery-continue@1',
        admission: result.admission,
        impact: result.impact,
        accepted: result.accepted,
        record: result.accepted ? result.record : null,
        // The reducer refuses the failed run's grant and any envelope grant here.
        next: result.accepted
          ? [
              `wl delivery authorize --file <operator-request.json> (exact plan ${result.record.digest})`,
              `wl delivery track --run ${run} --revision ${result.record.revision} --grant <new-authorization-id>`,
              'wl delivery runner-prepare --file <continuation-request.json>',
              'wl delivery run --digest <continuation-request-digest>',
            ]
          : [],
      })
      return EXIT.ok
    }
    if (command === 'delivery report') {
      emit(deliveryReport(location, run))
      return EXIT.ok
    }
    if (command === 'delivery diagnostics') {
      emit(deliveryDiagnostics(location, run))
      return EXIT.ok
    }
    if (command === 'delivery recovery-export') {
      const out = options['--out']
      if (typeof out !== 'string') throw new CliError('Provide --out <directory>', EXIT.input)
      // A recovery bundle carries private records; it is never produced implicitly.
      if (options['--include-private'] !== true)
        throw new CliError(
          'A recovery bundle holds private records; pass --include-private to export it',
          EXIT.input,
        )
      emit({
        schema: 'wholeloop/delivery-recovery-export@1',
        run,
        ...exportRecoveryBundle(lifecycle.journal.files.root, run, resolve(root, out)),
        private: true,
        authority: 'not-restored',
      })
      return EXIT.ok
    }
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
    if (
      error instanceof DeliveryJournalError ||
      error instanceof DeliveryRunnerError ||
      error instanceof DeliveryPlanError
    )
      throw new CliError(error.message, EXIT.precondition)
    throw new CliError(
      'Delivery journal failed; preserve the external store; contents omitted',
      EXIT.precondition,
    )
  }
}
