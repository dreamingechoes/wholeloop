import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  RegularFileError,
  readRegularFile,
  readRegularFileStrict,
  readRegularText,
} from '../../../src/fs/regular-file.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wholeloop-regular-file-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const reason = (path: string, limit: number, follow = false) => {
  try {
    readRegularFileStrict(path, limit, { follow })
    return 'read'
  } catch (error) {
    return error instanceof RegularFileError ? error.reason : 'other'
  }
}

describe('readRegularFile', () => {
  it('reads a regular file with its permission bits', () => {
    const file = join(dir, 'plain.txt')
    writeFileSync(file, 'hello\n', { mode: 0o640 })
    expect(readRegularFile(file, 6)).toEqual({ bytes: Buffer.from('hello\n'), mode: 0o640 })
    expect(readRegularText(file, 6)).toBe('hello\n')
  })

  it.each([
    { name: 'a missing path', setup: () => join(dir, 'absent'), expected: 'missing' },
    {
      name: 'a symbolic link',
      setup: () => {
        writeFileSync(join(dir, 'target'), 'secret')
        symlinkSync(join(dir, 'target'), join(dir, 'link'))
        return join(dir, 'link')
      },
      expected: 'not-regular',
    },
    {
      name: 'a directory',
      setup: () => {
        mkdirSync(join(dir, 'folder'))
        return join(dir, 'folder')
      },
      expected: 'not-regular',
    },
    {
      name: 'an oversized file',
      setup: () => {
        writeFileSync(join(dir, 'large'), 'x'.repeat(11))
        return join(dir, 'large')
      },
      expected: 'too-large',
    },
  ])('refuses $name', ({ setup, expected }) => {
    const path = setup()
    expect(reason(path, 10)).toBe(expected)
    expect(readRegularFile(path, 10)).toBeUndefined()
  })

  it('follows a link only when asked, and still checks what it reaches', () => {
    writeFileSync(join(dir, 'target'), 'linked')
    symlinkSync(join(dir, 'target'), join(dir, 'link'))
    expect(readRegularText(join(dir, 'link'), 10, { follow: true })).toBe('linked')
    expect(reason(join(dir, 'link'), 3, true)).toBe('too-large')
  })

  it('reads the file it opened even when the path is replaced by a link before the read', () => {
    const file = join(dir, 'checked.json')
    writeFileSync(file, '{"safe":true}')
    writeFileSync(join(dir, 'secret'), 'private')
    const read = readRegularText(file, 1024, {
      afterOpen: () => {
        rmSync(file)
        symlinkSync(join(dir, 'secret'), file)
      },
    })
    expect(read).toBe('{"safe":true}')
  })

  it('reads the opened file when another file is renamed over the path', () => {
    const file = join(dir, 'checked.txt')
    writeFileSync(file, 'original')
    writeFileSync(join(dir, 'other'), 'replacement')
    expect(
      readRegularText(file, 1024, { afterOpen: () => renameSync(join(dir, 'other'), file) }),
    ).toBe('original')
  })

  it('refuses a file that grows past the limit after it was opened', () => {
    const file = join(dir, 'growing.log')
    writeFileSync(file, 'small')
    let error: unknown
    try {
      readRegularFileStrict(file, 8, { afterOpen: () => appendFileSync(file, ' and growing') })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(RegularFileError)
    expect((error as RegularFileError).reason).toBe('too-large')
  })
})
