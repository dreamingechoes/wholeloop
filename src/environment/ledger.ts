import { isDeepStrictEqual } from 'node:util'
import type { StateEvent } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import type { StateStore } from '../state/store.js'
import {
  type EnvironmentWrite,
  environmentDeclarations,
  validEnvironmentData,
} from './contracts.js'

/** Include this subtree and shared ancestor declarations, never unrelated sibling work. */
export function environmentEntries(events: readonly StateEvent[], subject: string) {
  const parents = new Map(
    events.flatMap((event) =>
      event.type === 'item.created' && event.data.parent
        ? [[event.subject, event.data.parent] as const]
        : [],
    ),
  )
  const selected = new Set([subject])
  for (;;) {
    const before = selected.size
    for (const [child, parent] of parents) if (selected.has(parent)) selected.add(child)
    if (selected.size === before) break
  }
  let ancestor = parents.get(subject)
  while (ancestor && !selected.has(ancestor)) {
    selected.add(ancestor)
    ancestor = parents.get(ancestor)
  }
  return environmentDeclarations(events).filter((entry) => selected.has(entry.subject))
}
export function environmentReceipt(events: readonly StateEvent[], subject: string): string {
  const entries = environmentEntries(events, subject)
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
    this.store.get(subject)
    const events = this.store.events()
    return {
      schema: 'wholeloop/env-report@1',
      subject,
      entries: environmentEntries(events, subject),
      executed: false,
      receipt: environmentReceipt(events, subject),
    }
  }
}
