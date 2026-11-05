import {
  appendFileSync,
  closeSync,
  constants,
  fstatSync,
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
import { DeliveryJournalError } from '../../../src/delivery/events.js'
import { readJournalSegment } from '../../../src/delivery/journal-segment.js'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, readSync: vi.fn(fs.readSync) }
})
const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
afterEach(() => vi.mocked(readSync).mockReset().mockImplementation(actual.readSync))

const name = '0000000000000001.ndjson'
function fixture(
  run: (context: {
    root: string
    directory: string
    selected: string
    identity: ReturnType<typeof fstatSync> & { dev: bigint; ino: bigint }
  }) => void,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wholeloop-journal-leaf-'))),
    directory = join(root, 'journal'),
    selected = join(directory, name)
  mkdirSync(directory)
  writeFileSync(selected, 'original\n')
  const fd = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    run({ root, directory, selected, identity: fstatSync(fd, { bigint: true }) })
  } finally {
    closeSync(fd)
    rmSync(root, { recursive: true, force: true })
  }
}

describe('fresh flat journal reads bound to their original physical parent', () => {
  it('reads complete current binary bytes and empty leaves without inspecting unrelated source paths', () =>
    fixture(({ directory, identity, selected }) => {
      const bytes = Buffer.from([0, 255, 1, 254])
      writeFileSync(selected, bytes)
      expect(readJournalSegment(directory, identity, name)).toEqual(bytes)
      writeFileSync(selected, Buffer.from([3, 255, 1, 254]))
      expect(readJournalSegment(directory, identity, name)).toEqual(Buffer.from([3, 255, 1, 254]))
      truncateSync(selected, 0)
      expect(readJournalSegment(directory, identity, name)).toEqual(Buffer.alloc(0))
    }))

  it.each(['../outside.ndjson', '/outside.ndjson', 'bad.ndjson', '0000000000000001.ndjson/leaf'])(
    'refuses non-leaf selection %s before reading',
    (selection) =>
      fixture(({ directory, identity }) => {
        vi.mocked(readSync).mockClear()
        expect(() => readJournalSegment(directory, identity, selection)).toThrow(
          DeliveryJournalError,
        )
        expect(readSync).not.toHaveBeenCalled()
      }),
  )

  it.each(['leaf', 'directory'] as const)('refuses an aliased %s before reading', (kind) =>
    fixture(({ directory, identity, selected }) => {
      const path = kind === 'leaf' ? selected : directory,
        retained = `${path}.retained`
      renameSync(path, retained)
      symlinkSync(retained, path)
      vi.mocked(readSync).mockClear()
      expect(() => readJournalSegment(directory, identity, name)).toThrow('aliased-journal-path')
      expect(readSync).not.toHaveBeenCalled()
    }),
  )

  it('refuses a substituted parent and oversized leaf before reading', () =>
    fixture(({ directory, identity, selected }) => {
      vi.mocked(readSync).mockClear()
      expect(() =>
        readJournalSegment(directory, { ...identity, ino: identity.ino + 1n }, name),
      ).toThrow('changed-journal-directory')
      truncateSync(selected, 8 * 1024 * 1024 + 1)
      expect(() => readJournalSegment(directory, identity, name)).toThrow(
        'unreadable-journal-segment',
      )
      expect(readSync).not.toHaveBeenCalled()
    }))

  it.each([
    'grow',
    'truncate',
    'edit',
    'replace-leaf',
    'alias-leaf',
    'replace-parent',
    'alias-parent',
  ] as const)('refuses %s during a descriptor read', (kind) =>
    fixture(({ root, directory, identity, selected }) => {
      vi.mocked(readSync).mockImplementationOnce((...args) => {
        const length: number = Reflect.apply(actual.readSync, undefined, args)
        if (kind === 'grow') appendFileSync(selected, 'x')
        else if (kind === 'truncate') truncateSync(selected, 1)
        else if (kind === 'edit') {
          const before = actual.statSync(selected)
          // Preserve the old mtime, but allow even coarse filesystem clocks
          // to observe the new ctime of this concurrent same-length edit.
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
          writeFileSync(selected, 'changed!\n')
          utimesSync(selected, before.atime, before.mtime)
        } else if (kind === 'replace-leaf' || kind === 'alias-leaf') {
          renameSync(selected, `${selected}.retained`)
          if (kind === 'replace-leaf') writeFileSync(selected, 'original\n')
          else symlinkSync(`${selected}.retained`, selected)
        } else {
          renameSync(directory, `${directory}.retained`)
          const replacement = kind === 'replace-parent' ? directory : join(root, 'foreign')
          mkdirSync(replacement)
          writeFileSync(join(replacement, name), 'original\n')
          if (kind === 'alias-parent') symlinkSync(replacement, directory)
        }
        return length
      })
      expect(() => readJournalSegment(directory, identity, name)).toThrow(DeliveryJournalError)
    }),
  )
})
