import { type Item, replay, type StateEvent } from '../state/events.js'

/** Green build receipts unblock delivery without closing items still awaiting PRs. */
export function buildReady(
  events: readonly StateEvent[],
  subject: string,
  items: ReadonlyMap<string, Item> = replay(events),
  seen = new Set<string>(),
): boolean {
  if (seen.has(subject)) throw new Error('Build dependency cycle')
  if (items.get(subject)?.status === 'closed') return true
  seen = new Set([...seen, subject])
  const latest = [...events]
    .reverse()
    .find(
      (entry) =>
        entry.subject === subject &&
        ['step.started', 'step.completed'].includes(entry.type) &&
        'step' in entry.data &&
        entry.data.step === 'build-slice',
    )
  if (latest?.type === 'step.completed') return true
  if (latest?.type === 'step.started') return false
  const definition = [...events]
    .reverse()
    .find((entry) => entry.subject === subject && entry.type === 'slice.defined')
  return (
    definition?.type === 'slice.defined' &&
    !!definition.data.parts.length &&
    definition.data.parts.every((id) => buildReady(events, id, items, seen))
  )
}

export function blockingDependencies(events: readonly StateEvent[], subject: string): string[] {
  const latest = [...events]
    .reverse()
    .find(
      (entry) =>
        entry.subject === subject &&
        (entry.type === 'slice.defined' || entry.type === 'part.defined'),
    )
  if (latest?.type !== 'slice.defined' && latest?.type !== 'part.defined') return []
  const items = replay(events)
  return latest.data.blockedBy.filter((id) => !buildReady(events, id, items))
}

export function buildChildren(events: readonly StateEvent[], subject: string) {
  const items = replay(events)
  const parent = items.get(subject)
  if (parent?.kind === 'scope')
    return [...items.values()].filter(
      (item) =>
        item.parent === subject &&
        item.kind === 'slice' &&
        item.status === 'open' &&
        !buildReady(events, item.id, items),
    )
  if (parent?.kind === 'slice') {
    const latest = [...events]
      .reverse()
      .find((entry) => entry.subject === subject && entry.type === 'slice.defined')
    if (latest?.type === 'slice.defined' && latest.data.parts.length)
      return latest.data.parts.flatMap((id) => {
        const item = items.get(id)
        return item?.status === 'open' && !buildReady(events, id, items) ? [item] : []
      })
  }
  return undefined
}
