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

/** Store mutations and command launches must refuse before creating even a lock directory. */
export function assertObservationWritable(): void {
  const scope = observations.getStore()
  if (scope) {
    scope.failed = true
    throw new ReadObservationError()
  }
}

/** Values stay module-private: public readers must copy their selected view. */
export function observedRead<T>(key: string, read: () => ReadEvidence<T>, resource = key): T {
  const scope = observations.getStore()
  if (!scope) return read().value
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
    if (!projections.size) scope.resources.delete(resource)
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
