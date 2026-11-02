import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { type ImpactObservation, impactRuns } from '../impact/contracts.js'
import { impactSchedule } from '../impact/schedule.js'
import type { StateEvent } from '../state/events.js'
import type { StoreFiles } from '../state/files.js'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** One due checkpoint observation, identified by everything that makes it the same work. */
export interface DueObservation {
  key: string
  subject: string
  checkpoint: string
  due: string
  launchedAt: string
  source: string
  policy: string
}

/**
 * Pure. The identity binds subject, launch anchor, measurement source, checkpoint
 * and observation policy, so a changed launch or plan creates a new observation
 * while repeated ticks find the same one.
 */
export function dueObservations(
  events: readonly StateEvent[],
  subjects: readonly string[],
  checkpoints: string[],
  at: string,
  policy: unknown,
): DueObservation[] {
  const due: DueObservation[] = []
  for (const subject of [...new Set(subjects)].sort()) {
    const schedule = impactSchedule(events, subject, checkpoints, at),
      record = impactRuns(events)
        .filter((run) => run.subject === subject)
        .at(-1)
    if (!schedule || !record) continue
    for (const checkpoint of schedule.checkpoints) {
      if (checkpoint.status !== 'due' || !checkpoint.due) continue
      const identity = {
        subject,
        checkpoint: checkpoint.key,
        launchedAt: record.plan.launchedAt,
        source: digest(record.plan.source),
        policy: digest(policy),
      }
      due.push({ key: digest(identity), due: checkpoint.due, ...identity })
    }
  }
  return due
}

export type ObservationOutcome = 'observed' | 'completed-with-unknowns' | 'blocked' | 'needs-access'
/** Settle an observation by policy: unknown stays unknown, and none never asks a person. */
export function observationOutcome(
  metrics: readonly ImpactObservation[],
  intervention: 'supervised' | 'on-exception' | 'none',
  contract: 'complete-with-unknowns' | 'blocked',
): ObservationOutcome {
  if (metrics.length && metrics.every((metric) => metric.status === 'observed')) return 'observed'
  if (intervention !== 'none') return 'needs-access'
  return contract === 'complete-with-unknowns' && metrics.some((m) => m.status === 'observed')
    ? 'completed-with-unknowns'
    : 'blocked'
}

/** Durable, at-most-once scheduling in the external store; it performs no read itself. */
export class ObservationSchedule {
  constructor(readonly files: StoreFiles) {}
  private path(key: string) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid observation key')
    return `learning/scheduled/${key}.json`
  }
  tick(due: readonly DueObservation[]) {
    const scheduled: string[] = [],
      deduped: string[] = []
    for (const entry of due)
      this.files.locked(() => {
        if (existsSync(this.files.path(this.path(entry.key)))) {
          deduped.push(entry.key)
          return
        }
        this.files.atomic(
          this.path(entry.key),
          `${JSON.stringify({ schema: 'wholeloop/learning-observation@1', state: 'scheduled', ...entry })}\n`,
        )
        scheduled.push(entry.key)
      })
    return { scheduled, deduped }
  }
  /** One settlement per observation; a repeated or changed result is refused. */
  settle(
    key: string,
    metrics: readonly ImpactObservation[],
    intervention: 'supervised' | 'on-exception' | 'none',
    contract: 'complete-with-unknowns' | 'blocked',
  ) {
    const path = this.path(key).replace(/\.json$/, '.result.json')
    if (!existsSync(this.files.path(this.path(key))))
      throw new Error('Observation is not scheduled')
    const outcome = observationOutcome(metrics, intervention, contract),
      record = {
        schema: 'wholeloop/learning-observation-result@1',
        key,
        outcome,
        unknown: metrics.filter((metric) => metric.status === 'unknown').map((metric) => metric.id),
        metrics: digest(metrics),
        effects: 'not-performed',
      }
    this.files.locked(() => {
      if (existsSync(this.files.path(path))) throw new Error('Observation is already settled')
      this.files.atomic(path, `${JSON.stringify(record)}\n`)
    })
    return record
  }
}

/**
 * A delegated learning recommendation names its policy, evidence and every
 * unknown. It never changes flags, deploys, sends messages, removes code or
 * closes unmeasured work; implementation becomes a separately authorized proposal.
 */
export function learningRecommendation(input: {
  subject: string
  outcome: 'keep' | 'iterate' | 'kill' | 'unflag'
  policy: string
  metrics: readonly ImpactObservation[]
  rationale: string
  counterarguments: readonly string[]
  uncertainties: readonly string[]
}) {
  const unknown = input.metrics.filter((metric) => metric.status === 'unknown')
  if (!input.rationale.trim() || !input.counterarguments.some((text) => text.trim()))
    throw new Error('A learning recommendation needs a rationale and counterarguments')
  if (unknown.some((metric) => !input.uncertainties.some((text) => text.includes(metric.id))))
    throw new Error('Every unknown metric must be named as an uncertainty')
  return {
    schema: 'wholeloop/learning-recommendation@1' as const,
    subject: input.subject,
    actor: 'machine' as const,
    outcome: input.outcome,
    policy: input.policy,
    evidence: digest(input.metrics),
    rationale: input.rationale,
    counterarguments: [...input.counterarguments],
    uncertainties: [...input.uncertainties],
    measured: unknown.length ? ('partial' as const) : ('complete' as const),
    effects: {
      flags: 'not-changed' as const,
      deploy: 'not-performed' as const,
      messages: 'not-sent' as const,
      code: 'not-removed' as const,
      work: 'not-closed' as const,
    },
    ...(input.outcome === 'iterate' || input.outcome === 'kill' || input.outcome === 'unflag'
      ? { proposal: { kind: 'implementation', authorization: 'separate-run-required' as const } }
      : {}),
  }
}
