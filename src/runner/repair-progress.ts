// Counts repeated repair failures and stops a repair loop that is not improving.
import { findBudget } from '../delivery/budget-events.js'
import type { DeliveryEvent } from '../delivery/events.js'
import type { RunnerStore } from './store.js'

/** Fold authoritative order; changing a commit or interleaving failures is not observed improvement. */
export function runnerRepairStreak(
  events: readonly Pick<DeliveryEvent, 'run' | 'payload'>[],
  run: string,
  role: string,
  fingerprint: string,
) {
  const failures = new Set<string>(),
    progress = new Set<string>()
  let count = 0
  for (const event of events) {
    const payload = event.payload
    if (event.run !== run || payload.schema !== 'wholeloop/delivery-budget-event@1') continue
    if (payload.action === 'failure' && payload.failure) {
      const failure = payload.failure
      if (failures.has(failure.key)) continue
      failures.add(failure.key)
      if (
        failure.provenance === 'host-observed' &&
        failure.category === 'failed-behavior' &&
        failure.role === role &&
        failure.findings.includes(fingerprint)
      )
        count++
    } else if (payload.action === 'progress' && payload.progress) {
      const observed = payload.progress
      if (
        observed.provenance !== 'host-observed' ||
        !['observed-behavior', 'resolved-finding', 'accepted-candidate'].includes(observed.kind)
      )
        continue
      const key = `${observed.kind}:${observed.digest}`
      if (!progress.has(key)) count = 0
      progress.add(key)
    }
  }
  return count
}

/** Count and terminal transition share the journal lock, so real progress cannot race exhaustion. */
export function exhaustRepeatedRunnerRepair(
  store: RunnerStore,
  input: {
    run: string
    role: string
    fingerprint: string
    limit: number
    evidence: string
  },
) {
  return store.lifecycle.journal.transaction(
    { kind: 'controller', name: 'runner-repair-progress' },
    (view, append) => {
      const state = view().get(input.run)
      if (!state) throw new Error('Original repair run missing')
      const limit = Math.min(input.limit, findBudget(state)?.limits?.noProgress ?? input.limit),
        streak = runnerRepairStreak(
          store.lifecycle.journal.events(),
          input.run,
          input.role,
          input.fingerprint,
        )
      if (streak < limit) return false
      if (
        !['completed', 'failed', 'blocked', 'exhausted', 'stopped', 'stopping'].includes(
          state.state,
        )
      )
        append(input.run, {
          schema: 'wholeloop/delivery-control-event@1',
          from: state.state,
          to: 'exhausted',
          basis: state.basis.digest,
          outcome: 'exhausted',
          evidence: input.evidence,
          reason:
            'The same observed repair failure reached the original no-progress limit across candidates. Retain evidence and limits; no further correction is dispatched.',
        })
      return true
    },
  )
}
