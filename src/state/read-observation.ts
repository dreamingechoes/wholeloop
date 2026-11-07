// A read-only observation scope that lets fixed observers share one consistent read.
import { AsyncLocalStorage } from 'node:async_hooks'

interface ReadEvidence<T> {
  bytes: Buffer
  value: T
}
interface Observation {
  open: boolean
  failed: boolean
  checking: boolean
  bytes: number
  reads: Map<
    string,
    { resource: string; evidence: ReadEvidence<unknown>; read: () => ReadEvidence<unknown> }
  >
  resources: Map<string, Set<string>>
  groups: Map<string, readonly string[]>
  aliases: Map<string, string>
  validation: Map<string, ReadEvidence<unknown>>
}
const observations = new AsyncLocalStorage<Observation>()

export class ReadObservationError extends Error {
  constructor() {
    super('Read observation is closed, changed, oversized or attempted a mutation')
  }
}

/** Only fixed observers use this scope; it cannot surround dispatch or authorize an effect. */
export async function withReadObservation<T>(signal: AbortSignal, operation: () => Promise<T>) {
  if (observations.getStore() || signal.aborted) throw new ReadObservationError()
  const scope: Observation = {
    open: true,
    failed: false,
    checking: false,
    bytes: 0,
    reads: new Map(),
    resources: new Map(),
    groups: new Map(),
    aliases: new Map(),
    validation: new Map(),
  }
  try {
    const value = await observations.run(scope, operation)
    scope.open = false
    if (scope.failed || signal.aborted) throw new ReadObservationError()
    // Every distinct input is observed again before any verdict escapes. Keep
    // the write barrier installed while rereading, without reusing cached inputs.
    observations.run(scope, () => {
      scope.checking = true
      try {
        for (const [key, entry] of scope.reads) observedRead(key, entry.read, entry.resource)
      } finally {
        scope.checking = false
      }
    })
    if (scope.failed || signal.aborted) throw new ReadObservationError()
    return value
  } finally {
    scope.open = false
  }
}

export function inReadObservation(): boolean {
  return observations.getStore() !== undefined
}

/** Fixed composed readers join their caller; independent actions always start a fresh scope. */
export function shareReadObservation<T>(operation: () => Promise<T>) {
  const scope = observations.getStore()
  if (!scope) return withReadObservation(new AbortController().signal, operation)
  if (!scope.open || scope.failed) throw new ReadObservationError()
  return operation()
}

let effects = 0
/** Increments before every store mutation, launch or Git write this process announces (ADR-0243). */
export function effectEpoch(): number {
  return effects
}

/**
 * Successful answers about external facts, reused only within one synchronous
 * job while this process announces no effect (ADR-0243). A refusal is never
 * stored, a read that itself announces an effect is never reused, and every
 * entry expires when the job ends. Values must be immutable.
 */
export class DecisionMemo<T> {
  private readonly entries = new Map<string, T>()
  private epoch = -1
  private expiring = false
  constructor(private readonly limit = 64) {}
  get(key: string, read: () => T): T {
    if (this.epoch !== effects) {
      this.entries.clear()
      this.epoch = effects
    }
    if (this.entries.has(key)) return this.entries.get(key) as T
    const value = read()
    if (this.epoch !== effects || this.entries.size >= this.limit) return value
    this.entries.set(key, value)
    if (!this.expiring) {
      this.expiring = true
      queueMicrotask(() => {
        this.entries.clear()
        this.expiring = false
      })
    }
    return value
  }
}

/** Store mutations and command launches must refuse before creating even a lock directory. */
export function assertObservationWritable(): void {
  effects++
  const scope = observations.getStore()
  if (scope) {
    scope.failed = true
    throw new ReadObservationError()
  }
}

/** Fixed readers may declare one resource's complete bounded set of physical members. */
export function groupReadResources(resource: string, members: readonly string[]): void {
  const scope = observations.getStore()
  if (!scope) return
  const refuse = (): never => {
    scope.failed = true
    throw new ReadObservationError()
  }
  if ((!scope.open && !scope.checking) || scope.failed) refuse()
  const selected = [...members].sort(),
    existing = scope.groups.get(resource)
  if (!selected.length || selected.length > 8 || new Set(selected).size !== selected.length)
    refuse()
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(selected)) refuse()
    return
  }
  if (
    scope.checking ||
    scope.aliases.has(resource) ||
    scope.resources.has(resource) ||
    selected.some(
      (member) => member === resource || scope.aliases.has(member) || scope.groups.has(member),
    )
  )
    refuse()
  const projections = new Set<string>()
  let merged = 0
  for (const member of selected) {
    const prior = scope.resources.get(member)
    if (prior) merged++
    for (const key of prior ?? []) {
      // Never reclassify an in-progress capture: its evidence is not sealed yet.
      if (scope.reads.get(key)?.resource !== member) refuse()
      projections.add(key)
    }
  }
  if (projections.size > 8 || scope.resources.size - merged + 1 > 1024) refuse()
  // Keep the original read keys and every captured byte. Grouping cannot create
  // a second cache or duplicate opens when an ordinary reader shares a member.
  scope.groups.set(resource, selected)
  for (const member of selected) {
    scope.aliases.set(member, resource)
    scope.resources.delete(member)
  }
  scope.resources.set(resource, projections)
  for (const key of projections) {
    const entry = scope.reads.get(key)
    if (entry) entry.resource = resource
  }
}

/** Values stay module-private: public readers must copy their selected view. */
export function observedRead<T>(key: string, read: () => ReadEvidence<T>, resource = key): T {
  const scope = observations.getStore()
  if (!scope) return read().value
  resource = scope.aliases.get(resource) ?? resource
  // Validation is wholly synchronous: inherited asynchronous continuations
  // cannot run until this flag is cleared and the closed scope refuses them.
  if (scope.checking) {
    const expected = scope.reads.get(key)
    if (!expected || expected.resource !== resource) {
      scope.failed = true
      throw new ReadObservationError()
    }
    const prior = scope.validation.get(key)
    if (prior) return prior.value as T
    const current = read()
    if (!expected.evidence.bytes.equals(current.bytes)) {
      scope.failed = true
      throw new ReadObservationError()
    }
    scope.validation.set(key, current)
    return current.value
  }
  if (!scope.open || scope.failed) throw new ReadObservationError()
  const prior = scope.reads.get(key)
  if (prior) {
    if (prior.resource !== resource) {
      scope.failed = true
      throw new ReadObservationError()
    }
    return prior.evidence.value as T
  }
  const projections = scope.resources.get(resource) ?? new Set<string>()
  // Path protection and bytes describe one selected input, but remain separate
  // independently validated projections. Bound both dimensions, not their sum.
  if (
    (!scope.resources.has(resource) && scope.resources.size >= 1024) ||
    projections.size >= 8 ||
    projections.has(key)
  ) {
    scope.failed = true
    throw new ReadObservationError()
  }
  projections.add(key)
  scope.resources.set(resource, projections)
  let evidence: ReadEvidence<T>
  try {
    evidence = read()
  } catch (error) {
    projections.delete(key)
    if (!projections.size && !scope.groups.has(resource)) scope.resources.delete(resource)
    throw error
  }
  scope.bytes += evidence.bytes.length
  if (scope.bytes > 64 * 1024 * 1024) {
    scope.failed = true
    throw new ReadObservationError()
  }
  scope.reads.set(key, { resource, evidence, read })
  return evidence.value
}
