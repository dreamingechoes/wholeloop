// Learning plans, challenges, iteration ideas, decisions and their events for decide-next.
import { validate } from '../config/schema.js'
import { checkShape } from '../flow/registry.js'
import { checkFrame, FRAME_SECTIONS } from '../framing/contract.js'
import { measurementDigest } from '../launch/measurement.js'
import type { StateEvent } from '../state/events.js'
import { type LearningEvidence, learningEvidence } from './evidence.js'
import schema from './schemas/events-v1.json' with { type: 'json' }

export type LearningOutcome = 'keep' | 'iterate' | 'kill' | 'unflag'
export interface LearningPlan {
  run: string
  leaning: LearningOutcome
  evidence: LearningEvidence
  checkpoints: string[]
  profile: { challenge: 'supportive' | 'balanced' | 'adversarial'; instructions: string }
  guidance: { ref: string; origin: string; digest: string }
}
export interface LearningChallenge {
  schema: 'wholeloop/learning-challenge@1'
  basis: string
  against: LearningOutcome
  alternative: LearningOutcome
  argument: string
  limits: string
  by: string
}
export interface IterationIdea {
  title: string
  problem: string
  audience: string
  impact: string
  existing?: string
}
export interface LearningDecision {
  run: string
  basis: string
  outcome: LearningOutcome
  by: string
  reason: string
  acknowledgedUnknowns: string[]
  iteration?: IterationIdea & { id: string }
}
export type LearningEventData =
  | { type: 'learn.planned'; data: LearningPlan }
  | { type: 'learn.challenged'; data: { run: string; challenge: LearningChallenge } }
  | { type: 'learn.decided'; data: LearningDecision }
  | { type: 'learn.iteration-linked'; data: { run: string; idea: string; decision: string } }
