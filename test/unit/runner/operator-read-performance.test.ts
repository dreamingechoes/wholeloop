import { readdirSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeliveryAuthority } from '../../../src/delivery/authority.js'
import { journalLayout } from '../../../src/delivery/journal-layout.js'
import * as segments from '../../../src/delivery/journal-segment.js'
import { DeliveryLifecycle } from '../../../src/delivery/lifecycle.js'
import { deliveryDiagnostics, deliveryReport } from '../../../src/runner/operator-report.js'
import { StoreFiles } from '../../../src/state/files.js'
import { authorization, fixture } from '../../support/delivery.js'

const at = '2026-11-06T00:00:00.000Z'
afterEach(() => vi.restoreAllMocks())

describe('current operator report inputs', () => {
  it('keeps run/history snapshots independent of readers and later writes', () =>
    fixture(({ planning, plan }) => {
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at),
        prepared = planning.preparePlan(plan),
        grant = lifecycle.authority.authorize(authorization(plan, prepared.digest))
      lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      const before = lifecycle.journal.snapshot(),
        result = lifecycle.journal.runSnapshot(plan.run)
      expect(result.state).toEqual(before.states.get(plan.run))
      expect(result.events).toEqual(before.events)
      result.state.units.length = 0
      result.events.length = 0
      expect(lifecycle.journal.snapshot()).toEqual(before)
      const retained = lifecycle.journal.runSnapshot(plan.run)
      lifecycle.transition(plan.run, {
        to: 'paused',
        reason: 'Keep retained report facts independent.',
      })
      expect(retained.state.state).toBe('planned')
      expect(retained.events).toEqual(before.events)
      expect(lifecycle.journal.runSnapshot(plan.run).state.state).toBe('paused')
      expect(() => lifecycle.journal.runSnapshot('invalid')).toThrow('invalid-run')
      expect(() => lifecycle.journal.runSnapshot('delivery-ffffffffffffffff')).toThrow(
        'unknown-run',
      )
    }))
  it.each(['report', 'diagnostics'] as const)('reads one fresh journal snapshot for %s', (kind) =>
    fixture(({ planning, plan }) => {
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at),
        prepared = planning.preparePlan(plan),
        grant = lifecycle.authority.authorize(authorization(plan, prepared.digest))
      lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      lifecycle.transition(plan.run, {
        to: 'paused',
        reason: 'Retain a fresh read-only report fixture.',
      })
      const read = () =>
          kind === 'report'
            ? deliveryReport(lifecycle.journal.files.root, plan.run, () => at)
            : deliveryDiagnostics(lifecycle.journal.files.root, plan.run),
        expected = read(),
        names = journalLayout(readdirSync(lifecycle.journal.files.path('delivery/journal')))
          .map((file) => file.name)
          .sort(),
        journal = vi.spyOn(segments, 'readJournalSegment'),
        authority = vi.spyOn(DeliveryAuthority.prototype, 'inspect'),
        writes = vi.spyOn(StoreFiles.prototype, 'atomic'),
        locks = vi.spyOn(StoreFiles.prototype, 'locked')
      expect(read()).toEqual(expected)
      const counts = {
        kind,
        segments: journal.mock.calls.length,
        active: names.length,
        authority: authority.mock.calls.length,
      }
      console.info('Operator policy inputs:', JSON.stringify(counts))
      expect(journal.mock.calls.map(([, , name]) => name).sort()).toEqual(names)
      expect(authority).toHaveBeenCalledTimes(kind === 'report' ? 1 : 0)
      expect(writes).not.toHaveBeenCalled()
      expect(locks).not.toHaveBeenCalled()
    }),
  )
  it('never substitutes a previous report for changed current journal bytes', () =>
    fixture(({ planning, plan }) => {
      const lifecycle = new DeliveryLifecycle(planning.sources.files.root, () => at),
        prepared = planning.preparePlan(plan),
        grant = lifecycle.authority.authorize(authorization(plan, prepared.digest))
      lifecycle.track({ run: plan.run, revision: 1, grant: grant.grant.id })
      expect(deliveryReport(lifecycle.journal.files.root, plan.run, () => at).state).toBe('planned')
      const active = journalLayout(readdirSync(lifecycle.journal.files.path('delivery/journal')))[0]
      if (!active) throw new Error('Missing active report fixture')
      lifecycle.journal.files.atomic(`delivery/journal/${active.name}`, 'invalid-current-body\n')
      expect(() => deliveryReport(lifecycle.journal.files.root, plan.run, () => at)).toThrow()
      expect(() => deliveryDiagnostics(lifecycle.journal.files.root, plan.run)).toThrow()
    }))
})
