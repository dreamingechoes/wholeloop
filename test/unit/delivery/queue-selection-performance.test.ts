import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import * as compatibility from '../../../src/contracts/compatibility.js'
import type { DeliveryProjection } from '../../../src/delivery/events.js'
import { DEFAULT_DELIVERY_BUDGETS } from '../../../src/delivery/plan.js'
import type { QueueRecord } from '../../../src/delivery/queue-events.js'
import {
  hasUnqueuedAttempts,
  queueAttemptIndex,
  queueCapacity,
} from '../../../src/delivery/queue-selection.js'

const at = '2026-11-06T00:00:00.000Z',
  basis = 'a'.repeat(64),
  capacity = { builders: 1000, buildersPerRepository: 1000, evaluators: 1000 }
// In-memory policy data never registers a worker, reads authority or grants dispatch.
function fixture(count: number) {
  const records: QueueRecord[] = Array.from({ length: count }, (_, index) => ({
    id: `queue-${index.toString(16).padStart(32, '0')}`,
    basis,
    unit: `unit-${index}`,
    role: 'builder',
    priority: 0,
    status: 'claimed',
    sequence: index + 1,
    enqueuedAt: at,
    attempt: `attempt-${index.toString(16).padStart(16, '0')}`,
    generation: 1,
    controller: `controller-${'b'.repeat(32)}`,
    repository: 'app',
    repositoryKey: 'c'.repeat(64),
    remoteKey: 'd'.repeat(64),
  }))
  const state: DeliveryProjection = {
    schema: 'wholeloop/delivery-state@1',
    run: 'delivery-0000000000000000',
    sequence: 1,
    digest: 'e'.repeat(64),
    registeredAt: at,
    updatedAt: at,
    maxObservedAt: at,
    clockWentBackwards: false,
    state: 'running',
    basis: { kind: 'plan', digest: basis, revision: 1 },
    source: 'f'.repeat(64),
    policy: { digest: 'b'.repeat(64), endpoint: 'local-handoff', intervention: 'supervised' },
    units: records.map((record) => ({
      id: record.unit,
      role: 'implementation',
      repository: 'app',
    })),
    plans: [{ revision: 1, digest: basis }],
    facets: [
      {
        schema: 'wholeloop/delivery-attempts@1',
        records: records.map((record) => ({
          id: record.attempt ?? '',
          basis,
          unit: record.unit,
          role: record.role,
          generation: 1,
          state: 'started',
          observedAt: at,
        })),
      },
      { schema: 'wholeloop/delivery-queue@1', records },
    ],
  }
  const entry: QueueRecord = {
    ...records[0],
    id: `queue-${'f'.repeat(32)}`,
    basis,
    unit: 'next',
    role: 'builder',
    priority: 0,
    status: 'pending',
    sequence: count + 1,
    enqueuedAt: at,
  }
  return { state, states: new Map([[state.run, state]]), entry, records }
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

describe('fresh queue reservation selection', () => {
  it.each([100, 400])('joins %i active reservations to queue history once', (count) => {
    const { state, states, entry, records } = fixture(count),
      before = digest(state)
    let reads = 0
    for (const record of records) {
      const value = record.attempt
      Object.defineProperty(record, 'attempt', {
        enumerable: true,
        get() {
          reads++
          return value
        },
      })
    }
    const hash = vi.spyOn(compatibility, 'contractDigest')
    let result: string, fields: number, selectedSlotHashes: number
    try {
      result = queueCapacity(states, state, entry, DEFAULT_DELIVERY_BUDGETS, capacity)
      fields = reads
      selectedSlotHashes = hash.mock.calls.filter(
        ([value]) => value && typeof value === 'object' && 'unit' in value && value.unit === 'next',
      ).length
    } finally {
      hash.mockRestore()
    }
    console.info(
      'Queue assignment fields:',
      JSON.stringify({ count, fields, selectedSlotHashes, result }),
    )
    expect(result).toBe('run-capacity')
    expect(fields).toBe(count)
    expect(selectedSlotHashes).toBe(1)
    expect(digest(state)).toBe(before)
  })
  it('keeps the first match, including old bases, and rebuilds after mutation', () => {
    const { records } = fixture(2),
      first = records[0]
    if (!first?.attempt) throw new Error('Missing synthetic assignment')
    const newer = { ...first, basis: 'f'.repeat(64), repositoryKey: 'e'.repeat(64) }
    records.push(newer)
    expect(queueAttemptIndex(records).get(first.attempt)).toBe(first)
    records.shift()
    expect(queueAttemptIndex(records).get(first.attempt)).toBe(newer)
  })
  it.each([100, 400])('joins %i evaluator identities without per-attempt rescans', (count) => {
    const { state, records } = fixture(count),
      facet = state.facets.find((entry) => entry.schema === 'wholeloop/delivery-attempts@1')
    if (!facet) throw new Error('Missing synthetic attempts')
    let reads = 0
    for (const record of records) {
      const value = record.attempt
      Object.defineProperty(record, 'attempt', {
        enumerable: true,
        configurable: true,
        get() {
          reads++
          return value
        },
      })
    }
    expect(hasUnqueuedAttempts(state, facet.records)).toBe(false)
    console.info('Evaluator assignment fields:', JSON.stringify({ count, fields: reads }))
    expect(reads).toBe(count)
    Object.defineProperty(records[0], 'attempt', { value: 'attempt-ffffffffffffffff' })
    expect(hasUnqueuedAttempts(state, facet.records)).toBe(true)
    expect(hasUnqueuedAttempts(state, [])).toBe(false)
  })
  it('does not index queue history when no active attempt needs it', () => {
    const { state, states, entry, records } = fixture(100),
      attempts = state.facets.find((facet) => facet.schema === 'wholeloop/delivery-attempts@1')
    if (!attempts) throw new Error('Missing synthetic attempts')
    for (const attempt of attempts.records) attempt.state = 'stopped'
    for (const record of records)
      Object.defineProperty(record, 'attempt', {
        get() {
          throw new Error('Unused queue history was read')
        },
      })
    expect(queueCapacity(states, state, entry, DEFAULT_DELIVERY_BUDGETS, capacity)).toBe('')
    expect(hasUnqueuedAttempts(state, [])).toBe(false)
  })
  it('keeps an early first-match search for a single active attempt', () => {
    const { state, states, entry, records } = fixture(100),
      attempts = state.facets.find((facet) => facet.schema === 'wholeloop/delivery-attempts@1')
    if (!attempts) throw new Error('Missing synthetic attempts')
    for (const attempt of attempts.records.slice(1)) attempt.state = 'stopped'
    let reads = 0
    for (const record of records) {
      const value = record.attempt
      Object.defineProperty(record, 'attempt', {
        get() {
          reads++
          return value
        },
      })
    }
    expect(queueCapacity(states, state, entry, DEFAULT_DELIVERY_BUDGETS, capacity)).toBe(
      'run-repository-capacity',
    )
    expect(reads).toBe(1)
    reads = 0
    expect(hasUnqueuedAttempts(state, attempts.records.slice(0, 1))).toBe(false)
    expect(reads).toBe(1)
  })
  it('preserves refusal priority and repository/remote capacity across runs and revisions', () => {
    const { state, states, entry, records } = fixture(2),
      limits = { ...DEFAULT_DELIVERY_BUDGETS, builders: 1000, buildersPerRepository: 1000 },
      bounded = { ...capacity, buildersPerRepository: 1 }
    const [first, second] = records
    if (!first || !second) throw new Error('Missing synthetic queue history')
    expect(queueCapacity(states, state, entry, limits, bounded)).toBe('repository-capacity')
    first.remoteKey = 'a'.repeat(64)
    first.repositoryKey = 'a'.repeat(64)
    expect(queueCapacity(states, state, entry, limits, bounded)).toBe('repository-capacity')
    const target = { ...entry, unit: first.unit }
    expect(queueCapacity(states, state, target, limits, bounded)).toBe('slot-reserved')
    second.attempt = 'attempt-ffffffffffffffff'
    expect(queueCapacity(states, state, target, limits, bounded)).toBe('unknown-reservation')
  })
})
