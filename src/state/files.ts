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
    const created = mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
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
      // A view's own bytes stay unflushed, but a directory it creates may later
      // hold committed facts, so every directory the store creates is durable.
      if (durable) flushDirectory(dirname(path))
      flushCreatedEntries(created, dirname(path))
    } finally {
      if (existsSync(temporary)) rmSync(temporary)
    }
  }

  /** Create a store directory whose entry survives power loss like a committed fact. */
  directory(relative: string): string {
    assertObservationWritable()
    const path = this.path(relative)
    flushCreatedEntries(mkdirSync(path, { recursive: true, mode: 0o700 }), path)
    return path
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
    const created = mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
    renameSync(lock, target)
    for (const path of [this.root, dirname(target)]) flushDirectory(path)
    flushCreatedEntries(created, dirname(target))
  }

  locked<T>(operation: () => T, timeoutMs = 5000): T {
    assertObservationWritable()
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647)
      throw new Error('Invalid store lock timeout')
    // A store root created here must survive with the first fact flushed under it.
    const root = this.path('.')
    flushCreatedEntries(mkdirSync(root, { recursive: true, mode: 0o700 }), root)
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

function flushDirectory(path: string): void {
  const directory = openSync(path, 'r')
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
}

/**
 * Flushing a file and its directory does not make a directory created for it
 * durable: each new directory's entry lives in its parent. `created` is the
 * topmost directory mkdir created (undefined when none was), so every parent
 * from `dirname(created)` down to `deepest`'s parent is flushed. `deepest`
 * itself holds no entry this creation added; its writers flush it.
 */
function flushCreatedEntries(created: string | undefined, deepest: string): void {
  if (created === undefined) return
  for (let path = deepest; path !== dirname(path); ) {
    path = dirname(path)
    flushDirectory(path)
    if (path === dirname(created)) return
  }
}
