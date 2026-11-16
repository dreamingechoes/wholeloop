// Reads a bounded regular file through the descriptor it checked, for the release and conformance
// scripts. It mirrors src/fs/regular-file.ts: scripts run without a build, so they cannot import it.
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'

/**
 * The bytes of the regular file at the path, of at most `limit` bytes. Throws when the path is
 * missing, a symbolic link, not a regular file or too large, including a file that grows past the
 * limit after it was opened. The check and the read share one descriptor.
 */
export function readRegularFile(path, limit) {
  const fd = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  )
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > limit) throw new Error('Not a bounded regular file')
    const chunks = []
    let length = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, limit - length + 1))
      const read = readSync(fd, chunk, 0, chunk.length, null)
      if (!read) break
      length += read
      if (length > limit) throw new Error('Not a bounded regular file')
      chunks.push(chunk.subarray(0, read))
    }
    return Buffer.concat(chunks, length)
  } finally {
    closeSync(fd)
  }
}
