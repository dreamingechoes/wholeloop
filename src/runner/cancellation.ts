// Private, nonce-bound cancellation requests read by the native process wrapper.
import { lstatSync } from 'node:fs'
import { readSourceFile } from '../delivery/input.js'
import type { StoreFiles } from '../state/files.js'
import { assertObservationWritable } from '../state/read-observation.js'

/** The fixed wrapper has no module loader for core code; keep its reader explicit. */
export const NATIVE_CANCELLATION_READER = `const cancellationRequested = (() => {
  let buffer
  const unchanged = (a, b) => b.isFile() && a.dev === b.dev && a.ino === b.ino &&
    a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs
  return () => {
    let fd
    try {
      fd = openSync(request.cancel, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      const before = fstatSync(fd, { bigint: true })
      if (!before.isFile() || before.size > 65536n) return false
      buffer ??= Buffer.allocUnsafe(65537)
      let offset = 0
      while (offset < buffer.length) {
        const count = readSync(fd, buffer, offset, buffer.length - offset, null)
        if (!count) break
        offset += count
      }
      if (offset > 65536 || !unchanged(before, fstatSync(fd, { bigint: true })) ||
        !unchanged(before, lstatSync(request.cancel, { bigint: true }))) return false
      return JSON.parse(buffer.subarray(0, offset).toString('utf8')).nonce === request.nonce
    } catch { return false }
    finally { if (fd !== undefined) closeSync(fd) }
  }
})()`

export function cancellationNonce(files: StoreFiles, relative: string): unknown {
  if (lstatSync(files.path(relative), { throwIfNoEntry: false }) === undefined) return undefined
  const text = readSourceFile(files.root, relative, 65536)
  return text ? JSON.parse(text).nonce : undefined
}

/** A repeated request still observes current bytes; removal must permit republication. */
export function writeCancellationRequest(files: StoreFiles, relative: string, nonce: string) {
  assertObservationWritable()
  try {
    if (cancellationNonce(files, relative) === nonce) return
  } catch {
    // A damaged request never prevents the original owner from replacing it.
    // The same atomic writer retains containment and durability enforcement.
  }
  files.atomic(relative, JSON.stringify({ nonce }))
}
