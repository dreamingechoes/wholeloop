import { measurementDigest } from '../launch/measurement.js'
import type { StateEvent } from '../state/events.js'
import { impactRuns } from './contracts.js'
import { impactReport } from './report.js'

export interface DigestTarget {
  kind: 'draft' | 'doc-comment'
  provider: string
  subject?: string
  ref?: string
}
export function impactDigest(events: readonly StateEvent[], subjects?: string[]) {
  const closed = new Set<string>()
  for (const event of events) {
    if (event.type === 'item.closed') closed.add(event.subject)
    if (event.type === 'item.updated' && event.data.status === 'closed') closed.add(event.subject)
    if (event.type === 'item.updated' && event.data.status === 'open') closed.delete(event.subject)
  }
  const latest = new Map<string, ReturnType<typeof impactRuns>[number]>()
  for (const run of impactRuns(events)) {
    if (
      !run.observation ||
      !events.some(
        (event) =>
          event.type === 'step.completed' &&
          event.data.step === 'measure-impact' &&
          event.data.run === run.plan.run,
      )
    )
      continue
    if (subjects ? !subjects.includes(run.subject) : closed.has(run.subject)) continue
    latest.set(run.subject, run)
  }
  if (
    subjects &&
    (new Set(subjects).size !== subjects.length || subjects.some((subject) => !latest.has(subject)))
  )
    throw new Error('Every selected digest scope needs a completed impact checkpoint')
  const records = [...latest.values()].sort((a, b) => a.subject.localeCompare(b.subject))
  if (!records.length) throw new Error('No completed impact checkpoint is available for a digest')
  const reports = records.map((run) => impactReport(run))
  const sources = reports.map((report) => ({
    subject: report.subject,
    run: report.run,
    basis: report.basis ?? '',
    digest: measurementDigest(report),
  }))
  const id = measurementDigest(sources)
  const comments = reports.map((report) => ({
    subject: report.subject,
    marker: `wholeloop-impact:${id}:${report.subject}`,
    body: `Impact ${report.checkpoint} (${report.at})\n${report.metrics.map((row) => `${row.id}: ${row.observation?.value ?? 'unknown'} ${row.unit}; target ${row.target.operator} ${row.target.value}; ${row.verdict}; query ${row.queryDigest}; evidence ${row.observation?.ref ?? row.observation?.missing ?? 'unknown'}; contract ${row.metricRef}`).join('\n')}\nCheckpoint report items/${report.subject}/impact/${report.checkpoint}.json; basis ${report.basis}. No causal conclusion is implied.`,
  }))
  return {
    schema: 'wholeloop/impact-digest@1',
    id,
    sources,
    reports,
    draft: {
      operation: 'comms.draft',
      draft: true,
      send: false,
      body: comments.map((comment) => `${comment.subject}\n${comment.body}`).join('\n\n'),
    },
    comments,
  }
}
export function digestRequest(digest: ReturnType<typeof impactDigest>, target: DigestTarget) {
  if (!target.provider.trim()) throw new Error('Confirm a digest destination provider')
  if (target.kind === 'draft') {
    if (target.ref !== undefined || target.subject !== undefined)
      throw new Error('A digest draft does not take a scope/document reference')
    return {
      operation: 'comms.draft',
      body: digest.draft.body,
      marker: `wholeloop-impact:${digest.id}`,
    }
  }
  const comment = digest.comments.find((entry) => entry.subject === target.subject)
  if (!comment || !target.ref?.trim())
    throw new Error('A document comment needs a measured scope and explicit document reference')
  return { operation: 'docs.update', body: comment.body, marker: comment.marker }
}
