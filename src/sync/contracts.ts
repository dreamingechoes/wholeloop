import { validate } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'
import { parsePullRequest } from '../pull-requests/codehost.js'
import { type PullRequest, pullRequestPlanSelection } from '../pull-requests/contracts.js'
import type { StateEvent } from '../state/events.js'
import schema from './schemas/events-v1.json' with { type: 'json' }

export interface TrackerTransition {
  provider: string
  ref: string
  state: string
}
export type SyncEventData =
  | { type: 'sync.merged'; data: { plan: string; pr: PullRequest; origin: 'host' | 'import' } }
  | { type: 'sync.closed'; data: { proofs: string[] } }
  | { type: 'sync.delivery-ready'; data: { slices: string[]; proofs: string[] } }
  | {
      type: 'sync.transition-planned'
      data: {
        key: string
        basis: string
        target: TrackerTransition
        from: string
        revision: string
      }
    }
  | { type: 'sync.transition-recorded'; data: { key: string; ref: string } }
interface SyncState {
  invalidatedPlans: Set<string>
  items: Map<string, { kind: string; parent?: string; status: string }>
  merged: Map<string, { event: string; plan: string; pr: PullRequest }>
  closures: Map<string, { event: string; proofs: string[] }>
  deliveries: Map<string, { event: string; slices: string[]; proofs: string[] }>
  transitions: Map<
    string,
    { subject: string; basis: string; target: TrackerTransition; result?: string }
  >
}
interface SyncChildren {
  parts: Map<string, string[]>
  slices: Map<string, string[]>
}
function childGroup(children: SyncChildren, kind: string) {
  return kind === 'part' ? children.parts : kind === 'slice' ? children.slices : undefined
}
function indexChild(children: SyncChildren, id: string, child: { kind: string; parent?: string }) {
  const groups = childGroup(children, child.kind),
    parent = child.parent
  if (!groups || !parent) return
  const entries = groups.get(parent)
  if (entries) entries.push(id)
  else groups.set(parent, [id])
}
function unindexChild(
  children: SyncChildren,
  id: string,
  child: { kind: string; parent?: string },
) {
  const groups = childGroup(children, child.kind),
    parent = child.parent
  if (!groups || !parent) return
  const entries = groups.get(parent),
    position = entries?.indexOf(id) ?? -1
  // Only a direct reducer caller replacing a duplicate item id reaches removal.
  if (entries && position !== -1) entries.splice(position, 1)
}
const same = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
export function validSyncData(type: string, data: Record<string, unknown>) {
  try {
    const rule = schema.properties[type as keyof typeof schema.properties]
    return !!rule && !validate(data, rule).length
  } catch {
    return false
  }
}
function mergeProofs(
  state: SyncState,
  subject: string,
  partsByParent?: ReadonlyMap<string, readonly string[]>,
): string[] | undefined {
  const direct = state.merged.get(subject)
  const item = state.items.get(subject)
  let parts: readonly string[] | undefined
  if (item?.kind === 'slice') {
    if (partsByParent) parts = partsByParent.get(subject)
    else {
      const selected: string[] = []
      for (const [id, child] of state.items)
        if (child.parent === subject && child.kind === 'part') selected.push(id)
      parts = selected
    }
  }
  if (parts?.length) {
    const proofs: string[] = []
    for (const id of parts) {
      const observed = closedProofs(state, id, partsByParent)
      if (!observed) return undefined
      proofs.push(...observed)
    }
    if (direct) proofs.push(direct.event)
    return proofs.sort()
  }
  return direct ? [direct.event] : undefined
}
function closedProofs(
  state: SyncState,
  subject: string,
  partsByParent?: ReadonlyMap<string, readonly string[]>,
): string[] | undefined {
  const closure = state.closures.get(subject)
  // No subtree proof can supply the missing original closure receipt.
  if (!closure) return undefined
  const proofs = mergeProofs(state, subject, partsByParent)
  return proofs && state.items.get(subject)?.status === 'closed' && same(closure.proofs, proofs)
    ? proofs
    : undefined
}
export function syncProofs(state: SyncState, subject: string): string[] | undefined {
  return mergeProofs(state, subject)
}
export function syncClosed(state: SyncState, subject: string): boolean {
  return closedProofs(state, subject) !== undefined
}
function ready(state: SyncState, subject: string, children?: SyncChildren): boolean {
  const delivery = state.deliveries.get(subject)
  if (!delivery) return false
  const slices: string[] = children ? [...(children.slices.get(subject) ?? [])] : []
  if (!children)
    for (const [id, child] of state.items)
      if (child.kind === 'slice' && child.parent === subject) slices.push(id)
  slices.sort()
  if (!slices.length || !same(slices, delivery.slices)) return false
  // Prove direct receipt presence before allocating or traversing descendants.
  if (slices.some((id) => !state.closures.has(id))) return false
  let partsByParent = children?.parts
  if (!partsByParent && slices.length > 1) {
    partsByParent = new Map()
    const selected = new Set(slices)
    for (const [id, child] of state.items) {
      if (child.kind !== 'part') continue
      const parent = child.parent
      if (!parent || !selected.has(parent)) continue
      const parts = partsByParent.get(parent)
      if (parts) parts.push(id)
      else partsByParent.set(parent, [id])
    }
  }
  const proofs = scopeProofs(state, slices, partsByParent)
  return proofs !== undefined && same(delivery.proofs, proofs)
}
function scopeProofs(
  state: SyncState,
  slices: readonly string[],
  partsByParent?: ReadonlyMap<string, readonly string[]>,
) {
  const proofs: string[] = []
  for (const id of slices) {
    const observed = closedProofs(state, id, partsByParent)
    if (!observed) return undefined
    proofs.push(...observed)
  }
  return proofs
}
export function syncReady(state: SyncState, subject: string): boolean {
  return ready(state, subject)
}
function certifiedBasis(state: SyncState, subject: string, children?: SyncChildren) {
  return closedProofs(state, subject, children?.parts)
    ? state.closures.get(subject)?.event
    : ready(state, subject, children)
      ? state.deliveries.get(subject)?.event
      : undefined
}
export function syncBasis(state: SyncState, subject: string) {
  return certifiedBasis(state, subject)
}

