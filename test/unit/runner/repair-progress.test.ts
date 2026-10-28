import { describe, expect, it } from 'vitest'
import type { BudgetPayload, BudgetProgress } from '../../../src/delivery/budget-events.js'
import type { DeliveryEvent } from '../../../src/delivery/events.js'
import { runnerRepairStreak } from '../../../src/runner/repair-progress.js'

type Entry = Pick<DeliveryEvent, 'run' | 'payload'>
const fingerprint = 'f'.repeat(64),
  basis = 'a'.repeat(64)
function failure(
  key: string,
  candidate: string,
  overrides: { role?: string; finding?: string; run?: string } = {},
): Entry {
  const payload: BudgetPayload = {
    schema: 'wholeloop/delivery-budget-event@1',
    basis,
    action: 'failure',
    failure: {
      key,
      role: overrides.role ?? 'verification',
      category: 'failed-behavior',
      candidate,
      findings: [overrides.finding ?? fingerprint],
      evidence: 'e'.repeat(64),
      provenance: 'host-observed',
    },
  }
  return { run: overrides.run ?? 'run', payload }
}
function progress(
  key: string,
  digest = 'd'.repeat(64),
  kind: BudgetProgress['kind'] = 'observed-behavior',
  provenance: BudgetProgress['provenance'] = 'host-observed',
  run = 'run',
): Entry {
  return {
    run,
    payload: {
      schema: 'wholeloop/delivery-budget-event@1',
      basis,
      action: 'progress',
      progress: { key, kind, digest, provenance, evidence: 'e'.repeat(64) },
    },
  }
}
const first = failure('first', '1'.repeat(64)),
  second = failure('second', '2'.repeat(64))
describe('repair progress follows observed improvement across candidate changes', () => {
  it.each([
    { name: 'changed commit does not reset the same failure', events: [first, second], count: 2 },
    { name: 'duplicate failure key does not increment', events: [first, first], count: 1 },
    {
      name: 'other finding cannot hide a repeated issue',
      events: [first, failure('other', basis, { finding: 'b'.repeat(64) }), second],
      count: 2,
    },
    {
      name: 'other role does not count',
      events: [first, failure('other', basis, { role: 'review' }), second],
      count: 2,
    },
    {
      name: 'other run neither counts nor resets',
      events: [
        first,
        progress('other', basis, 'observed-behavior', 'host-observed', 'another'),
        failure('other', basis, { run: 'another' }),
        second,
      ],
      count: 2,
    },
    {
      name: 'observed behavior resets the repetition',
      events: [first, progress('actual'), second],
      count: 1,
    },
    {
      name: 'resolved finding resets the repetition',
      events: [first, progress('actual', basis, 'resolved-finding'), second],
      count: 1,
    },
    {
      name: 'accepted candidate resets the repetition',
      events: [first, progress('actual', basis, 'accepted-candidate'), second],
      count: 1,
    },
    {
      name: 'fixture claims do not reset',
      events: [first, progress('fixture', basis, 'observed-behavior', 'fixture'), second],
      count: 2,
    },
    {
      name: 'new artifact is not repair improvement',
      events: [first, progress('artifact', basis, 'validated-artifact'), second],
      count: 2,
    },
    {
      name: 'effect bookkeeping is not repair improvement',
      events: [first, progress('effect', basis, 'reconciled-effect'), second],
      count: 2,
    },
    {
      name: 'duplicate observed fact cannot reset twice',
      events: [progress('initial'), first, progress('duplicate'), second],
      count: 2,
    },
    {
      name: 'a different observed fact resets',
      events: [progress('initial'), first, progress('new', basis), second],
      count: 1,
    },
  ])('$name', ({ events, count }) => {
    expect(runnerRepairStreak(events, 'run', 'verification', fingerprint)).toBe(count)
  })
})
