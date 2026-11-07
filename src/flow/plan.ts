// Computes the flow plan and decision trail that status, execution and the overview all read.
import { resolveConfig } from '../config/resolve.js'
import { isObject } from '../config/schema.js'
import type { Profile } from '../profile/presets.js'
import { renderProfile } from '../profile/render.js'
import type { Item, StateEvent } from '../state/events.js'
import { syncReady, syncState } from '../sync/contracts.js'
import { STEPS, type Step, type StepName } from './registry.js'

export function decisions(
  events: readonly StateEvent[],
  subject: string,
  before: readonly string[] = [],
): { id: string; basis: string }[] {
  const relevant = events.filter((entry) => entry.subject === subject)
  const required = new Map<string, string>()
  for (const entry of relevant)
    if (
      entry.type === 'step.started' ||
      entry.type === 'step.completed' ||
      entry.type === 'step.skipped'
    ) {
      for (const id of STEPS.find((step) => step.name === entry.data.step)?.after ?? [])
        required.set(id, entry.id)
    }
  for (const entry of relevant)
    if (entry.type === 'build.planned') {
      if (entry.data.plan.assumptions.some((assumption) => assumption.status !== 'verified'))
        required.set('approve-build-plan', entry.id)
      else required.delete('approve-build-plan')
    }
  const basis = [...relevant]
    .reverse()
    .find(
      (entry) =>
        entry.type === 'step.completed' ||
        entry.type === 'step.skipped' ||
        entry.type === 'item.created',
    )?.id
  if (basis) for (const id of before) required.set(id, basis)
  const publication = relevant.findLast((entry) => entry.type === 'pr.planned')
  if (publication && before.includes('test-it')) required.set('test-it', publication.id)
  return [...required]
    .filter(([id, basis]) => {
      const last = [...relevant]
        .reverse()
        .find(
          (entry) =>
            entry.type === 'decision.recorded' &&
            entry.data.decision === id &&
            entry.data.basis === basis,
        )
      return last?.type !== 'decision.recorded' || last.data.outcome !== 'approved'
    })
    .map(([id, basis]) => ({ id, basis }))
}

export function decisionTrail(
  events: readonly StateEvent[],
  subject: string,
): { id: string; basis: string; subject: string }[] {
  const parents = new Map(
    events.flatMap((entry) =>
      entry.type === 'item.created' && entry.data.parent
        ? [[entry.subject, entry.data.parent] as const]
        : [],
    ),
  )
  const result = []
  const seen = new Set<string>()
  let current: string | undefined = subject
  while (current) {
    if (seen.has(current)) throw new Error('Item parent cycle')
    seen.add(current)
    const id = current
    result.push(...decisions(events, id).map((decision) => ({ ...decision, subject: id })))
    current = parents.get(current)
  }
  return result
}

export function flowPlan(
  events: readonly StateEvent[],
  subject: string,
  additions: readonly string[] = [],
) {
  const completed = new Set<StepName>()
  let active: StepName | undefined
  let closed = false
  // Standalone completion establishes progress without inventing earlier skip events.
  let furthest = -1
  for (const entry of events)
    if (entry.subject === subject) {
      if (entry.type === 'item.created') {
        const start =
          entry.data.kind === 'scope'
            ? 'slice-work'
            : ['slice', 'part'].includes(entry.data.kind)
              ? 'build-slice'
              : entry.data.kind === 'review'
                ? 'review-code'
                : 'research'
        furthest = Math.max(furthest, STEPS.findIndex((step) => step.name === start) - 1)
      }
      if (entry.type === 'item.closed') closed = true
      if (entry.type === 'item.updated' && entry.data.status)
        closed = entry.data.status === 'closed'
      if (entry.type === 'pr.planned')
        furthest = Math.max(furthest, STEPS.findIndex((step) => step.name === 'open-pr') - 1)
      if (entry.type === 'step.started') active = entry.data.step
      if (entry.type === 'step.completed' && entry.data.step === 'build-slice')
        furthest = Math.max(
          furthest,
          STEPS.findIndex((step) => step.name === 'review-code'),
        )
      if (entry.type === 'step.completed')
        furthest = Math.max(
          furthest,
          STEPS.findIndex((step) => step.name === entry.data.step),
        )
      if (entry.type === 'step.completed' || entry.type === 'step.skipped') {
        completed.add(entry.data.step)
        if (active === entry.data.step) active = undefined
      }
    }
  if (syncReady(syncState(events), subject))
    furthest = Math.max(
      furthest,
      STEPS.findIndex((step) => step.name === 'open-pr'),
    )
  const next = closed
    ? undefined
    : (active ??
      STEPS.slice(furthest + 1).find((step) => !step.optional && !completed.has(step.name))?.name)
  const definition = STEPS.find((step) => step.name === next)
  const pending = decisions(events, subject, [
    ...(definition?.before ?? []),
    ...(next === 'open-pr' ? additions : []),
  ])
  return {
    next: next ?? null,
    available: definition?.available ?? false,
    pending,
    completed: [...completed],
  }
}

