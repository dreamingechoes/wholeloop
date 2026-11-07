// Renders launch artifacts and the launch receipt from a validated record.
import type { StateEvent } from '../state/events.js'
import { launchRuns } from './contracts.js'
import { scopeMeasurement } from './measurement.js'

export interface LaunchArtifact {
  key: string
  operation: 'comms.draft' | 'dashboards.create' | 'docs.create'
  path: string
  title: string
  body: string
  metricRef?: string
}
export function launchArtifacts(
  events: readonly StateEvent[],
  subject: string,
  run: string,
): LaunchArtifact[] {
  const record = launchRuns(events).find(
    (entry) => entry.subject === subject && entry.plan.run === run,
  )
  return record ? renderLaunchArtifacts(record) : []
}

/** Format the exact already validated record without reparsing its history. */
export function renderLaunchArtifacts(
  record: ReturnType<typeof launchRuns>[number],
): LaunchArtifact[] {
  if (!record.draft) return []
  const subject = record.subject,
    run = record.plan.run
  const { plan, draft } = record
  const metrics = plan.source.plan.metrics
  const directory = `items/${subject}/launches/${run}`
  const artifacts: LaunchArtifact[] = [
    {
      key: 'rollout',
      operation: 'docs.create',
      path: `${directory}/rollout.md`,
      title: 'Rollout plan',
      body: `# Rollout plan\n\n${draft.rolloutPlan}\n\n## Pinned stages and rollback\n\n${JSON.stringify(plan.source.plan.rollout, null, 2)}\n\nFlag state was not observed by this draft. No exposure change was performed.\n`,
    },
  ]
  for (const comm of draft.comms)
    artifacts.push({
      key: `comms/${comm.key}`,
      operation: 'comms.draft',
      path: `${directory}/comms/${comm.key}.md`,
      title: `${comm.audience} — ${comm.stage}`,
      body: `# Draft — ${comm.audience}\n\nStage: ${comm.stage}. Not sent.\n\n${comm.body}\n`,
    })
  // Preserve the original first metric and its exact JSON-pointer position.
  // Empty/single dashboard selections need no complete metric index.
  const metricIndex = draft.dashboards.length > 1 ? new Map<string, number>() : undefined
  if (metricIndex) {
    let index = 0
    for (const metric of metrics) {
      const id = metric.id
      if (!metricIndex.has(id)) metricIndex.set(id, index)
      index++
    }
  }
  for (const dashboard of draft.dashboards) {
    const index = metricIndex
      ? (metricIndex.get(dashboard.metric) ?? -1)
      : metrics.findIndex((metric) => metric.id === dashboard.metric)
    const metric = metrics[index]
    if (!metric) throw new Error('Dashboard lost its pinned measurement entry')
    const metricRef = `${directory}/measurement.json#/metrics/${index}`
    artifacts.push({
      key: `dashboards/${dashboard.key}`,
      operation: 'dashboards.create',
      path: `${directory}/dashboards/${dashboard.key}.json`,
      title: dashboard.title,
      metricRef,
      body: JSON.stringify(
        {
          schema: 'wholeloop/launch-dashboard@1',
          title: dashboard.title,
          metricRef,
          sourceRevision: plan.source.revision,
          sourceDigest: plan.source.digest,
          metric,
        },
        null,
        2,
      ),
    })
  }
  for (const [key, title, body] of [
    ['support-guide', 'Support guide', draft.enablement.supportGuide],
    ['one-pager', 'One-pager', draft.enablement.onePager],
    ['runbook', 'Runbook', draft.enablement.runbook],
  ])
    artifacts.push({
      key: key ?? '',
      operation: 'docs.create',
      path: `${directory}/${key}.md`,
      title: title ?? '',
      body: `# ${title}\n\n${body}\n`,
    })
  return artifacts
}
export function launchReceipt(
  events: readonly StateEvent[],
  subject: string,
  run?: string,
): string {
  const record = launchRuns(events)
    .filter((entry) => entry.subject === subject && (!run || entry.plan.run === run))
    .at(-1)
  if (!record?.draft)
    throw new Error('Complete prepare-launch from its validated pinned launch kit')
  const ownerEvent = events.findLast(
    (event) =>
      event.subject === subject &&
      (event.type === 'item.created' || (event.type === 'item.updated' && event.data.owner)),
  )
  const owner = ownerEvent && 'owner' in ownerEvent.data ? (ownerEvent.data.owner ?? '') : ''
  const source = scopeMeasurement(events, subject, owner)
  if (source && source.digest !== record.plan.source.digest)
    throw new Error('Launch receipt cannot replace a changed scope measurement revision')
  const artifacts = launchArtifacts(events, subject, record.plan.run)
  return `# Launch kit receipt\n\n## Measurement plan\n\nSource: ${record.plan.source.ref}; revision: ${record.plan.source.revision}; digest: ${record.plan.source.digest}.\n\n## Rollout plan\n\n${artifacts.find((artifact) => artifact.key === 'rollout')?.path}\n\n## Comms drafts\n\n${artifacts
    .filter((artifact) => artifact.operation === 'comms.draft')
    .map((artifact) => `- ${artifact.title}: ${artifact.path} (draft only, not sent)`)
    .join('\n')}\n\n## Dashboards\n\n${
    artifacts
      .filter((artifact) => artifact.operation === 'dashboards.create')
      .map(
        (artifact) =>
          `- ${artifact.title}: ${artifact.path}; measurement entry: ${artifact.metricRef}`,
      )
      .join('\n') || 'No dashboards: the pinned plan contains an explicit measurement exception.'
  }\n\n## Enablement\n\n${artifacts
    .filter((artifact) => ['support-guide', 'one-pager', 'runbook'].includes(artifact.key))
    .map((artifact) => `- ${artifact.title}: ${artifact.path}`)
    .join(
      '\n',
    )}\n\n## Handoffs\n\nEvery artifact is stored locally. Provider draft/create operations require the explicit host publication boundary; unavailable providers retain these ready-to-use artifacts. Nothing was sent and no flag was changed.\n`
}
