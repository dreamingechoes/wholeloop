import { randomBytes, randomUUID } from 'node:crypto'
import { isObject } from '../config/schema.js'
import { replayMailbox } from './mailbox.js'

export const KINDS = ['initiative', 'scope', 'slice', 'part', 'brief', 'review'] as const
export type ItemKind = (typeof KINDS)[number]
const PREFIX: Record<ItemKind, string> = {
  initiative: 'init',
  scope: 'scope',
  slice: 'slice',
  part: 'part',
  brief: 'brief',
  review: 'review',
}
export const ITEM_ID = /^(init|scope|slice|part|brief|review)-[a-f0-9]{8}$/

export interface ItemInput {
  kind: ItemKind
  title: string
  owner: string
  body: string
  parent?: string
}
export interface Item extends ItemInput {
  id: string
  status: 'open' | 'closed'
  createdAt: string
  updatedAt: string
  notes: { id: string; text: string; ts: string }[]
  links: string[]
}
export type ItemPatch = Partial<Pick<Item, 'title' | 'owner' | 'body' | 'status'>>
export const MESSAGE_KINDS = ['contract', 'handoff', 'status', 'question', 'note'] as const
export type MessageKind = (typeof MESSAGE_KINDS)[number]
export type EventData =
  | { type: 'item.created'; data: ItemInput }
  | { type: 'item.updated'; data: ItemPatch }
  | { type: 'item.closed'; data: Record<string, never> }
  | { type: 'note.added'; data: { text: string } }
  | { type: 'link.added'; data: { url: string } }
  | { type: 'msg.sent'; data: { to: string; from: string; kind: MessageKind; body: string } }
  | { type: 'msg.read'; data: { reader: string; role: string; through: string } }
export type StateEvent = {
  v: 1
  id: string
  ts: string
  actor: { kind: 'person' | 'agent' | 'system'; name: string }
  subject: string
} & EventData

export function itemId(kind: ItemKind): string {
  return `${PREFIX[kind]}-${randomBytes(4).toString('hex')}`
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}
function text(value: unknown, empty = false): value is string {
  return typeof value === 'string' && (empty || value.trim().length > 0)
}
function validData(type: string, data: Record<string, unknown>): boolean {
  switch (type) {
    case 'item.created':
      return (
        keys(data, ['kind', 'title', 'owner', 'body', 'parent']) &&
        KINDS.includes(data.kind as ItemKind) &&
        text(data.title) &&
        text(data.owner) &&
        text(data.body, true) &&
        (data.parent === undefined || (text(data.parent) && ITEM_ID.test(data.parent)))
      )
    case 'item.updated':
      return (
        Object.keys(data).length > 0 &&
        keys(data, ['title', 'owner', 'body', 'status']) &&
        Object.entries(data).every(([key, value]) =>
          key === 'status'
            ? typeof value === 'string' && ['open', 'closed'].includes(value)
            : text(value, key === 'body'),
        )
      )
    case 'item.closed':
      return Object.keys(data).length === 0
    case 'note.added':
      return keys(data, ['text']) && text(data.text)
    case 'link.added': {
      if (!keys(data, ['url']) || !text(data.url)) return false
      try {
        return ['https:', 'http:'].includes(new URL(data.url).protocol)
      } catch {
        return false
      }
    }
    case 'msg.sent':
      return (
        keys(data, ['to', 'from', 'kind', 'body']) &&
        address(data.to) &&
        address(data.from) &&
        MESSAGE_KINDS.includes(data.kind as MessageKind) &&
        text(data.body) &&
        data.body.length <= 32768
      )
    case 'msg.read':
      return (
        keys(data, ['reader', 'role', 'through']) &&
        address(data.reader) &&
        address(data.role) &&
        text(data.through) &&
        /^ev-[a-f0-9-]{36}$/.test(data.through)
      )
    default:
      return false
  }
}

function address(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_.-]{0,127}$/.test(value)
}

export function validateEvent(value: unknown): asserts value is StateEvent {
  if (
    !isObject(value) ||
    !keys(value, ['v', 'id', 'ts', 'actor', 'subject', 'type', 'data']) ||
    value.v !== 1 ||
    !text(value.id) ||
    !/^ev-[a-f0-9-]{36}$/.test(value.id) ||
    !text(value.ts) ||
    !Number.isFinite(Date.parse(value.ts)) ||
    !text(value.subject) ||
    !ITEM_ID.test(value.subject) ||
    !isObject(value.actor) ||
    !keys(value.actor, ['kind', 'name']) ||
    !text(value.actor.kind) ||
    !['person', 'agent', 'system'].includes(value.actor.kind) ||
    !text(value.actor.name) ||
    !text(value.type) ||
    !isObject(value.data) ||
    !validData(value.type, value.data)
  ) {
    throw new Error('Invalid wholeloop/state-event@1 event')
  }
  if (
    value.type === 'item.created' &&
    !String(value.subject).startsWith(`${PREFIX[value.data.kind as ItemKind]}-`)
  )
    throw new Error('Item kind does not match its typed id')
}

export function event(subject: string, data: EventData, ts: string): StateEvent {
  const value = {
    v: 1,
    id: `ev-${randomUUID()}`,
    ts,
    actor: { kind: 'person', name: 'local' },
    subject,
    ...data,
  }
  validateEvent(value)
  return value
}

export function replay(events: readonly StateEvent[]): Map<string, Item> {
  const items = new Map<string, Item>()
  const ids = new Set<string>()
  for (const entry of events) {
    validateEvent(entry)
    if (ids.has(entry.id)) throw new Error(`Duplicate journal event: ${entry.id}`)
    ids.add(entry.id)
    if (entry.type === 'item.created') {
      if (items.has(entry.subject)) throw new Error(`Duplicate item: ${entry.subject}`)
      if (entry.data.parent && !items.has(entry.data.parent))
        throw new Error(`Missing parent: ${entry.data.parent}`)
      items.set(entry.subject, {
        ...entry.data,
        id: entry.subject,
        status: 'open',
        createdAt: entry.ts,
        updatedAt: entry.ts,
        notes: [],
        links: [],
      })
      continue
    }
    const item = items.get(entry.subject)
    if (!item) throw new Error(`Missing item: ${entry.subject}`)
    switch (entry.type) {
      case 'item.updated':
        Object.assign(item, entry.data)
        break
      case 'item.closed':
        item.status = 'closed'
        break
      case 'note.added':
        item.notes.push({ id: entry.id, text: entry.data.text, ts: entry.ts })
        break
      case 'link.added':
        if (!item.links.includes(entry.data.url)) item.links.push(entry.data.url)
        break
    }
    item.updatedAt = entry.ts
  }
  replayMailbox(events)
  return items
}