export function validLearningData(type: string, data: Record<string, unknown>) {
  try {
    const rule = schema.properties[type as keyof typeof schema.properties]
    if (!rule || validate(data, rule).length) return false
    const meaningful = (value: unknown): boolean =>
      typeof value === 'string'
        ? !!value.trim()
        : Array.isArray(value)
          ? value.every(meaningful)
          : value && typeof value === 'object'
            ? Object.values(value).every(meaningful)
            : true
    return meaningful(data)
  } catch {
    return false
  }
}
export function learningRuns(events: readonly StateEvent[]) {
  const runs = new Map<
    string,
    {
      subject: string
      event: string
      plan: LearningPlan
      challenge?: { event: string; value: LearningChallenge }
      decision?: { event: string; at: string; value: LearningDecision }
      iteration?: string
      complete?: boolean
    }
  >()
  const active = new Map<string, string>()
  const items = new Map<
    string,
    { kind: string; parent?: string; repository?: string; status: string; body: string }
  >()
  const finalized = new Set<string>()
  for (const event of events) {
    if (
      event.type === 'item.created' &&
      event.data.kind === 'scope' &&
      event.data.parent &&
      items.get(event.data.parent)?.status === 'closed'
    )
      throw new Error('Reopen the initiative before creating another scope')
    if (event.type === 'item.created') items.set(event.subject, { ...event.data, status: 'open' })
    const item = items.get(event.subject)
    if (event.type === 'item.updated' && event.data.status === 'open')
      finalized.delete(event.subject)
    if (
      (event.type === 'item.closed' ||
        (event.type === 'item.updated' && event.data.status === 'closed')) &&
      item?.kind === 'initiative'
    ) {
      const children = [...items].filter(
        ([, child]) => child.kind === 'scope' && child.parent === event.subject,
      )
      if (children.some(([id]) => !finalized.has(id)))
        throw new Error(
          'An initiative closes only after every scope has a completed learning decision',
        )
    }
    if (event.type === 'step.started' && event.data.step === 'decide-next')
      active.set(event.subject, event.data.run)
    if (event.type === 'learn.planned') {
      const prior = events.slice(0, events.indexOf(event))
      const evidence = learningEvidence(
        prior,
        event.subject,
        event.data.checkpoints,
        event.data.evidence.reported,
      )
      if (
        item?.kind !== 'scope' ||
        item.status !== 'open' ||
        active.get(event.subject) !== event.data.run ||
        measurementDigest(evidence) !== measurementDigest(event.data.evidence) ||
        runs.get(event.data.run)?.decision
      )
        throw new Error(
          'Learning plans need current exact evidence for an open scope and active run',
        )
      runs.set(event.data.run, { subject: event.subject, event: event.id, plan: event.data })
    }
    if (
      event.type === 'learn.challenged' ||
      event.type === 'learn.decided' ||
      event.type === 'learn.iteration-linked'
    ) {
      const run = runs.get(event.data.run)
      if (
        !run ||
        run.subject !== event.subject ||
        item?.status !== 'open' ||
        active.get(event.subject) !== event.data.run
      )
        throw new Error('Learning events need their active planned run')
      if (event.type === 'learn.challenged') {
        if (
          run.decision ||
          event.data.challenge.basis !== run.event ||
          event.data.challenge.against !== run.plan.leaning ||
          event.data.challenge.alternative === run.plan.leaning
        )
          throw new Error(
            'Challenge must argue against the current leaning and exact evidence plan',
          )
        run.challenge = { event: event.id, value: event.data.challenge }
      }
      if (event.type === 'learn.decided') {
        const evidence = learningEvidence(
          events.slice(0, events.indexOf(event)),
          event.subject,
          run.plan.checkpoints,
          run.plan.evidence.reported,
        )
        if (
          run.decision ||
          event.data.basis !== run.challenge?.event ||
          measurementDigest(evidence) !== measurementDigest(run.plan.evidence) ||
          JSON.stringify([...event.data.acknowledgedUnknowns].sort()) !==
            JSON.stringify(run.plan.evidence.unknowns) ||
          (event.data.outcome === 'unflag' && !run.plan.evidence.flag) ||
          (event.data.iteration?.existing !== undefined &&
            event.data.iteration.existing !== event.data.iteration.id) ||
          (event.data.outcome === 'iterate') !== !!event.data.iteration
        )
          throw new Error(
            'A decision needs current challenged evidence, a person/reason and acknowledgment of every unknown or pending checkpoint',
          )
        run.decision = { event: event.id, at: event.ts, value: event.data }
      }
      if (event.type === 'learn.iteration-linked') {
        const idea = items.get(event.data.idea)
        if (
          run.iteration ||
          run.decision?.event !== event.data.decision ||
          run.decision.value.iteration?.id !== event.data.idea ||
          idea?.kind !== 'initiative' ||
          idea.status !== 'open' ||
          !idea.body.includes(run.plan.evidence.ref) ||
          checkShape(idea.body, FRAME_SECTIONS).length > 0 ||
          checkFrame(idea.body).length > 0 ||
          !events
            .slice(0, events.indexOf(event))
            .some(
              (entry) =>
                entry.subject === event.data.idea &&
                entry.type === 'step.started' &&
                entry.data.step === 'frame-problem',
            )
        )
          throw new Error('Iteration must link the exact decision to its open framed idea')
        run.iteration = event.data.idea
      }
    }
    if (event.type === 'step.completed' && event.data.step === 'decide-next') {
      const run = runs.get(event.data.run)
      if (
        !run ||
        run.subject !== event.subject ||
        event.data.artifact.content !== learningReceiptFor(run)
      )
        throw new Error('Learning completion requires its canonical human decision receipt')
      run.complete = true
      finalized.add(event.subject)
      active.delete(event.subject)
    }
    if (event.type === 'step.skipped' && event.data.step === 'decide-next')
      active.delete(event.subject)
    if (event.type === 'item.updated' && item) Object.assign(item, event.data)
    if (event.type === 'item.closed' && item) item.status = 'closed'
  }
  return [...runs.values()]
}
export function learningFollowups(run: ReturnType<typeof learningRuns>[number]) {
  const call = run.decision?.value
  if (!call) return []
  const base = { applied: false, evidence: run.plan.evidence.ref, owner: call.by }
  const flag = run.plan.evidence.flag
  const followups =
    call.outcome === 'iterate'
      ? [
          {
            ...base,
            kind: 'iteration',
            title: call.iteration?.title ?? '',
            idea: run.iteration ?? call.iteration?.id ?? null,
          },
        ]
      : []
  if (call.outcome === 'kill')
    followups.push({
      ...base,
      kind: 'disable-and-remove',
      title: flag
        ? `A person disables ${flag}; propose removal of rejected code`
        : 'Propose removal of rejected behavior',
      idea: null,
    })
  else if (flag && call.outcome !== 'iterate')
    followups.push({
      ...base,
      kind: 'flag-removal',
      title: `Propose removal of ${flag} while preserving accepted behavior`,
      idea: null,
    })
  return followups
}
export function learningReceiptFor(run: ReturnType<typeof learningRuns>[number]) {
  const decision = run.decision
  if (!decision || (decision.value.outcome === 'iterate' && !run.iteration))
    throw new Error('Complete a human learning decision and its required iteration link first')
  return `# Learning decision\n\n## Evidence\n\n${run.plan.evidence.kind}: ${run.plan.evidence.ref}; basis ${run.plan.evidence.basis}; digest ${run.plan.evidence.digest}. Promise: ${run.plan.evidence.promise}.\n\n## Counterargument\n\nAgainst ${run.plan.leaning}: ${run.challenge?.value.argument}; alternative ${run.challenge?.value.alternative}; limits ${run.challenge?.value.limits}; challenger ${run.challenge?.value.by}; profile ${run.plan.profile.challenge}.\n\n## Decision\n\n${decision.value.outcome}; by ${decision.value.by}; at ${decision.at}; reason ${decision.value.reason}; challenge basis ${decision.value.basis}.\n\n## Unknowns\n\nAcknowledged: ${decision.value.acknowledgedUnknowns.join(', ') || 'none'}. Self-reported evidence is not a measured checkpoint.\n\n## Follow-up\n\n${
    learningFollowups(run)
      .map((proposal) => JSON.stringify(proposal))
      .join('\n') || 'No flag cleanup was inferred; no external change was performed.'
  }\n\n## Handoff\n\nClose this scope. Close its initiative only when every scope is decided. Follow-up work remains proposed; no flag or production code was changed. Iteration framing carries evidence without declaring prior validation complete.\n`
}
export function learningReceipt(events: readonly StateEvent[], subject: string) {
  const run = learningRuns(events)
    .filter((run) => run.subject === subject)
    .at(-1)
  if (!run) throw new Error('Begin decide-next before completing its decision')
  return learningReceiptFor(run)
}
