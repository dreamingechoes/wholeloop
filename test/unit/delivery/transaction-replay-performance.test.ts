import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { contractDigest } from '../../../src/contracts/compatibility.js'
import * as events from '../../../src/delivery/events.js'
import { DeliveryJournal } from '../../../src/delivery/journal.js'
import { deliveryReplay, replayDelivery } from '../../../src/delivery/reducer.js'

const run = 'delivery-0000000000000000',
  actor = { kind: 'controller' as const, name: 'Fixture' },
  at = '2026-11-06T00:00:00.000Z'
const registration = (): events.RegistrationPayload => ({
  schema: 'wholeloop/delivery-registration-event@1',
  basis: { kind: 'plan', digest: 'a'.repeat(64), revision: 1 },
  source: 'b'.repeat(64),
  policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
  units: [{ id: 'search', role: 'implementation', repository: 'app' }],
})
const transition = (paused: boolean): events.ControlPayload => ({
  schema: 'wholeloop/delivery-control-event@1',
  from: paused ? 'queued' : 'paused',
  to: paused ? 'paused' : 'queued',
  basis: 'a'.repeat(64),
  reason: 'Exercise an isolated transaction without native dispatch.',
})
function fixture(test: (journal: DeliveryJournal) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-transaction-replay-')),
    journal = new DeliveryJournal(join(root, 'state'), () => at)
  try {
    journal.transaction(actor, (_, append) => {
      append(run, registration())
      append(run, {
        schema: 'wholeloop/delivery-grant-event@1',
        id: 'authorization-0000000000000000',
        digest: 'd'.repeat(64),
        basis: 'a'.repeat(64),
        status: 'active',
      })
      append(run, { ...transition(false), from: 'planned' })
    })
    journal.get(run)
    test(journal)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('owned transaction replay', () => {
  it.each([100, 400])(
    'does not rebuild a %i-transition history after admission refusals',
    (count) =>
      fixture((journal) => {
        const initial = journal.events()
        for (let index = 0; index < count; index++)
          initial.push(
            events.deliveryEvent(run, actor, transition(index % 2 === 0), initial.at(-1), at),
          )
        const session = deliveryReplay(initial),
          before = session.snapshot(),
          next = events.deliveryEvent(run, actor, transition(true), initial.at(-1), at)
        const checks: number[] = []
        for (const kind of ['digest', 'sequence', 'id', 'schema']) {
          const event = structuredClone(next)
          if (kind === 'digest') event.digest = 'f'.repeat(64)
          if (kind === 'sequence') event.sequence++
          if (kind === 'id') event.id = initial[0]?.id ?? event.id
          if (kind === 'schema')
            Object.assign(event.payload, { schema: 'wholeloop/delivery-unknown@1' })
          if (kind !== 'digest') {
            const { digest: _digest, ...binding } = event
            event.digest = contractDigest(binding)
          }
          const validate = vi.spyOn(events, 'validateDeliveryEvent')
          try {
            expect(() => session.append(event)).toThrow(
              kind === 'digest'
                ? 'event-digest'
                : kind === 'schema'
                  ? 'unsupported-payload-version'
                  : 'event-order',
            )
            console.info(
              'Rejected candidate replay:',
              JSON.stringify({ count, kind, calls: validate.mock.calls.length }),
            )
            checks.push(validate.mock.calls.length)
          } finally {
            validate.mockRestore()
          }
          expect(session.snapshot()).toEqual(before)
        }
        expect(checks).toEqual([1, 1, 1, 1])
        session.append(next)
        expect(session.snapshot()).toEqual(replayDelivery([...initial, next]))
      }),
  )
  it.each([32, 128])('replays only %i new events across independent warm transactions', (count) =>
    fixture((journal) => {
      const validate = vi.spyOn(events, 'validateDeliveryEvent')
      try {
        for (let index = 0; index < count; index++)
          journal.transaction(actor, (_, append) => append(run, transition(index % 2 === 0)))
        console.info(
          'Independent transaction replay:',
          JSON.stringify({ count, calls: validate.mock.calls.length }),
        )
        expect(validate).toHaveBeenCalledTimes(count)
      } finally {
        validate.mockRestore()
      }
      expect(journal.snapshot().states).toEqual(replayDelivery(journal.events()))
    }),
  )
  it('keeps old cached and retained views independent of a transferred writer', () =>
    fixture((journal) => {
      let retained: (() => ReadonlyMap<string, events.DeliveryProjection>) | undefined
      journal.transaction(actor, (view, append) => {
        retained = view
        append(run, transition(true))
        expect(view().get(run)?.state).toBe('paused')
        expect(journal.get(run).state).toBe('queued')
        const old = journal.get(run)
        old.units.length = 0
        expect(view().get(run)?.units).toHaveLength(1)
      })
      expect(retained?.().get(run)?.state).toBe('paused')
      journal.transaction(actor, (_, append) => append(run, transition(false)))
      expect(journal.get(run).state).toBe('queued')
      expect(retained?.().get(run)?.state).toBe('paused')
    }))
  it.each(['journal', 'projection'] as const)(
    'recovers the exact committed prefix after a %s writer failure',
    (point) =>
      fixture((journal) => {
        // Segments use the durable writer; projections use the view writer (ADR-0242).
        const writer = point === 'journal' ? 'atomic' : 'project',
          original = journal.files[writer].bind(journal.files) as (
            path: string,
            body: string | Uint8Array,
          ) => void,
          observed = vi
            .spyOn(journal.files, writer)
            .mockImplementation((path: string, body: string | Uint8Array) => {
              if (path.startsWith(point === 'journal' ? 'delivery/journal/' : 'delivery/state/'))
                throw new Error('fixture-publication-refusal')
              original(path, body)
            })
        try {
          expect(() =>
            journal.transaction(actor, (_, append) => append(run, transition(true))),
          ).toThrow('fixture-publication-refusal')
        } finally {
          observed.mockRestore()
        }
        const committed = point === 'projection'
        expect(journal.get(run).state).toBe(committed ? 'paused' : 'queued')
        journal.transaction(actor, (_, append) => append(run, transition(!committed)))
        expect(journal.snapshot().states).toEqual(replayDelivery(journal.events()))
      }),
  )
  it.each([100, 400])('replays each event once across %i appends', (count) =>
    fixture((journal) => {
      const validate = vi.spyOn(events, 'validateDeliveryEvent'),
        original = JSON.stringify
      let encoded = 0
      const stringify = vi.spyOn(JSON, 'stringify').mockImplementation((...args) => {
        const value = args[0]
        if (value?.schema === 'wholeloop/delivery-event@1' && value.digest) encoded++
        return Reflect.apply(original, JSON, args)
      })
      try {
        journal.transaction(actor, (_, append) => {
          for (let index = 0; index < count; index++) append(run, transition(index % 2 === 0))
        })
        console.info(
          'Transaction event replay:',
          JSON.stringify({ count, calls: validate.mock.calls.length, encoded }),
        )
        expect(validate).toHaveBeenCalledTimes(count)
        // Includes construction/replay source-shape checks, plus one encoding
        // retained for quota and publication. It excludes digest-binding JSON.
        expect(encoded).toBe(3 * count)
      } finally {
        validate.mockRestore()
        stringify.mockRestore()
      }
      expect(journal.events()).toHaveLength(count + 3)
      expect(journal.snapshot().states).toEqual(replayDelivery(journal.events()))
    }),
  )
  it('restores successful history when a callback catches a partially applied invalid append', () =>
    fixture((journal) => {
      journal.transaction(actor, (view, append) => {
        append(run, transition(true))
        const before = view()
        expect(() =>
          append(run, {
            schema: 'wholeloop/delivery-queue-event@1',
            action: 'deferred',
            basis: 'a'.repeat(64),
            id: `queue-${'a'.repeat(32)}`,
            reason: 'This unknown entry must not leave a new queue facet.',
          }),
        ).toThrow('unknown-queue-entry')
        expect(view()).toEqual(before)
        const copy = view().get(run)
        if (!copy) throw new Error('Missing fixture state')
        copy.units.length = 0
        copy.state = 'completed'
        expect(view()).toEqual(before)
        append(run, transition(false))
      })
      expect(journal.events()).toHaveLength(5)
      expect(journal.snapshot().states).toEqual(replayDelivery(journal.events()))
      expect(
        journal.get(run).facets.some((facet) => facet.schema === 'wholeloop/delivery-queue@1'),
      ).toBe(false)
    }))
  it('does not publish when the operation throws after accepted appends', () =>
    fixture((journal) => {
      const before = journal.events(),
        atomic = vi.spyOn(journal.files, 'atomic')
      try {
        expect(() =>
          journal.transaction(actor, (_, append) => {
            append(run, transition(true))
            throw new Error('callback-failure')
          }),
        ).toThrow('callback-failure')
        expect(atomic.mock.calls.filter(([path]) => path.startsWith('delivery/'))).toHaveLength(0)
      } finally {
        atomic.mockRestore()
      }
      expect(journal.events()).toEqual(before)
    }))
  it.each(['returned', 'threw'])('closes an escaped append after the operation %s', (outcome) =>
    fixture((journal) => {
      let retained: ((run: string, payload: events.DeliveryPayload) => void) | undefined
      const operation = () =>
        journal.transaction(actor, (_, append) => {
          retained = append
          append(run, transition(true))
          if (outcome === 'threw') throw new Error('fixture-operation-failure')
        })
      if (outcome === 'threw') expect(operation).toThrow('fixture-operation-failure')
      else operation()
      const before = journal.events()
      if (!retained) throw new Error('Missing escaped fixture callback')
      expect(() => retained?.(run, transition(false))).toThrow('closed-transaction')
      expect(journal.events()).toEqual(before)
    }),
  )
  it('owns initial and appended events and returns independent views', () =>
    fixture((journal) => {
      const initial = journal.events(),
        expected = structuredClone(initial),
        session = deliveryReplay(initial)
      const first = initial[0]
      if (first?.payload.schema !== 'wholeloop/delivery-registration-event@1')
        throw new Error('Missing registration')
      first.payload.units.length = 0
      first.digest = 'f'.repeat(64)
      const event = events.deliveryEvent(run, actor, transition(true), expected.at(-1), at)
      expected.push(structuredClone(event))
      session.append(event)
      event.digest = 'f'.repeat(64)
      event.payload = registration()
      const copy = session.snapshot().get(run)
      if (!copy) throw new Error('Missing current state')
      copy.units.length = 0
      copy.facets.length = 0
      expect(session.snapshot()).toEqual(replayDelivery(expected))
      expect(() => session.append(event)).toThrow()
      expect(session.snapshot()).toEqual(replayDelivery(expected))
      const next = events.deliveryEvent(run, actor, transition(false), expected.at(-1), at)
      session.append(next)
      expected.push(next)
      expect(session.snapshot()).toEqual(replayDelivery(expected))
    }))
  it('restores identity and lane indexes after a projection validation refusal', () =>
    fixture((journal) => {
      const initial = journal.events(),
        session = deliveryReplay(initial),
        event = events.deliveryEvent(
          run,
          actor,
          {
            schema: 'wholeloop/delivery-attempt-event@1',
            id: 'attempt-0000000000000000',
            basis: 'a'.repeat(64),
            unit: 'search',
            role: 'builder',
            generation: 1,
            action: 'claimed',
          },
          initial.at(-1),
          at,
        ),
        original: typeof events.validateDeliveryProjection = events.validateDeliveryProjection
      let refuse = true
      const validate = vi
        .spyOn(events, 'validateDeliveryProjection')
        .mockImplementation((state) => {
          if (refuse) {
            refuse = false
            throw new Error('fixture-projection-refusal')
          }
          original(state)
        })
      try {
        expect(() => session.append(event)).toThrow('fixture-projection-refusal')
        expect(session.snapshot()).toEqual(replayDelivery(initial))
        session.append(event)
        expect(session.snapshot()).toEqual(replayDelivery([...initial, event]))
      } finally {
        validate.mockRestore()
      }
    }))
})
