// Reads a bounded regular file through the descriptor it checked. Checking a path and then reading
// it by name lets the file be swapped in between, for example for a symbolic link (#34).
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'

export interface RegularFile {
  bytes: Buffer
  /** Permission bits of the file that was read. */
  mode: number
}

export interface RegularFileOptions {
  /**
   * Follow a symbolic link at the last path component. Off by default: most callers refused links
   * before reading. Callers that accepted a link keep doing so, and still read what they checked.
   */
  follow?: boolean
  /**
   * Called once the descriptor is open, before it is checked and read. Tests use it to replace or
   * grow the file at that moment, which is the window this module exists to close.
   * @internal
   */
  afterOpen?: () => void
}

export type RegularFileReason = 'missing' | 'not-regular' | 'too-large' | 'unreadable'

export class RegularFileError extends Error {
  constructor(readonly reason: RegularFileReason) {
    super(`Not a bounded regular file: ${reason}`)
  }
}

// O_NOFOLLOW refuses a link at the leaf; O_NONBLOCK keeps a FIFO planted at the path from blocking
// the open. Windows has neither, and its file locking makes the swap this guards against unlikely.
const READ_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0)
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0
const CHUNK = 64 * 1024

/**
 * Read the regular file at the path, of at most `limit` bytes, or throw a RegularFileError saying
 * why not. Type and size come from the opened descriptor, and the bytes are read to the end, so a
 * file that grows past the limit after the check is refused rather than returned cut short.
 */
export function readRegularFileStrict(
  path: string,
  limit: number,
  options: RegularFileOptions = {},
): RegularFile {
  let fd: number | undefined
  try {
    try {
      fd = openSync(path, READ_FLAGS | (options.follow ? 0 : NO_FOLLOW))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // ELOOP is a link refused by O_NOFOLLOW; EISDIR and ENXIO are a directory or a socket.
      throw new RegularFileError(
        code === 'ENOENT' || code === 'ENOTDIR'
          ? 'missing'
          : code === 'ELOOP' || code === 'EISDIR' || code === 'ENXIO'
            ? 'not-regular'
            : 'unreadable',
      )
    }
    options.afterOpen?.()
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new RegularFileError('not-regular')
    if (stat.size > limit) throw new RegularFileError('too-large')
    const chunks: Buffer[] = []
    let length = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(CHUNK, limit - length + 1))
      const read = readSync(fd, chunk, 0, chunk.length, null)
      if (!read) break
      length += read
      if (length > limit) throw new RegularFileError('too-large')
      chunks.push(chunk.subarray(0, read))
    }
    return { bytes: Buffer.concat(chunks, length), mode: stat.mode & 0o777 }
  } catch (error) {
    throw error instanceof RegularFileError ? error : new RegularFileError('unreadable')
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** The same read, or undefined for any reason it is refused. */
export function readRegularFile(
  path: string,
  limit: number,
  options: RegularFileOptions = {},
): RegularFile | undefined {
  try {
    return readRegularFileStrict(path, limit, options)
  } catch {
    return undefined
  }
}

/** The same read decoded as UTF-8, or undefined for any reason it is refused. */
export function readRegularText(
  path: string,
  limit: number,
  options: RegularFileOptions = {},
): string | undefined {
  return readRegularFile(path, limit, options)?.bytes.toString('utf8')
}
