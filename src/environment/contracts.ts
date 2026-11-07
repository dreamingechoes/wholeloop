// Environment write declarations and their undo recipes, without credential values.
import { validate } from '../config/schema.js'
import type { StateEvent } from '../state/events.js'
import schema from './schemas/declaration-v1.json' with { type: 'json' }

export interface EnvironmentWrite {
  key: string
  resource: string
  effect: string
  undo: { cwd: string; argv: string[] }
  by: string
}
export type EnvironmentEventData = { type: 'env.declared'; data: EnvironmentWrite }
/** Declarations contain identifiers and undo recipes, never credential values. */
export function validEnvironmentData(type: string, data: Record<string, unknown>): boolean {
  if (type !== 'env.declared' || validate(data, schema).length) return false
  const value = data as unknown as EnvironmentWrite
  const fields = [value.resource, value.effect, value.by, value.undo.cwd, ...value.undo.argv]
  return (
    !!value.undo.argv[0]?.trim() &&
    value.undo.argv.length <= 100 &&
    fields.every(
      (field) =>
        field.length <= 4096 &&
        !field.includes('\0') &&
        !/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{40,})\b|[a-z][a-z0-9+.-]*:\/\/[^\s/]+:[^\s/]+@/i.test(
          field,
        ),
    ) &&
    !value.undo.argv.some((arg) =>
      /^(?:--?|\/)(?:password|token|secret|api[-_]?key)(?:=|$)/i.test(arg),
    ) &&
    !fields.some((field) => /(?:password|api[-_]?key|access[-_]?token)\s*=\s*\S+/i.test(field))
  )
}
export function environmentDeclarations(events: readonly StateEvent[]) {
  const declarations = new Map<
    string,
    { subject: string; event: string; at: string; write: EnvironmentWrite }
  >()
  for (const event of events) {
    if (event.type !== 'env.declared') continue
    const key = `${event.subject}/${event.data.key}`
    if (declarations.has(key)) throw new Error('An environment key is immutable within its item')
    declarations.set(key, {
      subject: event.subject,
      event: event.id,
      at: event.ts,
      write: event.data,
    })
  }
  return [...declarations.values()]
}
