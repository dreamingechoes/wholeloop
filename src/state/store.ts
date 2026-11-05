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
import { projections } from './projections.js'
import { inReadObservation, observedRead } from './read-observation.js'

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
      replay(events)
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
        const files = projections(replay(events), events)
        for (const path of files.keys()) this.files.path(path)
        const month = `journal/${ts.slice(0, 7)}.ndjson`
        const batch = events
          .slice(originalLength)
          .map((entry) => JSON.stringify(entry))
          .join('\n')
        this.files.atomic(month, `${this.files.read(month) ?? ''}${batch}\n`)
        // Journal first: a crash here is repaired by rebuild; reads always replay.
        for (const [path, content] of files) this.files.atomic(path, content)
      }
      return result
    })
  }

  create(input: ItemInput): Item {
    const id = this.transaction((events, append) => {
      const existing = replay(events)
      let id = itemId(input.kind)
      while (existing.has(id)) id = itemId(input.kind)
      append(id, { type: 'item.created', data: input })
      return id
    })
    return this.get(id)
  }
  update(id: string, patch: ItemPatch): Item {
    this.transaction((_events, append) => {
      append(id, { type: 'item.updated', data: patch })
    })
    return this.get(id)
  }
  note(id: string, text: string): Item {
    this.transaction((_events, append) => {
      append(id, { type: 'note.added', data: { text } })
    })
    return this.get(id)
  }
  link(id: string, url: string): Item {
    this.transaction((_events, append) => {
      append(id, { type: 'link.added', data: { url } })
    })
    return this.get(id)
  }
  rebuild(): number {
    return this.files.locked(() => {
      const events = this.events()
      const files = projections(replay(events), events)
      for (const [path, content] of files) this.files.atomic(path, content)
      return files.size
    })
  }
}
