// Projects one read-only observation for status and overview without inventing execution evidence.
import { decisionProducer, readFlows } from '../flow/plan.js'
import type { StepName } from '../flow/registry.js'
import { gateReport } from '../gates/report.js'
import { gateRuns } from '../gates/state.js'
import { impactSchedules } from '../impact/schedule.js'
import type { Item, StateEvent } from '../state/events.js'
import { worktreeRecords } from '../worktrees/contracts.js'

export function statusItems(
  items: readonly Item[],
  events: readonly StateEvent[],
  options: { additions: readonly string[]; checkpoints: string[]; at: string },
) {
  const flows = readFlows(events, options.additions),
    schedules = impactSchedules(events, options.checkpoints, options.at),
    worktrees = new Map<string, ReturnType<typeof worktreeRecords>>(),
    runs = new Map(gateRuns(events).map((run) => [run.run, run])),
    latest = new Map<string, string>(),
    children = new Map<string, Item[]>(),
    active = new Map<string, StepName>()
  for (const entry of events) {
    if (entry.type === 'gate.planned') latest.set(entry.subject, entry.data.plan.run)
    if (entry.type === 'step.started') active.set(entry.subject, entry.data.step)
    if (
      (entry.type === 'step.completed' || entry.type === 'step.skipped') &&
      active.get(entry.subject) === entry.data.step
    )
      active.delete(entry.subject)
  }
  for (const workspace of worktreeRecords(events)) {
    const records = worktrees.get(workspace.subject) ?? []
    records.push(workspace)
    worktrees.set(workspace.subject, records)
  }
  for (const item of items)
    if (item.parent) {
      const siblings = children.get(item.parent) ?? []
      siblings.push(item)
      children.set(item.parent, siblings)
    }
  const focuses = new Map<string, { subject: string; step: StepName; updatedAt: string } | null>()
  function focus(
    item: Item,
    seen = new Set<string>(),
  ): { subject: string; step: StepName; updatedAt: string } | null {
    if (seen.has(item.id)) throw new Error('Item parent cycle')
    if (focuses.has(item.id)) return focuses.get(item.id) ?? null
    seen.add(item.id)
    const own = active.get(item.id)
    const candidates = (children.get(item.id) ?? [])
      .filter((child) => child.status !== 'closed')
      .map((child) => focus(child, seen))
      .filter((value) => value !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.subject.localeCompare(b.subject))
    const value =
      item.status === 'closed'
        ? null
        : own
          ? { subject: item.id, step: own, updatedAt: item.updatedAt }
          : (candidates[0] ?? null)
    seen.delete(item.id)
    focuses.set(item.id, value)
    return value
  }
  return items.map((item) => {
    const plan = flows.plan(item.id),
      pending = plan.pending.map((decision) => ({
        ...decision,
        state: decisionProducer(flows.history(decision.subject), decision.subject, decision.id)
          ? ('upcoming' as const)
          : ('actionable' as const),
      })),
      descendants = children.get(item.id) ?? [],
      impact = schedules.get(item.id),
      dueCheckpoints =
        impact?.checkpoints
          .filter((checkpoint) => checkpoint.status === 'due')
          .map(({ key }) => key) ?? [],
      workspaces = worktrees.get(item.id) ?? [],
      run = runs.get(latest.get(item.id) ?? ''),
      round = run?.rounds.at(-1),
      report =
        round && run
          ? (round.decision?.report ??
            gateReport(
              round.plan,
              round.results,
              round.votes,
              round.plan.snapshot.digest,
              run.budget,
            ))
          : undefined,
      current = focus(item)
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      owner: item.owner,
      status: item.status,
      updatedAt: item.updatedAt,
      parent: item.parent ?? null,
      children: {
        total: descendants.length,
        open: descendants.filter((child) => child.status !== 'closed').length,
        closed: descendants.filter((child) => child.status === 'closed').length,
      },
      flow: { ...plan, pending },
      activeStep: active.get(item.id) ?? null,
      focus: current ? { subject: current.subject, step: current.step } : null,
      attention:
        item.status === 'closed'
          ? ('closed' as const)
          : pending.some(({ state }) => state === 'actionable')
            ? ('waiting' as const)
            : dueCheckpoints.length
              ? ('due' as const)
              : ('progress' as const),
      gate:
        round && run && report
          ? {
              gate: run.gate,
              round: round.plan.round,
              budget: run.budget,
              verdict: round.decision ? report.verdict : ('RUNNING' as const),
              openFindings: report.kept.length,
              recorded: true as const,
            }
          : null,
      dueCheckpoints,
      workspaces,
      ...(impact ? { impact } : {}),
      ...(workspaces[0] ? { workspace: workspaces[0] } : {}),
    }
  })
}
export type StatusItem = ReturnType<typeof statusItems>[number]
