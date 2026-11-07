// Publishes an approved scope plan as child items of its initiative.
import { stringify } from 'yaml'
import { publicationPlan } from '../providers/publication.js'
import { type EventData, itemId, replay, type StateEvent } from '../state/events.js'
import type { ScopePlan } from './contract.js'

export function publishScopes(options: {
  root: string
  userFile: string
  configuration: Record<string, unknown>
  subject: string
  run: string
  plan: ScopePlan
  events: readonly StateEvent[]
  append: (subject: string, event: EventData) => void
}) {
  const { events, append, plan, subject, run } = options
  const items = replay(events)
  const parent = items.get(subject)
  if (parent?.kind !== 'initiative') throw new Error('Cut scopes on an initiative')
  const definitions = events.filter(
    (entry) => entry.type === 'scope.defined' && entry.data.initiative === subject,
  )
  const ids = new Map<string, string>()
  for (const scope of plan.scopes) {
    const prior = [...definitions]
      .reverse()
      .find((entry) => entry.type === 'scope.defined' && entry.data.definition.key === scope.key)
    let id = prior?.subject ?? itemId('scope')
    while (!prior && ([...ids.values()].includes(id) || items.has(id))) id = itemId('scope')
    if (items.get(id)?.status === 'closed')
      throw new Error(`Scope ${id} is closed; reopen it explicitly before refining it`)
    ids.set(scope.key, id)
  }
  const scopes = []
  for (const definition of plan.scopes) {
    const id = ids.get(definition.key)
    if (!id) throw new Error('Scope id allocation failed')
    const after = (definition.after ?? []).map((ref) => ids.get(ref) ?? ref)
    for (const ref of after)
      if (
        ![...ids.values()].includes(ref) &&
        (items.get(ref)?.kind !== 'scope' || items.get(ref)?.parent !== subject)
      )
        throw new Error(`Scope dependency must belong to the same initiative: ${ref}`)
    const body = `# ${definition.title}\n\n${definition.goal}\n\n## Definition\n\n\`\`\`yaml\n${stringify(definition)}\`\`\`\n`
    if (items.has(id)) append(id, { type: 'item.updated', data: { title: definition.title, body } })
    else
      append(id, {
        type: 'item.created',
        data: {
          kind: 'scope',
          title: definition.title,
          owner: parent.owner,
          parent: subject,
          body,
          ...(parent.repository ? { repository: parent.repository } : {}),
        },
      })
    const tracker = publicationPlan(
      options.root,
      options.userFile,
      options.configuration,
      id,
      `items/${id}/scope.md`,
      ['tracker'],
    ).tracker
    if (!tracker) throw new Error('Scope tracker resolution failed')
    append(id, {
      type: 'scope.defined',
      data: { initiative: subject, run, definition, after, tracker },
    })
    if (tracker.status === 'pending')
      append(id, {
        type: 'note.added',
        data: { text: `Publication pending: ${tracker.provider}; local scope: ${id}` },
      })
    scopes.push({ id, key: definition.key, tracker })
  }
  const graph = new Map<string, string[]>()
  for (const entry of events)
    if (entry.type === 'scope.defined' && entry.data.initiative === subject)
      graph.set(entry.subject, entry.data.after)
  const checked = new Set<string>()
  function visit(id: string, path: Set<string>): void {
    if (path.has(id)) throw new Error('Scope dependencies contain a cycle')
    if (checked.has(id)) return
    for (const dependency of graph.get(id) ?? []) visit(dependency, new Set([...path, id]))
    checked.add(id)
  }
  for (const id of graph.keys()) visit(id, new Set())
  return scopes
}
