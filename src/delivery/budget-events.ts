// Budget limits, reservations and usage, replayed from the delivery journal.
import { contractDigest } from '../contracts/compatibility.js'
import type { DeliveryEvent, DeliveryProjection } from './events.js'
import { DeliveryJournalError } from './journal-error.js'
import type { DEFAULT_DELIVERY_BUDGETS } from './plan.js'
import budgetEventSchema from './schemas/budget-event-v1.json' with { type: 'json' }
import budgetFacetSchema from './schemas/budget-v1.json' with { type: 'json' }

export { budgetEventSchema, budgetFacetSchema }
export type BudgetLimits = typeof DEFAULT_DELIVERY_BUDGETS
export interface BudgetMoney {
  currency: string
  micros: number
}
export interface BudgetRequirements {
  tokens?: { limit: number; mode: 'hard' | 'advisory' }
  currency?: BudgetMoney & { mode: 'hard' | 'advisory' }
}
export interface BudgetClock {
  wall: string
  monotonicMs: number
  epoch: string
}
export interface BudgetMetering {
  tokensMaximum?: number
  currencyMaximum?: BudgetMoney
  hardTokens: boolean
  hardCurrency: boolean
  meter: string
  evidence: string
  provenance: 'fixture' | 'host-observed'
}
export interface BudgetReservation {
  id: string
  kind: 'attempt' | 'effect'
  unit?: string
  role?: string
  cell?: string
  generation?: number
  deadline: string
  clock: BudgetClock
  metering?: BudgetMetering
}
export interface BudgetUsage {
  key: string
  reservation: string
  meter: string
  mode: 'delta' | 'cumulative'
  tokens?: number
  currency?: BudgetMoney
  final: boolean
  evidence: string
  provenance: 'fixture' | 'host-observed'
}
export interface BudgetFailure {
  key: string
  role: string
  category: string
  candidate: string
  findings: string[]
  evidence: string
  provenance: 'fixture' | 'host-observed'
}
export interface BudgetProgress {
  key: string
  kind:
    | 'validated-artifact'
    | 'observed-behavior'
    | 'resolved-finding'
    | 'accepted-candidate'
    | 'reconciled-effect'
  digest: string
  evidence: string
  provenance: 'fixture' | 'host-observed'
}
export interface BudgetCounter {
  key: string
  kind: 'integration-repair'
  evidence: string
  provenance: 'fixture' | 'host-observed'
}
export interface BudgetArtifact {
  digest: string
  bytes: number
  ref: string
}
export interface BudgetPayload {
  schema: 'wholeloop/delivery-budget-event@1'
  basis: string
  action:
    | 'configured'
    | 'started'
    | 'clock'
    | 'limits'
    | 'reserved'
    | 'usage'
    | 'counter'
    | 'failure'
    | 'progress'
    | 'artifact-reserved'
    | 'artifact-observed'
    | 'artifact-omitted'
  grantDigest?: string
  requirements?: BudgetRequirements
  limits?: BudgetLimits
  clock?: BudgetClock
  startedAt?: string
  deadline?: string
  reservation?: BudgetReservation
  usage?: BudgetUsage
  counter?: BudgetCounter
  failure?: BudgetFailure
  progress?: BudgetProgress
  artifact?: BudgetArtifact
  reason?: 'artifact-byte-limit' | 'credential-bearing'
}
export interface BudgetFacet {
  schema: 'wholeloop/delivery-budget@1'
  requirements: BudgetRequirements
  limits?: BudgetLimits
  grantDigest?: string
  startedAt?: string
  deadline?: string
  clock?: BudgetClock
  elapsedMs: number
  clockInvalid: boolean
  meterViolation: boolean
  reservations: BudgetReservation[]
  usage: BudgetUsage[]
  counters: BudgetCounter[]
  failures: BudgetFailure[]
  progress: BudgetProgress[]
  streak: number
  signature?: string
  artifacts: (BudgetArtifact & { status: 'reserved' | 'observed' })[]
  omissions: (BudgetArtifact & { reason: 'artifact-byte-limit' | 'credential-bearing' })[]
}
export function emptyBudget(): BudgetFacet {
  return {
    schema: 'wholeloop/delivery-budget@1',
    requirements: {},
    elapsedMs: 0,
    clockInvalid: false,
    meterViolation: false,
    reservations: [],
    usage: [],
    counters: [],
    failures: [],
    progress: [],
    streak: 0,
    artifacts: [],
    omissions: [],
  }
}
export function findBudget(state: DeliveryProjection): BudgetFacet | undefined {
  return state.facets.find((entry) => entry.schema === 'wholeloop/delivery-budget@1')
}
export function budgetClockState(facet: BudgetFacet, clock: BudgetClock) {
  const prior = facet.clock
  const invalid =
    facet.clockInvalid ||
    !Number.isFinite(Date.parse(clock.wall)) ||
    new Date(clock.wall).toISOString() !== clock.wall ||
    !Number.isFinite(clock.monotonicMs) ||
    clock.monotonicMs < 0 ||
    (prior !== undefined &&
      (clock.wall < prior.wall ||
        clock.epoch !== prior.epoch ||
        clock.monotonicMs < prior.monotonicMs))
  const elapsed = Math.max(
    facet.elapsedMs + (prior && !invalid ? Math.ceil(clock.monotonicMs - prior.monotonicMs) : 0),
    facet.startedAt ? Date.parse(clock.wall) - Date.parse(facet.startedAt) : 0,
    facet.elapsedMs,
  )
  return {
    elapsedMs: Number.isSafeInteger(elapsed) ? elapsed : Number.MAX_SAFE_INTEGER,
    clockInvalid: invalid || !Number.isSafeInteger(elapsed),
  }
}
export function failureSignature(failure: BudgetFailure): string {
  return contractDigest({
    role: failure.role,
    category: failure.category,
    candidate: failure.candidate,
    findings: [...failure.findings].sort(),
  })
}

