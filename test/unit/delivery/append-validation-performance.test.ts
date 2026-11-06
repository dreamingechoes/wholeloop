import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as events from '../../../src/delivery/events.js'
import { DeliveryJournal } from '../../../src/delivery/journal.js'

const actor = { kind: 'controller' as const, name: 'Fixture' },
  at = '2026-11-06T00:00:00.000Z'
const run = (index: number) => `delivery-${index.toString(16).padStart(16, '0')}`
const registration = (): events.RegistrationPayload => ({
  schema: 'wholeloop/delivery-registration-event@1',
  basis: { kind: 'plan', digest: 'a'.repeat(64), revision: 1 },
  source: 'b'.repeat(64),
  policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
  units: [{ id: 'search', role: 'implementation', repository: 'app' }],
})
function fixture(size: number, test: (journal: DeliveryJournal) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-append-validation-')),
    journal = new DeliveryJournal(join(root, 'state'), () => at),
    history: events.DeliveryEvent[] = []
  try {
    for (let index = 0; index < size; index++)
      history.push(events.deliveryEvent(run(index), actor, registration(), history.at(-1), at))
    journal.files.atomic(
      'delivery/journal/0000000000000001.ndjson',
      `${history.map((event) => JSON.stringify(event)).join('\n')}\n`,
    )
    // Warm only from current verified bytes, before observing append validation.
    journal.get(run(0))
    test(journal)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('owned append projection validation', () => {
  it.each([20, 80])('validates every retained/new state once with %i prior runs', (size) =>
    fixture(size, (journal) => {
      const validate = vi.spyOn(events, 'validateDeliveryProjection')
      try {
        journal.transaction(actor, (_, append) => append(run(size), registration()))
        const subjects = validate.mock.calls.map(
          ([state]) => (state as events.DeliveryProjection).run,
        )
        console.info(
          'Append projection validation:',
          JSON.stringify({ size, calls: subjects.length }),
        )
        expect(subjects).toHaveLength(size + 1)
        expect(new Set(subjects)).toEqual(
          new Set(Array.from({ length: size + 1 }, (_, i) => run(i))),
        )
      } finally {
        validate.mockRestore()
      }
      expect(journal.list()).toHaveLength(size + 1)
    }),
  )
  it('still refuses a retained projection before publishing any delivery file', () =>
    fixture(20, (journal) => {
      const before = journal.events(),
        original: typeof events.validateDeliveryProjection = events.validateDeliveryProjection,
        validate = vi.spyOn(events, 'validateDeliveryProjection').mockImplementation((state) => {
          if ((state as events.DeliveryProjection).run === run(10))
            throw new Error('retained-projection-refusal')
          original(state)
        }),
        atomic = vi.spyOn(journal.files, 'atomic')
      try {
        expect(() =>
          journal.transaction(actor, (_, append) => append(run(20), registration())),
        ).toThrow('retained-projection-refusal')
        expect(atomic.mock.calls.filter(([path]) => path.startsWith('delivery/'))).toHaveLength(0)
      } finally {
        validate.mockRestore()
        atomic.mockRestore()
      }
      expect(journal.events()).toEqual(before)
      expect(journal.list()).toHaveLength(20)
    }))
})
