import { readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { journalLayout } from '../../../src/delivery/journal-layout.js'
import { DeliveryLifecycle } from '../../../src/delivery/lifecycle.js'
import { deliveryReplay } from '../../../src/delivery/reducer.js'
import { authorization, fixture } from '../../support/delivery.js'

// Count the journal's actual replay constructor, preserving its full behavior.
vi.mock('../../../src/delivery/reducer.js', async (original) => {
  const reducer = await original<typeof import('../../../src/delivery/reducer.js')>()
  return { ...reducer, deliveryReplay: vi.fn(reducer.deliveryReplay) }
})

const at = '2026-10-24T10:00:00.000Z'
const tracked = (context: Parameters<Parameters<typeof fixture>[0]>[0]) => {
  const prepared = context.planning.preparePlan(context.plan),
    lifecycle = new DeliveryLifecycle(context.planning.sources.files.root, () => at),
    issued = lifecycle.authority.authorize(authorization(context.plan, prepared.digest))
  return {
    lifecycle,
    original: lifecycle.track({ run: context.plan.run, revision: 1, grant: issued.grant.id }),
  }
}

describe('journal replay reuse bound to identical current segment bytes (RUN-02)', () => {
  it('reuses owned committed facts but replays after current input bytes change', () =>
    fixture((context) => {
      const { lifecycle, original } = tracked(context),
        replays = vi.mocked(deliveryReplay)
      lifecycle.journal.snapshot()
      replays.mockClear()
      for (let index = 0; index < 5; index++)
        expect(
          new DeliveryLifecycle(context.planning.sources.files.root).journal.get(original.run),
        ).toEqual(original)
      expect(replays).not.toHaveBeenCalled()
      lifecycle.transition(original.run, { to: 'queued', reason: 'Commit a later transition.' })
      // An owned append already validates the new projection; a full prefix
      // replay would duplicate that work. Its committed state must still appear.
      const committed = lifecycle.journal.get(original.run)
      expect(committed.state).toBe('queued')
      expect(replays).not.toHaveBeenCalled()
      const directory = lifecycle.journal.files.path('delivery/journal'),
        active = journalLayout(readdirSync(directory))[0]
      if (!active) throw new Error('Current active journal input required')
      const path = join(directory, active.name),
        bytes = readFileSync(path, 'utf8'),
        changed = bytes.replace('"sequence":', '"sequence" :')
      expect(changed).not.toBe(bytes)
      // Valid JSON whitespace preserves events, but must invalidate byte reuse.
      writeFileSync(path, changed)
      expect(lifecycle.journal.get(original.run)).toEqual(committed)
      expect(replays).toHaveBeenCalledTimes(1)
      replays.mockClear()
      expect(lifecycle.journal.get(original.run).state).toBe('queued')
      expect(replays).not.toHaveBeenCalled()
    }))

  it('never shares mutable events or states with a later reader', () =>
    fixture((context) => {
      const { lifecycle, original } = tracked(context),
        first = lifecycle.journal.snapshot(),
        event = first.events[0],
        state = first.states.get(original.run)
      if (!event || !state) throw new Error('Original observation required')
      Object.assign(event.payload, { source: 'f'.repeat(64) })
      event.sequence = 99
      state.state = 'completed'
      state.units.length = 0
      const events = lifecycle.journal.events(),
        single = lifecycle.journal.get(original.run),
        listed = lifecycle.journal.list()
      if (!events[0] || !listed[0]) throw new Error('Original public journal views required')
      events[0].sequence = 100
      single.units.length = 0
      listed[0].state = 'completed'
      const second = lifecycle.journal.snapshot()
      expect(second.events[0]?.sequence).toBe(1)
      expect(second.events[0]?.payload).not.toMatchObject({ source: 'f'.repeat(64) })
      expect(second.states.get(original.run)).toEqual(original)
    }))

  it('refuses a same-length byte change even when file times are restored', () =>
    fixture((context) => {
      const { lifecycle } = tracked(context),
        directory = lifecycle.journal.files.path('delivery/journal'),
        name = readdirSync(directory).sort()[0]
      if (!name) throw new Error('Original immutable segment required')
      lifecycle.journal.snapshot()
      const path = join(directory, name),
        before = statSync(path),
        bytes = readFileSync(path, 'utf8'),
        changed = bytes.replace(/"sequence":1/, '"sequence":2')
      expect(changed).not.toBe(bytes)
      expect(changed.length).toBe(bytes.length)
      writeFileSync(path, changed)
      utimesSync(path, before.atime, before.mtime)
      expect(() => lifecycle.journal.snapshot()).toThrow()
      writeFileSync(path, bytes)
      expect(() => lifecycle.journal.snapshot()).not.toThrow()
    }))

  it('keeps interleaved stores independent', () =>
    fixture((one) =>
      fixture((two) => {
        const first = tracked(one),
          second = tracked(two)
        second.lifecycle.transition(second.original.run, {
          to: 'queued',
          reason: 'Change only the second store.',
        })
        for (let index = 0; index < 2; index++) {
          expect(first.lifecycle.journal.get(first.original.run)).toEqual(first.original)
          expect(second.lifecycle.journal.get(second.original.run).state).toBe('queued')
        }
      }),
    ))
})
