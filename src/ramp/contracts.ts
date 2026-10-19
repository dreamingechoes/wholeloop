import { createHash } from 'node:crypto'
import { validate } from '../config/schema.js'
import { OPERATIONS } from '../providers/taxonomy.js'
import type { StateEvent } from '../state/events.js'
import eventSchema from './schemas/events-v1.json' with { type: 'json' }
import schema from './schemas/plan-v1.json' with { type: 'json' }

export interface RampCheck {
  key: string
  provider: string
  operation: string
  query: string
  unit: string
  operator: 'lt' | 'lte' | 'eq' | 'gte' | 'gt'
  threshold: number
  required: boolean
  lookbackHours: number
  timezone: string
}
export interface RampStage {
  key: string
  audience: string
  enabled: boolean
  exposure: number
  exit: string
  checks: RampCheck[]
}
export interface RampPlan {
  schema: 'wholeloop/ramp-plan@1'
  environment: string
  flag?: string
  confirmedBy: string
  sourceDigest?: string
  stages: RampStage[]
}
export interface FlagObservation {
  status: 'observed' | 'unknown' | 'manual'
  ref: string
  flag?: string
  environment: string
  enabled?: boolean
  exposure?: number
  audience?: string
  revision?: string
  missing?: string
}
export interface CheckObservation {
  key: string
  status: 'pass' | 'fail' | 'unknown'
  provider: string
  operation: string
  query: string
  queryDigest: string
  window: { start: string; end: string; timezone: string }
  unit: string
  value?: number
  ref?: string
  bodyDigest?: string
  missing?: string
}
export interface RampEvidence {
  run: string
  stage: number
  at: string
  flag: FlagObservation
  checks: CheckObservation[]
}
export type RampOutcome = 'go' | 'hold' | 'rollback'
export type RampEventData =
  | {
      type: 'ramp.planned'
      data: {
        run: string
        plan: RampPlan
        criteria: { ref: string; origin: string; digest: string }
      }
    }
  | { type: 'ramp.observed'; data: RampEvidence }
  | {
      type: 'ramp.proposal-planned'
      data: { run: string; stage: number; basis: string; provider: string; digest: string }
    }
  | {
      type: 'ramp.proposal-finished'
      data: {
        run: string
        stage: number
        basis: string
        result: { status: 'succeeded' | 'pending'; ref: string }
      }
    }
  | {
      type: 'ramp.decided'
      data: {
        run: string
        stage: number
        basis: string
        by: string
        reason: string
        outcome: RampOutcome
        acknowledgedRisks: string[]
      }
    }
  | {
      type: 'ramp.confirmed'
      data: {
        run: string
        stage: number
        basis: string
        by: string
        at: string
        evidence: FlagObservation
      }
    }

