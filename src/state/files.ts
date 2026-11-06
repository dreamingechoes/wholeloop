import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { externalStorePath } from './paths.js'
import { assertObservationWritable } from './read-observation.js'

/** All store mutations pass through this boundary, including locks and temp files. */
export class StoreFiles {
  readonly root: string
  constructor(root: string) {
    this.root = externalStorePath(root)
  }

  path(relative: string): string {
    return externalStorePath(resolve(this.root, relative), this.root, relative)
  }

  read(relative: string): string | undefined {
    const path = this.path(relative)
    try {
      return readFileSync(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  /** Durable replacement for committed facts: file and directory are flushed before return. */
  atomic(relative: string, content: string | Uint8Array): void {
    assertObservationWritable()
    this.replace(relative, this.path(relative), content, true)
  }

  /**
   * Journal-derived views only (ADR-0242). Readers replay the flushed journal and
   * rebuild regenerates these files, so a crash may leave a view stale but never
   * changes a fact. Replacement stays atomic for concurrent readers; identical
   * current bytes already are the planned view, so nothing is rewritten.
   */
  project(relative: string, content: string): void {
    assertObservationWritable()
    const path = this.path(relative)
    try {
      if (readFileSync(path).equals(Buffer.from(content))) return
    } catch {
      // Absent or unreadable views take the ordinary replacement and its errors.
    }
    this.replace(relative, path, content, false)
  }

  private replace(relative: string, path: string, content: string | Uint8Array, durable: boolean) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const temporary = this.path(`${relative}.${randomUUID()}.tmp`)
    const fd = openSync(temporary, 'wx', 0o600)
    try {
      try {
        writeFileSync(fd, content)
        if (durable) fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      renameSync(temporary, path)
      if (!durable) return
      const directory = openSync(dirname(path), 'r')
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    } finally {
      if (existsSync(temporary)) rmSync(temporary)
    }
  }

  /** Preserve a verified stopped writer's lock instead of deleting its ownership evidence. */
  retainLock(destination: string): void {
    assertObservationWritable()
    const lock = this.path('.lock'),
      target = this.path(destination)
    if (
      lock !== resolve(this.root, '.lock') ||
      target !== resolve(this.root, destination) ||
      !/^delivery\/recovered-locks\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(
        destination,
      ) ||
      existsSync(target)
    )
      throw new Error('Refuse an aliased or occupied lock retention destination')
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    renameSync(lock, target)
    for (const path of [this.root, dirname(target)]) {
      const directory = openSync(path, 'r')
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    }
  }

  locked<T>(operation: () => T, timeoutMs = 5000): T {
    assertObservationWritable()
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647)
      throw new Error('Invalid store lock timeout')
    mkdirSync(this.path('.'), { recursive: true, mode: 0o700 })
    const lock = this.path('.lock')
    const deadline = performance.now() + timeoutMs
    let wait: Int32Array | undefined
    while (true) {
      try {
        mkdirSync(lock, { mode: 0o700 })
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        // Wall-clock adjustment cannot extend contention or consume its budget
        // early. Zero still permits the initial uncontended acquisition.
        const remaining = deadline - performance.now()
        if (remaining <= 0)
          throw new Error(
            `Store is locked: ${lock}. Inspect owner.json; remove the lock only after confirming its writer has stopped.`,
          )
        wait ??= new Int32Array(new SharedArrayBuffer(4))
        Atomics.wait(wait, 0, 0, Math.min(10, remaining))
      }
    }
    try {
      // Diagnostic owner metadata, not a committed fact (ADR-0242). The lock
      // directory's own mkdir/rmdir are never flushed, so syncing this file gave
      // no coherent power-loss guarantee; an absent or partial owner is already
      // "unknown" and blocks recovery. Exclusive creation inside the directory
      // this writer just created keeps the containment-checked path.
      writeFileSync(
        this.path('.lock/owner.json'),
        `${JSON.stringify({ pid: process.pid, started: new Date().toISOString() })}\n`,
        { flag: 'wx', mode: 0o600 },
      )
      return operation()
    } finally {
      rmSync(this.path('.lock'), { recursive: true })
    }
  }
}