export function syncState(events: readonly StateEvent[]): SyncState {
  const state: SyncState = {
    invalidatedPlans: new Set(),
    items: new Map(),
    merged: new Map(),
    closures: new Map(),
    deliveries: new Map(),
    transitions: new Map(),
  }
  const latestPlans = new Map<string, string>()
  let priorPlan: ReturnType<typeof pullRequestPlanSelection> | undefined
  let children: SyncChildren | undefined
  const tree = () => {
    if (!children) {
      children = { parts: new Map(), slices: new Map() }
      for (const [id, child] of state.items) indexChild(children, id, child)
    }
    return children
  }
  for (const [index, event] of events.entries()) {
    if (event.type === 'item.created') {
      if (children) {
        const previous = state.items.get(event.subject)
        if (previous) unindexChild(children, event.subject, previous)
      }
      const created = { ...event.data, status: 'open' }
      state.items.set(event.subject, created)
      if (children) indexChild(children, event.subject, created)
    }
    const item = state.items.get(event.subject)
    if (event.type === 'item.updated' && item) {
      if (event.data.status === 'open' && item.status === 'closed') {
        const plan = latestPlans.get(event.subject)
        if (plan) state.invalidatedPlans.add(plan)
        state.merged.delete(event.subject)
      }
      Object.assign(item, event.data)
      if (event.data.status === 'open') state.closures.delete(event.subject)
    }
    if (event.type === 'item.closed' && item) item.status = 'closed'
    if (event.type === 'pr.planned') {
      latestPlans.set(event.subject, event.id)
      state.merged.delete(event.subject)
      state.closures.delete(event.subject)
    }
    if (event.type === 'sync.merged') {
      priorPlan ??= pullRequestPlanSelection(events)
      const plan = priorPlan(index, event.subject)
      const pr = parsePullRequest(event.data.pr)
      if (
        !plan?.pr ||
        !['slice', 'part'].includes(item?.kind ?? '') ||
        state.merged.has(event.subject) ||
        state.invalidatedPlans.has(event.data.plan) ||
        event.data.plan !== plan.event ||
        !pr.merged ||
        pr.state !== 'merged' ||
        pr.draft ||
        ['url', 'repository', 'head', 'base', 'sha'].some(
          (key) => pr[key as keyof PullRequest] !== plan.pr?.[key as keyof PullRequest],
        )
      )
        throw new Error(
          'Sync merge evidence must match the exact published PR, head, base, repository and commit',
        )
      state.merged.set(event.subject, { event: event.id, plan: plan.event, pr })
    }
    if (event.type === 'sync.closed') {
      const parts = item?.kind === 'slice' ? tree().parts : children?.parts
      const proofs = mergeProofs(state, event.subject, parts)
      if (
        !['slice', 'part'].includes(item?.kind ?? '') ||
        !proofs ||
        !same(proofs, event.data.proofs) ||
        closedProofs(state, event.subject, parts) !== undefined
      )
        throw new Error(
          'Sync closure requires complete matching merge proofs for this item and every repository part',
        )
      state.closures.set(event.subject, { event: event.id, proofs: event.data.proofs })
    }
    if (event.type === 'sync.delivery-ready') {
      const current = tree(),
        slices = [...(current.slices.get(event.subject) ?? [])].sort()
      if (
        item?.kind !== 'scope' ||
        !slices.length ||
        ready(state, event.subject, current) ||
        !same(slices, event.data.slices)
      )
        throw new Error(
          'Scope delivery is ready only after every slice has certified complete merge evidence',
        )
      const proofs = scopeProofs(state, slices, current.parts)
      if (!proofs || !same(event.data.proofs, proofs))
        throw new Error(
          'Scope delivery is ready only after every slice has certified complete merge evidence',
        )
      state.deliveries.set(event.subject, {
        event: event.id,
        slices: event.data.slices,
        proofs: event.data.proofs,
      })
    }
    if (event.type === 'sync.transition-planned') {
      const needsTree =
        state.deliveries.has(event.subject) ||
        (item?.kind === 'slice' && state.closures.has(event.subject))
      const basis = certifiedBasis(state, event.subject, needsTree ? tree() : children)
      if (
        !basis ||
        event.data.basis !== basis ||
        state.transitions.has(event.data.key) ||
        event.data.key !==
          measurementDigest({
            subject: event.subject,
            basis: event.data.basis,
            target: event.data.target,
          })
      )
        throw new Error(
          'Tracker transition needs one exact certified delivery/closure basis and target',
        )
      state.transitions.set(event.data.key, {
        subject: event.subject,
        basis: event.data.basis,
        target: event.data.target,
      })
    }
    if (event.type === 'sync.transition-recorded') {
      const prior = state.transitions.get(event.data.key)
      if (
        !prior ||
        prior.subject !== event.subject ||
        prior.result ||
        prior.target.ref !== event.data.ref
      )
        throw new Error('Tracker receipt needs one matching transition intent and reference')
      prior.result = event.data.ref
    }
  }
  return state
}
