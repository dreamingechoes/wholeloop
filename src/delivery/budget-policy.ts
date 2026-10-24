import { hostname, platform } from 'node:os'
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryGrant } from './authority.js'
import {
  type BudgetClock,
  type BudgetFacet,
  type BudgetLimits,
  type BudgetMetering,
  type BudgetPayload,
  type BudgetReservation,
  budgetClockState,
  emptyBudget,
  findBudget,
} from './budget-events.js'
import type { DeliveryProjection } from './events.js'

const CLOCK_EPOCH = contractDigest({
  hostname: hostname(),
  platform: platform(),
  clock: 'local-monotonic',
})
export function deliveryBudgetClock(wall: () => string): BudgetClock {
  return {
    wall: wall(),
    monotonicMs: Number(process.hrtime.bigint() / 1000000n),
    epoch: CLOCK_EPOCH,
  }
}
/** Historical work without a reservation has unknown usage, even after newer calls finish. */
export function unmeteredDeliveryWork(state: DeliveryProjection): number {
  const reserved = new Set(findBudget(state)?.reservations.map((entry) => entry.id) ?? [])
  return state.facets.reduce(
    (total, facet) =>
      total +
      (facet.schema === 'wholeloop/delivery-attempts@1'
        ? facet.records.filter((entry) => !reserved.has(entry.id)).length
        : facet.schema === 'wholeloop/delivery-effects@1'
          ? facet.records.filter((entry) => entry.invocation && !reserved.has(entry.invocation))
              .length
          : 0),
    0,
  )
}
export function effectiveBudget(
  state: DeliveryProjection,
  grant: DeliveryGrant,
  clock: BudgetClock,
  currentLimits?: BudgetLimits,
) {
  const stored = findBudget(state) ?? emptyBudget()
  const limits = Object.fromEntries(
    Object.entries(grant.budgets).map(([key, value]) => [
      key,
      Math.min(
        value,
        stored.limits?.[key as keyof BudgetLimits] ?? value,
        currentLimits?.[key as keyof BudgetLimits] ?? value,
      ),
    ]),
  ) as unknown as BudgetLimits
  const previousWork = state.facets.some(
    (facet) =>
      (facet.schema === 'wholeloop/delivery-attempts@1' && facet.records.length > 0) ||
      (facet.schema === 'wholeloop/delivery-effects@1' &&
        facet.records.some((record) => record.invocation)),
  )
  // Older runs lack a start marker. Use their original registration conservatively, never a fresh allowance.
  const startedAt = stored.startedAt ?? (previousWork ? state.registeredAt : clock.wall)
  const deadline = new Date(Date.parse(startedAt) + limits.wallTimeMs).toISOString()
  const facet: BudgetFacet = { ...structuredClone(stored), limits, startedAt, deadline }
  Object.assign(facet, budgetClockState(facet, clock))
  facet.clockInvalid ||= state.clockWentBackwards || clock.wall < state.maxObservedAt
  const remainingMs = Math.max(
    0,
    Math.min(limits.wallTimeMs - facet.elapsedMs, Date.parse(deadline) - Date.parse(clock.wall)),
  )
  const problem = facet.clockInvalid
    ? 'clock-invalid'
    : facet.meterViolation
      ? 'metering-violation'
      : remainingMs <= 0
        ? 'deadline'
        : facet.streak >= limits.noProgress
          ? 'no-progress'
          : null
  return { facet, limits, startedAt, deadline, remainingMs, problem }
}
export function budgetClockPayload(
  state: DeliveryProjection,
  grant: DeliveryGrant,
  clock: BudgetClock,
  currentLimits?: BudgetLimits,
): BudgetPayload {
  const budget = effectiveBudget(state, grant, clock, currentLimits)
  return findBudget(state)?.startedAt
    ? {
        schema: 'wholeloop/delivery-budget-event@1',
        action: 'clock',
        basis: state.basis.digest,
        clock,
        limits: budget.limits,
      }
    : {
        schema: 'wholeloop/delivery-budget-event@1',
        action: 'started',
        basis: state.basis.digest,
        clock,
        limits: budget.limits,
        startedAt: budget.startedAt,
        deadline: budget.deadline,
        grantDigest: state.grant?.digest ?? '',
      }
}
export interface BudgetProposal {
  id: string
  kind: 'attempt' | 'effect'
  unit?: string
  role?: string
  cell?: string
  generation?: number
  operation?: string
  metering?: BudgetMetering
}
export function prepareBudgetAdmission(
  state: DeliveryProjection,
  grant: DeliveryGrant,
  clock: BudgetClock,
  proposal: BudgetProposal,
  currentLimits?: BudgetLimits,
) {
  const budget = effectiveBudget(state, grant, clock, currentLimits)
  let problem: string | null = budget.problem
  if (
    !problem &&
    proposal.kind === 'attempt' &&
    ['builder', 'researcher'].includes(proposal.role ?? '') &&
    (proposal.generation ?? 1) - 1 > budget.limits.restarts
  )
    problem = 'restart-limit'
  const pushes =
    state.facets
      .find((facet) => facet.schema === 'wholeloop/delivery-effects@1')
      ?.records.filter((record) => record.intent.operation === 'git.push' && record.invocation)
      .length ?? 0
  if (!problem && proposal.operation === 'git.push' && pushes >= budget.limits.ciPushes)
    problem = 'ci-push-limit'
  const requirements = budget.facet.requirements,
    metering = proposal.metering
  if (
    !problem &&
    unmeteredDeliveryWork(state) > 0 &&
    (requirements.tokens?.mode === 'hard' || requirements.currency?.mode === 'hard')
  )
    problem = 'unmetered-hard-limit'

  if (!problem && requirements.tokens?.mode === 'hard') {
    if (!metering?.hardTokens || metering.tokensMaximum === undefined)
      problem = 'unsupported-hard-token-limit'
    else if (
      budget.facet.reservations.reduce(
        (total, entry) => total + (entry.metering?.tokensMaximum ?? 0),
        0,
      ) +
        metering.tokensMaximum >
      requirements.tokens.limit
    )
      problem = 'token-reservation-limit'
  }
  if (!problem && requirements.currency?.mode === 'hard') {
    if (
      !metering?.hardCurrency ||
      metering.currencyMaximum?.currency !== requirements.currency.currency
    )
      problem = 'unsupported-hard-currency-limit'
    else if (
      budget.facet.reservations.reduce(
        (total, entry) => total + (entry.metering?.currencyMaximum?.micros ?? 0),
        0,
      ) +
        metering.currencyMaximum.micros >
      requirements.currency.micros
    )
      problem = 'currency-reservation-limit'
  }
  const deadline = new Date(
    Math.min(
      Date.parse(grant.expiresAt),
      Date.parse(clock.wall) + Math.min(budget.limits.attemptMs, budget.remainingMs),
    ),
  ).toISOString()
  const reservation: BudgetReservation = {
    id: proposal.id,
    kind: proposal.kind,
    deadline,
    clock,
    ...(proposal.unit ? { unit: proposal.unit } : {}),
    ...(proposal.role ? { role: proposal.role } : {}),
    ...(proposal.cell !== undefined ? { cell: proposal.cell } : {}),
    ...(proposal.generation !== undefined ? { generation: proposal.generation } : {}),
    ...(metering ? { metering: structuredClone(metering) } : {}),
  }
  const payloads: BudgetPayload[] = problem
    ? []
    : [
        budgetClockPayload(state, grant, clock, currentLimits),
        {
          schema: 'wholeloop/delivery-budget-event@1',
          action: 'reserved',
          basis: state.basis.digest,
          reservation,
        },
      ]
  return { problem, payloads, reservation }
}
export function currentBudgetReservation(
  state: DeliveryProjection,
  id: string,
  clock: BudgetClock,
): boolean {
  const facet = findBudget(state)
  if (!facet?.startedAt || !facet.limits) return true
  const reservation = facet.reservations.find((entry) => entry.id === id)
  if (
    !reservation ||
    facet.clockInvalid ||
    facet.meterViolation ||
    facet.streak >= facet.limits.noProgress ||
    state.clockWentBackwards ||
    clock.wall < (facet.clock?.wall ?? facet.startedAt) ||
    clock.epoch !== reservation.clock.epoch ||
    clock.monotonicMs < reservation.clock.monotonicMs
  )
    return false
  const elapsed = budgetClockState(facet, clock)
  return (
    !elapsed.clockInvalid &&
    elapsed.elapsedMs < facet.limits.wallTimeMs &&
    clock.wall < (facet.deadline ?? '') &&
    clock.wall < reservation.deadline &&
    clock.monotonicMs - reservation.clock.monotonicMs <
      Date.parse(reservation.deadline) - Date.parse(reservation.clock.wall)
  )
}

