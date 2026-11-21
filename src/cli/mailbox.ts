// `wl msg`, `wl handoff` and `wl resume`: durable messages between roles and the resume context
// pack.
import { readFileSync } from 'node:fs'
import { MESSAGE_KINDS, type MessageKind } from '../state/events.js'
import { read, send } from '../state/mailbox.js'
import { contextPack } from '../state/resume.js'
import { StateStore } from '../state/store.js'
import type { parseArguments } from './arguments.js'
import { CliError } from './errors.js'
import { EXIT, type Io } from './io.js'
import { emitCommand } from './presentation.js'

export function mailboxCommand(
  command: string,
  { positional, options }: ReturnType<typeof parseArguments>,
  json: boolean,
  io: Io,
): number {
  const value = (key: string) => (typeof options[key] === 'string' ? options[key] : undefined)
  const required = (key: string) => {
    const result = value(key)
    if (!result) throw new CliError(`Provide ${key}`, EXIT.input)
    return result
  }
  if (positional.length > (command === 'resume' || command === 'handoff' ? 1 : 0))
    throw new CliError(`Too many arguments for ${command}`)
  try {
    const store = new StateStore()
    if (command === 'resume') {
      const role = value('--for') ?? 'conductor'
      emitCommand(
        command,
        contextPack(store.events(), positional[0], role, value('--reader') ?? role),
        io,
        json,
      )
      return EXIT.ok
    }
    let payload: Record<string, unknown>
    if (command === 'msg read') {
      const role = required('--for')
      payload = {
        messages: read(store, role, value('--reader') ?? role, options['--peek'] === true),
      }
    } else {
      const thread = command === 'handoff' ? positional[0] : value('--thread')
      if (!thread) throw new CliError('Provide an existing item id as the thread', EXIT.input)
      const kind = command === 'handoff' ? 'handoff' : required('--kind')
      if (!MESSAGE_KINDS.includes(kind as MessageKind))
        throw new CliError(`Unknown message kind: ${kind}`)
      if (value('--body') && value('--body-file'))
        throw new CliError('Use either --body or --body-file')
      const body = value('--body-file')
        ? readFileSync(value('--body-file') ?? '', 'utf8')
        : required('--body')
      payload = {
        message: send(store, thread, {
          to: required('--to'),
          from: value('--from') ?? 'conductor',
          kind: kind as MessageKind,
          body,
        }),
      }
    }
    emitCommand(
      command,
      { schema: `wholeloop/${command.replaceAll(' ', '-')}@1`, ...payload },
      io,
      json,
    )
    return EXIT.ok
  } catch (error) {
    if (error instanceof CliError) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new CliError(
      message,
      /Unknown item|Missing item|outside git|locked|escapes/.test(message)
        ? EXIT.precondition
        : /No items/.test(message)
          ? EXIT.input
          : EXIT.shape,
    )
  }
}
