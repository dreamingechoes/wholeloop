import { stringify } from 'yaml'
import type { Item, StateEvent } from './events.js'

export function projections(
  items: ReadonlyMap<string, Item>,
  _events: readonly StateEvent[] = [],
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
  return files
}
