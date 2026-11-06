import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DeliveryJournal } from '../../../src/delivery/journal.js'

const run = 'delivery-0000000000000000'
const actor = { kind: 'controller' as const, name: 'Fixture' }
function fixture(size: number, test: (journal: DeliveryJournal) => void) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-projection-render-'))
  const journal = new DeliveryJournal(join(root, 'state'), () => '2026-11-06T00:00:00.000Z')
  try {
    journal.transaction(actor, (_, append) => {
      append(run, {
        schema: 'wholeloop/delivery-registration-event@1',
        basis: { kind: 'plan', digest: 'a'.repeat(64), revision: 1 },
        source: 'b'.repeat(64),
        policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
        units: Array.from({ length: size }, (_, index) => ({
          id: `unit-${index}`,
          role: 'implementation',
          repository: 'app',
        })),
      })
      append(run, {
        schema: 'wholeloop/delivery-grant-event@1',
        id: 'authorization-0123456789abcdef',
        digest: 'd'.repeat(64),
        basis: 'a'.repeat(64),
        status: 'active',
      })
      append(run, {
        schema: 'wholeloop/delivery-control-event@1',
        from: 'planned',
        to: 'queued',
        basis: 'a'.repeat(64),
        reason: 'Prepare the synthetic render fixture.',
      })
    })
    test(journal)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
function transition(journal: DeliveryJournal) {
  journal.transaction(actor, (_, append) =>
    append(run, {
      schema: 'wholeloop/delivery-control-event@1',
      from: 'queued',
      to: 'paused',
      basis: 'a'.repeat(64),
      reason: 'Observe the current controller pause without dispatch.',
    }),
  )
}
function renders(operation: () => void) {
  const stringify = JSON.stringify
  const calls: { bytes: number; digest: string }[] = []
  const observed = vi.spyOn(JSON, 'stringify').mockImplementation((...args) => {
    const text: string | undefined = Reflect.apply(stringify, JSON, args)
    const value = args[0]
    if (
      text &&
      value &&
      typeof value === 'object' &&
      value.schema === 'wholeloop/delivery-state@1' &&
      args[2] === 2
    )
      calls.push({
        bytes: Buffer.byteLength(text),
        digest: createHash('sha256').update(text).digest('hex'),
      })
    return text
  })
  try {
    operation()
    return calls
  } finally {
    observed.mockRestore()
  }
}

describe('owned delivery projection serialization', () => {
  it.each([20, 80])('renders one changed %i-unit view once before publication', (size) =>
    fixture(size, (journal) => {
      const calls = renders(() => transition(journal))
      console.info('Changed projection renders:', JSON.stringify({ size, calls }))
      expect(calls).toHaveLength(1)
      const expected = `${JSON.stringify(journal.get(run), null, 2)}\n`
      expect(readFileSync(journal.files.path(`delivery/state/${run}.json`), 'utf8')).toBe(expected)
      expect(journal.cacheStatus(journal.get(run))).toBe('current')
    }),
  )
  it.each([20, 80])('renders one valid stale %i-unit view once for repair', (size) =>
    fixture(size, (journal) => {
      const state = journal.get(run)
      journal.files.atomic(`delivery/state/${run}.json`, JSON.stringify(state))
      const calls = renders(() => expect(journal.rebuild()).toEqual({ runs: 1, written: 1 }))
      console.info('Repaired projection renders:', JSON.stringify({ size, calls }))
      expect(calls).toHaveLength(1)
      expect(readFileSync(journal.files.path(`delivery/state/${run}.json`), 'utf8')).toBe(
        `${JSON.stringify(state, null, 2)}\n`,
      )
      expect(journal.rebuild()).toEqual({ runs: 1, written: 0 })
    }),
  )
  it('retains missing-view repair and refuses unsupported caches before any journal write', () =>
    fixture(1, (journal) => {
      const path = `delivery/state/${run}.json`
      renameSync(journal.files.path(path), journal.files.path(`${path}.retained`))
      expect(journal.cacheStatus(journal.get(run))).toBe('missing')
      expect(
        renders(() => expect(journal.rebuild()).toEqual({ runs: 1, written: 1 })),
      ).toHaveLength(1)
      journal.files.atomic(
        path,
        JSON.stringify({ ...journal.get(run), schema: 'wholeloop/delivery-state@2' }),
      )
      const before = journal.events(),
        atomic = vi.spyOn(journal.files, 'atomic')
      try {
        expect(() => transition(journal)).toThrow('unsupported-projection-version')
        expect(atomic.mock.calls.filter(([path]) => path.startsWith('delivery/'))).toHaveLength(0)
        expect(journal.events()).toEqual(before)
      } finally {
        atomic.mockRestore()
      }
    }))
})
