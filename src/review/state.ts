import type { StateEvent } from '../state/events.js'
import type { ReviewInput } from './contracts.js'

/** Inputs precede observations and are immutable even when a host resumes mid-round. */
export function reviewInputs(events: readonly StateEvent[]) {
  const inputs = new Map<string, { subject: string; input: ReviewInput }>()
  for (const event of events) {
    if (event.type !== 'review.input') continue
    const input = event.data
    const key = `${input.run}/${input.round}`
    const index = events.indexOf(event)
    const planned = events
      .slice(0, index)
      .findLast(
        (entry) =>
          entry.type === 'gate.planned' &&
          entry.data.plan.run === input.run &&
          entry.data.plan.round === input.round &&
          entry.subject === event.subject,
      )
    const previous = inputs.get(`${input.run}/${input.round - 1}`)
    if (
      inputs.has(key) ||
      planned?.type !== 'gate.planned' ||
      planned.data.plan.gate !== 'review' ||
      events
        .slice(0, index)
        .some(
          (entry) =>
            entry.type.startsWith('gate.') &&
            'run' in entry.data &&
            entry.data.run === input.run &&
            'round' in entry.data &&
            entry.data.round === input.round,
        ) ||
      (input.round > 1 &&
        (!previous || JSON.stringify(previous.input.rubric) !== JSON.stringify(input.rubric)))
    )
      throw new Error('Review input needs one prior review plan, pinned rubric and no observations')
    inputs.set(key, { subject: event.subject, input })
  }
  return [...inputs.values()]
}
