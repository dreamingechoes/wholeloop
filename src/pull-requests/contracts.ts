import { validate } from '../config/schema.js'
import type { StateEvent } from '../state/events.js'
import schema from './schemas/events-v1.json' with { type: 'json' }

export interface PullRequest {
  url: string
  repository: string
  head: string
  base: string
  sha: string
  draft: boolean
  merged: boolean
  state: 'open' | 'closed' | 'merged'
}
export interface PullRequestPlan {
  root: string
  repository: string
  remote: string
  branch: string
  base: string
  head: string
  snapshot: string
  title: string
  body: string
  provider: string
  convention: { ref: string; origin: string; digest: string }
  gated: boolean
}
export type PullRequestEventData =
  | { type: 'pr.planned'; data: { plan: PullRequestPlan } }
  | { type: 'pr.tested'; data: { plan: string; by: string; note: string; snapshot: string } }
  | { type: 'pr.requested'; data: { plan: string } }
  | { type: 'pr.published'; data: { plan: string; pr: PullRequest } }

export function validPullRequestData(type: string, data: Record<string, unknown>) {
  const rule = schema.properties[type as keyof typeof schema.properties]
  return !!rule && validate(data, rule).length === 0
}
interface PullRequestRecord {
  subject: string
  event: string
  plan: PullRequestPlan
  tested?: string
  requested?: string
  pr?: PullRequest
}
class PullRequestReplay {
  readonly plans = new Map<string, PullRequestRecord>()
  private readonly latest = new Map<string, string>()
  private readonly selected = new Map<string, PullRequestRecord>()
  private readonly pending = new Map<string, PullRequestRecord>()
  private readonly approvals = new Map<string, Map<string, 'approved' | 'rejected'>>()

  append(event: StateEvent) {
    switch (event.type) {
      case 'decision.recorded': {
        const data = event.data
        if (data.decision !== 'test-it') return
        let approvals = this.approvals.get(event.subject)
        if (!approvals) {
          approvals = new Map()
          this.approvals.set(event.subject, approvals)
        }
        approvals.set(data.basis, data.outcome)
        return
      }
      case 'pr.planned': {
        const subject = event.subject,
          id = event.id
        if (this.pending.has(subject))
          throw new Error('Reconcile the pending PR request before changing its plan')
        const previous = this.plans.get(id)
        if (previous && this.pending.get(previous.subject) === previous)
          this.pending.delete(previous.subject)
        const entry = { subject, event: id, plan: event.data.plan }
        this.plans.set(id, entry)
        this.latest.set(subject, id)
        if (previous) {
          // Ordinary journals have unique ids. Preserve the old Map-order result
          // for direct reducer callers that replace an existing plan id anyway.
          this.selected.delete(previous.subject)
          this.selected.delete(subject)
          for (const plan of this.plans.values())
            if (plan.subject === previous.subject || plan.subject === subject)
              this.selected.set(plan.subject, plan)
        } else this.selected.set(subject, entry)
        return
      }
      case 'pr.tested':
      case 'pr.requested':
      case 'pr.published': {
        const entry = this.plans.get(event.data.plan),
          subject = event.subject
        if (!entry || entry.subject !== subject || this.latest.get(subject) !== entry.event)
          throw new Error('PR event must reference its current earlier plan')
        if (event.type === 'pr.tested') {
          if (event.data.snapshot !== entry.plan.snapshot || entry.requested)
            throw new Error('Human testing must match the planned snapshot before publication')
          entry.tested = event.id
        }
        if (event.type === 'pr.requested') {
          if (
            !entry.tested ||
            entry.requested ||
            this.approvals.get(subject)?.get(entry.event) !== 'approved'
          )
            throw new Error('One PR request needs prior human testing and its exact-plan approval')
          entry.requested = event.id
          this.pending.set(subject, entry)
        }
        if (event.type === 'pr.published') {
          const pr = event.data.pr
          if (
            !entry.requested ||
            entry.pr ||
            !pr.draft ||
            pr.merged ||
            pr.state !== 'open' ||
            pr.sha !== entry.plan.head ||
            pr.head !== entry.plan.branch ||
            pr.base !== entry.plan.base ||
            pr.repository !== entry.plan.repository ||
            !pr.url.startsWith(`${pr.repository}/`)
          )
            throw new Error('Publication must be a matching open draft for its unique request')
          entry.pr = pr
          this.pending.delete(subject)
        }
      }
    }
  }
  forSubject(subject: string) {
    return this.selected.get(subject)
  }
}
export function pullRequestPlans(events: readonly StateEvent[]) {
  const replay = new PullRequestReplay()
  for (const event of events) replay.append(event)
  return [...replay.plans.values()]
}
/** One synchronous chronological consumer; never admits facts beyond the requested prefix. */
export function pullRequestPlanSelection(events: readonly StateEvent[]) {
  const replay = new PullRequestReplay()
  let cursor = 0
  return (end: number, subject: string) => {
    if (!Number.isSafeInteger(end) || end < cursor || end > events.length)
      throw new Error('PR prefix selection must advance within the original event vector')
    while (cursor < end) {
      const event = events[cursor]
      if (!event) throw new Error('PR prefix selection requires a complete event vector')
      replay.append(event)
      cursor++
    }
    return replay.forSubject(subject)
  }
}
