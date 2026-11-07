// CI check observations, the wait policy and the verdict derived from them.
import { contractDigest } from '../contracts/compatibility.js'
import { safeSourceText } from '../delivery/input.js'
import { validateDeliveryShape } from '../delivery/plan.js'
import { DeliveryRunnerError } from './route.js'
import ciSchema from './schemas/ci-v1.json' with { type: 'json' }
import type { RunnerStore } from './store.js'

export const DELIVERY_CI_SCHEMA = ciSchema
/** Default finite CI wait: 15-second polls within 30 minutes, inside the run deadline. */
export const CI_WAIT = Object.freeze({ pollMs: 15000, totalMs: 30 * 60 * 1000 })
export interface CiCheck {
  name: string
  /** The issuing app or integration identity; a matching name alone is never enough. */
  issuer?: string
  attempt: number
  head: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion?:
    | 'success'
    | 'failure'
    | 'cancelled'
    | 'skipped'
    | 'neutral'
    | 'timed_out'
    | 'action_required'
    | 'stale'
}
export interface CiObservation {
  schema: 'wholeloop/delivery-ci@1'
  codeHost: 'github'
  repository: string
  pr: string
  candidate: string
  head: string
  base: string
  observedAt: string
  complete: boolean
  checks: CiCheck[]
  protection: {
    status: 'observed' | 'unknown'
    required: { name: string; issuer?: string }[]
    strict?: boolean
  }
  reviews: { status: 'observed' | 'unknown'; required?: number; approvals?: number }
  provenance: 'fixture' | 'host-observed'
}
/** Operator policy: checks the run itself requires, each with its trusted issuer. */
export interface CiPolicy {
  required: { name: string; issuer: string }[]
}
export type CiCheckState =
  | 'success'
  | 'pending'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'neutral'
  | 'missing'
  | 'stale'
  | 'wrong-issuer'
  | 'unknown-issuer'
  | 'timed_out'
  | 'action_required'
  | 'missing-conclusion'
  | 'ambiguous-attempt'
export interface CiVerdict {
  status: 'passed' | 'pending' | 'failed' | 'unknown'
  reasons: string[]
  checks: { name: string; issuer: string | null; state: CiCheckState }[]
  reviews: 'satisfied' | 'unsatisfied' | 'unknown'
}

export function validateCiObservation(value: unknown): asserts value is CiObservation {
  validateDeliveryShape(value, ciSchema)
  const observed = value as CiObservation
  if (
    !Number.isFinite(Date.parse(observed.observedAt)) ||
    new Date(observed.observedAt).toISOString() !== observed.observedAt
  )
    throw new DeliveryRunnerError('ci-observation-time')
}

/**
 * Pure: only a complete observation of the exact candidate, with known protection,
 * can pass. Every other state stays distinct and never becomes success.
 */
export function ciVerdict(
  observation: Readonly<CiObservation>,
  policy: Readonly<CiPolicy>,
): CiVerdict {
  validateCiObservation(observation)
  const reasons: string[] = []
  if (!observation.complete) reasons.push('incomplete-observation')
  if (observation.protection.status !== 'observed') reasons.push('unknown-protection')
  if (observation.head !== observation.candidate) reasons.push('stale-pull-request-head')
  const required = new Map<string, { name: string; issuer: string | null }>()
  for (const entry of [...observation.protection.required, ...policy.required]) {
    const key = `${entry.name}\u0000${entry.issuer ?? ''}`
    // A protection rule without an issuer is satisfied only by the policy's named issuer.
    if (entry.issuer === undefined && policy.required.some((item) => item.name === entry.name))
      continue
    required.set(key, { name: entry.name, issuer: entry.issuer ?? null })
  }
  if (!required.size) reasons.push('empty-required-set')
  const checks = [...required.values()]
    .sort((a, b) =>
      a.name === b.name
        ? (a.issuer ?? '').localeCompare(b.issuer ?? '')
        : a.name.localeCompare(b.name),
    )
    .map(({ name, issuer }) => {
      const named = observation.checks.filter((check) => check.name === name),
        current = named.filter((check) => check.head === observation.candidate)
      let state: CiCheckState
      if (!named.length) state = 'missing'
      else if (!current.length) state = 'stale'
      else if (issuer === null) state = 'unknown-issuer'
      else {
        const trusted = current.filter((check) => check.issuer === issuer)
        if (!trusted.length) state = 'wrong-issuer'
        else {
          const attempt = Math.max(...trusted.map((check) => check.attempt)),
            latest = trusted.filter((check) => check.attempt === attempt),
            [only] = latest
          // A tie has no trustworthy ordering. More importantly, a completed
          // timeout or absent conclusion is not an observed code/test failure.
          state =
            latest.length !== 1 || !only
              ? 'ambiguous-attempt'
              : only.status !== 'completed'
                ? 'pending'
                : (only.conclusion ?? 'missing-conclusion')
        }
      }
      return { name, issuer, state }
    })
  const reviews =
    observation.reviews.status !== 'observed' ||
    observation.reviews.required === undefined ||
    observation.reviews.approvals === undefined
      ? ('unknown' as const)
      : observation.reviews.approvals >= observation.reviews.required
        ? ('satisfied' as const)
        : ('unsatisfied' as const)
  const states = new Set(checks.map((check) => check.state))
  const status: CiVerdict['status'] = reasons.length
    ? 'unknown'
    : ['failure', 'timed_out', 'action_required'].some((state) => states.has(state as CiCheckState))
      ? 'failed'
      : [...states].every((state) => state === 'success')
        ? 'passed'
        : [...states].every((state) => state === 'success' || state === 'pending')
          ? 'pending'
          : 'unknown'
  return { status, reasons, checks, reviews }
}

