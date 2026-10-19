import { createHash } from 'node:crypto'
import type { StateEvent } from '../state/events.js'
import { impactRuns, metricVerdict } from './contracts.js'

export function impactReport(record: ReturnType<typeof impactRuns>[number]) {
  const metrics = record.plan.source.plan.metrics.map((metric, index) => {
    const observation = record.observation?.metrics.find((row) => row.id === metric.id)
    const delta =
      observation?.value !== undefined &&
      metric.baseline.status === 'known' &&
      metric.baseline.value !== undefined
        ? observation.value - metric.baseline.value
        : null
    // Finite source values can still overflow during subtraction; keep that derived value unknown.
    return {
      ...metric,
      observation: observation ?? null,
      verdict: metricVerdict(observation?.value, metric),
      delta: delta !== null && Number.isFinite(delta) ? delta : null,
      queryDigest: createHash('sha256').update(metric.source.query).digest('hex'),
      metricRef: `items/${record.subject}/impact/${record.plan.run}.json#/plan/source/plan/metrics/${index}`,
    }
  })
  return {
    schema: 'wholeloop/impact-report@1',
    subject: record.subject,
    run: record.plan.run,
    checkpoint: record.plan.checkpoint,
    launchedAt: record.plan.launchedAt,
    due: new Date(
      Date.parse(record.plan.launchedAt) + record.plan.afterDays * 86400000,
    ).toISOString(),
    at: record.plan.at,
    source: {
      ref: record.plan.source.ref,
      revision: record.plan.source.revision,
      digest: record.plan.source.digest,
    },
    basis: record.observation?.event ?? null,
    metrics,
    qualitative: record.plan.qualitative.map((query) => ({
      ...query,
      observation: record.observation?.qualitative.find((row) => row.id === query.id) ?? null,
    })),
    measurementException: record.plan.source.plan.measurementException ?? null,
    sections: record.layout?.sections ?? null,
  }
}
export function impactReceipt(events: readonly StateEvent[], subject: string) {
  const record = impactRuns(events)
    .filter((run) => run.subject === subject)
    .at(-1)
  if (!record?.observation || !record.layout)
    throw new Error(
      'Impact completion needs observed/unknown evidence and a current complete report layout',
    )
  const report = impactReport(record)
  const sections = record.layout.sections.map((section) => {
    const metrics = section.metrics
      .map((id) => report.metrics.find((row) => row.id === id))
      .map((row) => {
        if (!row) throw new Error('Missing report metric')
        return `- ${row.id} (${row.name}): baseline ${JSON.stringify(row.baseline)}; target ${row.target.operator} ${row.target.value} ${row.unit}; actual ${row.observation?.value ?? 'unknown'}; verdict ${row.verdict}; delta ${row.delta ?? 'unknown'}.\n  Source ${row.source.provider}/${row.source.operation}; query ${JSON.stringify(row.source.query)} (${row.queryDigest}); window ${JSON.stringify(row.observation?.window)}; evidence ${row.observation?.ref ?? row.observation?.missing ?? 'unknown'}; body ${row.observation?.bodyDigest ?? 'unknown'}; metric ${row.metricRef}.`
      })
    const qualitative = section.qualitative
      .map((id) => report.qualitative.find((row) => row.id === id))
      .map((row) => {
        if (!row) throw new Error('Missing qualitative report query')
        return `- ${row.id}: source ${row.provider}/${row.operation}; query ${JSON.stringify(row.query)}; window ${JSON.stringify(row.observation?.window)}; quote ${JSON.stringify(row.observation?.text ?? '')}; evidence ${row.observation?.ref ?? row.observation?.missing ?? 'unknown'}. Qualitative statements are source quotes, not verified metric values.`
      })
    return `### ${section.title}\n\n${[...metrics, ...qualitative].join('\n') || 'No datapoints; see the explicit measurement exception.'}`
  })
  return `# Impact checkpoint\n\n## Checkpoint\n\n${report.checkpoint}; due ${report.due}; observed window end ${report.at}; basis ${report.basis}; source ${report.source.ref} (${report.source.revision}, ${report.source.digest}).\n\n## Measurements\n\nValues below retain their pinned definitions and source observations.\n\n${sections.join('\n\n')}\n\n## Unknowns\n\n${
    report.metrics
      .filter((row) => row.verdict === 'unknown')
      .map((row) => `- ${row.id}: ${row.observation?.missing}; owner follow-up required.`)
      .join('\n') || 'No missing numeric observations.'
  }\n${report.measurementException ? `Measurement exception: ${report.measurementException.reason}; confirmed by ${report.measurementException.who}.` : ''}\n\n## Handoff\n\nThis report measures observations against the promise; it does not establish causality or make the keep/iterate/kill/unflag decision. Continue to decide-next.\n`
}
