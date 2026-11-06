import {
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DeliveryJournal } from '../../../src/delivery/journal.js'
import { journalLayout } from '../../../src/delivery/journal-layout.js'
import { readOverview } from '../../../src/overview/read.js'
import { type WatchFrame, watchOverview } from '../../../src/overview/watch.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, lstatSync: vi.fn(fs.lstatSync), openSync: vi.fn(fs.openSync) }
})
const at = '2026-11-06T00:00:00.000Z'
async function fixture(
  run: (context: {
    journal: DeliveryJournal
    options: { root: string; store: string; userFile: string; at: string }
    append: () => void
  }) => void | Promise<void>,
) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-overview-packed-')),
    journal = new DeliveryJournal(join(root, 'state'), () => at)
  let index = 0
  const append = () =>
    journal.transaction({ kind: 'controller', name: 'Fixture' }, (_, emit) => {
      emit(`delivery-${(index++).toString(16).padStart(16, '0')}`, {
        schema: 'wholeloop/delivery-registration-event@1',
        basis: { kind: 'plan', digest: 'a'.repeat(64), revision: 1 },
        source: 'b'.repeat(64),
        policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
        units: [{ id: 'search', role: 'implementation', repository: 'app' }],
      })
    })
  try {
    await run({
      journal,
      append,
      options: { root, store: journal.files.root, userFile: join(root, 'user.yml'), at },
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('overview and watch over witnessed delivery ranges', () => {
  it.each([8, 32])('preflights active inputs without touching %i retained bodies', (count) =>
    fixture(({ journal, append, options }) => {
      for (let index = 0; index < count; index++) append()
      const directory = journal.files.path('delivery/journal'),
        names = readdirSync(directory),
        active = new Set(journalLayout(names).map((file) => file.name)),
        witnesses = names.filter((name) => !active.has(name)),
        paths = new Set(witnesses.map((name) => join(directory, name)))
      expect(witnesses.length).toBeGreaterThan(0)
      const retained = witnesses[0]
      if (!retained) throw new Error('Missing retained packing witness')
      // A superseded body is no longer a logical input; its filename's digest is still checked.
      truncateSync(join(directory, retained), 9 * 1024 * 1024)
      vi.mocked(lstatSync).mockClear()
      vi.mocked(openSync).mockClear()
      const read = readOverview(options)
      expect(read.states.size).toBe(count)
      expect(read.deliveryEvents).toEqual(journal.events())
      expect(
        vi.mocked(lstatSync).mock.calls.filter(([path]) => paths.has(String(path))),
      ).toHaveLength(0)
      expect(
        vi.mocked(openSync).mock.calls.filter(([path]) => paths.has(String(path))),
      ).toHaveLength(0)
      console.info(
        'Overview retained body I/O:',
        JSON.stringify({ count, witnesses: witnesses.length, opens: 0, stats: 0 }),
      )
    }),
  )
  it('advances the exact event prefix while writes replace active packed ranges', () =>
    fixture(async ({ append, options }) => {
      append()
      const frames: WatchFrame[] = [],
        stop = new AbortController(),
        timeout = setTimeout(() => stop.abort(), 3000)
      try {
        const code = await watchOverview(
          { ...options, poll: true, pollMs: 25, signal: stop.signal },
          (frame) => {
            frames.push(frame)
            if (frame.kind === 'overview' && frame.change === 'initial') append()
            if (frame.kind === 'events') stop.abort()
          },
        )
        expect(code).toBe(0)
        expect(frames.some((frame) => frame.kind === 'problem')).toBe(false)
        const events = frames.flatMap((frame) => (frame.kind === 'events' ? frame.events : []))
        expect(events.map((event) => event.position)).toEqual([2])
      } finally {
        clearTimeout(timeout)
      }
    }))
  it.each(['oversized-active', 'active-alias', 'unknown-name'])(
    'still refuses %s without partial overview facts',
    (mode) =>
      fixture(({ journal, append, options }) => {
        append()
        const directory = journal.files.path('delivery/journal'),
          name = journalLayout(readdirSync(directory))[0]?.name
        if (!name) throw new Error('Missing active range')
        const path = join(directory, name)
        if (mode === 'oversized-active') truncateSync(path, 9 * 1024 * 1024)
        else if (mode === 'active-alias') {
          renameSync(path, `${path}.retained`)
          symlinkSync(`${path}.retained`, path)
        } else journal.files.atomic('delivery/journal/unknown.ndjson', 'not-a-journal\n')
        expect(() => readOverview(options)).toThrow('store-unreadable')
      }),
  )
})