/** Pending, not-yet-created and transiently unreadable states are observed again. */
export function ciRetry(verdict: Readonly<CiVerdict>) {
  if (verdict.status === 'pending') return true
  if (
    verdict.reasons.some((reason) =>
      ['unavailable-read', 'incomplete-observation'].includes(reason),
    )
  )
    return true
  return (
    verdict.status === 'unknown' &&
    !verdict.reasons.length &&
    verdict.checks.every((check) => ['success', 'pending', 'missing'].includes(check.state))
  )
}
export interface CiClock {
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
}
export const SYSTEM_CI_CLOCK: CiClock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      if (signal.aborted) return resolve()
      const timer = setTimeout(done, ms),
        cancel = () => {
          clearTimeout(timer)
          resolve()
        }
      function done() {
        signal.removeEventListener('abort', cancel)
        resolve()
      }
      signal.addEventListener('abort', cancel, { once: true })
    }),
}
/** One complete read of a PR's checks, protection and reviews at an exact candidate. */
export interface RunnerCiHost {
  observe(
    target: Readonly<{ path: string; remote: string; base: string; head: string }>,
    pr: string,
    signal: AbortSignal,
  ): Promise<CiObservation>
}
export interface CiWait {
  outcome: 'settled' | 'deadline' | 'cancelled'
  verdict: CiVerdict
  observations: string[]
}

/** Waiting on CI is permitted unattended; it ends by verdict, deadline or cancellation. */
export class RunnerCiObserver {
  constructor(
    readonly store: RunnerStore,
    readonly host: RunnerCiHost,
    readonly clock: CiClock = SYSTEM_CI_CLOCK,
  ) {}
  private retain(run: string, observation: CiObservation) {
    const body = `${JSON.stringify(observation)}\n`,
      digest = contractDigest(observation)
    safeSourceText(body, 4 * 1024 * 1024)
    if (!/^delivery-[a-f0-9]{16}$/.test(run)) throw new DeliveryRunnerError('ci-observation-run')
    this.store.files.atomic(`delivery/runner-ci/${run}/${digest}.json`, body)
    return digest
  }
  async wait(input: {
    run: string
    target: Readonly<{ path: string; remote: string; base: string; head: string }>
    pr: string
    policy: Readonly<CiPolicy>
    deadline: number
    signal: AbortSignal
  }): Promise<CiWait> {
    const until = Math.min(input.deadline, this.clock.now() + CI_WAIT.totalMs),
      observations: string[] = []
    let verdict: CiVerdict = {
      status: 'unknown',
      reasons: ['not-observed'],
      checks: [],
      reviews: 'unknown',
    }
    while (!input.signal.aborted && this.clock.now() < until) {
      try {
        const observed = await this.host.observe(input.target, input.pr, input.signal)
        validateCiObservation(observed)
        if (
          observed.candidate !== input.target.head ||
          observed.pr !== input.pr ||
          observed.base !== input.target.base ||
          observed.repository !== input.pr.slice(0, input.pr.lastIndexOf('/pull/'))
        )
          throw new DeliveryRunnerError('ci-observation-binding')
        observations.push(this.retain(input.run, observed))
        verdict = ciVerdict(observed, input.policy)
      } catch {
        verdict = {
          status: 'unknown',
          reasons: ['unavailable-read'],
          checks: [],
          reviews: 'unknown',
        }
      }
      // Pending and transiently unreadable states keep polling; every other verdict settles.
      if (!ciRetry(verdict)) return { outcome: 'settled', verdict, observations }
      const remaining = until - this.clock.now()
      if (remaining <= 0) break
      await this.clock.sleep(Math.min(CI_WAIT.pollMs, remaining), input.signal)
    }
    return { outcome: input.signal.aborted ? 'cancelled' : 'deadline', verdict, observations }
  }
}
