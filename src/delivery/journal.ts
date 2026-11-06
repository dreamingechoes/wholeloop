import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { StoreFiles } from '../state/files.js'
import { storePath } from '../state/paths.js'
import { inReadObservation, observedRead } from '../state/read-observation.js'
import {
  type DeliveryActor,
  type DeliveryEvent,
  DeliveryJournalError,
  type DeliveryPayload,
  type DeliveryProjection,
  deliveryEvent,
  validateDeliveryEvent,
  validateDeliveryProjection,
} from './events.js'
import { readSourceFile, safeSourceText } from './input.js'
import {
  journalFile,
  journalLayout,
  journalMembership,
  journalWrite,
  verifyJournalFile,
} from './journal-layout.js'
import { readJournalSegment } from './journal-segment.js'
import { deliveryReplay } from './reducer.js'

// Readers reconstruct authority from current bytes hundreds of times per run.
// Retain only the last full replay; identical committed segment bytes yield
// identical validated events and states, while any difference replays again.
let replayed:
  | {
      directory: string
      segments: { name: string; bytes: Buffer; events: DeliveryEvent[] }[]
      states: Map<string, DeliveryProjection>
      context?: ReturnType<typeof deliveryReplay>
      inventory?: ReturnType<typeof journalLayout>
    }
  | undefined

// Directory entries are read on every call. Only identical complete entry
// vectors can reuse their parsed/sorted layout; file contents and types stay fresh.
let inventoried:
  | {
      directory: string
      names: string[]
      layout: ReturnType<typeof journalLayout>
      membership: string[]
    }
  | undefined
function currentLayout(directory: string) {
  const names = readdirSync(directory)
  const previous = inventoried
  if (
    previous?.directory === directory &&
    names.length === previous.names.length &&
    names.every((name, index) => name === previous.names[index])
  )
    return previous
  const layout = journalLayout(names)
  inventoried = { directory, names, layout, membership: journalMembership(layout) }
  return inventoried
}

/** Cached projections are shared by every borrowed view, so none may change. */
function frozenStates(states: Map<string, DeliveryProjection>) {
  const freeze = (value: unknown) => {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
    Object.freeze(value)
    for (const entry of Object.values(value)) freeze(entry)
  }
  for (const state of states.values()) freeze(state)
  return states
}

type ProjectionCache = { path: string; status: 'missing' | 'stale' } | { path: string; raw: string }

/** Immutable atomic segments avoid a multi-file journal commit or dependence on wall-clock order. */
export class DeliveryJournal {
  readonly files: StoreFiles
  constructor(
    store = storePath(),
    readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.files = new StoreFiles(store)
  }

  /** One fresh read per observation; reuse a replay only for identical current segment bytes. */
  private readSnapshot() {
    if (!inReadObservation()) return this.readPhysicalSnapshot().value
    return observedRead(`journal:${this.files.root}`, () => this.readPhysicalSnapshot())
  }

