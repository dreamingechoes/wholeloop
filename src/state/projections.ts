import { stringify } from 'yaml'
import type { Item, StateEvent } from './events.js'
import { replayMailbox } from './mailbox.js'

export function projections(
  items: ReadonlyMap<string, Item>,
  events: readonly StateEvent[] = [],
): Map<string, string> {
  const files = new Map<string, string>()
  const links: Record<string, string[]> = {}
  for (const item of [...items.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const { body, notes, links: refs, ...metadata } = item
    const noteText = notes.length
      ? `\n## Notes\n\n${notes.map((note) => `- ${note.ts} (${note.id}): ${note.text}`).join('\n')}\n`
      : ''
    const linkText = refs.length
      ? `\n## Links\n\n${refs.map((ref) => `- ${ref}`).join('\n')}\n`
      : ''
    files.set(
      `items/${item.id}/${item.kind}.md`,
      `---\n${stringify(metadata)}---\n\n${body}\n${noteText}${linkText}`,
    )
    links[item.id] = refs
  }
  files.set('links.json', `${JSON.stringify(links, null, 2)}\n`)
  const mailbox = replayMailbox(events)
  const threads = new Map<string, string[]>()
  for (const message of mailbox.messages) {
    const thread = threads.get(message.thread) ?? []
    thread.push(JSON.stringify(message))
    threads.set(message.thread, thread)
  }
  for (const [id, messages] of threads)
    files.set(`mailbox/${id}.ndjson`, `${messages.join('\n')}\n`)
  files.set('cursors.json', `${JSON.stringify(mailbox.cursors, null, 2)}\n`)
  return files
}
