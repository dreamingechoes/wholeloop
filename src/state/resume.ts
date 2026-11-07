// Builds the bounded context pack that a new conversation resumes from.
import { latestBuilderPlan } from '../build/contracts.js'
import { environmentEntries } from '../environment/ledger.js'
import { decisionTrail, flowPlan } from '../flow/plan.js'
import { impactRuns } from '../impact/contracts.js'
import { learningRuns } from '../learning/contracts.js'
import { rampRuns } from '../ramp/contracts.js'
import { sharingState } from '../sharing/contracts.js'
import { syncBasis, syncState } from '../sync/contracts.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { replay, type StateEvent } from './events.js'
import { unread } from './mailbox.js'

export const CONTEXT_BYTES = 6144
const short = (value: string, limit: number) => [...value].slice(0, limit).join('')

/** Bodies stay in the store; a fresh session gets references and bounded summaries. */
export function contextPack(
  events: readonly StateEvent[],
  id?: string,
  role = 'conductor',
  reader = role,
) {
  const items = [...replay(events).values()]
  const subject = id
    ? items.find((item) => item.id === id)
    : [...items].sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      )[0]
  if (!subject)
    throw new Error(id ? `Unknown item: ${id}` : 'No items to resume; create an initiative first')
  const descendantIds = new Set([subject.id])
  let previous = 0
  while (previous !== descendantIds.size) {
    previous = descendantIds.size
    for (const item of items)
      if (item.parent && descendantIds.has(item.parent)) descendantIds.add(item.id)
  }
  const descendants = items
    .filter((item) => item.id !== subject.id && descendantIds.has(item.id))
    .sort((a, b) => a.id.localeCompare(b.id))
  const messages = unread(events, role, reader).filter((message) =>
    descendantIds.has(message.thread),
  )
  const ownPlan = flowPlan(events, subject.id)
  const plan = {
    ...ownPlan,
    pending: [
      ...decisionTrail(events, subject.id).filter((decision) => decision.subject !== subject.id),
      ...ownPlan.pending.map((decision) => ({ ...decision, subject: subject.id })),
    ],
  }
  const artifacts = events.flatMap((entry) =>
    entry.subject === subject.id && entry.type === 'step.completed'
      ? [{ step: entry.data.step, path: entry.data.artifact.path }]
      : [],
  )
  const sources = events.flatMap((entry) =>
    entry.subject === subject.id && entry.type === 'frame.sourced'
      ? [{ id: entry.data.brief, path: entry.data.artifact }]
      : [],
  )
  const payload = {
    schema: 'wholeloop/resume@1',
    subject: {
      id: subject.id,
      kind: subject.kind,
      title: short(subject.title, 160),
      owner: short(subject.owner, 80),
      status: subject.status,
      path: `items/${subject.id}/${subject.kind}.md`,
      ...(sharingState(events).modes.has(subject.id)
        ? { sharing: `items/${subject.id}/sharing.json` }
        : {}),
      ...(syncBasis(syncState(events), subject.id)
        ? { sync: `items/${subject.id}/sync.json` }
        : {}),
      ...(learningRuns(events).some((record) => record.subject === subject.id)
        ? { learning: `items/${subject.id}/learning.json` }
        : {}),
      ...(impactRuns(events).some((record) => record.subject === subject.id)
        ? {
            impact: `items/${subject.id}/impact/${
              impactRuns(events)
                .filter((record) => record.subject === subject.id)
                .at(-1)?.plan.run
            }.json`,
          }
        : {}),
      ...(rampRuns(events).some((record) => record.subject === subject.id)
        ? {
            ramp: `items/${subject.id}/ramps/${
              rampRuns(events)
                .filter((record) => record.subject === subject.id)
                .at(-1)?.run
            }.json`,
          }
        : {}),
      ...(environmentEntries(events, subject.id).length
        ? { environment: `items/${subject.id}/environment.md` }
        : {}),
      ...(latestBuilderPlan(events, subject.id)
        ? { builderPlan: `items/${subject.id}/build-plan.json` }
        : {}),
      ...(worktreeRecords(events).some((record) => record.subject === subject.id)
        ? { workspace: `items/${subject.id}/worktree.json` }
        : {}),
    },
    totalItems: descendantIds.size,
    items: descendants.slice(0, 12).map((item) => ({
      id: item.id,
      kind: item.kind,
      title: short(item.title, 80),
      status: item.status,
    })),
    unreadCount: messages.length,
    unread: messages.slice(0, 8).map((message) => ({
      id: message.id,
      thread: message.thread,
      kind: message.kind,
      from: message.from,
    })),
    notes: subject.notes.slice(-3).map((note) => short(note.text, 160)),
    links: subject.links.slice(-5).map((link) => short(link, 240)),
    flow: { ...plan, pending: plan.pending.slice(0, 8), completed: plan.completed.slice(0, 13) },
    sources: sources.slice(-5),
    artifacts: artifacts.slice(-8),
    next: plan.pending.length
      ? `wl step plan --for ${subject.id}`
      : plan.available && plan.next
        ? `wl step begin ${plan.next} --for ${subject.id}`
        : `wl open ${subject.id}`,
    truncated:
      sources.length > 5 ||
      descendants.length > 12 ||
      messages.length > 8 ||
      subject.links.length > 5 ||
      subject.notes.length > 3,
  }
  while (Buffer.byteLength(JSON.stringify(payload)) > CONTEXT_BYTES) {
    payload.truncated = true
    if (payload.items.length) payload.items.pop()
    else if (payload.sources.length) payload.sources.pop()
    else if (payload.artifacts.length) payload.artifacts.pop()
    else if (payload.unread.length) payload.unread.pop()
    else if (payload.links.length) payload.links.pop()
    else if (payload.notes.length) payload.notes.pop()
    else throw new Error('Context pack metadata exceeds its byte ceiling')
  }
  return payload
}
