import type { MessageKind, StateEvent } from './events.js'
import type { StateStore } from './store.js'

export interface Message {
  id: string
  ts: string
  thread: string
  to: string
  from: string
  kind: MessageKind
  body: string
}
export interface Mailbox {
  messages: Message[]
  cursors: Record<string, Record<string, string>>
}

export function replayMailbox(events: readonly StateEvent[]): Mailbox {
  const messages: Message[] = []
  const cursors: Record<string, Record<string, string>> = Object.create(null)
  for (const entry of events) {
    if (entry.type === 'msg.sent')
      messages.push({ id: entry.id, ts: entry.ts, thread: entry.subject, ...entry.data })
    if (entry.type === 'msg.read') {
      const { reader, role, through } = entry.data
      const position = messages.findIndex(
        (message) => message.id === through && message.to === role,
      )
      if (position < 0) throw new Error(`Invalid mailbox cursor: ${through}`)
      const readerCursors = cursors[reader] ?? Object.create(null)
      const previous = messages.findIndex((message) => message.id === readerCursors[role])
      if (position < previous) throw new Error('Mailbox cursors cannot move backwards')
      readerCursors[role] = through
      cursors[reader] = readerCursors
    }
  }
  return { messages, cursors }
}

export function unread(events: readonly StateEvent[], role: string, reader = role): Message[] {
  const { messages, cursors } = replayMailbox(events)
  const cursor = cursors[reader]?.[role]
  const position = cursor ? messages.findIndex((message) => message.id === cursor) : -1
  return messages.slice(position + 1).filter((message) => message.to === role)
}

export function send(
  store: StateStore,
  thread: string,
  data: { to: string; from: string; kind: MessageKind; body: string },
): Message {
  return store.transaction((events, append) => {
    append(thread, { type: 'msg.sent', data })
    const message = replayMailbox(events).messages.at(-1)
    if (!message) throw new Error('Message was not recorded')
    return message
  })
}

export function read(store: StateStore, role: string, reader = role, peek = false): Message[] {
  if (peek) return unread(store.events(), role, reader)
  return store.transaction((events, append) => {
    const messages = unread(events, role, reader)
    const last = messages.at(-1)
    if (last) append(last.thread, { type: 'msg.read', data: { reader, role, through: last.id } })
    return messages
  })
}
