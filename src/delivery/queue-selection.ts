import { contractDigest } from '../contracts/compatibility.js'
import type { BudgetLimits } from './budget-events.js'
import type { AttemptRecord, DeliveryProjection } from './events.js'
import { deliveryQueue, type QueueRecord } from './queue-events.js'
import { deliveryAttempts } from './reducer.js'

const ACTIVE = new Set(['claimed', 'started', 'stopping'])
const execution = (role: string) => ['builder', 'researcher'].includes(role)
const slot = (value: { unit?: string; role: string; cell?: string }) =>
  contractDigest({ unit: value.unit ?? null, role: value.role, cell: value.cell ?? null })

/** Fresh first matches, including older bases; never retain this across a queue mutation. */
export function queueAttemptIndex(records: readonly QueueRecord[]): Map<string, QueueRecord> {
  const result = new Map<string, QueueRecord>()
  for (const record of records) {
    const attempt = record.attempt
    if (attempt !== undefined && !result.has(attempt)) result.set(attempt, record)
  }
  return result
}

/** Inspect only the supplied current-call group, with no cached membership or authority. */
export function hasUnqueuedAttempts(
  state: DeliveryProjection,
  attempts: readonly AttemptRecord[],
): boolean {
  if (!attempts.length) return false
  const records = deliveryQueue(state).records
  if (attempts.length === 1)
    return attempts.some((attempt) => !records.some((record) => record.attempt === attempt.id))
  const index = queueAttemptIndex(records)
  return attempts.some((attempt) => !index.has(attempt.id))
}

/** In-memory capacity selection; the live caller still reads current grant, clock and plan. */
export function queueCapacity(
  states: ReadonlyMap<string, DeliveryProjection>,
  state: DeliveryProjection,
  entry: QueueRecord,
  limits: BudgetLimits,
  capacity: { builders: number; buildersPerRepository: number; evaluators: number },
): string {
  const active = [...states.values()].flatMap((run) => {
    const attempts = deliveryAttempts(run).records.filter((attempt) => ACTIVE.has(attempt.state))
    if (!attempts.length) return []
    const records = deliveryQueue(run).records,
      index = attempts.length > 1 ? queueAttemptIndex(records) : undefined
    return attempts.map((attempt) => ({
      run: run.run,
      attempt,
      entry: index
        ? index.get(attempt.id)
        : records.find((record) => record.attempt === attempt.id),
    }))
  })
  if (
    active.some((value) => execution(value.attempt.role) === execution(entry.role) && !value.entry)
  )
    return 'unknown-reservation'
  let selectedSlot: string | undefined
  if (
    active.some((value) => {
      if (value.run !== state.run) return false
      const signature = slot(value.attempt)
      selectedSlot ??= slot(entry)
      return signature === selectedSlot
    })
  )
    return 'slot-reserved'
  const group = active.filter((value) => execution(value.attempt.role) === execution(entry.role))
  if (group.length >= (execution(entry.role) ? capacity.builders : capacity.evaluators))
    return 'global-capacity'
  if (
    group.filter((value) => value.run === state.run).length >=
    (execution(entry.role) ? limits.builders : limits.evaluators)
  )
    return 'run-capacity'
  if (execution(entry.role) && entry.repositoryKey) {
    const same = group.filter(
      (value) =>
        value.entry?.repositoryKey === entry.repositoryKey ||
        (entry.remoteKey !== undefined && value.entry?.remoteKey === entry.remoteKey),
    )
    if (same.length >= capacity.buildersPerRepository) return 'repository-capacity'
    if (same.filter((value) => value.run === state.run).length >= limits.buildersPerRepository)
      return 'run-repository-capacity'
  }
  return ''
}