export const queryDigest = (query: string) => createHash('sha256').update(query).digest('hex')
export function satisfies(
  value: number,
  operator: RampCheck['operator'],
  threshold: number,
): boolean {
  return operator === 'lt'
    ? value < threshold
    : operator === 'lte'
      ? value <= threshold
      : operator === 'eq'
        ? value === threshold
        : operator === 'gte'
          ? value >= threshold
          : value > threshold
}
export function validateRampPlan(value: unknown): asserts value is RampPlan {
  if (validate(value, schema).length) throw new Error('Invalid wholeloop/ramp-plan@1 input')
  const plan = value as RampPlan
  if (
    !plan.confirmedBy.trim() ||
    !plan.environment.trim() ||
    new Set(plan.stages.map((stage) => stage.key)).size !== plan.stages.length
  )
    throw new Error('Ramp stages need unique keys and explicit environment/plan confirmation')
  for (const stage of plan.stages) {
    if (
      !stage.audience.trim() ||
      !stage.exit.trim() ||
      new Set(stage.checks.map((check) => check.key)).size !== stage.checks.length
    )
      throw new Error('Each ramp stage needs audience, exit criteria and unique checks')
    for (const check of stage.checks) {
      if (
        !check.query.trim() ||
        !check.unit.trim() ||
        !check.provider.trim() ||
        !check.operation.startsWith('source.') ||
        !OPERATIONS.has(check.operation)
      )
        throw new Error('Ramp checks need explicit read-only queries, provider and unit')
      try {
        new Intl.DateTimeFormat('en', { timeZone: check.timezone })
      } catch {
        throw new Error('Ramp checks need a valid query timezone')
      }
    }
  }
}
export function rampRecommendation(evidence: RampEvidence, stage: RampStage) {
  if (evidence.flag.status === 'unknown') return 'hold' as const
  if (
    evidence.checks.some(
      (row) =>
        row.status === 'fail' && stage.checks.find((check) => check.key === row.key)?.required,
    )
  )
    return 'rollback' as const
  if (
    evidence.checks.some(
      (row) =>
        row.status === 'unknown' && stage.checks.find((check) => check.key === row.key)?.required,
    )
  )
    return 'hold' as const
  return evidence.checks.some((row) => row.status !== 'pass')
    ? ('review-open-signals' as const)
    : ('go' as const)
}
export function observedTarget(observed: FlagObservation, stage: RampStage): boolean {
  return (
    observed.status === 'manual' ||
    (observed.status === 'observed' &&
      observed.enabled === stage.enabled &&
      (!stage.enabled ||
        (observed.exposure === stage.exposure && observed.audience === stage.audience)))
  )
}

export function sameExposure(left: FlagObservation, right: FlagObservation): boolean {
  return (
    left.enabled === right.enabled &&
    (!left.enabled || (left.exposure === right.exposure && left.audience === right.audience))
  )
}
/** A lost or changed control observation breaks the evidence window, even if later restored. */
export function bindRampControl(
  evidence: RampEvidence,
  baseline?: FlagObservation,
  uncertain = false,
): RampEvidence {
  if (baseline?.status !== 'observed' || evidence.flag.status !== 'observed') return evidence
  if (!sameExposure(evidence.flag, baseline))
    return {
      ...evidence,
      flag: {
        status: 'unknown',
        ...(evidence.flag.flag ? { flag: evidence.flag.flag } : {}),
        environment: evidence.flag.environment,
        ref: evidence.flag.ref,
        missing:
          'Exposure changed outside the approved ramp; restore and re-observe the confirmed control before continuing',
      },
    }
  if (!uncertain) return evidence
  return {
    ...evidence,
    checks: evidence.checks.map(({ value: _value, ref: _ref, bodyDigest: _digest, ...check }) => ({
      ...check,
      status: 'unknown',
      missing:
        'Confirmed exposure was restored after uncertainty; collect a fresh full lookback window',
    })),
  }
}

