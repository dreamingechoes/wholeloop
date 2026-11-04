/** Stable core precedence; renderers never rank, infer or approve an action. */
export const ATTENTION_REASONS = [
  'store-problem',
  'ambiguous-effect',
  'unknown-worker',
  'human-decision',
  'item-decision',
  'inactive-grant',
  'failed-run',
  'exhausted-run',
  'blocked-run',
  'paused-run',
  'blocked-dependency',
  'due-checkpoint',
  'unread-mail',
] as const
export type AttentionReason = (typeof ATTENTION_REASONS)[number]
export interface NextCommand {
  argv: (string | { input: string; prefix?: string })[]
  inputs: { name: string; kind: 'person' | 'choice'; values?: string[] }[]
}
export interface Attention {
  id: string
  reason: AttentionReason
  target: { kind: 'store' | 'delivery' | 'item' | 'mail'; id: string }
  next: NextCommand[]
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
export function orderedAttention(entries: readonly Attention[]) {
  return [...entries].sort(
    (a, b) =>
      ATTENTION_REASONS.indexOf(a.reason) - ATTENTION_REASONS.indexOf(b.reason) ||
      compare(a.target.kind, b.target.kind) ||
      compare(a.target.id, b.target.id) ||
      compare(a.id, b.id),
  )
}
export type Headline =
  | 'unavailable'
  | 'attention'
  | 'blocked'
  | 'running'
  | 'waiting'
  | 'ready'
  | 'complete'
  | 'empty'
  | 'idle'
export interface HeadlineFacts {
  healthy: boolean
  attention: readonly Pick<Attention, 'reason'>[]
  active: number
  waiting: number
  ready: number
  entities: number
  terminal: number
}
export function overviewHeadline(facts: HeadlineFacts): Headline {
  if (!facts.healthy) return 'unavailable'
  if (
    facts.attention.some((entry) =>
      [
        'store-problem',
        'ambiguous-effect',
        'unknown-worker',
        'human-decision',
        'item-decision',
      ].includes(entry.reason),
    )
  )
    return 'attention'
  if (
    facts.attention.some((entry) =>
      [
        'inactive-grant',
        'failed-run',
        'exhausted-run',
        'blocked-run',
        'blocked-dependency',
      ].includes(entry.reason),
    )
  )
    return 'blocked'
  if (facts.attention.length) return 'attention'
  if (facts.active) return 'running'
  if (facts.waiting) return 'waiting'
  if (facts.ready) return 'ready'
  if (facts.entities && facts.terminal === facts.entities) return 'complete'
  return facts.entities ? 'idle' : 'empty'
}
