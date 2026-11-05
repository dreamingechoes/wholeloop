import { describe, expect, it } from 'vitest'
import { event, replay, type StateEvent } from '../../../src/state/events.js'

const ts = '2026-11-01T00:00:00.000Z',
  subject = 'init-12345678',
  other = 'init-87654321',
  run = 'run-0000000000000001'
const created = (id: string) =>
  event(
    id,
    {
      type: 'item.created',
      data: { kind: 'initiative', title: 'Fixture idea', owner: 'Fixture Owner', body: '' },
    },
    ts,
  )
const start = (id = subject, step: 'frame-problem' | 'write-spec' = 'frame-problem', key = run) =>
  event(
    id,
    { type: 'step.started', data: { step, run: key, mode: 'standalone', input: 'Fixture idea' } },
    ts,
  )
const complete = (
  id = subject,
  step: 'frame-problem' | 'write-spec' = 'frame-problem',
  key = run,
) =>
  event(
    id,
    {
      type: 'step.completed',
      data: {
        step,
        run: key,
        artifact: { path: `items/${id}/artifacts/${step}/${key}.md`, content: 'Fixture artifact' },
      },
    },
    ts,
  )

describe('matching earlier step starts during journal replay', () => {
  it.each(['subject', 'step', 'run', 'future', 'skip-only'] as const)(
    'refuses %s mismatch without changing existing matching-start semantics',
    (mode) => {
      const events: StateEvent[] = [created(subject), created(other)]
      if (mode === 'subject') events.push(start(other))
      if (mode === 'step') events.push(start(subject, 'write-spec'))
      if (mode === 'run') events.push(start(subject, 'frame-problem', 'run-0000000000000002'))
      if (mode === 'skip-only')
        events.push(
          event(
            subject,
            { type: 'step.skipped', data: { step: 'frame-problem', run, reason: 'Fixture skip' } },
            ts,
          ),
        )
      events.push(complete())
      if (mode === 'future') events.push(start())
      expect(() => replay(events)).toThrow('matching start')
      expect(replay([created(subject), start(), complete(), complete()]).has(subject)).toBe(true)
    },
  )

  it('does linear event work when completed history grows fourfold', () => {
    const counts: number[] = []
    for (const count of [100, 400]) {
      const events: StateEvent[] = [created(subject)]
      for (let i = 0; i < count; i++) {
        const key = `run-${i.toString(16).padStart(16, '0')}`
        events.push(start(subject, 'frame-problem', key), complete(subject, 'frame-problem', key))
      }
      let reads = 0
      const observed = events.map(
        (entry) =>
          new Proxy(entry, {
            get(target, key, receiver) {
              if (['type', 'subject', 'data'].includes(String(key))) reads++
              return Reflect.get(target, key, receiver)
            },
          }),
      )
      expect(replay(observed).size).toBe(1)
      counts.push(reads)
    }
    expect(counts[1]).toBeLessThan((counts[0] ?? 0) * 5)
  })
})
