import { replay, type StateEvent } from '../state/events.js'

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
  return latest.data.blockedBy.filter((id) => items.get(id)?.status !== 'closed')
}

export function buildChildren(events: readonly StateEvent[], subject: string) {
  const items = replay(events)
  const parent = items.get(subject)
  if (parent?.kind === 'scope')
    return [...items.values()].filter(
      (item) => item.parent === subject && item.kind === 'slice' && item.status === 'open',
    )
  if (parent?.kind === 'slice') {
    const latest = [...events]
      .reverse()
      .find((entry) => entry.subject === subject && entry.type === 'slice.defined')
    if (latest?.type === 'slice.defined' && latest.data.parts.length)
      return latest.data.parts.flatMap((id) => {
        const item = items.get(id)
        return item?.status === 'open' ? [item] : []
      })
  }
  return undefined
}
