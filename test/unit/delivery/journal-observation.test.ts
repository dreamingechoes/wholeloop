import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { journalLayout } from '../../../src/delivery/journal-layout.js'
import { readJournalSegment } from '../../../src/delivery/journal-segment.js'
import { DeliveryLifecycle } from '../../../src/delivery/lifecycle.js'
import { withReadObservation } from '../../../src/state/read-observation.js'
import { authorization, fixture } from '../../support/delivery.js'

vi.mock('../../../src/delivery/journal-segment.js', async (original) => {
  const segment = await original<typeof import('../../../src/delivery/journal-segment.js')>()
  return { ...segment, readJournalSegment: vi.fn(segment.readJournalSegment) }
})
afterEach(() => vi.mocked(readJournalSegment).mockClear())

describe('shared exact-byte journal observations', () => {
  it.each(['stable', 'changed-whitespace', 'added-segment'] as const)(
    'reads each segment twice and retains %s semantics',
    (mode) =>
      fixture(async ({ planning, plan }) => {
        const prepared = planning.preparePlan(plan),
          lifecycle = new DeliveryLifecycle(
            planning.sources.files.root,
            () => '2026-10-24T10:00:00.000Z',
          ),
          issued = lifecycle.authority.authorize(authorization(plan, prepared.digest))
        const original = lifecycle.track({ run: plan.run, revision: 1, grant: issued.grant.id }),
          directory = lifecycle.journal.files.path('delivery/journal'),
          names = journalLayout(readdirSync(directory)).map((file) => file.name)
        vi.mocked(readJournalSegment).mockClear()
        let release: () => void = () => undefined
        const gap = new Promise<void>((resolve) => {
            release = resolve
          }),
          observation = withReadObservation(new AbortController().signal, async () => {
            for (let i = 0; i < 100; i++) {
              const copy = lifecycle.journal.get(plan.run)
              expect(copy).toEqual(original)
              copy.units.length = 0
              const events = lifecycle.journal.events()
              events.length = 0
            }
            await gap
            return lifecycle.journal.get(plan.run)
          })
        expect(readJournalSegment).toHaveBeenCalledTimes(names.length)
        if (mode === 'changed-whitespace') {
          const path = join(directory, names[0] ?? '')
          writeFileSync(path, readFileSync(path, 'utf8').replace('{', '{ '))
        } else if (mode === 'added-segment')
          lifecycle.journal.transaction(
            { kind: 'controller', name: 'fixture' },
            (_view, append) => {
              append(plan.run, {
                schema: 'wholeloop/delivery-control-event@1',
                from: original.state,
                to: 'blocked',
                outcome: 'blocked',
                basis: original.basis.digest,
                reason: 'An independent caller changes the current journal.',
              })
            },
          )
        release()
        if (mode === 'stable') {
          await expect(observation).resolves.toEqual(original)
          expect(readJournalSegment).toHaveBeenCalledTimes(names.length * 2)
        } else await expect(observation).rejects.toThrow()
      }),
  )
})
