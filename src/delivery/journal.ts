import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { isObject } from '../config/schema.js'
import { StoreFiles } from '../state/files.js'
import { canonicalPath, storePath } from '../state/paths.js'
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
import { readSourceBytes, readSourceFile, safeSourceText } from './input.js'
import { replayDelivery } from './reducer.js'

// Readers reconstruct authority from current bytes hundreds of times per run.
// Retain only the last full replay; identical committed segment bytes yield
// identical validated events and states, while any difference replays again.
let replayed:
  | {
      directory: string
      segments: { name: string; bytes: Buffer; events: DeliveryEvent[] }[]
      states: Map<string, DeliveryProjection>
    }
  | undefined

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
  snapshot() {
    const directory = this.ownedPath('delivery/journal')
    if (!existsSync(directory))
      return { events: [] as DeliveryEvent[], states: new Map<string, DeliveryProjection>() }
    const original = statSync(directory),
      events: DeliveryEvent[] = [],
      segments: NonNullable<typeof replayed>['segments'] = [],
      prior = replayed?.directory === directory ? replayed.segments : []
    let unchanged = prior.length > 0
    if (!original.isDirectory()) throw new DeliveryJournalError('unreadable-journal-segment')
    for (const name of readdirSync(directory).sort()) {
      if (!/^\d{16}\.ndjson$/.test(name)) {
        if (name.endsWith('.ndjson')) throw new DeliveryJournalError('unknown-journal-segment')
        continue
      }
      let bytes: Buffer
      // Segments are plain leaves in one already checked external directory.
      // Keep exact alias refusal per leaf without rechecking every common
      // ancestor thousands of times; reobserve directory ownership before return.
      const selected = resolve(directory, name)
      if (canonicalPath(selected) !== selected)
        throw new DeliveryJournalError('aliased-journal-path')
      try {
        bytes = readSourceBytes(this.files.root, `delivery/journal/${name}`, 8 * 1024 * 1024)
      } catch {
        throw new DeliveryJournalError('unreadable-journal-segment')
      }
      const same = prior[segments.length]
      if (unchanged && same?.name === name && same.bytes.equals(bytes)) {
        segments.push(same)
        events.push(...structuredClone(same.events))
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
        if (index === 0 && this.segment(value.sequence) !== `delivery/journal/${name}`)
          throw new DeliveryJournalError('segment-sequence')
        parsed.push(value)
      }
      segments.push({ name, bytes: Buffer.from(bytes), events: structuredClone(parsed) })
      events.push(...parsed)
    }
    const current = statSync(this.ownedPath('delivery/journal'))
    if (current.dev !== original.dev || current.ino !== original.ino || !current.isDirectory())
      throw new DeliveryJournalError('changed-journal-directory')
    if (unchanged && replayed && segments.length === prior.length)
      return { events, states: structuredClone(replayed.states) }
    const states = replayDelivery(events)
    replayed = { directory, segments, states: structuredClone(states) }
    return { events, states }
  }

  events(): DeliveryEvent[] {
    return this.snapshot().events
  }
  list(): DeliveryProjection[] {
    return [...this.snapshot().states.values()]
  }
  get(run: string): DeliveryProjection {
    this.run(run)
    const state = this.snapshot().states.get(run)
    if (!state) throw new DeliveryJournalError('unknown-run')
    return state
  }

  transaction<T>(
    actor: DeliveryActor,
    operation: (
      view: () => ReadonlyMap<string, DeliveryProjection>,
      append: (run: string, payload: DeliveryPayload) => void,
    ) => T,
  ): T {
    return this.files.locked(() => {
      const observed = this.snapshot(),
        events = observed.events,
        original = events.length
      let states = observed.states
      const ts = this.now()
      const result = operation(
        () => new Map([...states].map(([run, state]) => [run, structuredClone(state)])),
        (run, payload) => {
          if (events.length - original >= 1000)
            throw new DeliveryJournalError('transaction-event-limit')
          const event = deliveryEvent(run, actor, payload, events.at(-1), ts)
          if (Buffer.byteLength(JSON.stringify(event)) > 65536)
            throw new DeliveryJournalError('event-byte-limit')
          const next = replayDelivery([...events, event])
          for (const state of next.values()) validateDeliveryProjection(state)
          events.push(event)
          states = next
        },
      )
      if (events.length === original) return result
      const added = events.slice(original),
        first = added[0]
      if (!first) throw new DeliveryJournalError('empty-transaction')
      const segment = this.segment(first.sequence)
      if (existsSync(this.ownedPath(segment))) throw new DeliveryJournalError('segment-collision')
      const projections = [...new Set(added.map((event) => event.run))].sort().map((run) => {
        const state = states.get(run)
        if (!state) throw new DeliveryJournalError('missing-projection')
        const path = this.projection(run)
        this.ownedPath(path)
        this.cacheStatus(state)
        return { path, body: this.render(state) }
      })
      const body = `${added.map((event) => JSON.stringify(event)).join('\n')}\n`
      if (Buffer.byteLength(body) > 8 * 1024 * 1024)
        throw new DeliveryJournalError('segment-byte-limit')
      // This one replacement is the commit point. Projection failures never erase retained events.
      this.files.atomic(segment, body)
      for (const projection of projections) this.files.atomic(projection.path, projection.body)
      return result
    })
  }

  cacheStatus(state: DeliveryProjection): 'current' | 'missing' | 'stale' {
    const path = this.projection(state.run)
    if (!existsSync(this.ownedPath(path))) return 'missing'
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
      return 'stale'
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
      return 'stale'
    }
    return raw === this.render(state) ? 'current' : 'stale'
  }

  rebuild(): { runs: number; written: number } {
    return this.files.locked(() => {
      const states = this.list().sort((a, b) => a.run.localeCompare(b.run))
      for (const state of states) {
        validateDeliveryProjection(state)
        this.ownedPath(this.projection(state.run))
      }
      const cached = new Map(states.map((state) => [state.run, this.cacheStatus(state)]))
      let written = 0
      for (const state of states)
        if (cached.get(state.run) !== 'current') {
          this.files.atomic(this.projection(state.run), this.render(state))
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
