// Retains operational facts that must not disappear when a structured result becomes human text.
import { isObject } from '../config/schema.js'

const record = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {})
const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export function displayDetails(
  payload: Record<string, unknown>,
  plan: Record<string, unknown>,
  report: Record<string, unknown>,
) {
  const rows: { label: string; value: string }[] = []
  const open: string[] = []
  const produced: string[] = []
  const row = (label: string, value: unknown) => {
    const valueText = text(value)
    if (valueText) rows.push({ label, value: valueText })
  }
  if (Array.isArray(payload.problems)) {
    row('Document checks', `${payload.problems.length} problems`)
    for (const problem of payload.problems) {
      const entry = record(problem)
      const message =
        text(problem) || [text(entry.path), text(entry.message)].filter(Boolean).join(': ')
      if (message) open.push(message)
    }
  }
  for (const step of list(plan.steps)) row('Plan', step)
  for (const test of list(plan.tests)) row('Test', test)
  for (const assumption of list(plan.assumptions)) {
    const entry = record(assumption)
    const detail = `${text(entry.text)} — ${text(entry.status)}; ${text(entry.evidence)}`
    if (entry.status === 'verified') row('Assumption', detail)
    else open.push(detail)
  }
  const workspace = record(payload.workspace)
  row('Workspace', workspace.path)
  row('Branch', workspace.branch)
  const guidance = list(payload.guidance ?? record(payload.preflight).guidance)
    .map((entry) => text(record(entry).ref))
    .filter(Boolean)
  if (guidance.length) row('Guidance', guidance.join(' · '))

  const impact = record(payload.impact ?? report.impact)
  for (const metric of list(payload.metrics ?? report.metrics ?? impact.metrics)) {
    const entry = record(metric)
    const observation = record(entry.observation)
    const name = text(entry.name) || text(entry.id)
    const actual = text(observation.value) || 'unknown'
    row(
      name || 'Metric',
      `${actual}${text(entry.unit) ? ` ${text(entry.unit)}` : ''} · ${text(entry.verdict) || 'unknown'}`,
    )
    if (
      entry.verdict === 'unknown' ||
      observation.status === 'unknown' ||
      !Object.keys(observation).length
    )
      open.push(`${name}: ${text(observation.missing) || 'No checked observation.'}`)
  }
  for (const query of list(payload.qualitative ?? impact.qualitative)) {
    const entry = record(query),
      observation = record(entry.observation)
    if (observation.status !== 'observed')
      open.push(`${text(entry.id)}: ${text(observation.missing) || 'No qualitative observation.'}`)
  }
  row('Recommendation', payload.recommendation)
  row('Decision', record(report.decision).outcome)
  row('Reason', record(payload.decision ?? report.decision).reason)
  row('Stage', record(payload.stage).id)
  if (payload.changedFlag === false) row('Flag change', 'Not performed')
  const publication = Array.isArray(payload.publication)
    ? payload.publication
    : Object.values(record(payload.publication))
  for (const item of publication) {
    const entry = record(item)
    const name = text(entry.title) || text(entry.key) || 'Artifact'
    const status = text(entry.status)
    if (!status) continue
    row(
      'Publication',
      `${name}: ${status}${text(entry.provider) ? ` · ${text(entry.provider)}` : ''}`,
    )
    if (entry.path) produced.push(text(entry.path))
    if (entry.externalRef) produced.push(text(entry.externalRef))
    if (!['stored', 'succeeded'].includes(status)) open.push(`${name}: publication ${status}.`)
    if (entry.operation === 'comms.draft' && entry.sent === false)
      row('Messages', 'Draft only; not sent')
  }
  return { rows, open, produced }
}
