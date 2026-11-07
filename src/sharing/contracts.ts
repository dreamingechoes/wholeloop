// Shared-document events and state: adoption, queued publication and their exact chunk identities.
import { validate } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'
import type { EventData, StateEvent } from '../state/events.js'
import schema from './schemas/events-v1.json' with { type: 'json' }

export interface SharedTarget {
  key: string
  provider: string
  kind: 'docs' | 'tracker'
  ref?: string
}
export type SharingEventData =
  | {
      type: 'share.adopted'
      data: {
        ref: string
        provider: string
        kind: 'docs' | 'tracker'
        revision: string
        digest: string
        origin: 'host' | 'import'
      }
    }
  | { type: 'share.mode'; data: { mode: 'local' | 'shared'; by: string; targets: SharedTarget[] } }
  | { type: 'share.queued'; data: { key: string; artifact: string; target: SharedTarget } }
  | { type: 'share.requested'; data: { key: string } }
  | { type: 'share.published'; data: { key: string; ref: string; origin: 'host' | 'import' } }
export const DEFINE_STEPS = ['research', 'frame-problem', 'write-spec', 'cut-scopes']
export function canonicalSharedUrl(ref: string) {
  const url = new URL(ref)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    [...url.searchParams.keys()].some((key) =>
      /password|token|secret|api.?key|authorization/i.test(key),
    )
  )
    throw new Error('Use a credential-free HTTPS work URL')
  url.hash = ''
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(?:gclid|fbclid)$/i.test(key)) url.searchParams.delete(key)
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  url.searchParams.sort()
  return url.href
}
export function validSharingData(type: string, data: Record<string, unknown>) {
  try {
    const rule = schema.properties[type as keyof typeof schema.properties]
    if (!rule || validate(data, rule).length) return false
    if (
      ['share.adopted', 'share.published'].includes(type) &&
      canonicalSharedUrl(String(data.ref)) !== data.ref
    )
      return false
    if (type === 'share.mode') {
      const targets = data.targets as SharedTarget[]
      if (
        !String(data.by).trim() ||
        new Set(targets.map((target) => target.key)).size !== targets.length ||
        (data.mode === 'shared' && !targets.length) ||
        targets.some(
          (target) =>
            !target.provider.trim() ||
            (target.ref !== undefined && canonicalSharedUrl(target.ref) !== target.ref),
        )
      )
        return false
    }
    if (
      type === 'share.queued' &&
      (data.target as SharedTarget).ref &&
      canonicalSharedUrl((data.target as SharedTarget).ref ?? '') !==
        (data.target as SharedTarget).ref
    )
      return false
    return true
  } catch {
    return false
  }
}
export function sharingState(events: readonly StateEvent[]) {
  const items = new Map<string, { kind: string; parent?: string }>()
  const briefOwners = new Map<string, Set<string>>()
  const modes = new Map<string, { mode: 'local' | 'shared'; by: string; targets: SharedTarget[] }>()
  const adopted = new Map<string, string>()
  const queue = new Map<
    string,
    {
      root: string
      subject: string
      artifact: string
      target: SharedTarget
      requested?: string
      ref?: string
    }
  >()
  const root = (id: string): string | undefined => {
    const seen = new Set<string>()
    let current: string | undefined = id
    while (current && !seen.has(current)) {
      seen.add(current)
      const item = items.get(current)
      if (item?.kind === 'initiative') return current
      const owners = briefOwners.get(current)
      current = item?.parent ?? (owners?.size === 1 ? [...owners][0] : undefined)
    }
    return undefined
  }
  for (const [index, event] of events.entries()) {
    if (event.type === 'item.created') items.set(event.subject, event.data)
    if (event.type === 'frame.sourced') {
      const owners = briefOwners.get(event.data.brief) ?? new Set<string>()
      owners.add(event.subject)
      briefOwners.set(event.data.brief, owners)
    }
    if (event.type === 'share.adopted') {
      if (items.get(event.subject)?.kind !== 'initiative' || adopted.has(event.data.ref))
        throw new Error('A shared URL belongs to one adopted initiative')
      adopted.set(event.data.ref, event.subject)
    }
    if (event.type === 'share.mode') {
      if (items.get(event.subject)?.kind !== 'initiative')
        throw new Error('Work mode belongs to an initiative')
      const previous = modes.get(event.subject)
      if (
        previous?.targets.length &&
        measurementDigest(previous.targets) !== measurementDigest(event.data.targets)
      )
        throw new Error(
          'Retain pinned shared destinations; use the same targets when changing mode',
        )
      modes.set(event.subject, event.data)
    }
    if (event.type === 'share.queued') {
      const source = events.slice(0, index).find((entry) => entry.id === event.data.artifact)
      const initiative = source ? root(source.subject) : undefined
      const mode = initiative ? modes.get(initiative) : undefined
      if (
        source?.type !== 'step.completed' ||
        !DEFINE_STEPS.includes(source.data.step) ||
        initiative !== event.subject ||
        mode?.mode !== 'shared' ||
        !mode.targets.some(
          (target) => measurementDigest(target) === measurementDigest(event.data.target),
        ) ||
        queue.has(event.data.key) ||
        event.data.key !==
          measurementDigest({ artifact: event.data.artifact, target: event.data.target })
      )
        throw new Error(
          'Publication queue needs one completed Define artifact and its explicit shared target',
        )
      queue.set(event.data.key, {
        root: event.subject,
        subject: source.subject,
        artifact: event.data.artifact,
        target: event.data.target,
      })
    }
    if (event.type === 'share.requested' || event.type === 'share.published') {
      const entry = queue.get(event.data.key)
      if (!entry || entry.root !== event.subject || modes.get(entry.root)?.mode !== 'shared')
        throw new Error('Shared publication needs its current authorized outbox entry')
      if (event.type === 'share.requested') {
        if (entry.requested || entry.ref)
          throw new Error('Inspect ambiguous publication instead of repeating it')
        entry.requested = event.id
      } else {
        if (!entry.requested || entry.ref)
          throw new Error('Publication receipt needs one prior intent')
        canonicalSharedUrl(event.data.ref)
        entry.ref = event.data.ref
      }
    }
  }
  return { items, modes, adopted, queue, root }
}
export function linkedSharedItem(events: readonly StateEvent[], ref: string) {
  const canonical = canonicalSharedUrl(ref)
  const state = sharingState(events)
  const matches = new Set<string>()
  if (state.adopted.has(canonical)) matches.add(state.adopted.get(canonical) ?? '')
  for (const event of events) {
    const url =
      event.type === 'link.added'
        ? event.data.url
        : event.type === 'pr.published'
          ? event.data.pr.url
          : undefined
    if (url)
      try {
        if (canonicalSharedUrl(url) === canonical) matches.add(event.subject)
      } catch {
        /* Non-web local links cannot identify a remote work URL. */
      }
  }
  if (matches.size === 1) return [...matches][0]
  const roots = new Set([...matches].map((id) => state.root(id) ?? id))
  if (roots.size > 1)
    throw new Error('This URL links several initiatives; choose an explicit stored item ID')
  return [...roots][0]
}
export function sharedChunk(events: readonly StateEvent[], artifact: string) {
  const event = events.find((entry) => entry.id === artifact)
  if (event?.type !== 'step.completed' || !DEFINE_STEPS.includes(event.data.step))
    throw new Error('Missing completed Define artifact')
  const marker = `<!-- wholeloop-artifact:${event.id} -->`
  const outcome =
    event.data.step === 'frame-problem'
      ? events.find(
          (entry) =>
            entry.subject === event.subject &&
            entry.type === 'frame.decided' &&
            entry.data.run === event.data.run,
        )
      : undefined
  const content = `${marker}\n\n## ${event.data.step} — ${event.subject}\n\n${event.data.artifact.content}\n${outcome?.type === 'frame.decided' ? `\nFraming outcome: ${outcome.data.outcome}; reason: ${outcome.data.reason}.\n` : ''}`
  return { event, marker, content }
}
/** Queue only: synchronous core completion never performs remote I/O under the state lock. */
export function queueSharedArtifacts(
  events: readonly StateEvent[],
  append: (subject: string, data: EventData) => void,
  initiative?: string,
) {
  const state = sharingState(events)
  for (const artifact of [...events]) {
    if (artifact.type !== 'step.completed' || !DEFINE_STEPS.includes(artifact.data.step)) continue
    const root = state.root(artifact.subject)
    if (!root || (initiative && root !== initiative) || state.modes.get(root)?.mode !== 'shared')
      continue
    for (const target of state.modes.get(root)?.targets ?? []) {
      const key = measurementDigest({ artifact: artifact.id, target })
      if (!state.queue.has(key))
        append(root, { type: 'share.queued', data: { key, artifact: artifact.id, target } })
    }
  }
}