/** Replay derives elapsed time, deduplicated counters and streaks; callers cannot supply totals. */
export function reduceDeliveryBudget(
  state: DeliveryProjection,
  event: DeliveryEvent,
  payload: BudgetPayload,
): void {
  if (payload.basis !== state.basis.digest) throw new DeliveryJournalError('budget-basis')
  const fields: Record<BudgetPayload['action'], string[]> = {
    configured: ['grantDigest', 'requirements'],
    started: ['grantDigest', 'limits', 'clock', 'startedAt', 'deadline'],
    clock: ['clock', 'limits'],
    limits: ['limits'],
    reserved: ['reservation'],
    usage: ['usage'],
    counter: ['counter'],
    failure: ['failure'],
    progress: ['progress'],
    'artifact-reserved': ['artifact'],
    'artifact-observed': ['artifact'],
    'artifact-omitted': ['artifact', 'reason'],
  }
  if (
    Object.keys(payload).some(
      (key) => !['schema', 'basis', 'action', ...fields[payload.action]].includes(key),
    )
  )
    throw new DeliveryJournalError('budget-action-fields')
  let facet = findBudget(state)
  if (!facet) {
    facet = emptyBudget()
    state.facets.push(facet)
  }
  if (payload.action === 'configured') {
    if (
      event.actor.kind !== 'operator' ||
      !state.grant ||
      !payload.requirements ||
      !Object.keys(payload.requirements).length ||
      payload.grantDigest !== state.grant?.digest ||
      state.grant.status !== 'active' ||
      facet.startedAt ||
      Object.keys(facet.requirements).length
    )
      throw new DeliveryJournalError('budget-constraints-authority')
    facet.requirements = structuredClone(payload.requirements)
    return
  }
  if (event.actor.kind !== 'controller') throw new DeliveryJournalError('budget-controller')
  if (payload.action === 'started') {
    if (
      !state.grant ||
      facet.startedAt ||
      !payload.startedAt ||
      !payload.deadline ||
      !payload.clock ||
      !payload.limits ||
      payload.grantDigest !== state.grant?.digest ||
      state.grant.status !== 'active' ||
      payload.startedAt > payload.clock.wall ||
      !Number.isFinite(Date.parse(payload.startedAt)) ||
      new Date(Date.parse(payload.startedAt) + payload.limits.wallTimeMs).toISOString() !==
        payload.deadline
    )
      throw new DeliveryJournalError('budget-start')
    facet.startedAt = payload.startedAt
    facet.deadline = payload.deadline
    facet.grantDigest = payload.grantDigest
    facet.limits = structuredClone(payload.limits)
    Object.assign(facet, budgetClockState(facet, payload.clock))
    facet.clock = structuredClone(payload.clock)
    facet.clockInvalid ||= state.clockWentBackwards
    return
  }
  if (!facet.startedAt || !facet.limits || !facet.deadline)
    throw new DeliveryJournalError('budget-not-started')
  if (payload.action === 'clock' || payload.action === 'limits') {
    if (
      (payload.action === 'clock' && !payload.clock) ||
      !payload.limits ||
      Object.entries(payload.limits).some(
        ([key, value]) => value > (facet.limits?.[key as keyof BudgetLimits] ?? -1),
      )
    )
      throw new DeliveryJournalError('budget-extension')
    facet.limits = structuredClone(payload.limits)
    facet.deadline = new Date(Date.parse(facet.startedAt) + facet.limits.wallTimeMs).toISOString()
    if (payload.clock) {
      Object.assign(facet, budgetClockState(facet, payload.clock))
      facet.clock = structuredClone(payload.clock)
      facet.clockInvalid ||= state.clockWentBackwards
    }
  } else if (payload.action === 'reserved') {
    const reservation = payload.reservation
    if (
      !reservation ||
      facet.clockInvalid ||
      facet.meterViolation ||
      facet.elapsedMs >= facet.limits.wallTimeMs ||
      facet.streak >= facet.limits.noProgress ||
      facet.reservations.some((entry) => entry.id === reservation.id) ||
      !Number.isFinite(Date.parse(reservation.deadline)) ||
      reservation.deadline > facet.deadline ||
      reservation.deadline <= (facet.clock?.wall ?? facet.startedAt) ||
      (reservation.kind === 'attempt' &&
        (!reservation.role ||
          !reservation.generation ||
          (!reservation.unit && !['planner', 'challenger'].includes(reservation.role))))
    )
      throw new DeliveryJournalError('budget-reservation')
    const tokens = facet.requirements.tokens,
      currency = facet.requirements.currency,
      metering = reservation.metering
    if (
      tokens?.mode === 'hard' &&
      (!metering?.hardTokens ||
        metering.tokensMaximum === undefined ||
        facet.reservations.reduce(
          (total, entry) => total + (entry.metering?.tokensMaximum ?? 0),
          0,
        ) +
          metering.tokensMaximum >
          tokens.limit)
    )
      throw new DeliveryJournalError('unsupported-or-exhausted-hard-tokens')
    if (
      currency?.mode === 'hard' &&
      (!metering?.hardCurrency ||
        metering.currencyMaximum?.currency !== currency.currency ||
        facet.reservations.reduce(
          (total, entry) => total + (entry.metering?.currencyMaximum?.micros ?? 0),
          0,
        ) +
          metering.currencyMaximum.micros >
          currency.micros)
    )
      throw new DeliveryJournalError('unsupported-or-exhausted-hard-currency')
    facet.reservations.push(structuredClone(reservation))
  } else if (payload.action === 'usage') {
    const usage = payload.usage,
      reservation = facet.reservations.find((entry) => entry.id === usage?.reservation)
    if (!usage || !reservation) throw new DeliveryJournalError('budget-usage-binding')
    const cumulative = usage.mode === 'cumulative',
      monetary = cumulative || usage.currency !== undefined
    let invalidStream =
      (reservation.metering !== undefined && reservation.metering.meter !== usage.meter) ||
      (reservation.metering?.provenance === 'fixture' && usage.provenance !== 'fixture')
    let lastTokens: number | undefined
    let lastCurrency: BudgetMoney | undefined
    let tokenTotal = 0
    let moneyTotal = 0
    for (const entry of facet.usage) {
      // Key refusal precedes every stream/regression refusal, including when a
      // later unrelated record duplicates this key. After a bad stream, finish
      // only that key check instead of reading unusable accounting fields.
      if (entry.key === usage.key) throw new DeliveryJournalError('budget-usage-binding')
      if (invalidStream || entry.reservation !== usage.reservation) continue
      if (entry.meter !== usage.meter || entry.mode !== usage.mode || entry.final) {
        invalidStream = true
        continue
      }
      const tokens = entry.tokens
      if (cumulative) {
        if (tokens !== undefined) lastTokens = tokens
      } else tokenTotal += tokens ?? 0
      if (monetary) {
        const money = entry.currency
        if (money !== undefined) lastCurrency = money
        if (!cumulative) moneyTotal += money?.micros ?? 0
      }
    }
    if (invalidStream) throw new DeliveryJournalError('budget-usage-stream')
    if (
      (cumulative &&
        usage.tokens !== undefined &&
        lastTokens !== undefined &&
        usage.tokens < lastTokens) ||
      (usage.currency &&
        lastCurrency &&
        (usage.currency.currency !== lastCurrency.currency ||
          (cumulative && usage.currency.micros < lastCurrency.micros)))
    )
      throw new DeliveryJournalError('budget-usage-regression')
    facet.usage.push(structuredClone(usage))
    const tokens = cumulative ? (usage.tokens ?? lastTokens) : tokenTotal + (usage.tokens ?? 0)
    const money = cumulative
      ? (usage.currency ?? lastCurrency)
      : usage.currency
        ? { currency: usage.currency.currency, micros: moneyTotal + usage.currency.micros }
        : undefined
    if (
      (reservation.metering?.hardTokens &&
        tokens !== undefined &&
        tokens > (reservation.metering.tokensMaximum ?? -1)) ||
      (reservation.metering?.hardCurrency &&
        money &&
        (money.currency !== reservation.metering.currencyMaximum?.currency ||
          money.micros > (reservation.metering.currencyMaximum?.micros ?? -1)))
    )
      facet.meterViolation = true
  } else if (payload.action === 'counter') {
    if (
      !payload.counter ||
      facet.counters.some((entry) => entry.key === payload.counter?.key) ||
      facet.counters.length >= facet.limits.integrationRepairs
    )
      throw new DeliveryJournalError('budget-counter-limit')
    facet.counters.push(structuredClone(payload.counter))
  } else if (payload.action === 'failure') {
    const failure = payload.failure
    if (!failure || facet.failures.some((entry) => entry.key === failure.key))
      throw new DeliveryJournalError('budget-failure-binding')
    const signature = failureSignature(failure)
    facet.streak = signature === facet.signature ? facet.streak + 1 : 1
    facet.signature = signature
    facet.failures.push(structuredClone(failure))
  } else if (payload.action === 'progress') {
    const progress = payload.progress
    if (!progress || facet.progress.some((entry) => entry.key === progress.key))
      throw new DeliveryJournalError('budget-progress-binding')
    if (
      !facet.progress.some(
        (entry) => entry.kind === progress.kind && entry.digest === progress.digest,
      )
    ) {
      facet.streak = 0
      delete facet.signature
    }
    facet.progress.push(structuredClone(progress))
  } else {
    const artifact = payload.artifact
    if (!artifact || artifact.ref !== `delivery/artifacts/${state.run}/${artifact.digest}`)
      throw new DeliveryJournalError('budget-artifact-binding')
    const prior = facet.artifacts.find((entry) => entry.digest === artifact.digest)
    if (payload.action === 'artifact-omitted') {
      if (
        !payload.reason ||
        facet.omissions.some(
          (entry) => entry.digest === artifact.digest && entry.reason === payload.reason,
        )
      )
        throw new DeliveryJournalError('budget-artifact-omission')
      facet.omissions.push({ ...structuredClone(artifact), reason: payload.reason })
    } else if (payload.action === 'artifact-reserved') {
      if (
        prior ||
        facet.artifacts.reduce((bytes, entry) => bytes + entry.bytes, 0) + artifact.bytes >
          facet.limits.artifactBytes
      )
        throw new DeliveryJournalError('budget-artifact-limit')
      facet.artifacts.push({ ...structuredClone(artifact), status: 'reserved' })
    } else {
      if (
        prior?.status !== 'reserved' ||
        prior.bytes !== artifact.bytes ||
        prior.ref !== artifact.ref
      )
        throw new DeliveryJournalError('budget-artifact-observation')
      prior.status = 'observed'
    }
  }
}
