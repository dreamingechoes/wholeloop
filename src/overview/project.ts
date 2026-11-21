// Projects the operator overview from journal facts with bounded limits.
import { contractDigest } from '../contracts/compatibility.js'
import { findBudget } from '../delivery/budget-events.js'
import { budgetUsage, unmeteredDeliveryWork } from '../delivery/budget-policy.js'
import { deliveryEffects } from '../delivery/effect-events.js'
import { deliveryAttempts } from '../delivery/reducer.js'
import { decisionProducer, readFlows } from '../flow/plan.js'
import { STEPS } from '../flow/registry.js'
import { impactSchedule } from '../impact/schedule.js'
import { deliveryRunner } from '../runner/events.js'
import { blockingDependencies } from '../slices/routing.js'
import type { StateEvent } from '../state/events.js'
import { unread } from '../state/mailbox.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import {
  type Attention,
  type AttentionReason,
  type NextCommand,
  orderedAttention,
  overviewHeadline,
} from './attention.js'
import { OverviewError } from './cursor.js'
import type { OverviewRead } from './read.js'
import { recordedTime } from './time.js'

/** Consumer fixtures retain journal facts plus explicitly synthetic observations. */
export type OverviewInput = Pick<
  OverviewRead,
  | 'at'
  | 'store'
  | 'cursor'
  | 'stateEvents'
  | 'deliveryEvents'
  | 'items'
  | 'states'
  | 'configuration'
  | 'configurationDigest'
  | 'humans'
  | 'decidedHumans'
  | 'reports'
> & {
  runners: ReadonlyMap<
    string,
    { request: { run: string }; route: readonly unknown[]; problems: readonly string[] }
  >
  budgetReports: ReadonlyMap<
    string,
    Pick<
      OverviewRead['budgetReports'] extends Map<string, infer T> ? T : never,
      'problem' | 'limits' | 'deadline'
    >
  >
}

