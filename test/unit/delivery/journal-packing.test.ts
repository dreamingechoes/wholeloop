import { mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  type DeliveryEvent,
  deliveryEvent,
  type RegistrationPayload,
} from '../../../src/delivery/events.js'
import { DeliveryJournal } from '../../../src/delivery/journal.js'
import * as layout from '../../../src/delivery/journal-layout.js'
import {
  type JournalExtent,
  journalFile,
  journalLayout,
  journalWrite,
} from '../../../src/delivery/journal-layout.js'
import * as segments from '../../../src/delivery/journal-segment.js'
import { withReadObservation } from '../../../src/state/read-observation.js'

const raw = (first: number) => `${String(first).padStart(16, '0')}.ndjson`
const digest = (sequence: number) => sequence.toString(16).padStart(64, '0')
const packed = (first: number, last: number, sha = digest(last)) =>
  `${String(first).padStart(16, '0')}-${String(last).padStart(16, '0')}-${sha}.ndjson`
function source(journal: DeliveryJournal, first: number, last = first) {
  const file = readdirSync(journal.files.path('delivery/journal'))
    .map(journalFile)
    .find((file) => file?.first === first && file.last === last)
  if (!file) throw new Error('Missing bounded fixture source')
  return `delivery/journal/${file.name}`
}
function isRange(path: string, first: number, last: number) {
  const file = journalFile(path.split('/').at(-1) ?? '')
  return file?.first === first && file.last === last
}
function extent(first: number, last = first, bytes = 1024): JournalExtent {
  return { first, last, bytes, events: last - first + 1, digest: digest(last), kind: 'bounded' }
}
const registration = (): RegistrationPayload => ({
  schema: 'wholeloop/delivery-registration-event@1',
  basis: { kind: 'plan', digest: 'a'.repeat(64), revision: 1 },
  source: 'b'.repeat(64),
  policy: { digest: 'c'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
  units: [{ id: 'search', role: 'implementation', repository: 'app' }],
})
const runId = (index: number) => `delivery-${index.toString(16).padStart(16, '0')}`
async function fixture(run: (journal: DeliveryJournal) => void | Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'wholeloop-journal-packing-fault-'))
  try {
    await run(new DeliveryJournal(join(root, 'state'), () => '2026-11-06T00:00:00.000Z'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
function register(journal: DeliveryJournal, index: number) {
  journal.transaction({ kind: 'controller', name: 'Fixture' }, (_, append) =>
    append(runId(index), registration()),
  )
}

describe('bounded immutable journal packing', () => {
  it('keeps its original replay facts when a nested reader observes another store', () =>
    fixture(async (journal) => {
      register(journal, 0)
      await fixture((other) => {
        register(other, 1)
        expect(journal.get(runId(0)).run).toBe(runId(0))
        const original = segments.readJournalSegment
        const read = vi.spyOn(segments, 'readJournalSegment').mockImplementationOnce((...args) => {
          const bytes = original(...args)
          expect(other.get(runId(1)).run).toBe(runId(1))
          return bytes
        })
        try {
          expect(journal.get(runId(0)).run).toBe(runId(0))
        } finally {
          read.mockRestore()
        }
      })
    }))
  it('reuses layout parsing only after comparing the complete fresh entry vector', () =>
    fixture((journal) => {
      register(journal, 0)
      const parse = vi.spyOn(layout, 'journalLayout'),
        read = vi.spyOn(segments, 'readJournalSegment')
      try {
        for (let index = 0; index < 12; index++) expect(journal.get(runId(0)).state).toBe('planned')
        expect(read).toHaveBeenCalledTimes(12)
        expect(parse).toHaveBeenCalledTimes(1)
        journal.files.atomic('delivery/journal/unrecognized.ndjson', 'not-a-journal\n')
        expect(() => journal.get(runId(0))).toThrow('unknown-journal-segment')
      } finally {
        parse.mockRestore()
        read.mockRestore()
      }
    }))
  it('binds retained witness membership across an asynchronous observation gap', () =>
    fixture(async (journal) => {
      register(journal, 0)
      register(journal, 1)
      let release: () => void = () => undefined
      const gap = new Promise<void>((resolve) => {
        release = resolve
      })
      const observed = withReadObservation(new AbortController().signal, async () => {
        journal.get(runId(1))
        await gap
        return journal.get(runId(1))
      })
      const witness = journal.files.path(source(journal, 1))
      renameSync(witness, `${witness}.retained`)
      release()
      await expect(observed).rejects.toThrow('Read observation')
    }))
  it('refuses a self-consistent larger pack that rewrites a witnessed earlier prefix', () =>
    fixture((journal) => {
      register(journal, 0)
      register(journal, 1)
      const forged: DeliveryEvent[] = []
      for (let index = 0; index < 3; index++)
        forged.push(
          deliveryEvent(
            runId(index),
            { kind: 'controller', name: 'Changed Fixture' },
            registration(),
            forged.at(-1),
            '2026-11-06T00:00:00.000Z',
          ),
        )
      const last = forged.at(-1)
      if (!last) throw new Error('Missing forged fixture tail')
      journal.files.atomic(
        `delivery/journal/${packed(1, 3, last.digest)}`,
        `${forged.map((value) => JSON.stringify(value)).join('\n')}\n`,
      )
      expect(() => journal.events()).toThrow('changed-packed-history')
    }))
  it('checks changed witness names even when active bytes match its publication cache', () =>
    fixture((journal) => {
      register(journal, 0)
      register(journal, 1)
      const original = readFileSync(journal.files.path(source(journal, 1)))
      journal.files.atomic(`delivery/journal/${packed(1, 1, 'f'.repeat(64))}`, original)
      expect(() => journal.events()).toThrow('changed-packed-history')
    }))
  it('checks the active filename digest against the complete actual event tail', () =>
    fixture((journal) => {
      register(journal, 0)
      renameSync(
        journal.files.path(source(journal, 1)),
        journal.files.path(`delivery/journal/${packed(1, 1, 'f'.repeat(64))}`),
      )
      expect(() => journal.events()).toThrow('segment-digest')
    }))
  it('keeps a legacy prefix authoritative while packing only its newer bounded tail', () =>
    fixture((journal) => {
      journal.transaction({ kind: 'controller', name: 'Fixture' }, (_, append) => {
        for (let index = 0; index < 3; index++) append(runId(index), registration())
      })
      const legacy = `delivery/journal/${raw(1)}`
      renameSync(journal.files.path(source(journal, 1, 3)), journal.files.path(legacy))
      const original = readFileSync(journal.files.path(legacy))
      register(journal, 3)
      register(journal, 4)
      expect(
        journalLayout(readdirSync(journal.files.path('delivery/journal'))).map((file) => [
          file.first,
          file.last,
        ]),
      ).toEqual([
        [1, undefined],
        [4, 5],
      ])
      expect(journal.events()).toHaveLength(5)
      expect(readFileSync(journal.files.path(legacy))).toEqual(original)
      journal.files.atomic(legacy, 'not-json\n')
      expect(() => journal.events()).toThrow('invalid-journal-line')
    }))
  it('does not let a new prefix pack hide the tail of an earlier multi-event file', () =>
    fixture((journal) => {
      journal.transaction({ kind: 'controller', name: 'Fixture' }, (_, append) => {
        for (let index = 0; index < 3; index++) append(runId(index), registration())
      })
      const events = journal.events(),
        last = events[1]
      if (!last) throw new Error('Missing fixture prefix')
      const body = readFileSync(journal.files.path(source(journal, 1, 3)), 'utf8')
      journal.files.atomic(
        `delivery/journal/${packed(1, 2, last.digest)}`,
        `${body.trimEnd().split('\n').slice(0, 2).join('\n')}\n`,
      )
      expect(journal.events()).toEqual(events)
    }))
  it('never lets a new range retire a legacy file with an undeclared tail', () =>
    fixture((journal) => {
      journal.transaction({ kind: 'controller', name: 'Fixture' }, (_, append) => {
        for (let index = 0; index < 3; index++) append(runId(index), registration())
      })
      const original = source(journal, 1, 3),
        legacy = `delivery/journal/${raw(1)}`
      renameSync(journal.files.path(original), journal.files.path(legacy))
      const events = journal.events(),
        last = events[1]
      if (!last) throw new Error('Missing fixture prefix')
      const body = readFileSync(journal.files.path(legacy), 'utf8')
      journal.files.atomic(
        `delivery/journal/${packed(1, 2, last.digest)}`,
        `${body.trimEnd().split('\n').slice(0, 2).join('\n')}\n`,
      )
      expect(() => journal.events()).toThrow('legacy-journal-range-overlap')
    }))
  it('refuses a callback changing input bytes instead of packing older buffered facts', () =>
    fixture((journal) => {
      register(journal, 0)
      const path = source(journal, 1)
      const original = readFileSync(journal.files.path(path), 'utf8')
      expect(() =>
        journal.transaction({ kind: 'controller', name: 'Fixture' }, (_, append) => {
          append(runId(1), registration())
          journal.files.atomic(path, ` ${original}`)
        }),
      ).toThrow('changed-journal-before-pack')
      expect(journal.events()).toHaveLength(1)
      expect(journal.list()).toHaveLength(1)
    }))
  it.each(['before', 'after'] as const)(
    'retains the exact atomic commit boundary when publication fails %s rename',
    (when) =>
      fixture((journal) => {
        register(journal, 0)
        const retained = readFileSync(journal.files.path(source(journal, 1)))
        const atomic = journal.files.atomic.bind(journal.files)
        const fault = vi.spyOn(journal.files, 'atomic').mockImplementation((path, content) => {
          if (isRange(path, 1, 2)) {
            if (when === 'after') atomic(path, content)
            throw new Error('Injected pack publication failure')
          }
          atomic(path, content)
        })
        try {
          expect(() => register(journal, 1)).toThrow('Injected pack publication failure')
        } finally {
          fault.mockRestore()
        }
        expect(readFileSync(journal.files.path(source(journal, 1)))).toEqual(retained)
        expect(journal.events()).toHaveLength(when === 'after' ? 2 : 1)
        if (when === 'after') {
          expect(journal.get(runId(1)).state).toBe('planned')
          expect(journal.rebuild()).toEqual({ runs: 2, written: 1 })
        } else expect(() => journal.get(runId(1))).toThrow('unknown-run')
      }),
  )
  it('does not trust a writer that changes the supplied packed buffer', () =>
    fixture((journal) => {
      register(journal, 0)
      const atomic = journal.files.atomic.bind(journal.files)
      const faulty = vi.spyOn(journal.files, 'atomic').mockImplementation((path, content) => {
        if (isRange(path, 1, 2) && typeof content !== 'string') content[0] = 91
        atomic(path, content)
      })
      try {
        register(journal, 1)
      } finally {
        faulty.mockRestore()
      }
      expect(() => journal.get(runId(1))).toThrow('invalid-journal-line')
    }))
  it('keeps original bytes and revalidates the active pack rather than its retained input', () =>
    fixture((journal) => {
      register(journal, 0)
      const original = readFileSync(journal.files.path(source(journal, 1)))
      register(journal, 1)
      expect(readFileSync(journal.files.path(source(journal, 1)))).toEqual(original)
      const path = source(journal, 1, 2)
      journal.files.atomic(path, 'not-json\n')
      expect(() => journal.events()).toThrow('invalid-journal-line')
    }))
  it.skipIf(process.platform === 'win32')(
    'refuses an aliased active pack before it can supply cached facts',
    () =>
      fixture((journal) => {
        register(journal, 0)
        register(journal, 1)
        const path = journal.files.path(source(journal, 1, 2))
        rmSync(path)
        symlinkSync(journal.files.path(source(journal, 1)), path)
        expect(() => journal.events()).toThrow('aliased-journal-path')
      }),
  )
  it('rejects a declared packed range that differs from its actual event tail', () =>
    fixture((journal) => {
      register(journal, 0)
      register(journal, 1)
      const body = readFileSync(journal.files.path(source(journal, 1, 2)))
      journal.files.atomic(`delivery/journal/${packed(1, 3)}`, body)
      expect(() => journal.events()).toThrow('segment-sequence')
    }))
  it('reparses semantically equivalent edits instead of trusting publication metadata', () =>
    fixture((journal) => {
      register(journal, 0)
      register(journal, 1)
      const expected = journal.events()
      const path = source(journal, 1, 2)
      const body = readFileSync(journal.files.path(path), 'utf8')
      journal.files.atomic(path, ` ${body}`)
      const parse = vi.spyOn(JSON, 'parse')
      try {
        expect(journal.events()).toEqual(expected)
        expect(
          parse.mock.calls.filter(([text]) =>
            /^\s*\{"schema":"wholeloop\/delivery-event@1"/.test(text),
          ),
        ).toHaveLength(2)
      } finally {
        parse.mockRestore()
      }
    }))
  it.each([100, 400])('bounds descriptor count and write amplification at %i commits', (count) => {
    let earlier: JournalExtent[] = []
    const names: string[] = [],
      activeNames: string[] = []
    let written = 0,
      input = 0
    for (let sequence = 1; sequence <= count; sequence++) {
      // A slow decrease reproduces the worst case for comparing raw sizes.
      const bytes = 2048 - sequence
      const write = journalWrite(earlier, extent(sequence, sequence, bytes))
      written += write.bytes
      input += bytes
      earlier = [...earlier.slice(0, write.from), write]
      activeNames.splice(write.from, activeNames.length - write.from, write.name)
      names.push(write.name)
    }
    expect(journalLayout(names).map((file) => file.name)).toEqual(activeNames)
    expect(earlier.length).toBeLessThanOrEqual(Math.ceil(Math.log2(count)) + 1)
    expect(written).toBeLessThanOrEqual(input * (Math.ceil(Math.log2(count)) + 1))
    expect(names).toHaveLength(count)
  })
  it('preserves bounded witnesses, retains legacy files and rejects partial overlaps', () => {
    const files = journalLayout([
      packed(1, 1),
      packed(2, 2),
      packed(1, 2),
      packed(3, 3),
      packed(1, 3),
      '.temporary',
    ])
    expect(files.map((file) => file.name)).toEqual([packed(1, 3)])
    expect(files[0]?.witnesses).toHaveLength(4)
    expect(() => journalLayout([raw(1), packed(1, 2)])).toThrow('legacy-journal-range-overlap')
    expect(journalLayout([raw(1), packed(2, 2)]).map((file) => file.name)).toEqual([
      raw(1),
      packed(2, 2),
    ])
    expect(() => journalLayout([packed(1, 3), packed(2, 4)])).toThrow(
      'overlapping-journal-segments',
    )
    expect(() => journalLayout(['unrecognized.ndjson'])).toThrow('unknown-journal-segment')
    expect(() => journalLayout([packed(1, 1001)])).toThrow('segment-sequence')
  })
  it('does not merge across byte, event-count, legacy, sequence or safe-integer limits', () => {
    expect(journalWrite([extent(1, 1, 8 * 1024 * 1024)], extent(2, 2, 8 * 1024 * 1024)).from).toBe(
      1,
    )
    expect(journalWrite([extent(1, 1000)], extent(1001)).from).toBe(1)
    expect(journalWrite([{ ...extent(1), kind: 'legacy' }], extent(2)).from).toBe(1)
    expect(() => journalWrite([extent(1)], extent(3))).toThrow('invalid-pack-selection')
    expect(() => journalWrite([], extent(1, 1, Number.POSITIVE_INFINITY))).toThrow(
      'invalid-pack-selection',
    )
  })
  it.each([32, 128])('reads few active files after %i actual atomic transactions', (count) => {
    const root = mkdtempSync(join(tmpdir(), 'wholeloop-journal-packing-'))
    const journal = new DeliveryJournal(join(root, 'state'), () => '2026-11-06T00:00:00.000Z')
    try {
      const atomic = vi.spyOn(journal.files, 'atomic')
      for (let index = 0; index < count; index++)
        journal.transaction({ kind: 'controller', name: 'Fixture' }, (_, append) => {
          append(`delivery-${index.toString(16).padStart(16, '0')}`, registration())
        })
      const publications = atomic.mock.calls.filter(([path]) =>
        path.startsWith('delivery/journal/'),
      )
      atomic.mockRestore()
      expect(publications).toHaveLength(count)
      const read = vi.spyOn(segments, 'readJournalSegment')
      const parse = vi.spyOn(JSON, 'parse')
      const last = `delivery-${(count - 1).toString(16).padStart(16, '0')}`
      try {
        expect(journal.get(last).state).toBe('planned')
        const opened = read.mock.calls.length
        const eventParses = parse.mock.calls.filter(([text]) =>
          /^\s*\{"schema":"wholeloop\/delivery-event@1"/.test(text),
        ).length
        console.info('Actual packed journal poll:', JSON.stringify({ count, opened, eventParses }))
        expect(opened).toBeLessThanOrEqual(Math.ceil(Math.log2(count)) + 2)
        expect(eventParses).toBe(0)
        expect(read.mock.calls.map(([, , name]) => name)).toEqual(
          journalLayout(readdirSync(journal.files.path('delivery/journal'))).map(
            (file) => file.name,
          ),
        )
        const events = journal.events()
        expect(journal.events()).toEqual(events)
        expect(journal.list()).toHaveLength(count)
      } finally {
        parse.mockRestore()
        read.mockRestore()
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
