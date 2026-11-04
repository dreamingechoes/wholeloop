import { describe, expect, it } from 'vitest'
import {
  ATTENTION_REASONS,
  type Attention,
  type HeadlineFacts,
  orderedAttention,
  overviewHeadline,
} from '../../../src/overview/attention.js'

const empty: HeadlineFacts = {
  healthy: true,
  attention: [],
  active: 0,
  waiting: 0,
  ready: 0,
  entities: 0,
  terminal: 0,
}
describe('operator overview precedence', () => {
  it.each([
    { values: {}, expected: 'empty' },
    {
      values: { healthy: false, active: 1, ready: 1, attention: [{ reason: 'human-decision' }] },
      expected: 'unavailable',
    },
    { values: { attention: [{ reason: 'human-decision' }], active: 1 }, expected: 'attention' },
    { values: { attention: [{ reason: 'failed-run' }], active: 1 }, expected: 'blocked' },
    { values: { active: 1, waiting: 1, ready: 1 }, expected: 'running' },
    { values: { waiting: 1, ready: 1 }, expected: 'waiting' },
    { values: { ready: 1 }, expected: 'ready' },
    { values: { entities: 2, terminal: 2 }, expected: 'complete' },
    { values: { entities: 2, terminal: 1 }, expected: 'idle' },
  ] satisfies { values: Partial<HeadlineFacts>; expected: string }[])(
    'chooses $expected from the fixed precedence',
    ({ values, expected }) => {
      expect(overviewHeadline({ ...empty, ...values })).toBe(expected)
    },
  )
  it.each(ATTENTION_REASONS)('classifies %s before routine activity', (reason) => {
    const blocked = [
      'inactive-grant',
      'failed-run',
      'exhausted-run',
      'blocked-run',
      'blocked-dependency',
    ]
    expect(overviewHeadline({ ...empty, attention: [{ reason }], active: 1 })).toBe(
      blocked.includes(reason) ? 'blocked' : 'attention',
    )
  })
  it('orders every attention category before applying a display bound and uses stable typed-ID ties', () => {
    const entries: Attention[] = ATTENTION_REASONS.toReversed().flatMap((reason) =>
      ['b', 'a'].map((id) => ({ id, reason, target: { kind: 'item' as const, id }, next: [] })),
    )
    const original = structuredClone(entries),
      ordered = orderedAttention(entries)
    expect(ordered.map((entry) => entry.reason)).toEqual(
      ATTENTION_REASONS.flatMap((reason) => [reason, reason]),
    )
    expect(
      ordered.filter((entry) => entry.reason === 'human-decision').map((entry) => entry.id),
    ).toEqual(['a', 'b'])
    expect(ordered.slice(0, 1)[0]?.reason).toBe('store-problem')
    expect(entries).toEqual(original)
  })
})
