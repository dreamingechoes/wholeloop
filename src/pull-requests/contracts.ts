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
export function pullRequestPlans(events: readonly StateEvent[]) {
  const plans = new Map<
    string,
    {
      subject: string
      event: string
      plan: PullRequestPlan
      tested?: string
      requested?: string
      pr?: PullRequest
    }
  >()
  const latest = new Map<string, string>()
  for (const event of events) {
    if (event.type === 'pr.planned') {
      const pending = [...plans.values()].find(
        (plan) => plan.subject === event.subject && plan.requested && !plan.pr,
      )
      if (pending) throw new Error('Reconcile the pending PR request before changing its plan')
      plans.set(event.id, { subject: event.subject, event: event.id, plan: event.data.plan })
      latest.set(event.subject, event.id)
    }
    if (
      event.type === 'pr.tested' ||
      event.type === 'pr.requested' ||
      event.type === 'pr.published'
    ) {
      const entry = plans.get(event.data.plan)
      if (!entry || entry.subject !== event.subject || latest.get(event.subject) !== entry.event)
        throw new Error('PR event must reference its current earlier plan')
      if (event.type === 'pr.tested') {
        if (event.data.snapshot !== entry.plan.snapshot || entry.requested)
          throw new Error('Human testing must match the planned snapshot before publication')
        entry.tested = event.id
      }
      if (event.type === 'pr.requested') {
        const approved = events
          .slice(0, events.indexOf(event))
          .findLast(
            (candidate) =>
              candidate.subject === event.subject &&
              candidate.type === 'decision.recorded' &&
              candidate.data.decision === 'test-it' &&
              candidate.data.basis === entry.event,
          )
        if (
          !entry.tested ||
          entry.requested ||
          approved?.type !== 'decision.recorded' ||
          approved.data.outcome !== 'approved'
        )
          throw new Error('One PR request needs prior human testing and its exact-plan approval')
        entry.requested = event.id
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
      }
    }
  }
  return [...plans.values()]
}
