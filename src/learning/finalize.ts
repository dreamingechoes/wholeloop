// Closes a learning scope once its decisions are complete, never on merge alone.
import type { EventData, StateEvent } from '../state/events.js'
import { learningRuns } from './contracts.js'

/** Closing is derived from completed decisions, never from merge or a manually closed sibling. */
export function closeLearningScope(
  events: readonly StateEvent[],
  append: (subject: string, data: EventData) => void,
  subject: string,
) {
  const run = learningRuns(events)
    .filter((entry) => entry.subject === subject)
    .at(-1)
  if (!run?.complete) throw new Error('Complete the learning decision before closing its scope')
  const created = events.find((event) => event.subject === subject && event.type === 'item.created')
  append(subject, { type: 'item.closed', data: {} })
  if (created?.type !== 'item.created' || !created.data.parent) return
  const parent = created.data.parent
  const parentItem = events.find(
    (event) => event.subject === parent && event.type === 'item.created',
  )
  if (parentItem?.type !== 'item.created' || parentItem.data.kind !== 'initiative') return
  const scopes = events
    .filter(
      (event) =>
        event.type === 'item.created' &&
        event.data.kind === 'scope' &&
        event.data.parent === parent,
    )
    .map((event) => event.subject)
  const done = new Set(
    learningRuns(events)
      .filter((entry) => entry.complete)
      .map((entry) => entry.subject),
  )
  // Replay enforces reopening too; a reopened sibling is no longer eligible for automatic closure.
  const reopened = new Set<string>()
  for (const event of events) {
    if (event.type === 'item.updated' && event.data.status === 'open') reopened.add(event.subject)
    if (event.type === 'step.completed' && event.data.step === 'decide-next')
      reopened.delete(event.subject)
  }
  if (scopes.every((id) => done.has(id) && !reopened.has(id)))
    append(parent, { type: 'item.closed', data: {} })
}
