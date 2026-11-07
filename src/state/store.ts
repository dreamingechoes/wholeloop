// The state store: journal appends and projection writes under the writer lock.
import { existsSync, readdirSync } from 'node:fs'
import type { EventMetadata } from './attribution.js'
import {
  event,
  type Item,
  type ItemInput,
  type ItemPatch,
  itemId,
  replay,
  type StateEvent,
  validateEvent,
} from './events.js'
import { StoreFiles } from './files.js'
import { storePath } from './paths.js'
import { projections, replayProjectionSnapshot, replayProjections } from './projections.js'
import { inReadObservation, observedRead } from './read-observation.js'

const BASIC_ITEM_EVENTS = new Set<StateEvent['type']>([
  'item.created',
  'item.updated',
  'item.closed',
  'note.added',
  'link.added',
])

export class StateStore {
  readonly files: StoreFiles
  constructor(root = storePath()) {
    this.files = new StoreFiles(root)
  }

  events(): StateEvent[] {
    if (!inReadObservation()) return this.readEvents().value
    return structuredClone(observedRead(`state-events:${this.files.root}`, () => this.readEvents()))
  }

  private readEvents() {
    const directory = this.files.path('journal')
    if (!existsSync(directory)) return { bytes: Buffer.from('absent'), value: [] as StateEvent[] }
    const events: StateEvent[] = []
    const segments: Buffer[] = []
    for (const name of readdirSync(directory).sort()) {
      if (!/^\d{4}-\d{2}\.ndjson$/.test(name)) continue
      const content = this.files.read(`journal/${name}`) ?? ''
      if (inReadObservation())
        segments.push(Buffer.from(`${name}:${Buffer.byteLength(content)}:${content}`))
      if (content && !content.endsWith('\n'))
        throw new Error(`Incomplete journal file: ${name}; preserve it and recover before writing`)
      const lines = content.split('\n')
      for (const [index, line] of lines.entries()) {
        if (!line && index === lines.length - 1) continue
        try {
          const value: unknown = JSON.parse(line)
          validateEvent(value)
          events.push(value)
        } catch (error) {
          throw new Error(
            `${name}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }
    return { bytes: Buffer.concat(segments), value: events }
  }

  list(): Item[] {
    return [...replay(this.events()).values()].sort((a, b) => a.id.localeCompare(b.id))
  }
  get(id: string): Item {
    const item = replay(this.events()).get(id)
    if (!item) throw new Error(`Unknown item: ${id}`)
    return item
  }

  transaction<T>(
    operation: (
      events: readonly StateEvent[],
      append: (
        subject: string,
        data: Parameters<typeof event>[1],
        metadata?: EventMetadata,
      ) => void,
    ) => T,
  ): T {
    return this.files.locked(() => {
      const events = this.events()
      const initial = replay(events)
      const originalLength = events.length
      const last = events.at(-1)?.ts
      // One batch belongs to one month and one atomic journal replacement.
      const ts = new Date(Math.max(Date.now(), last ? Date.parse(last) + 1 : 0)).toISOString()
      const append = (
        subject: string,
        data: Parameters<typeof event>[1],
        metadata?: EventMetadata,
      ) => {
        const entry = event(subject, data, ts, metadata)
        replay([...events, entry])
        events.push(entry)
      }
      const result = operation(events, append)
      if (events.length > originalLength) {
        const files = replayProjections(events)
        for (const path of files.keys()) this.files.path(path)
        // Compare authoritative versions in memory, never file mtimes or a
        // retained cache. Workflow/artifact events keep their complete refresh;
        // unrelated stale views have explicit rebuild as their recovery path.
        const previous =
          originalLength > 0 &&
          events.slice(originalLength).every((entry) => BASIC_ITEM_EVENTS.has(entry.type))
            ? projections(initial, events.slice(0, originalLength))
            : undefined
        this.publishProjectionBatch(events, originalLength, ts, files, previous)
      }
      return result
    })
  }

  /** Both callers hold the writer lock and have validated every planned path. */
  private publishProjectionBatch(
    events: readonly StateEvent[],
    originalLength: number,
    ts: string,
    files: ReadonlyMap<string, string>,
    previous?: ReadonlyMap<string, string>,
  ) {
    const month = `journal/${ts.slice(0, 7)}.ndjson`,
      batch = events
        .slice(originalLength)
        .map((entry) => JSON.stringify(entry))
        .join('\n')
    this.files.atomic(month, `${this.files.read(month) ?? ''}${batch}\n`)
    // Journal first: a crash here is repaired by rebuild; reads always replay.
    for (const [path, content] of files)
      if (previous?.get(path) !== content) this.files.project(path, content)
  }

  private appendBasic(
    input: Extract<
      Parameters<typeof event>[1],
      { type: 'item.created' | 'item.updated' | 'note.added' | 'link.added' }
    >,
    subject?: string,
  ) {
    return this.files.locked(() => {
      const events = this.events(),
        originalLength = events.length,
        before =
          originalLength && input.type === 'item.created'
            ? replayProjectionSnapshot(events)
            : undefined,
        previous = originalLength ? (before?.files ?? replayProjections(events)) : undefined,
        last = events.at(-1)?.ts,
        ts = new Date(Math.max(Date.now(), last ? Date.parse(last) + 1 : 0)).toISOString()
      // This fixed action has no callback or effect between its owned before
      // view and complete final validation. Generic append callbacks keep all
      // intermediate replays; their inputs may not borrow this assumption.
      let id = subject ?? ''
      if (input.type === 'item.created') {
        id = ''
        // A broken/randomness-test source must not hold the writer forever.
        // Sixteen refused collisions leave the original journal untouched.
        for (let attempt = 0; attempt < 16; attempt++) {
          const candidate = itemId(input.data.kind)
          if (before?.items.has(candidate)) continue
          id = candidate
          break
        }
        if (!id) throw new Error('Unable to allocate a unique item id')
      }
      events.push(event(id, input, ts))
      const files = replayProjections(events)
      for (const path of files.keys()) this.files.path(path)
      this.publishProjectionBatch(events, originalLength, ts, files, previous)
      return id
    })
  }

  create(input: ItemInput): Item {
    const id = this.appendBasic({ type: 'item.created', data: input })
    return this.get(id)
  }
  update(id: string, patch: ItemPatch): Item {
    this.appendBasic({ type: 'item.updated', data: patch }, id)
    return this.get(id)
  }
  note(id: string, text: string): Item {
    this.appendBasic({ type: 'note.added', data: { text } }, id)
    return this.get(id)
  }
  link(id: string, url: string): Item {
    this.appendBasic({ type: 'link.added', data: { url } }, id)
    return this.get(id)
  }
  rebuild(): number {
    return this.files.locked(() => {
      const events = this.events()
      const files = replayProjections(events)
      for (const [path, content] of files) this.files.project(path, content)
      return files.size
    })
  }
}
