import { isDeepStrictEqual } from 'node:util'
import { type Item, replay, type StateEvent } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import type { StateStore } from '../state/store.js'
import {
  type EnvironmentWrite,
  environmentDeclarations,
  validEnvironmentData,
} from './contracts.js'

type EnvironmentEntry = ReturnType<typeof environmentDeclarations>[number]
function environmentGraph(events: readonly StateEvent[]) {
  const parents = new Map<string, string>()
  for (const entry of events)
    if (entry.type === 'item.created' && entry.data.parent)
      parents.set(entry.subject, entry.data.parent)
  return childGraph(parents)
}
function childGraph(parents: ReadonlyMap<string, string>) {
  const children = new Map<string, string[]>()
  for (const [child, parent] of parents) {
    const entries = children.get(parent)
    if (entries) entries.push(child)
    else children.set(parent, [child])
  }
  return { parents, children }
}
function relatedSubjects(graph: ReturnType<typeof environmentGraph>, subject: string) {
  const selected = new Set([subject])
  const pending = [subject]
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    const children = graph.children.get(current)
    if (!children) continue
    for (const child of children) {
      if (selected.has(child)) continue
      selected.add(child)
      pending.push(child)
    }
  }
  let ancestor = graph.parents.get(subject)
  while (ancestor && !selected.has(ancestor)) {
    selected.add(ancestor)
    ancestor = graph.parents.get(ancestor)
  }
  return selected
}

/** Include this subtree and shared ancestor declarations, never unrelated sibling work. */
export function environmentEntries(events: readonly StateEvent[], subject: string) {
  const entries = environmentDeclarations(events)
  if (!entries.length) return entries
  const selected = relatedSubjects(environmentGraph(events), subject)
  return entries.filter((entry) => selected.has(entry.subject))
}

/** Full-store rendering visits each declaration relationship once, in original event order. */
export function environmentProjectionEntries(events: readonly StateEvent[]) {
  const entries = environmentDeclarations(events)
  return entries.length
    ? projectEntries(environmentGraph(events), entries)
    : new Map<string, EnvironmentEntry[]>()
}

/** Rendering consumes already validated declarations and immutable item parents. */
export function renderEnvironmentProjections(
  items: ReadonlyMap<string, Item>,
  entries: readonly EnvironmentEntry[],
) {
  if (!entries.length) return new Map<string, EnvironmentEntry[]>()
  const parents = new Map<string, string>()
  for (const item of items.values()) if (item.parent) parents.set(item.id, item.parent)
  return projectEntries(childGraph(parents), entries)
}
function projectEntries(
  graph: ReturnType<typeof childGraph>,
  entries: readonly EnvironmentEntry[],
) {
  const result = new Map<string, EnvironmentEntry[]>()
  // Ancestor/descendant relatedness is symmetric. Propagate each declaration
  // to its related views, without reconstructing all history for every item.
  for (const entry of entries)
    for (const subject of relatedSubjects(graph, entry.subject)) {
      const selected = result.get(subject)
      if (selected) selected.push(entry)
      else result.set(subject, [entry])
    }
  return result
}
export function environmentReceipt(events: readonly StateEvent[], subject: string): string {
  return renderEnvironmentReceipt(subject, environmentEntries(events, subject))
}
export function renderEnvironmentReceipt(
  subject: string,
  entries: readonly EnvironmentEntry[],
): string {
  return `${
    entries.length
      ? [...entries]
          .reverse()
          .map(
            ({ subject: owner, write }) =>
              `- ${owner}/${write.key}\n  Resource: ${JSON.stringify(write.resource)}\n  Effect: ${JSON.stringify(write.effect)}\n  Declared by: ${JSON.stringify(write.by)}\n  Undo working directory: ${JSON.stringify(write.undo.cwd)}\n  Undo argv: ${JSON.stringify(write.undo.argv)}`,
          )
          .join('\n\n')
      : 'No external writes declared; absence of declarations does not prove there were no effects.'
  }\n\nRecipes are declarations, not observed undo results. No command is executed by this ledger. Current report: ${entries.length ? `items/${subject}/environment.md` : `wl env report --for ${subject}`}.\n`
}
export class EnvironmentLedger {
  constructor(readonly store: StateStore) {}
  declare(subject: string, write: EnvironmentWrite) {
    if (!validEnvironmentData('env.declared', write as unknown as Record<string, unknown>))
      throw new Error(
        'Environment declarations require bounded non-secret fields and an explicit undo argv/cwd',
      )
    const input = { ...write, undo: { ...write.undo, cwd: canonicalPath(write.undo.cwd) } }
    return this.store.transaction((events, append) => {
      const created = events.find(
        (event) => event.subject === subject && event.type === 'item.created',
      )
      const closed = events.findLast(
        (event) =>
          event.subject === subject &&
          (event.type === 'item.closed' || (event.type === 'item.updated' && event.data.status)),
      )
      if (
        !created ||
        closed?.type === 'item.closed' ||
        (closed?.type === 'item.updated' && closed.data.status === 'closed')
      )
        throw new Error('Declare effects against an existing open item')
      const declarations = environmentDeclarations(events)
      const existing = declarations.find(
        (entry) => entry.subject === subject && entry.write.key === input.key,
      )
      if (existing && !isDeepStrictEqual(existing.write, input))
        throw new Error(
          'Environment key already names a different immutable write; choose a new key',
        )
      if (!existing) {
        if (declarations.filter((entry) => entry.subject === subject).length >= 1000)
          throw new Error('Environment ledger exceeds 1000 writes for one item')
        append(subject, { type: 'env.declared', data: input })
      }
      return {
        schema: 'wholeloop/env-declare@1',
        subject,
        declared: !existing,
        write: input,
        executed: false,
        receipt: environmentReceipt(events, subject),
      }
    })
  }
  report(subject: string) {
    const events = this.store.events()
    if (!replay(events).has(subject)) throw new Error(`Unknown item: ${subject}`)
    const entries = environmentEntries(events, subject)
    return {
      schema: 'wholeloop/env-report@1',
      subject,
      entries,
      executed: false,
      receipt: renderEnvironmentReceipt(subject, entries),
    }
  }
}
