import { stringify } from 'yaml'
import { publicationPlan } from '../providers/publication.js'
import { type EventData, itemId, replay, type StateEvent } from '../state/events.js'
import { canonicalPath } from '../state/paths.js'
import { checkDependencies, type SlicePlan } from './contract.js'

export function publishSlices(options: {
  root: string
  userFile: string
  configuration: Record<string, unknown>
  subject: string
  run: string
  plan: SlicePlan
  events: readonly StateEvent[]
  append: (subject: string, event: EventData) => void
}) {
  const { events, append, subject, run, plan } = options
  const items = replay(events)
  const parent = items.get(subject)
  if (parent?.kind !== 'scope') throw new Error('Slice work on a scope')
  const repositories = plan.repositories.map((repo) => ({
    ...repo,
    path: canonicalPath(repo.path),
  }))
  if (new Set(repositories.map((repo) => repo.path)).size !== repositories.length)
    throw new Error('Repository roots must be distinct after resolving symlinks')
  const allocated = new Set(items.keys())
  function allocate(kind: 'slice' | 'part', prior?: string): string {
    let id = prior ?? itemId(kind)
    while (!prior && allocated.has(id)) id = itemId(kind)
    allocated.add(id)
    if (items.get(id)?.status === 'closed')
      throw new Error(`Item ${id} is closed; reopen it explicitly before refinement`)
    return id
  }
  const ids = new Map(
    plan.slices.map((definition) => {
      const prior = [...events]
        .reverse()
        .find(
          (entry) =>
            entry.type === 'slice.defined' &&
            entry.data.scope === subject &&
            entry.data.definition.key === definition.key,
        )
      return [definition.key, allocate('slice', prior?.subject)]
    }),
  )
  function save(
    id: string,
    kind: 'slice' | 'part',
    parentId: string,
    title: string,
    body: string,
    repository?: string,
  ): void {
    const existing = items.get(id)
    if (existing && repository && existing.repository !== repository)
      throw new Error('A stable part key cannot change repository identity')
    if (existing) append(id, { type: 'item.updated', data: { title, body } })
    else
      append(id, {
        type: 'item.created',
        data: {
          kind,
          title,
          body,
          owner: parent?.owner ?? '',
          parent: parentId,
          ...(repository ? { repository } : {}),
        },
      })
  }
  function tracker(id: string, kind: string) {
    const result = publicationPlan(
      options.root,
      options.userFile,
      options.configuration,
      id,
      `items/${id}/${kind}.md`,
      ['tracker'],
    ).tracker
    if (!result) throw new Error('Tracker resolution failed')
    if (result.status === 'pending')
      append(id, {
        type: 'note.added',
        data: { text: `Publication pending: ${result.provider}; local ${kind}: ${id}` },
      })
    return result
  }
  const slices = []
  for (const [index, definition] of plan.slices.entries()) {
    const id = ids.get(definition.key)
    if (!id) throw new Error('Slice id allocation failed')
    const dependencies = definition.blockedBy ?? (index ? [plan.slices[index - 1]?.key ?? ''] : [])
    const blockedBy = dependencies.map((ref) => ids.get(ref) ?? ref)
    for (const ref of blockedBy)
      if (
        ![...ids.values()].includes(ref) &&
        (items.get(ref)?.kind !== 'slice' || items.get(ref)?.parent !== subject)
      )
        throw new Error(`Slice dependency must belong to the same scope: ${ref}`)
    const selected = definition.repositories
      .map((ref) => {
        const repo = repositories.find((repo) => repo.key === ref)
        if (!repo) throw new Error(`Unknown repository: ${ref}`)
        return repo
      })
      .sort(
        (a, b) =>
          Number(b.key === definition.contract?.repository) -
          Number(a.key === definition.contract?.repository),
      )
    save(
      id,
      'slice',
      subject,
      definition.title,
      `# ${definition.title}\n\n${definition.objective}\n\n## Definition\n\n\`\`\`yaml\n${stringify(definition)}\`\`\`\n`,
    )
    const parts: { id: string; repository: string; role: 'contract' | 'implementation' }[] = []
    if (selected.length > 1) {
      for (const repo of selected) {
        const prior = [...events]
          .reverse()
          .find(
            (entry) =>
              entry.type === 'part.defined' &&
              entry.data.slice === id &&
              entry.data.repository.key === repo.key,
          )
        const part = allocate('part', prior?.subject)
        const role =
          repo.key === definition.contract?.repository
            ? ('contract' as const)
            : ('implementation' as const)
        save(
          part,
          'part',
          id,
          `${definition.title} — ${repo.key}`,
          `# ${definition.title} — ${repo.key}\n\nRole: ${role}.\n\n${definition.objective}\n\n## Contract\n\n\`\`\`yaml\n${stringify(definition.contract)}\`\`\`\n\nCriteria and tests: parent slice ${id}.\n`,
          repo.path,
        )
        const dependencies = role === 'contract' ? blockedBy : [parts[0]?.id ?? '']
        append(part, {
          type: 'part.defined',
          data: {
            slice: id,
            run,
            repository: repo,
            role,
            blockedBy: dependencies,
            tracker: tracker(part, 'part'),
          },
        })
        parts.push({ id: part, repository: repo.key, role })
      }
    }
    const reference = tracker(id, 'slice')
    append(id, {
      type: 'slice.defined',
      data: {
        scope: subject,
        run,
        definition,
        repositories: selected,
        blockedBy,
        parts: parts.map((part) => part.id),
        tracker: reference,
      },
    })
    slices.push({ id, key: definition.key, blockedBy, parts, tracker: reference })
  }
  const graph = new Map<string, string[]>()
  for (const entry of events)
    if (entry.type === 'slice.defined' && entry.data.scope === subject)
      graph.set(entry.subject, entry.data.blockedBy)
  checkDependencies(graph)
  return slices
}
