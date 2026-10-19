import { validate } from '../config/schema.js'
import { measurementDigest } from '../launch/measurement.js'
import { parsePullRequest } from '../pull-requests/codehost.js'
import { type PullRequest, pullRequestPlans } from '../pull-requests/contracts.js'
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
export function syncProofs(state: SyncState, subject: string): string[] | undefined {
  const direct = state.merged.get(subject)
  const item = state.items.get(subject)
  const parts =
    item?.kind === 'slice'
      ? [...state.items].filter(([, child]) => child.parent === subject && child.kind === 'part')
      : []
  if (parts.length) {
    if (parts.some(([id]) => !syncClosed(state, id))) return undefined
    return [
      ...parts.flatMap(([id]) => syncProofs(state, id) ?? []),
      ...(direct ? [direct.event] : []),
    ].sort()
  }
  return direct ? [direct.event] : undefined
}
export function syncClosed(state: SyncState, subject: string): boolean {
  const closure = state.closures.get(subject)
  const proofs = syncProofs(state, subject)
  return (
    !!closure &&
    !!proofs &&
    state.items.get(subject)?.status === 'closed' &&
    same(closure.proofs, proofs)
  )
}
export function syncReady(state: SyncState, subject: string): boolean {
  const delivery = state.deliveries.get(subject)
  const slices = [...state.items]
    .filter(([, child]) => child.kind === 'slice' && child.parent === subject)
    .map(([id]) => id)
    .sort()
  return (
    !!delivery &&
    !!slices.length &&
    same(slices, delivery.slices) &&
    slices.every((id) => syncClosed(state, id)) &&
    same(
      delivery.proofs,
      slices.flatMap((id) => syncProofs(state, id) ?? []),
    )
  )
}
export function syncBasis(state: SyncState, subject: string) {
  return syncClosed(state, subject)
    ? state.closures.get(subject)?.event
    : syncReady(state, subject)
      ? state.deliveries.get(subject)?.event
      : undefined
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
  for (const [index, event] of events.entries()) {
    if (event.type === 'item.created')
      state.items.set(event.subject, { ...event.data, status: 'open' })
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
      const plan = pullRequestPlans(events.slice(0, index))
        .filter((plan) => plan.subject === event.subject)
        .at(-1)
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
      const proofs = syncProofs(state, event.subject)
      if (
        !['slice', 'part'].includes(item?.kind ?? '') ||
        !proofs ||
        !same(proofs, event.data.proofs) ||
        syncClosed(state, event.subject)
      )
        throw new Error(
          'Sync closure requires complete matching merge proofs for this item and every repository part',
        )
      state.closures.set(event.subject, { event: event.id, proofs: event.data.proofs })
    }
    if (event.type === 'sync.delivery-ready') {
      const slices = [...state.items]
        .filter(([, child]) => child.kind === 'slice' && child.parent === event.subject)
        .map(([id]) => id)
        .sort()
      if (
        item?.kind !== 'scope' ||
        !slices.length ||
        syncReady(state, event.subject) ||
        !same(slices, event.data.slices) ||
        slices.some((id) => !syncClosed(state, id)) ||
        !same(
          event.data.proofs,
          slices.flatMap((id) => syncProofs(state, id) ?? []),
        )
      )
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
      if (
        !syncBasis(state, event.subject) ||
        event.data.basis !== syncBasis(state, event.subject) ||
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
