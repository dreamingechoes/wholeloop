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
  type BudgetUsage,
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
function calculateBudget(
  copy: (facet: BudgetFacet) => BudgetFacet,
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
  // Older runs lack a start marker. Use their original registration conservatively, never a fresh allowance.
  const startedAt =
    stored.startedAt ??
    (state.facets.some(
      (facet) =>
        (facet.schema === 'wholeloop/delivery-attempts@1' && facet.records.length > 0) ||
        (facet.schema === 'wholeloop/delivery-effects@1' &&
          facet.records.some((record) => record.invocation)),
    )
      ? state.registeredAt
      : clock.wall)
  const deadline = new Date(Date.parse(startedAt) + limits.wallTimeMs).toISOString()
  const facet: BudgetFacet = { ...copy(stored), limits, startedAt, deadline }
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
type BudgetReadValue<T> = T extends readonly (infer Item)[]
  ? readonly BudgetReadValue<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: BudgetReadValue<T[Key]> }
    : T
const borrowBudget = (facet: BudgetFacet) => facet

/** Public snapshots keep independent nested records for callers that retain or edit them. */
export function effectiveBudget(
  state: DeliveryProjection,
  grant: DeliveryGrant,
  clock: BudgetClock,
  currentLimits?: BudgetLimits,
) {
  return calculateBudget(structuredClone, state, grant, clock, currentLimits)
}

/** Borrow nested records only for the current synchronous read, never across mutation or await.
 * This is not an independent snapshot or an authority receipt. */
export function effectiveBudgetView(
  state: DeliveryProjection,
  grant: DeliveryGrant,
  clock: BudgetClock,
  currentLimits?: BudgetLimits,
): BudgetReadValue<ReturnType<typeof calculateBudget>> {
  return calculateBudget(borrowBudget, state, grant, clock, currentLimits)
}

function clockPayload(
  state: DeliveryProjection,
  clock: BudgetClock,
  budget: ReturnType<typeof effectiveBudgetView>,
): BudgetPayload {
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
export function budgetClockPayload(
  state: DeliveryProjection,
  grant: DeliveryGrant,
  clock: BudgetClock,
  currentLimits?: BudgetLimits,
): BudgetPayload {
  return clockPayload(state, clock, effectiveBudgetView(state, grant, clock, currentLimits))
}
export interface BudgetProposal {
  /** Internal parent bound; narrowing never grants additional runtime. */
  deadline?: string
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
  const budget = effectiveBudgetView(state, grant, clock, currentLimits)
  const parent = proposal.deadline === undefined ? undefined : Date.parse(proposal.deadline)
  let problem: string | null = budget.problem
  if (parent !== undefined) {
    if (!Number.isFinite(parent) || new Date(parent).toISOString() !== proposal.deadline)
      problem = 'invalid-parent-deadline'
    else if (parent <= Date.parse(clock.wall)) problem = 'parent-deadline'
  }
  if (
    !problem &&
    proposal.kind === 'attempt' &&
    ['builder', 'researcher'].includes(proposal.role ?? '') &&
    (proposal.generation ?? 1) - 1 > budget.limits.restarts
  )
    problem = 'restart-limit'
  if (!problem && proposal.operation === 'git.push') {
    const pushes =
      state.facets
        .find((facet) => facet.schema === 'wholeloop/delivery-effects@1')
        ?.records.reduce(
          (total, record) =>
            total + Number(record.intent.operation === 'git.push' && Boolean(record.invocation)),
          0,
        ) ?? 0
    if (pushes >= budget.limits.ciPushes) problem = 'ci-push-limit'
  }
  const requirements = budget.facet.requirements,
    metering = proposal.metering
  if (
    !problem &&
    (requirements.tokens?.mode === 'hard' || requirements.currency?.mode === 'hard') &&
    unmeteredDeliveryWork(state) > 0
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
      parent !== undefined && Number.isFinite(parent) ? parent : Number.POSITIVE_INFINITY,
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
        clockPayload(state, clock, budget),
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
function usageStreams(facet: BudgetFacet): BudgetUsage[][] {
  if (!facet.reservations.length) return []
  if (facet.reservations.length === 1) {
    const id = facet.reservations[0]?.id
    return [facet.usage.filter((report) => report.reservation === id)]
  }
  const byReservation = new Map<string, BudgetUsage[]>()
  const streams = facet.reservations.map(({ id }) => {
    let reports = byReservation.get(id)
    if (!reports) {
      reports = []
      byReservation.set(id, reports)
    }
    return reports
  })
  // Preserve receipt order and duplicate reservation weighting. Orphan receipts
  // still contribute currency inventory and provenance in the full report below.
  for (const report of facet.usage) byReservation.get(report.reservation)?.push(report)
  return streams
}
function addCurrencyUsage(
  totals: Map<string, { micros: number; complete: number }>,
  currency: string,
  micros: number,
  complete: boolean,
) {
  // Per-stream overflow must still refuse even if the aggregate happens to be safe.
  safeSum([micros])
  const prior = totals.get(currency)
  totals.set(currency, {
    micros: (prior?.micros ?? 0) + micros,
    complete: (prior?.complete ?? 0) + Number(complete),
  })
}
export function budgetUsage(facet: BudgetFacet, unmeteredInvocations = 0) {
  const streams = usageStreams(facet)
  const tokenValues = streams.map((reports) => {
    const known = reports.filter((report) => report.tokens !== undefined)
    return {
      value: known.length
        ? reports[0]?.mode === 'cumulative'
          ? (known.at(-1)?.tokens ?? 0)
          : safeSum(known.map((report) => report.tokens ?? 0))
        : null,
      complete:
        reports.at(-1)?.final === true &&
        reports.at(-1)?.tokens !== undefined &&
        (reports[0]?.mode === 'cumulative' ||
          reports.every((report) => report.tokens !== undefined)),
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
  const totals = new Map<string, { micros: number; complete: number }>()
  for (const reports of streams) {
    const last = reports.at(-1)
    if (reports.length === 1) {
      const money = last?.currency
      if (money) addCurrencyUsage(totals, money.currency, money.micros, last?.final === true)
      continue
    }
    const cumulative = reports[0]?.mode === 'cumulative'
    const known = new Map<string, { micros: number; count: number }>()
    for (const report of reports) {
      const money = report.currency
      if (!money) continue
      const prior = known.get(money.currency)
      known.set(money.currency, {
        micros: cumulative ? money.micros : (prior?.micros ?? 0) + money.micros,
        count: (prior?.count ?? 0) + 1,
      })
    }
    const finalCurrency = last?.currency?.currency
    for (const [currency, value] of known) {
      addCurrencyUsage(
        totals,
        currency,
        value.micros,
        last?.final === true &&
          finalCurrency === currency &&
          (cumulative || value.count === reports.length),
      )
    }
  }
  const currencies = codes.map((currency) => {
    const value = totals.get(currency)
    return {
      currency,
      micros: value ? safeSum([value.micros]) : null,
      completeness:
        !unmeteredInvocations && streams.length && value?.complete === streams.length
          ? 'complete'
          : value
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