/** The same current and inherited decisions serve status, execution and read-only overview. */
export function itemFlow(
  events: readonly StateEvent[],
  subject: string,
  additions: readonly string[] = [],
) {
  const plan = flowPlan(events, subject, additions)
  return {
    schema: 'wholeloop/step-plan@1',
    subject,
    ...plan,
    pending: [
      ...decisionTrail(events, subject).filter((decision) => decision.subject !== subject),
      ...plan.pending.map((decision) => ({ ...decision, subject })),
    ],
  }
}

export function remembered(
  events: readonly StateEvent[],
  subject: string | undefined,
  run: string | undefined,
  configuration: Record<string, unknown>,
): Record<string, string> {
  const values: Record<string, string> = Object.create(null)
  if (isObject(configuration.answers))
    for (const [key, value] of Object.entries(configuration.answers))
      if (typeof value === 'string') values[key] = value
  if (isObject(configuration.providers)) {
    if (typeof configuration.providers.docs === 'string')
      values['docs.destination'] = configuration.providers.docs
    if (typeof configuration.providers.tracker === 'string')
      values['tracker.destination'] = configuration.providers.tracker
  }
  if (!subject) return values
  for (const scope of ['initiative', 'run'])
    for (const entry of events)
      if (
        entry.subject === subject &&
        entry.type === 'answer.remembered' &&
        entry.data.scope === scope &&
        (scope !== 'run' || entry.data.run === run)
      )
        values[entry.data.qid] = entry.data.value
  return values
}

export function beginPlan(
  step: Step,
  options: {
    input?: string
    owner?: string
    subject?: Item
    mode?: 'standalone' | 'flow'
    run?: string
    events?: readonly StateEvent[]
    configuration?: Record<string, unknown>
    presets?: Readonly<Record<string, Readonly<Record<string, string>>>>
  },
) {
  const events = options.events ?? []
  const answers = remembered(events, options.subject?.id, options.run, options.configuration ?? {})
  const input = options.input ?? answers.input ?? options.subject?.title
  const owner = options.owner ?? answers.owner ?? options.subject?.owner
  const missing = [...(!input?.trim() ? ['input'] : []), ...(!owner?.trim() ? ['owner'] : [])]
  const artifacts: Record<string, string> = {}
  for (const entry of events)
    if (entry.subject === options.subject?.id && entry.type === 'step.completed')
      artifacts[entry.data.step] = entry.data.artifact.path
  const skipped = events.flatMap((entry) =>
    entry.subject === options.subject?.id && entry.type === 'step.skipped'
      ? [{ step: entry.data.step, reason: entry.data.reason }]
      : [],
  )
  return {
    schema: 'wholeloop/step-begin@1',
    step: step.name,
    available: step.available,
    mode: options.mode ?? 'standalone',
    subject: options.subject ? { id: options.subject.id, kind: options.subject.kind } : null,
    run: options.run ?? null,
    input: input ?? null,
    owner: owner ?? null,
    have: artifacts,
    missing,
    questions: missing.map((id) => ({
      id,
      prompt: id === 'owner' ? 'Who owns this work?' : 'What should this step work on?',
      multi: false,
      options: [] as { value: string; label: string }[],
      remember: id === 'owner' ? ['run', 'initiative', 'project', 'user'] : ['run', 'initiative'],
    })),
    bindings: {},
    profile: renderProfile(
      resolveConfig([{ scope: 'run', values: options.configuration ?? {} }], options.presets).values
        .profile as Profile,
    ),
    template: step.sections.length ? [...step.sections] : null,
    decision: { before: step.before, after: step.after },
    preflight: [
      `Plan — ${step.name} (${options.mode ?? 'standalone'}).`,
      'Where — external wholeloop store.',
      'Never — merge, send messages externally or change flags.',
      ...skipped.map((skip) => `Skipped — ${skip.step}: ${skip.reason}`),
      'Stop — on request or at a required decision point.',
    ],
  }
}
