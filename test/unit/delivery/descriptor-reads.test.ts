import {
  appendFileSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSourceBytes } from '../../../src/delivery/input.js'
import { readJournalSegment } from '../../../src/delivery/journal-segment.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    readSync: vi.fn(fs.readSync),
    fstatSync: vi.fn(fs.fstatSync),
    lstatSync: vi.fn(fs.lstatSync),
  }
})
const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
afterEach(() => {
  vi.mocked(readSync).mockReset().mockImplementation(actual.readSync)
  vi.mocked(fstatSync).mockReset().mockImplementation(actual.fstatSync)
  vi.mocked(lstatSync).mockReset().mockImplementation(actual.lstatSync)
})
type Kind = 'source' | 'journal'
function fixture(
  kind: Kind,
  run: (input: { selected: string; read: (limit?: number) => Buffer }) => void,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-bounded-descriptor-'))),
    directory = join(root, 'journal'),
    name = '0000000000000001.ndjson'
  mkdirSync(directory)
  const parent = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY),
    identity = fstatSync(parent, { bigint: true }),
    selected = kind === 'source' ? join(root, 'source') : join(directory, name)
  writeFileSync(selected, 'original')
  vi.mocked(readSync).mockClear()
  vi.mocked(fstatSync).mockClear()
  try {
    run({
      selected,
      read: (limit) =>
        kind === 'source'
          ? readSourceBytes(root, 'source', limit)
          : readJournalSegment(directory, identity, name),
    })
  } finally {
    closeSync(parent)
    rmSync(root, { recursive: true, force: true })
  }
}
describe('bounded regular descriptor reads', () => {
  for (const kind of ['source', 'journal'] as const) {
    it.each([0, 8, 4096])(
      `retains complete ${kind} bytes and explicit EOF proof (%i bytes)`,
      (size) =>
        fixture(kind, ({ selected, read }) => {
          const bytes = Buffer.alloc(size, 120)
          writeFileSync(selected, bytes)
          expect(read()).toEqual(bytes)
          expect(readSync).toHaveBeenCalledTimes(size === 0 ? 1 : 2)
        }),
    )
    it(`continues actual short ${kind} reads until all expected bytes arrive`, () =>
      fixture(kind, ({ read }) => {
        vi.mocked(readSync).mockImplementation((...args) => {
          const selected: unknown[] = [...args]
          selected[3] = Math.min(Number(selected[3]), 2)
          return Reflect.apply(actual.readSync, undefined, selected)
        })
        expect(read()).toEqual(Buffer.from('original'))
        expect(readSync).toHaveBeenCalledTimes(5)
      }))
    it(`refuses a ${kind} regular file whose advertised extent omits actual bytes`, () =>
      fixture(kind, ({ read }) => {
        vi.mocked(fstatSync).mockImplementation((...args) => {
          const observed = Reflect.apply(actual.fstatSync, undefined, args)
          if (observed?.isFile())
            Object.defineProperty(observed, 'size', {
              value: typeof observed.size === 'bigint' ? 0n : 0,
            })
          return observed
        })
        vi.mocked(lstatSync).mockImplementation((...args) => {
          const observed = Reflect.apply(actual.lstatSync, undefined, args)
          if (observed?.isFile())
            Object.defineProperty(observed, 'size', {
              value: typeof observed.size === 'bigint' ? 0n : 0,
            })
          return observed
        })
        expect(read).toThrow()
        expect(readSync).toHaveBeenCalled()
      }))
    it(`never issues a zero-byte ${kind} read when growth fills the bounded buffer`, () =>
      fixture(kind, ({ selected, read }) => {
        vi.mocked(fstatSync).mockImplementationOnce((...args) => {
          const observed = Reflect.apply(actual.fstatSync, undefined, args)
          appendFileSync(selected, 'x')
          return observed
        })
        expect(read).toThrow()
        expect(readSync).toHaveBeenCalledTimes(1)
        expect(
          vi
            .mocked(readSync)
            .mock.calls.every((call) => Number((call as readonly unknown[])[3]) > 0),
        ).toBe(true)
      }))
    it(`refuses premature ${kind} EOF`, () =>
      fixture(kind, ({ read }) => {
        vi.mocked(readSync).mockReturnValueOnce(0)
        expect(read).toThrow()
      }))
    it.each(['grow', 'truncate', 'edit', 'alias'] as const)(
      `refuses %s during a ${kind} read`,
      (mode) =>
        fixture(kind, ({ selected, read }) => {
          vi.mocked(readSync).mockImplementationOnce((...args) => {
            const length = Reflect.apply(actual.readSync, undefined, args)
            if (mode === 'grow') appendFileSync(selected, 'changed')
            else if (mode === 'truncate') truncateSync(selected, 1)
            else if (mode === 'edit') {
              const before = actual.statSync(selected)
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
              writeFileSync(selected, 'modified')
              utimesSync(selected, before.atime, before.mtime)
            } else {
              renameSync(selected, `${selected}.saved`)
              symlinkSync(`${selected}.saved`, selected)
            }
            return length
          })
          expect(read).toThrow()
        }),
    )
  }
  it('keeps the actual-byte quota refusal even when a regular file advertises an empty extent', () =>
    fixture('source', ({ read }) => {
      vi.mocked(fstatSync).mockImplementation((...args) => {
        const observed = Reflect.apply(actual.fstatSync, undefined, args)
        if (observed.isFile())
          Object.defineProperty(observed, 'size', {
            value: typeof observed.size === 'bigint' ? 0n : 0,
          })
        return observed
      })
      expect(() => read(0)).toThrow('oversized')
    }))
  it.each(['grow', 'truncate', 'edit', 'alias'] as const)(
    'refuses %s after the final source descriptor stat',
    (mode) =>
      fixture('source', ({ selected, read }) => {
        let calls = 0
        vi.mocked(fstatSync).mockImplementation((...args) => {
          const observed = Reflect.apply(actual.fstatSync, undefined, args)
          if (++calls === 2) {
            if (mode === 'grow') appendFileSync(selected, 'changed')
            else if (mode === 'truncate') truncateSync(selected, 1)
            else if (mode === 'edit') {
              const before = actual.statSync(selected)
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
              writeFileSync(selected, 'modified')
              utimesSync(selected, before.atime, before.mtime)
            } else {
              renameSync(selected, `${selected}.saved`)
              symlinkSync(`${selected}.saved`, selected)
            }
          }
          return observed
        })
        expect(read).toThrow()
      }),
  )
})
