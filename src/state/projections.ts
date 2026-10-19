import { stringify } from 'yaml'
import { gateRuns } from '../gates/state.js'
import { reviewInputs } from '../review/state.js'
import { verificationRuns } from '../verification/state.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import type { Item, StateEvent } from './events.js'
import { replayMailbox } from './mailbox.js'

export function projections(
  items: ReadonlyMap<string, Item>,
  events: readonly StateEvent[] = [],
): Map<string, string> {
  const files = new Map<string, string>()
  const links: Record<string, string[]> = {}
  const workspaces = new Map(worktreeRecords(events).map((record) => [record.subject, record]))
  for (const item of [...items.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const { body, notes, links: refs, ...metadata } = item
    const noteText = notes.length
      ? `\n## Notes\n\n${notes.map((note) => `- ${note.ts} (${note.id}): ${note.text}`).join('\n')}\n`
      : ''
    const linkText = refs.length
      ? `\n## Links\n\n${refs.map((ref) => `- ${ref}`).join('\n')}\n`
      : ''
    const workspace = workspaces.get(item.id)
    const workspaceText = workspace
      ? `\n## Workspace\n\n- Mode: ${workspace.mode}; status: ${workspace.status}\n- Path: ${workspace.path}\n- Branch: ${workspace.branch}\n- Base: ${workspace.base.ref} (${workspace.base.sha})\n- Ports: ${workspace.ports.start}-${workspace.ports.end}\n`
      : ''
    files.set(
      `items/${item.id}/${item.kind}.md`,
      `---\n${stringify(metadata)}---\n\n${body}\n${workspaceText}${noteText}${linkText}`,
    )
    links[item.id] = refs
    if (workspace)
      files.set(`items/${item.id}/worktree.json`, `${JSON.stringify(workspace, null, 2)}\n`)
  }
  for (const { subject, input } of reviewInputs(events))
    files.set(
      `items/${subject}/reviews/${input.run}/${input.round}.json`,
      `${JSON.stringify(input, null, 2)}\n`,
    )
  for (const suite of verificationRuns(events))
    files.set(
      `items/${suite.subject}/verification/${suite.run}/${suite.round}.json`,
      `${JSON.stringify(suite, null, 2)}\n`,
    )
  for (const entry of events)
    if (entry.type === 'build.planned')
      files.set(
        `items/${entry.subject}/build-plan.json`,
        `${JSON.stringify(entry.data, null, 2)}\n`,
      )
  for (const run of gateRuns(events))
    for (const round of run.rounds)
      files.set(
        `items/${run.subject}/gates/${run.run}/${round.plan.round}.json`,
        `${JSON.stringify({ ...round, budget: run.budget }, null, 2)}\n`,
      )
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
  for (const entry of events)
    if (entry.type === 'step.completed')
      files.set(entry.data.artifact.path, entry.data.artifact.content)
  files.set('cursors.json', `${JSON.stringify(mailbox.cursors, null, 2)}\n`)
  return files
}
