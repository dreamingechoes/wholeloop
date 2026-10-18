import { FlowEngine } from '../flow/engine.js'
import { ITEM_ID } from '../state/events.js'
import { unread } from '../state/mailbox.js'
import { StateStore } from '../state/store.js'
import { next } from '../utilities/next.js'
import { setup } from '../utilities/setup.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'

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
      if (command === 'next') result = next(engine, positional[0], value('--owner'))
      else {
        const id = positional[0]
        if (id && !ITEM_ID.test(id)) throw new CliError('status expects a typed item ID')
        const items = id ? [store.get(id)] : store.list()
        const messages = unread(
          store.events(),
          value('--for') ?? 'conductor',
          value('--reader') ?? value('--for') ?? 'conductor',
        )
        result = {
          code: EXIT.ok,
          payload: {
            schema: 'wholeloop/status@1',
            items: items.map(({ id, kind, title, owner, status, updatedAt }) => ({
              id,
              kind,
              title,
              owner,
              status,
              updatedAt,
              flow: engine.plan(id),
            })),
            unreadCount: messages.filter((message) => !id || message.thread === id).length,
          },
        }
      }
    }
    io.out(JSON.stringify(result.payload, null, json ? undefined : 2))
    return result.code
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(
      error instanceof Error ? error.message : 'Utility command failed',
      EXIT.precondition,
    )
  }
}