export function validRampData(type: string, data: Record<string, unknown>): boolean {
  try {
    const rule = eventSchema.properties[type as keyof typeof eventSchema.properties]
    if (!rule || validate(data, rule).length) return false
    if (type === 'ramp.planned') validateRampPlan(data.plan)
    if (
      (type === 'ramp.decided' || type === 'ramp.confirmed') &&
      (typeof data.by !== 'string' || !data.by.trim())
    )
      return false
    if (type === 'ramp.decided' && (typeof data.reason !== 'string' || !data.reason.trim()))
      return false
    return true
  } catch {
    return false
  }
}
function validFlag(plan: RampPlan, evidence: FlagObservation): boolean {
  if (evidence.environment !== plan.environment) return false
  if (!plan.flag) return evidence.status === 'manual' && !!evidence.ref.trim()
  if (evidence.flag !== plan.flag || evidence.status === 'manual') return false
  if (evidence.status === 'unknown')
    return (
      !!evidence.missing?.trim() &&
      evidence.enabled === undefined &&
      evidence.exposure === undefined
    )
  return (
    typeof evidence.enabled === 'boolean' &&
    typeof evidence.exposure === 'number' &&
    Number.isFinite(evidence.exposure) &&
    evidence.exposure >= 0 &&
    evidence.exposure <= 100 &&
    !!evidence.audience?.trim() &&
    !!evidence.revision?.trim() &&
    !!evidence.ref.trim()
  )
}
/** Plans stay immutable; each approval points at the exact evidence shown for this stage. */
export function rampRuns(events: readonly StateEvent[]) {
  const runs = new Map<
    string,
    {
      subject: string
      event: string
      run: string
      plan: RampPlan
      criteria: { ref: string; origin: string; digest: string }
      stage: number
      observation?: { event: string; evidence: RampEvidence }
      decision?: { event: string; outcome: RampOutcome; by: string }
      confirmations: string[]
      exposureSince?: string
      baseline?: FlagObservation
      controlUncertain?: boolean
    }
  >()
  const active = new Map<string, string>()
  for (const event of events) {
    if (event.type === 'step.started' && event.data.step === 'ramp-exposure')
      active.set(event.subject, event.data.run)
    if (
      (event.type === 'step.completed' || event.type === 'step.skipped') &&
      event.data.step === 'ramp-exposure'
    )
      active.delete(event.subject)
    if (event.type === 'ramp.planned') {
      if (
        !events
          .slice(0, events.indexOf(event))
          .some(
            (entry) =>
              entry.subject === event.subject &&
              entry.type === 'step.started' &&
              entry.data.step === 'ramp-exposure' &&
              entry.data.run === event.data.run,
          )
      )
        throw new Error('Begin ramp-exposure before its plan')
      if (active.get(event.subject) !== event.data.run)
        throw new Error('Ramp plan needs its active stage workflow')
      if (runs.has(event.data.run)) throw new Error('A ramp run has one immutable plan')
      runs.set(event.data.run, {
        subject: event.subject,
        event: event.id,
        ...event.data,
        stage: 0,
        confirmations: [],
      })
    }
    if (
      event.type === 'ramp.observed' ||
      event.type === 'ramp.decided' ||
      event.type === 'ramp.confirmed'
    ) {
      const run = runs.get(event.data.run)
      const target = run?.plan.stages[run.stage]
      if (
        !run ||
        active.get(event.subject) !== event.data.run ||
        run.subject !== event.subject ||
        !target ||
        event.data.stage !== run.stage
      )
        throw new Error('Ramp event must match its current uncompleted stage')
      if (event.type === 'ramp.observed') {
        if (!validFlag(run.plan, event.data.flag))
          throw new Error(
            'Flag observation must preserve its environment, identity and observed/unknown status',
          )
        if (
          !Number.isFinite(Date.parse(event.data.at)) ||
          Date.parse(event.data.at) > Date.parse(event.ts) ||
          (run.exposureSince !== undefined &&
            Date.parse(event.data.at) < Date.parse(run.exposureSince))
        )
          throw new Error('Ramp evidence needs a valid historical window end')
        if (run.baseline?.status === 'observed' && event.data.flag.status === 'observed') {
          if (!sameExposure(event.data.flag, run.baseline))
            throw new Error('Changed exposure must be reported unknown before considering go')
          if (run.controlUncertain) {
            run.exposureSince = event.data.at
            run.controlUncertain = false
          }
        } else if (run.baseline?.status === 'observed') run.controlUncertain = true
        const rows = event.data.checks
        if (
          rows.length !== target.checks.length ||
          new Set(rows.map((row) => row.key)).size !== rows.length
        )
          throw new Error('Every stage check needs an explicit observation or unknown')
        for (const row of rows) {
          const check = target.checks.find((check) => check.key === row.key)
          if (
            !check ||
            row.provider !== check.provider ||
            row.operation !== check.operation ||
            row.query !== check.query ||
            row.queryDigest !== queryDigest(check.query) ||
            row.unit !== check.unit ||
            row.window.timezone !== check.timezone
          )
            throw new Error('Evidence must preserve its exact planned source query/window/unit')
          if (
            Date.parse(row.window.end) !== Date.parse(event.data.at) ||
            Date.parse(row.window.end) - Date.parse(row.window.start) !==
              Math.round(check.lookbackHours * 3600000)
          )
            throw new Error(
              'Evidence window must match the planned lookback and observation anchor',
            )
          if (
            run.exposureSince &&
            Date.parse(row.window.start) < Date.parse(run.exposureSince) &&
            row.status !== 'unknown'
          )
            throw new Error('A stage cannot pass with evidence from before its confirmed exposure')
          if (
            row.status !== 'unknown' &&
            (row.value === undefined ||
              !row.ref ||
              !row.bodyDigest ||
              (row.status === 'pass') !== satisfies(row.value, check.operator, check.threshold))
          )
            throw new Error(
              'A ramp verdict must match observed numeric evidence and the planned comparison',
            )
          if (row.status === 'unknown' && (row.value !== undefined || !row.missing?.trim()))
            throw new Error('Unknown ramp evidence cannot invent a value')
        }
        run.observation = { event: event.id, evidence: event.data }
        delete run.decision
      }
      if (event.type === 'ramp.decided') {
        if (!run.observation || event.data.basis !== run.observation.event)
          throw new Error('Ramp decision must reference the current displayed evidence')
        const evidence = run.observation.evidence
        const open = target.checks
          .filter(
            (check) =>
              !check.required &&
              evidence.checks.find((row) => row.key === check.key)?.status !== 'pass',
          )
          .map((check) => check.key)
          .sort()
        if (
          event.data.outcome === 'go' &&
          (['hold', 'rollback'].includes(rampRecommendation(evidence, target)) ||
            JSON.stringify([...event.data.acknowledgedRisks].sort()) !== JSON.stringify(open))
        )
          throw new Error(
            'Go needs required checks passed and explicit acknowledgment of every optional open signal',
          )
        run.decision = { event: event.id, outcome: event.data.outcome, by: event.data.by }
      }
      if (event.type === 'ramp.confirmed') {
        if (
          !validFlag(run.plan, event.data.evidence) ||
          !Number.isFinite(Date.parse(event.data.at)) ||
          Date.parse(event.data.at) > Date.parse(event.ts) ||
          (run.exposureSince !== undefined &&
            Date.parse(event.data.at) < Date.parse(run.exposureSince))
        )
          throw new Error('Confirmation needs a valid same-flag observation and time')
        if (
          !run.decision ||
          event.data.basis !== run.decision.event ||
          run.decision.outcome === 'hold'
        )
          throw new Error("Confirmation needs this stage's explicit go or rollback decision")
        if (run.decision.outcome === 'go' && !observedTarget(event.data.evidence, target))
          throw new Error('Flag read does not confirm the exact approved exposure/audience')
        if (
          run.decision.outcome === 'rollback' &&
          !(
            event.data.evidence.status === 'manual' ||
            (event.data.evidence.status === 'observed' && event.data.evidence.enabled === false)
          )
        )
          throw new Error(
            'Rollback confirmation requires an observed disabled flag or explicit manual handoff',
          )
        run.baseline = event.data.evidence
        run.controlUncertain = false
        run.confirmations.push(event.id)
        run.exposureSince = event.data.at
        run.stage = run.decision.outcome === 'go' ? run.stage + 1 : 0
        delete run.decision
        delete run.observation
      }
    }
  }
  return [...runs.values()]
}

export function rampProposal(record: ReturnType<typeof rampRuns>[number]) {
  if (!record.decision || record.decision.outcome === 'hold')
    throw new Error('A proposal requires an explicit go or rollback decision')
  const target = record.plan.stages[record.stage]
  if (!target) throw new Error('No stage remains to propose')
  const desired =
    record.decision.outcome === 'rollback'
      ? { enabled: false }
      : {
          enabled: target.enabled,
          exposure: target.exposure,
          audience: target.audience,
        }
  return {
    schema: 'wholeloop/ramp-proposal@1',
    subject: record.subject,
    run: record.run,
    basis: record.decision.event,
    operation: record.plan.flag ? 'flags.propose-change' : 'manual-exposure-proposal',
    flag: record.plan.flag ?? null,
    environment: record.plan.environment,
    desired,
    applied: false,
    instruction:
      'A person applies the change externally; re-read/confirm afterward. No flag mutation is performed here.',
  }
}