function safeSum(values: number[]): number {
  const result = values.reduce((total, value) => total + value, 0)
  if (!Number.isSafeInteger(result))
    throw new Error('Observed usage exceeds safe integer accounting')
  return result
}
export function budgetUsage(facet: BudgetFacet, unmeteredInvocations = 0) {
  const streams = facet.reservations.map((reservation) => ({
    reservation,
    reports: facet.usage.filter((report) => report.reservation === reservation.id),
  }))
  const tokenValues = streams.map((stream) => {
    const known = stream.reports.filter((report) => report.tokens !== undefined)
    return {
      value: known.length
        ? stream.reports[0]?.mode === 'cumulative'
          ? (known.at(-1)?.tokens ?? 0)
          : safeSum(known.map((report) => report.tokens ?? 0))
        : null,
      complete:
        stream.reports.at(-1)?.final === true &&
        stream.reports.at(-1)?.tokens !== undefined &&
        (stream.reports[0]?.mode === 'cumulative' ||
          stream.reports.every((report) => report.tokens !== undefined)),
    }
  })
  const tokens = {
    value: tokenValues.some((entry) => entry.value !== null)
      ? safeSum(tokenValues.map((entry) => entry.value ?? 0))
      : null,
    completeness:
      !unmeteredInvocations && tokenValues.length && tokenValues.every((entry) => entry.complete)
        ? 'complete'
        : tokenValues.some((entry) => entry.value !== null)
          ? 'partial'
          : 'unknown',
  }
  const codes = [
    ...new Set(
      facet.usage.flatMap((report) => (report.currency ? [report.currency.currency] : [])),
    ),
  ].sort()
  if (facet.requirements.currency && !codes.includes(facet.requirements.currency.currency))
    codes.push(facet.requirements.currency.currency)
  const currencies = codes.map((currency) => {
    const observations = streams.map((stream) => {
      const known = stream.reports.filter((report) => report.currency?.currency === currency)
      return {
        value: known.length
          ? stream.reports[0]?.mode === 'cumulative'
            ? (known.at(-1)?.currency?.micros ?? 0)
            : safeSum(known.map((report) => report.currency?.micros ?? 0))
          : null,
        complete:
          stream.reports.at(-1)?.final === true &&
          stream.reports.at(-1)?.currency?.currency === currency &&
          (stream.reports[0]?.mode === 'cumulative' ||
            stream.reports.every((report) => report.currency?.currency === currency)),
      }
    })
    return {
      currency,
      micros: observations.some((entry) => entry.value !== null)
        ? safeSum(observations.map((entry) => entry.value ?? 0))
        : null,
      completeness:
        !unmeteredInvocations &&
        observations.length &&
        observations.every((entry) => entry.complete)
          ? 'complete'
          : observations.some((entry) => entry.value !== null)
            ? 'partial'
            : 'unknown',
    }
  })
  return {
    tokens,
    currencies,
    unmeteredInvocations,
    provenance: facet.usage.length
      ? facet.usage.some((report) => report.provenance === 'fixture')
        ? 'fixture'
        : 'host-observed'
      : 'unknown',
  }
}
