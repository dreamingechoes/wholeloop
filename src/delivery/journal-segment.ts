import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from 'node:fs'
import { join } from 'node:path'
import { DeliveryJournalError } from './events.js'

const SEGMENT_LIMIT = 8 * 1024 * 1024

/** The caller pins this canonical external directory with an open descriptor for its observation. */
export function readJournalSegment(
  directory: string,
  original: Pick<BigIntStats, 'dev' | 'ino'>,
  name: string,
): Buffer {
  let fd: number | undefined
  // A matching physical parent cannot select private records elsewhere in the
  // store. Check it around every leaf, rather than resolving every shared path
  // component again. This is not an arbitrary source-path reader.
  const parent = () => {
    const current = lstatSync(directory, { bigint: true })
    if (current.isSymbolicLink()) throw new DeliveryJournalError('aliased-journal-path')
    if (!current.isDirectory() || current.dev !== original.dev || current.ino !== original.ino)
      throw new DeliveryJournalError('changed-journal-directory')
  }
  try {
    if (!/^\d{16}\.ndjson$/.test(name)) throw new DeliveryJournalError('unreadable-journal-segment')
    parent()
    const selected = join(directory, name),
      leaf = lstatSync(selected, { bigint: true })
    if (leaf.isSymbolicLink()) throw new DeliveryJournalError('aliased-journal-path')
    fd = openSync(selected, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const before = fstatSync(fd, { bigint: true })
    if (
      !before.isFile() ||
      before.size < 0n ||
      before.size > BigInt(SEGMENT_LIMIT) ||
      leaf.dev !== before.dev ||
      leaf.ino !== before.ino
    )
      throw new DeliveryJournalError('unreadable-journal-segment')
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let length = 0
    while (length < bytes.length) {
      const read = readSync(fd, bytes, length, bytes.length - length, null)
      if (!read) break
      length += read
    }
    const after = fstatSync(fd, { bigint: true }),
      current = lstatSync(selected, { bigint: true })
    if (current.isSymbolicLink()) throw new DeliveryJournalError('aliased-journal-path')
    // Big integers preserve inode and timestamp identity without rounding two
    // different observations into the same JavaScript number.
    if (
      BigInt(length) !== before.size ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      !current.isFile() ||
      current.dev !== after.dev ||
      current.ino !== after.ino ||
      current.size !== after.size ||
      current.mtimeNs !== after.mtimeNs ||
      current.ctimeNs !== after.ctimeNs
    )
      throw new DeliveryJournalError('unreadable-journal-segment')
    parent()
    return bytes.subarray(0, length)
  } catch (error) {
    if (error instanceof DeliveryJournalError) throw error
    throw new DeliveryJournalError('unreadable-journal-segment')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
