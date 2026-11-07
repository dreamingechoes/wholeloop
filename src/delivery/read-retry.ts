// Bounded reads for recovery, where a timeout stays unresolved and never authorizes a retry.
import { performance } from 'node:perf_hooks'

export type RecoveryReadFailure =
  | 'transient-provider'
  | 'denied-access'
  | 'invalid-output'
  | 'unavailable-read'
  | 'clock-invalid'
  | 'deadline'
export type RecoveryRead<T> =
  | { available: true; value: T }
  | { available: false; reason: RecoveryReadFailure }
export interface RecoveryClock {
  now(): number
  wait(ms: number): Promise<void>
}
const DEFAULT_CLOCK: RecoveryClock = {
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/** A host can ignore cancellation; a timeout remains unresolved and cannot authorize a retry. */
export async function boundedRecoveryCall<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<RecoveryRead<T>> {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0)
    return { available: false, reason: 'deadline' }
  const controller = new AbortController()
  const budget = Math.min(milliseconds, 2147483647),
    started = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<RecoveryRead<T>>((resolve) => {
      timer = setTimeout(() => {
        controller.abort()
        resolve({ available: false, reason: 'deadline' })
      }, budget)
    })
    const request = Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => ({ available: true as const, value }),
        () => ({ available: false as const, reason: 'unavailable-read' as const }),
      )
    const result = await Promise.race([request, timeout])
    // Synchronous host work or a microtask chain can starve the timer. Its
    // delayed callback must not make an observation completed past budget current.
    if (performance.now() - started >= budget) {
      controller.abort()
      return { available: false, reason: 'deadline' }
    }
    return result
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Writes never enter this helper. Only an explicitly classified transient read can retry. */
export async function recoveryRead<T>(
  operation: (signal: AbortSignal) => Promise<RecoveryRead<T>>,
  deadline: number,
  clock = DEFAULT_CLOCK,
): Promise<RecoveryRead<T>> {
  let maximum = clock.now()
  if (!Number.isFinite(deadline) || !Number.isFinite(maximum))
    return { available: false, reason: 'clock-invalid' }
  for (const delay of [0, 5000, 15000, 45000]) {
    const before = clock.now()
    if (!Number.isFinite(before) || before < maximum)
      return { available: false, reason: 'clock-invalid' }
    maximum = before
    if (before >= deadline || before + delay >= deadline)
      return { available: false, reason: 'deadline' }
    if (delay) await clock.wait(delay)
    const at = clock.now()
    if (!Number.isFinite(at) || at < maximum) return { available: false, reason: 'clock-invalid' }
    maximum = at
    if (at >= deadline) return { available: false, reason: 'deadline' }
    let result: RecoveryRead<T>
    try {
      const bounded = await boundedRecoveryCall(operation, deadline - at)
      if (!bounded.available) return bounded
      result = bounded.value
    } catch {
      return { available: false, reason: 'unavailable-read' }
    }
    const after = clock.now()
    if (!Number.isFinite(after) || after < maximum)
      return { available: false, reason: 'clock-invalid' }
    maximum = after
    if (after >= deadline) return { available: false, reason: 'deadline' }
    if (result.available || result.reason !== 'transient-provider') return result
  }
  return { available: false, reason: 'transient-provider' }
}