export const OVERVIEW_LIMITS = {
  attention: 128,
  items: 256,
  deliveries: 64,
  agents: 256,
  worktrees: 128,
  scheduled: 128,
  outcomes: 50,
} as const
/** No partial facts or invented zero totals escape an unreadable or concurrently changing store. */
export function overviewProblem(
  problem: OverviewError['problem'],
  asOf = new Date().toISOString(),
) {
  const body = {
    schema: 'wholeloop/overview@1' as const,
    nativeAcceptance: 'not-established-by-inspection' as const,
    health: {
      status: problem === 'store-busy' ? ('busy' as const) : ('unavailable' as const),
      problems: [problem],
    },
    headline: 'unavailable' as const,
    attention: [
      {
        id: contractDigest({ reason: 'store-problem', problem }),
        reason: 'store-problem' as const,
        target: { kind: 'store' as const, id: 'configured-store' },
        next: [inspect('overview')],
        omittedNext: 0,
      },
    ],
    items: [],
    deliveries: [],
    agents: [],
    worktrees: [],
    scheduled: [],
    outcomes: [],
    counts: null,
    omitted: null,
    unreadCount: null,
    cursor: null,
    configurationDigest: null,
  }
  return { ...body, asOf, digest: contractDigest(body) }
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const inspect = (...argv: string[]): NextCommand => ({ argv: ['wl', ...argv], inputs: [] })
const builtInDecisions = new Set([
  ...STEPS.flatMap((step) => [...step.before, ...step.after]),
  'approve-build-plan',
])
const genericDecisions = new Set(STEPS.flatMap((step) => [...step.after]))
const publicDecision = (id: string) =>
  builtInDecisions.has(id) ? id : `custom-${contractDigest(id)}`
const checkpoint = (id: string) =>
  /^(?:launch|d\+?\d{1,5})$/i.test(id) ? id : `custom-${contractDigest(id)}`

/** Bind known inputs to the shared permitted-action list; unresolved bindings offer inspection. */
function runCommands(view: OverviewInput, run: string, verbs?: readonly string[]) {
  const report = view.reports.get(run),
    state = view.states.get(run)
  if (!report || !state) return []
  const unavailableBasis = [...view.runners.values()].some(
    (status) =>
      status.request.run === run && status.problems.includes('unavailable-or-changed-basis'),
  )
  const commands: NextCommand[] = []
  for (const text of report.next) {
    if (
      (unavailableBasis || view.budgetReports.get(run)?.problem != null) &&
      ['run', 'resume', 'human-decide', 'continue'].includes(text.split(' ')[2] ?? '')
    )
      continue
    if (verbs && !verbs.includes(text.split(' ')[2] ?? '')) continue
    const argv: NextCommand['argv'] = text.split(' '),
      inputs: NextCommand['inputs'] = []
    const request = argv[argv.indexOf('--digest') + 1]
    const pending = [...view.humans.values()].find(
      (entry) =>
        entry.request === request && !view.decidedHumans.has(`${entry.request}:${entry.stage}`),
    )
    let bound = true
    for (let index = 0; index < argv.length; index++) {
      const value = argv[index]
      if (typeof value !== 'string' || !value.startsWith('<')) continue
      if (value === '<name>') {
        argv[index] = { input: 'operator' }
        inputs.push({ name: 'operator', kind: 'person' })
      } else if (value === '<accept|reject>') {
        argv[index] = { input: 'outcome' }
        inputs.push({ name: 'outcome', kind: 'choice', values: ['accept', 'reject'] })
      } else if (value === '<stage>' && pending) argv[index] = pending.stage
      else if (value === '<id>' && pending) argv[index] = pending.decision
      else if (value === '<sha256>' && pending) argv[index] = pending.subject
      else bound = false
    }
    if (bound) commands.push({ argv: [...argv, '--store', view.store], inputs })
  }
  return commands.length
    ? commands
    : [inspect('delivery', 'report', '--run', run, '--store', view.store)]
}

/** Build one typed hierarchy before truncation; arbitrary item content is never copied. */
function itemOrder(view: OverviewInput) {
  const children = new Map<string | undefined, string[]>()
  for (const item of view.items.values()) {
    const ids = children.get(item.parent) ?? []
    ids.push(item.id)
    children.set(item.parent, ids)
  }
  for (const ids of children.values()) ids.sort(compare)
  const result: string[] = [],
    pending = [...(children.get(undefined) ?? [])].reverse()
  while (pending.length) {
    const id = pending.pop()
    if (!id) break
    result.push(id)
    pending.push(...[...(children.get(id) ?? [])].reverse())
  }
  if (result.length !== view.items.size) throw new OverviewError('store-unreadable')
  return result
}

export function projectOverview(view: OverviewInput) {
  const flows = readFlows(view.stateEvents, view.configuration.additions),
    attention: Attention[] = [],
    attentionKeys = new Set<string>(),
    add = (
      reason: AttentionReason,
      kind: Attention['target']['kind'],
      id: string,
      next: NextCommand[],
      binding: unknown = null,
    ) => {
      const key = contractDigest({ reason, kind, id, binding })
      if (attentionKeys.has(key)) return
      attentionKeys.add(key)
      attention.push({
        id: key,
        reason,
        target: { kind, id },
        next: next.slice(0, 8),
        omittedNext: Math.max(0, next.length - 8),
      })
    },
    items = itemOrder(view).map((id) => {
      const item = view.items.get(id)
      if (!item) throw new Error('Overview item unavailable; contents omitted')
      const flow = flows.plan(id),
        pending = flow.pending.map((decision) => ({
          ...decision,
          id: publicDecision(decision.id),
        })),
        blockedBy = blockingDependencies(view.stateEvents, id)
      if (item.status === 'open') {
        for (const decision of flow.pending) {
          if (decisionProducer(flows.history(decision.subject), decision.subject, decision.id))
            continue
          const command: NextCommand = genericDecisions.has(decision.id)
            ? {
                argv: [
                  'wl',
                  'answer',
                  { input: 'outcome', prefix: `decision.${decision.id}=` },
                  '--for',
                  decision.subject,
                  '--by',
                  { input: 'operator' },
                  '--basis',
                  decision.basis,
                ],
                inputs: [
                  { name: 'outcome', kind: 'choice', values: ['approved', 'rejected'] },
                  { name: 'operator', kind: 'person' },
                ],
              }
            : inspect('status', id)
          add('item-decision', 'item', decision.subject, [command], {
            id: decision.id,
            basis: decision.basis,
            subject: decision.subject,
          })
        }
        if (blockedBy.length)
          add('blocked-dependency', 'item', id, [inspect('status', id)], blockedBy)
      }
      return {
        id,
        kind: item.kind,
        parent: item.parent ?? null,
        status: item.status,
        flow: {
          next: flow.next,
          available: flow.available,
          completed: flow.completed,
          pending: pending.slice(0, 32),
          omittedPending: Math.max(0, pending.length - 32),
        },
        blockedBy: blockedBy.slice(0, 32),
        omittedDependencies: Math.max(0, blockedBy.length - 32),
      }
    }),
    deliveries = [...view.states.values()]
      .sort((a, b) => compare(a.run, b.run))
      .map((original) => {
        const state = structuredClone(original),
          report = view.reports.get(state.run)
        if (!report) throw new Error('Overview run unavailable; contents omitted')
        const records = deliveryRunner(state).records,
          effects = deliveryEffects(state).records,
          next = runCommands(view, state.run),
          budget = findBudget(state),
          budgetReport = view.budgetReports.get(state.run),
          stages = report.stages,
          progress = budget?.progress.at(-1),
          usage = budget ? budgetUsage(budget, unmeteredDeliveryWork(state)) : null,
          statuses = records.flatMap((record) =>
            view.runners.get(record.request) ? [view.runners.get(record.request)] : [],
          )
        if (effects.some((effect) => effect.status === 'unknown'))
          add(
            'ambiguous-effect',
            'delivery',
            state.run,
            runCommands(view, state.run, ['reconcile', 'status', 'report']),
          )
        if (
          records.some(
            (record) =>
              record.ownership === 'unknown' ||
              record.stages.some((stage) => stage.status === 'unknown'),
          )
        )
          add(
            'unknown-worker',
            'delivery',
            state.run,
            runCommands(view, state.run, ['reconcile', 'status', 'report']),
          )
        const humanRequests = [...view.humans].filter(([, pending]) =>
          records.some((record) => record.request === pending.request),
        )
        const unavailableBasis = statuses.some((status) =>
          status?.problems.includes('unavailable-or-changed-basis'),
        )
        if (
          report.outcome === null &&
          budgetReport?.problem &&
          budgetReport.problem !== 'inactive-authority'
        )
          add('budget-boundary', 'delivery', state.run, [
            inspect('delivery', 'report', '--run', state.run, '--store', view.store),
          ])
        if (report.outcome === null && report.grant?.status === 'active' && unavailableBasis)
          add('unavailable-basis', 'delivery', state.run, [
            inspect('delivery', 'report', '--run', state.run, '--store', view.store),
          ])
        if (
          report.grant?.status === 'active' &&
          !unavailableBasis &&
          !budgetReport?.problem &&
          state.state === 'waiting-input' &&
          (!humanRequests.length || humanRequests.some(([key]) => !view.decidedHumans.has(key)))
        )
          add(
            'human-decision',
            'delivery',
            state.run,
            runCommands(view, state.run, ['human-decide', 'status', 'report']),
          )
        if (
          !['completed', 'failed', 'blocked', 'exhausted', 'stopped'].includes(state.state) &&
          report.grant?.status !== 'active'
        )
          add('inactive-grant', 'delivery', state.run, [
            inspect('delivery', 'report', '--run', state.run, '--store', view.store),
          ])
        const reason = {
          failed: 'failed-run',
          exhausted: 'exhausted-run',
          blocked: 'blocked-run',
          paused: 'paused-run',
        } as const
        if (state.state in reason)
          add(reason[state.state as keyof typeof reason], 'delivery', state.run, next)
        return {
          run: state.run,
          state: report.state,
          outcome: report.outcome,
          category: report.category,
          endpoint: report.endpoint,
          intervention: report.intervention,
          plan: report.plan,
          grant: report.grant ? { ...report.grant, provenance: 'operator-control' as const } : null,
          policyProvenance: 'pinned-policy' as const,
          controllers: records
            .map((record) => ({
              request: record.request,
              ownership: record.ownership,
              generation: record.generation,
            }))
            .slice(0, 32),
          omittedControllers: Math.max(0, records.length - 32),
          humanDecisions: humanRequests
            .map(([key, pending]) => ({
              request: pending.request,
              stage: pending.stage,
              decision: pending.decision,
              subject: pending.subject,
              status: view.decidedHumans.has(key) ? 'recorded' : 'required',
              record: view.decidedHumans.get(key)?.record ?? null,
              outcome: view.decidedHumans.get(key)?.outcome ?? null,
            }))
            .slice(0, 32),
          unresolved: report.unresolved,
          next: next.slice(0, 8),
          omittedNext: Math.max(0, next.length - 8),
          route: {
            total:
              statuses.length &&
              statuses.every(
                (status) => status && !status.problems.includes('unavailable-or-changed-basis'),
              )
                ? statuses.reduce((sum, status) => sum + (status?.route.length ?? 0), 0)
                : null,
            observed: stages.length,
            passed: stages.filter((stage) => stage.status === 'passed').length,
            blocked: stages.filter((stage) =>
              ['failed', 'blocked', 'unknown', 'stopped'].includes(stage.status),
            ).length,
          },
          budget: budget
            ? {
                startedAt: budget.startedAt ?? null,
                deadline: budgetReport?.deadline ?? null,
                limits: budgetReport?.limits ?? budget.limits ?? null,
                committedElapsedMs: budget.elapsedMs,
                problem: budgetReport?.problem ?? null,
                noProgressStreak: budget.streak,
                metering: budget.requirements,
                reservations: budget.reservations.length,
                integrationRepairs: budget.counters.filter(
                  (counter) => counter.kind === 'integration-repair',
                ).length,
                usage: usage
                  ? {
                      ...usage,
                      currencies: usage.currencies.slice(0, 8),
                      omittedCurrencies: Math.max(0, usage.currencies.length - 8),
                    }
                  : null,
                lastProgress: progress
                  ? {
                      kind: progress.kind,
                      digest: progress.digest,
                      provenance: progress.provenance,
                    }
                  : null,
              }
            : null,
          updatedAt: report.updatedAt,
        }
      }),
    sessions = new Map<
      string,
      {
        id: string
        kind: 'session'
        status: 'last-seen'
        source: string
        client: Extract<StateEvent['actor'], { kind: 'agent' }>['client'] | null
        lastSeen: { event: string; at: string | null }
      }
    >()
  for (const entry of view.stateEvents)
    if (entry.actor.kind === 'agent') {
      const id = `session-${contractDigest(entry.actor)}`
      sessions.set(id, {
        id,
        kind: 'session',
        status: 'last-seen',
        source: entry.actor.client?.source ?? 'unknown',
        client: entry.actor.client ?? null,
        lastSeen: { event: entry.id, at: recordedTime(entry.ts) },
      })
    }
  const agents = [
      ...sessions.values(),
      ...[...view.states.values()].flatMap((original) => {
        const state = structuredClone(original),
          stages = deliveryRunner(state).records.flatMap((record) => record.stages)
        return deliveryAttempts(state).records.map((attempt) => ({
          id: attempt.id,
          kind: 'delivery-worker' as const,
          run: state.run,
          role: attempt.role,
          status: attempt.state,
          source: attempt.runtime ? 'observed-process' : 'claimed',
          runtimeDigest: attempt.runtime ? contractDigest(attempt.runtime) : null,
          semanticProvenance:
            stages.find(
              (stage) =>
                stage.runtime &&
                attempt.runtime &&
                contractDigest(stage.runtime) === contractDigest(attempt.runtime),
            )?.provenance ?? 'unknown',
          lastSeen: { at: recordedTime(attempt.observedAt) },
        }))
      }),
    ].sort((a, b) => compare(a.id, b.id)),
    worktrees = worktreeRecords(view.stateEvents).map((record) => ({
      subject: record.subject,
      status: record.status,
      mode: record.mode,
      ports: record.ports,
    })),
    scheduled = [...view.items.keys()]
      .sort(compare)
      .flatMap(
        (subject) =>
          impactSchedule(
            view.stateEvents,
            subject,
            view.configuration.checkpoints,
            view.at,
          )?.checkpoints.map((entry) => ({ ...entry, key: checkpoint(entry.key), subject })) ?? [],
      ),
    mail = unread(view.stateEvents, 'conductor'),
    outcomes = [
      ...view.deliveryEvents.flatMap((event) =>
        event.payload.schema === 'wholeloop/delivery-control-event@1' && event.payload.outcome
          ? [
              {
                source: 'delivery',
                id: event.run,
                event: event.id,
                at: recordedTime(event.ts),
                outcome: event.payload.outcome,
                actor: event.actor.kind,
              },
            ]
          : [],
      ),
      ...view.stateEvents.flatMap((event) =>
        event.type === 'frame.decided' || event.type === 'learn.decided'
          ? [
              {
                source: 'state',
                id: event.subject,
                event: event.id,
                at: recordedTime(event.ts),
                outcome: event.data.outcome,
                actor: event.actor.kind,
              },
            ]
          : event.type === 'item.closed'
            ? [
                {
                  source: 'state',
                  id: event.subject,
                  event: event.id,
                  at: recordedTime(event.ts),
                  outcome: 'closed',
                  actor: event.actor.kind,
                },
              ]
            : [],
      ),
    ].sort(
      (a, b) =>
        compare(b.at ?? '', a.at ?? '') || compare(a.source, b.source) || compare(a.event, b.event),
    )
  for (const entry of scheduled)
    if (entry.status === 'due')
      add(
        'due-checkpoint',
        'item',
        entry.subject,
        [inspect('measure', 'schedule', '--for', entry.subject)],
        entry.key,
      )
  if (mail.length)
    add('unread-mail', 'mail', 'conductor', [
      inspect('msg', 'read', '--for', 'conductor', '--reader', 'conductor', '--peek'),
    ])
  const ordered = orderedAttention(attention),
    all = { attention: ordered, items, deliveries, agents, worktrees, scheduled, outcomes },
    counts = Object.fromEntries(Object.entries(all).map(([key, values]) => [key, values.length])),
    omitted = Object.fromEntries(
      Object.entries(all).map(([key, values]) => [
        key,
        Math.max(0, values.length - OVERVIEW_LIMITS[key as keyof typeof OVERVIEW_LIMITS]),
      ]),
    ),
    headline = overviewHeadline({
      healthy: true,
      attention: ordered,
      active: deliveries.filter((run) => run.state === 'running').length,
      waiting: deliveries.filter((run) => ['waiting-external', 'waiting-input'].includes(run.state))
        .length,
      ready:
        deliveries.filter((run) => ['planned', 'queued'].includes(run.state)).length +
        items.filter((item) => item.status === 'open' && item.flow.next).length,
      entities: deliveries.length + items.length,
      terminal:
        deliveries.filter((run) =>
          ['completed', 'failed', 'blocked', 'exhausted', 'stopped'].includes(run.state),
        ).length + items.filter((item) => item.status === 'closed').length,
    }),
    body = {
      schema: 'wholeloop/overview@1' as const,
      nativeAcceptance: 'not-established-by-inspection' as const,
      health: { status: 'healthy' as const, problems: [] as string[] },
      headline,
      attention: ordered.slice(0, OVERVIEW_LIMITS.attention),
      items: items.slice(0, OVERVIEW_LIMITS.items),
      deliveries: deliveries.slice(0, OVERVIEW_LIMITS.deliveries),
      agents: agents.slice(0, OVERVIEW_LIMITS.agents),
      worktrees: worktrees.slice(0, OVERVIEW_LIMITS.worktrees),
      scheduled: scheduled.slice(0, OVERVIEW_LIMITS.scheduled),
      outcomes: outcomes.slice(0, OVERVIEW_LIMITS.outcomes),
      counts,
      omitted,
      unreadCount: mail.length,
      cursor: view.cursor,
      configurationDigest: view.configurationDigest,
    }
  const result = { ...body, asOf: view.at, digest: contractDigest(body) }
  if (Buffer.byteLength(JSON.stringify(result)) > 16 * 1024 * 1024)
    throw new OverviewError('overview-limit')
  return result
}