  private readPhysicalSnapshot() {
    const directory = this.ownedPath('delivery/journal')
    if (!existsSync(directory))
      return {
        bytes: Buffer.from('absent'),
        value: {
          events: [] as DeliveryEvent[],
          states: new Map<string, DeliveryProjection>(),
          segments: [] as NonNullable<typeof replayed>['segments'],
          membership: [] as string[],
          owner: undefined as typeof replayed,
        },
      }
    const fd = openSync(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    try {
      const ownedReplay = replayed?.directory === directory ? replayed : undefined
      const original = fstatSync(fd, { bigint: true }),
        events: DeliveryEvent[] = [],
        segments: NonNullable<typeof replayed>['segments'] = [],
        prior = ownedReplay?.segments ?? []
      let unchanged = prior.length > 0
      if (!original.isDirectory()) throw new DeliveryJournalError('unreadable-journal-segment')
      const { layout, membership } = currentLayout(directory)
      for (const selected of layout) {
        const name = selected.name
        const bytes = readJournalSegment(directory, original, name)
        const same = prior[segments.length]
        if (unchanged && same?.name === name && same.bytes.equals(bytes)) {
          if (ownedReplay?.inventory !== layout) verifyJournalFile(selected, same.events)
          segments.push(same)
          events.push(...same.events)
          continue
        }
        unchanged = false
        let raw: string
        try {
          raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
          safeSourceText(raw, 8 * 1024 * 1024)
        } catch {
          throw new DeliveryJournalError('unreadable-journal-segment')
        }
        if (!raw.endsWith('\n')) throw new DeliveryJournalError('incomplete-journal-segment')
        const lines = raw.slice(0, -1).split('\n'),
          parsed: DeliveryEvent[] = []
        if (lines.length > 1000) throw new DeliveryJournalError('segment-event-limit')
        for (const [index, line] of lines.entries()) {
          let value: unknown
          try {
            if (Buffer.byteLength(line) > 65536) throw new Error()
            value = JSON.parse(line)
          } catch {
            throw new DeliveryJournalError('invalid-journal-line')
          }
          validateDeliveryEvent(value)
          if (index === 0 && value.sequence !== selected.first)
            throw new DeliveryJournalError('segment-sequence')
          parsed.push(value)
        }
        verifyJournalFile(selected, parsed)
        segments.push({ name, bytes: Buffer.from(bytes), events: structuredClone(parsed) })
        events.push(...parsed)
      }
      const current = statSync(this.ownedPath('delivery/journal'), { bigint: true })
      if (current.dev !== original.dev || current.ino !== original.ino || !current.isDirectory())
        throw new DeliveryJournalError('changed-journal-directory')
      let owner =
        unchanged && ownedReplay && segments.length === prior.length ? ownedReplay : undefined
      if (!owner) {
        const context = deliveryReplay(events)
        // Independent reader views must not alias the context moved into a
        // later writer. Only private events, never caller state, seed it.
        owner = {
          directory,
          segments,
          states: frozenStates(context.snapshot()),
          context,
          inventory: layout,
        }
      } else owner.inventory = layout
      replayed = owner
      const states = owner.states
      // Length framing binds exact segment names and bytes, including otherwise
      // semantically equivalent whitespace edits. No file-metadata cache is used.
      const bytes = inReadObservation()
        ? Buffer.concat([
            Buffer.from(`${JSON.stringify(membership)}:`),
            ...segments.flatMap((segment) => [
              Buffer.from(`${segment.name}:${segment.bytes.length}:`),
              segment.bytes,
            ]),
          ])
        : Buffer.alloc(0)
      return { bytes, value: { events, states, segments, membership, owner } }
    } finally {
      closeSync(fd)
    }
  }

  snapshot() {
    const observed = this.readSnapshot()
    return { events: structuredClone(observed.events), states: structuredClone(observed.states) }
  }

  /** Reports need one run and its original event source from the same fresh read.
   * Clone only those public views, not every unrelated projection. */
  runSnapshot(run: string) {
    this.run(run)
    const observed = this.readSnapshot(),
      state = observed.states.get(run)
    if (!state) throw new DeliveryJournalError('unknown-run')
    return { state: structuredClone(state), events: structuredClone(observed.events) }
  }

  /** A callback may change source files. Never retire their authority using older buffered bytes. */
  private packingInputs(
    segments: NonNullable<typeof replayed>['segments'],
    from: number,
    membership: readonly string[],
  ) {
    const directory = this.ownedPath('delivery/journal')
    const fd = openSync(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    try {
      const original = fstatSync(fd, { bigint: true })
      if (!original.isDirectory()) throw new DeliveryJournalError('unreadable-journal-segment')
      const names = currentLayout(directory).membership
      if (
        names.length !== membership.length ||
        names.some((name, index) => name !== membership[index])
      )
        throw new DeliveryJournalError('changed-journal-before-pack')
      const bytes: Buffer[] = []
      for (let index = from; index < segments.length; index++) {
        const segment = segments[index]
        if (!segment) throw new DeliveryJournalError('changed-journal-before-pack')
        const current = readJournalSegment(directory, original, segment.name)
        if (!current.equals(segment.bytes))
          throw new DeliveryJournalError('changed-journal-before-pack')
        bytes.push(current)
      }
      const current = statSync(this.ownedPath('delivery/journal'), { bigint: true })
      if (!current.isDirectory() || current.dev !== original.dev || current.ino !== original.ino)
        throw new DeliveryJournalError('changed-journal-directory')
      return bytes
    } finally {
      closeSync(fd)
    }
  }
  events(): DeliveryEvent[] {
    return structuredClone(this.readSnapshot().events)
  }
  list(): DeliveryProjection[] {
    return structuredClone([...this.readSnapshot().states.values()])
  }
  get(run: string): DeliveryProjection {
    return structuredClone(this.view(run))
  }
  /**
   * The current validated projection itself, deeply frozen when it was cached,
   * for synchronous read-only callers (ADR-0239). It costs no copy; any write
   * throws. Never retain it across an await or a mutation: read it again.
   */
  view(run: string): DeliveryProjection {
    this.run(run)
    const state = this.readSnapshot().states.get(run)
    if (!state) throw new DeliveryJournalError('unknown-run')
    return state
  }
  /** Every current frozen projection; see view(). */
  views(): DeliveryProjection[] {
    return [...this.readSnapshot().states.values()]
  }

  transaction<T>(
    actor: DeliveryActor,
    operation: (
      view: () => ReadonlyMap<string, DeliveryProjection>,
      append: (run: string, payload: DeliveryPayload, metadata?: { rationale?: string }) => void,
    ) => T,
  ): T {
    return this.files.locked(() => {
      const observed = this.readSnapshot(),
        events = [...observed.events],
        lines: string[] = [],
        original = events.length
      let candidate: ReturnType<typeof deliveryReplay> | undefined
      let completed: Map<string, DeliveryProjection> | undefined
      let accepting = true
      const ts = this.now()
      let result: T
      try {
        result = operation(
          () =>
            completed
              ? structuredClone(completed)
              : candidate
                ? candidate.snapshot()
                : structuredClone(observed.states),
          (run, payload, metadata) => {
            if (!accepting) throw new DeliveryJournalError('closed-transaction')
            if (events.length - original >= 1000)
              throw new DeliveryJournalError('transaction-event-limit')
            const event = deliveryEvent(run, actor, payload, events.at(-1), ts, metadata)
            const line = JSON.stringify(event)
            if (Buffer.byteLength(line) > 65536) throw new DeliveryJournalError('event-byte-limit')
            // Every current source byte and witness was checked above. Move the
            // private context out of that cache before any mutation: readers
            // keep independent states, and another writer cannot take it again.
            if (!candidate && observed.owner?.context) {
              candidate = observed.owner.context
              delete observed.owner.context
            }
            if (candidate) candidate.append(event)
            else candidate = deliveryReplay([...events, event])
            events.push(event)
            // Immutable text already passed the byte limit; the replay receives
            // its own event clone, so publication can use these exact bytes.
            lines.push(line)
          },
        )
      } finally {
        // A retained callback must never change facts after publication capture.
        accepting = false
      }
      if (events.length === original) return result
      if (!candidate) throw new DeliveryJournalError('empty-transaction')
      // Retained view callbacks must stay on this completed transaction even
      // after its context moves into a later writer.
      const states = candidate.snapshot()
      completed = states
      const added = events.slice(original),
        first = added[0]
      if (!first) throw new DeliveryJournalError('empty-transaction')
      const segment = this.segment(first.sequence)
      if (existsSync(this.ownedPath(segment))) throw new DeliveryJournalError('segment-collision')
      const projections = [...new Set(added.map((event) => event.run))].sort().map((run) => {
        const state = states.get(run)
        if (!state) throw new DeliveryJournalError('missing-projection')
        // Publication needs cache version/path validation, not a discarded
        // current/stale comparison that serializes this changed state again.
        const cache = this.projectionCache(run)
        return { path: cache.path, body: this.render(state) }
      })
      const body = `${lines.join('\n')}\n`
      if (Buffer.byteLength(body) > 8 * 1024 * 1024)
        throw new DeliveryJournalError('segment-byte-limit')
      const last = added.at(-1)
      if (!last) throw new DeliveryJournalError('empty-transaction')
      const write = journalWrite(
        observed.segments.map((part) => {
          const first = part.events[0],
            last = part.events.at(-1)
          if (!first || !last) throw new DeliveryJournalError('unreadable-journal-segment')
          return {
            first: first.sequence,
            last: last.sequence,
            events: part.events.length,
            bytes: part.bytes.length,
            digest: last.digest,
            kind:
              journalFile(part.name)?.digest === undefined
                ? ('legacy' as const)
                : ('bounded' as const),
          }
        }),
        {
          first: first.sequence,
          last: last.sequence,
          events: added.length,
          bytes: Buffer.byteLength(body),
          digest: last.digest,
          kind: 'bounded',
        },
      )
      const target = `delivery/journal/${write.name}`
      if (target !== segment && existsSync(this.ownedPath(target)))
        throw new DeliveryJournalError('segment-collision')
      const content =
        write.from < observed.segments.length
          ? Buffer.concat([
              ...this.packingInputs(observed.segments, write.from, observed.membership),
              Buffer.from(body),
            ])
          : body
      // Capture before the writer boundary: even a failing/reentrant wrapper must
      // not pair changed input bytes with these already validated event/state facts.
      // Every later reader still opens and compares the complete current bytes.
      const published = {
        directory: resolve(this.files.root, 'delivery/journal'),
        segments: [
          ...observed.segments.slice(0, write.from),
          {
            name: write.name,
            bytes: Buffer.from(content),
            events: structuredClone(events.slice(write.first - 1)),
          },
        ],
        states: frozenStates(structuredClone(states)),
        context: candidate,
      }
      // One replacement commits either a plain tail or its immutable packed range.
      // Earlier files remain untouched; projection failure never erases committed events.
      this.files.atomic(target, content)
      replayed = published
      for (const projection of projections) this.files.project(projection.path, projection.body)
      return result
    })
  }

  private projectionCache(run: string): ProjectionCache {
    const path = this.projection(run)
    if (!existsSync(this.ownedPath(path))) return { path, status: 'missing' }
    let raw: string
    try {
      raw = readSourceFile(this.files.root, path, 8 * 1024 * 1024)
    } catch {
      throw new DeliveryJournalError('unreadable-projection')
    }
    let cached: unknown
    try {
      cached = JSON.parse(raw)
    } catch {
      return { path, status: 'stale' }
    }
    if (
      isObject(cached) &&
      typeof cached.schema === 'string' &&
      cached.schema !== 'wholeloop/delivery-state@1'
    )
      throw new DeliveryJournalError('unsupported-projection-version')
    try {
      validateDeliveryProjection(cached)
    } catch (error) {
      if (error instanceof DeliveryJournalError && error.problem === 'unsupported-facet-version')
        throw error
      return { path, status: 'stale' }
    }
    return { path, raw }
  }

  cacheStatus(state: DeliveryProjection): 'current' | 'missing' | 'stale' {
    const cache = this.projectionCache(state.run)
    return 'status' in cache ? cache.status : cache.raw === this.render(state) ? 'current' : 'stale'
  }

  rebuild(): { runs: number; written: number } {
    return this.files.locked(() => {
      const states = this.list().sort((a, b) => a.run.localeCompare(b.run))
      for (const state of states) {
        validateDeliveryProjection(state)
        this.ownedPath(this.projection(state.run))
      }
      const planned = states.map((state) => {
        const cache = this.projectionCache(state.run)
        const body = this.render(state)
        return { path: cache.path, body, changed: 'status' in cache || cache.raw !== body }
      })
      let written = 0
      for (const projection of planned)
        if (projection.changed) {
          this.files.project(projection.path, projection.body)
          written++
        }
      return { runs: states.length, written }
    })
  }

  private render(state: DeliveryProjection): string {
    return `${JSON.stringify(state, null, 2)}\n`
  }
  private ownedPath(relative: string): string {
    const path = this.files.path(relative)
    // Store containment alone permits aliases into private authority records in the same store.
    if (path !== resolve(this.files.root, relative))
      throw new DeliveryJournalError('aliased-journal-path')
    return path
  }
  private projection(run: string): string {
    this.run(run)
    return `delivery/state/${run}.json`
  }
  private segment(sequence: number): string {
    return `delivery/journal/${String(sequence).padStart(16, '0')}.ndjson`
  }
  private run(run: string): void {
    if (!/^delivery-[a-f0-9]{16}$/.test(run)) throw new DeliveryJournalError('invalid-run')
  }
}
