// Keeps read-only status separate from the flow and preference actions of next and setup.
import { isObject } from '../config/schema.js'
import { statusDisplay } from '../display/status.js'
import { FlowEngine } from '../flow/engine.js'
import { configuredCheckpoints } from '../impact/schedule.js'
import { SharingWorkflow } from '../sharing/workflow.js'
import { ITEM_ID, replay } from '../state/events.js'
import { unread } from '../state/mailbox.js'
import { StateStore } from '../state/store.js'
import { statusItems } from '../status/project.js'
import { next } from '../utilities/next.js'
import { setup } from '../utilities/setup.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { hasJsonInput, jsonInput } from './json-input.js'
import { emitCommand } from './presentation.js'
import { sharedObservation, sharedRead } from './sharing-read.js'
import { statusSummary } from './summary.js'

export function utilityCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  root: string,
  json: boolean,
  io: Io,
): number {
  if (positional.length > (command === 'setup' ? 0 : 1))
    throw new CliError(`Too many arguments for ${command}`)
  const value = (name: string) => (typeof options[name] === 'string' ? options[name] : undefined)
  try {
    let result: { code: number; payload: unknown }
    if (command === 'setup')
      result = setup(root, {
        ...(value('--scope') ? { scope: value('--scope') as string } : {}),
        ...(value('--profile') ? { profile: value('--profile') as string } : {}),
        ...(value('--docs') ? { docs: value('--docs') as string } : {}),
        ...(value('--tracker') ? { tracker: value('--tracker') as string } : {}),
      })
    else {
      const store = new StateStore()
      const engine = new FlowEngine(store, root)
      if (command === 'next') {
        const input = positional[0]
        if (hasJsonInput(options)) {
          if (!input || !/^https?:\/\//i.test(input))
            throw new CliError('next --file requires an HTTPS work URL')
          const provider = value('--provider')
          const kind = value('--kind')
          if (!provider || (kind !== 'docs' && kind !== 'tracker'))
            throw new CliError('Provide --provider and --kind docs|tracker')
          const adopted = new SharingWorkflow(engine).importRead(
            input,
            options['--stdin'] === true
              ? sharedObservation(
                  jsonInput(options, { limit: 2 * 1024 * 1024 }),
                  input,
                  provider,
                  kind,
                )
              : sharedRead(value('--file') ?? '', input, provider, kind),
            {
              provider,
              kind,
              ...(value('--owner') ? { owner: value('--owner') as string } : {}),
              ...(value('--title') ? { title: value('--title') as string } : {}),
            },
          )
          result =
            adopted.status === 'question'
              ? {
                  code: EXIT.input,
                  payload: { ...adopted, schema: 'wholeloop/next@1', action: null },
                }
              : next(engine, adopted.subject, value('--owner'))
        } else result = next(engine, input, value('--owner'))
      } else {
        const id = positional[0]
        if (id && !ITEM_ID.test(id)) throw new CliError('status expects a typed item ID')
        const events = store.events(),
          items = [...replay(events).values()].sort((a, b) => a.id.localeCompare(b.id)),
          configuration = items.length ? engine.config() : {},
          decisions = isObject(configuration.flow) ? configuration.flow.decisions : undefined,
          projected = statusItems(items, events, {
            additions:
              isObject(decisions) && Array.isArray(decisions.add)
                ? decisions.add.filter((entry): entry is string => typeof entry === 'string')
                : [],
            checkpoints: configuredCheckpoints(configuration),
            at: new Date().toISOString(),
          }),
          selected = id ? projected.filter((item) => item.id === id) : projected,
          messages = unread(
            events,
            value('--for') ?? 'conductor',
            value('--reader') ?? value('--for') ?? 'conductor',
          ),
          payload = {
            schema: 'wholeloop/status@1',
            items: selected,
            unreadCount: messages.filter((message) => !id || message.thread === id).length,
          }
        if (id && !selected.length) throw new Error(`Unknown item: ${id}`)
        result = {
          code: EXIT.ok,
          payload: json
            ? { ...payload, display: statusDisplay(payload, { all: options['--all'] === true }) }
            : payload,
        }
      }
    }
    if (!json && command === 'status')
      io.out(
        statusSummary(result.payload as Parameters<typeof statusSummary>[0], {
          ...io.terminal,
          all: options['--all'] === true,
        }),
      )
    else emitCommand(command, result.payload, io, json)
    return result.code
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Utility command failed',
      EXIT.precondition,
    )
  }
}
