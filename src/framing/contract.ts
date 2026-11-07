// Structural checks of a framing document and its outcome; factual truth still needs evidence
// review.
import { stripCode } from '../docs/markdown.js'
import type { Item, StateEvent } from '../state/events.js'

export const FRAME_SECTIONS = [
  'Problem',
  'Who it is for',
  'Evidence and hypothesis',
  'Expected impact',
  'Who validated it',
  'Cost and priority',
  'Stop conditions',
  'Scope hint',
  'Owner',
] as const
const titleKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

export function framingMatches(
  items: readonly Item[],
  events: readonly StateEvent[],
  input?: string,
  from?: string,
  repository?: string,
): Item[] {
  const linked = from
    ? new Set(
        events.flatMap((entry) =>
          entry.type === 'frame.sourced' && entry.data.brief === from ? [entry.subject] : [],
        ),
      )
    : new Set<string>()
  return items.filter(
    (item) =>
      item.kind === 'initiative' &&
      (linked.has(item.id) ||
        Boolean(
          input &&
            (item.repository === repository || !item.repository) &&
            titleKey(item.title) === titleKey(input),
        )),
  )
}

/** Structure can reject unexplained placeholders; factual truth still requires evidence review. */
export function checkFrame(content: string): string[] {
  const problems: string[] = []
  for (const [index, line] of stripCode(content).entries()) {
    if (/^\s*(?:[-*]\s+)?TBD\b/i.test(line) && !/\bTBD:\s*\S.+;\s*who:\s*\S/i.test(line))
      problems.push(
        `Line ${index + 1}: TBD must name what is missing and who can answer: TBD: <missing>; who: <person or role>`,
      )
    if (/^\s*(unknown|tbc|n\/a|to be determined)\s*[.!]?\s*$/i.test(line))
      problems.push(
        `Line ${index + 1}: replace an unexplained unknown with TBD: <missing>; who: <person or role>`,
      )
  }
  return problems
}

export interface FrameOutcome {
  outcome: 'go' | 'dropped' | 'on-hold'
  reason: string
  reopen?: string
}
export function validateFrameOutcome(value: FrameOutcome): void {
  if (!['go', 'dropped', 'on-hold'].includes(value.outcome) || !value.reason.trim())
    throw new Error('A framing outcome needs a valid call and a reason')
  if (value.outcome === 'on-hold' && !value.reopen?.trim())
    throw new Error('An on-hold framing needs a reopening condition')
}
