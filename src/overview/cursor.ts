import { isObject } from '../config/schema.js'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryEvent } from '../delivery/events.js'
import type { StateEvent } from '../state/events.js'

export interface JournalPosition {
  version: 1
  state: { count: number; tip: string | null; digest: string }
  delivery: { sequence: number; digest: string | null }
}
export class OverviewError extends Error {
  constructor(
    readonly problem: 'invalid-cursor' | 'cursor-diverged' | 'store-busy' | 'store-unreadable',
  ) {
    super(`Overview unavailable: ${problem}; contents omitted`)
  }
}
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const exact = (value: Record<string, unknown>, names: string[]) =>
  Object.keys(value).sort().join(',') === [...names].sort().join(',')

/** Journal prefixes, not projection timestamps or directory enumeration order, identify a read. */
export function journalPosition(
  state: readonly StateEvent[],
  delivery: readonly DeliveryEvent[],
): JournalPosition {
  return {
    version: 1,
    state: { count: state.length, tip: state.at(-1)?.id ?? null, digest: contractDigest(state) },
    delivery: { sequence: delivery.at(-1)?.sequence ?? 0, digest: delivery.at(-1)?.digest ?? null },
  }
}
export function encodeCursor(position: JournalPosition) {
  const canonical = {
    version: position.version,
    state: { count: position.state.count, tip: position.state.tip, digest: position.state.digest },
    delivery: { sequence: position.delivery.sequence, digest: position.delivery.digest },
  }
  return `v1.${Buffer.from(JSON.stringify(canonical)).toString('base64url')}`
}
export function decodeCursor(cursor: string): JournalPosition {
  try {
    if (cursor.length > 1024 || !/^v1\.[A-Za-z0-9_-]+$/.test(cursor)) throw new Error()
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(cursor.slice(3), 'base64url')),
    )
    if (
      !isObject(value) ||
      !exact(value, ['version', 'state', 'delivery']) ||
      value.version !== 1 ||
      !isObject(value.state) ||
      !exact(value.state, ['count', 'tip', 'digest']) ||
      !count(value.state.count) ||
      !sha(value.state.digest) ||
      (value.state.count === 0
        ? value.state.tip !== null
        : typeof value.state.tip !== 'string' || !/^ev-[a-f0-9-]{36}$/.test(value.state.tip)) ||
      !isObject(value.delivery) ||
      !exact(value.delivery, ['sequence', 'digest']) ||
      !count(value.delivery.sequence) ||
      (value.delivery.sequence === 0 ? value.delivery.digest !== null : !sha(value.delivery.digest))
    )
      throw new Error()
    const position = value as unknown as JournalPosition
    if (encodeCursor(position) !== cursor) throw new Error()
    return position
  } catch {
    throw new OverviewError('invalid-cursor')
  }
}
/** Refuse edits, gaps, truncated histories and a cursor from another store before resuming. */
export function cursorPrefix(
  cursor: string,
  state: readonly StateEvent[],
  delivery: readonly DeliveryEvent[],
) {
  const position = decodeCursor(cursor)
  if (
    position.state.count > state.length ||
    position.delivery.sequence > delivery.length ||
    encodeCursor(
      journalPosition(
        state.slice(0, position.state.count),
        delivery.slice(0, position.delivery.sequence),
      ),
    ) !== cursor
  )
    throw new OverviewError('cursor-diverged')
  return position
}
