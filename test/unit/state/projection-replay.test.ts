import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as environments from '../../../src/environment/contracts.js'
import * as gates from '../../../src/gates/state.js'
import * as impacts from '../../../src/impact/contracts.js'
import * as impactDeliveries from '../../../src/impact/publish.js'
import * as launches from '../../../src/launch/contracts.js'
import * as launchDeliveries from '../../../src/launch/publish.js'
import * as learning from '../../../src/learning/contracts.js'
import * as pullRequests from '../../../src/pull-requests/contracts.js'
import * as ramps from '../../../src/ramp/contracts.js'
import * as rampProposals from '../../../src/ramp/publish.js'
import * as reviews from '../../../src/review/state.js'
import * as sharing from '../../../src/sharing/contracts.js'
import { event, replay, type StateEvent } from '../../../src/state/events.js'
import * as mailbox from '../../../src/state/mailbox.js'
import { projections, replayProjections } from '../../../src/state/projections.js'
import { StateStore } from '../../../src/state/store.js'
import * as synchronization from '../../../src/sync/contracts.js'
import * as verification from '../../../src/verification/state.js'
import * as worktrees from '../../../src/worktrees/contracts.js'

afterEach(() => vi.restoreAllMocks())
const ts = '2026-11-01T00:00:00.000Z'
function history(count: number): StateEvent[] {
  return Array.from({ length: count }, (_, i) =>
    event(
      `init-${i.toString(16).padStart(8, '0')}`,
      {
        type: 'item.created',
        data: { kind: 'initiative', title: 'Fixture idea', owner: 'Fixture Owner', body: '' },
      },
      ts,
    ),
  )
}
it('measures validation and rendering together, preserving every original byte', () => {
  const measurements = [100, 400].map((size) => {
    const events = history(size)
    const results = ['legacy', 'shared'].map((mode) => {
        let reads = 0
        const observed = events.map(
            (entry) =>
              new Proxy(entry, {
                get(target, key, receiver) {
                  if (['type', 'subject', 'data'].includes(String(key))) reads++
                  return Reflect.get(target, key, receiver)
                },
              }),
          ),
          files =
            mode === 'legacy'
              ? projections(replay(observed), observed)
              : replayProjections(observed)
        return { reads, files }
      }),
      original = results[0],
      current = results[1]
    if (!original || !current) throw new Error('Both fixed consumers required')
    expect(current.files).toEqual(original.files)
    expect(current.files.size).toBe(size + 2)
    return { size, original: original.reads, current: current.reads }
  })
  console.info('Complete projection event reads:', JSON.stringify(measurements))
  for (const measurement of measurements) {
    expect(measurement.current).toBeLessThan(measurement.original * 0.7)
    expect(measurement.current).toBeLessThanOrEqual(105 * measurement.size)
  }
})
it('validates every domain once per fresh rebuild and preserves the complete original files', () => {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-projection-replay-'))
  try {
    const store = new StateStore(join(root, 'state')),
      events = history(8),
      expected = projections(replay(events), events)
    store.files.atomic(
      'journal/2026-11.ndjson',
      `${events.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    )
    const observers = [
      ['mailbox', vi.spyOn(mailbox, 'replayMailbox')],
      ['workspaces', vi.spyOn(worktrees, 'worktreeRecords')],
      ['gates', vi.spyOn(gates, 'gateRuns')],
      ['verification', vi.spyOn(verification, 'replayVerification')],
      ['reviews', vi.spyOn(reviews, 'reviewInputs')],
      ['pullRequests', vi.spyOn(pullRequests, 'pullRequestPlans')],
      ['environment', vi.spyOn(environments, 'environmentDeclarations')],
      ['launches', vi.spyOn(launches, 'launchRuns')],
      ['launchDeliveries', vi.spyOn(launchDeliveries, 'launchDeliveries')],
      ['sharing', vi.spyOn(sharing, 'sharingState')],
      ['sync', vi.spyOn(synchronization, 'syncState')],
      ['learning', vi.spyOn(learning, 'learningRuns')],
      ['impact', vi.spyOn(impacts, 'impactRuns')],
      ['impactDeliveries', vi.spyOn(impactDeliveries, 'impactDeliveries')],
      ['ramps', vi.spyOn(ramps, 'rampRuns')],
      ['rampProposals', vi.spyOn(rampProposals, 'rampProposals')],
    ] as const
    for (let attempt = 1; attempt <= 2; attempt++) {
      expect(store.rebuild()).toBe(expected.size)
      expect(
        Object.fromEntries(observers.map(([name, observer]) => [name, observer.mock.calls.length])),
      ).toEqual(Object.fromEntries(observers.map(([name]) => [name, attempt])))
      for (const [path, body] of expected) expect(store.files.read(path)).toBe(body)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
it('retains final current-history validation after a callback changes a previously checked event', () => {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-projection-final-validation-'))
  try {
    const store = new StateStore(join(root, 'state')),
      events = history(1)
    store.files.atomic(
      'journal/2026-11.ndjson',
      `${events.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
    )
    const before = store.events(),
      subject = events[0]?.subject ?? ''
    expect(() =>
      store.transaction((current, append) => {
        append(subject, { type: 'note.added', data: { text: 'Must not commit' } })
        const first = current[0]
        if (first?.type === 'item.created') first.data.parent = 'init-ffffffff'
      }),
    ).toThrow('Missing parent')
    expect(store.events()).toEqual(before)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
