import { stringify } from 'yaml'
import {
  environmentProjectionEntries,
  renderEnvironmentProjections,
  renderEnvironmentReceipt,
} from '../environment/ledger.js'
import { gateRuns } from '../gates/state.js'
import { impactRuns } from '../impact/contracts.js'
import { impactDeliveries } from '../impact/publish.js'
import { impactReport } from '../impact/report.js'
import { launchArtifacts, renderLaunchArtifacts } from '../launch/artifacts.js'
import { launchRuns } from '../launch/contracts.js'
import { launchDeliveries } from '../launch/publish.js'
import { learningFollowups, learningRuns } from '../learning/contracts.js'
import { pullRequestPlans } from '../pull-requests/contracts.js'
import { rampRuns } from '../ramp/contracts.js'
import { rampProposals } from '../ramp/publish.js'
import { reviewInputs } from '../review/state.js'
import { sharingState } from '../sharing/contracts.js'
import { syncBasis, syncReady, syncState } from '../sync/contracts.js'
import { verificationRuns } from '../verification/state.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { type Item, replayState, type StateEvent } from './events.js'
import { replayMailbox } from './mailbox.js'

export function projections(
  items: ReadonlyMap<string, Item>,
  events: readonly StateEvent[] = [],
): Map<string, string> {
  return renderProjections(items, events)
}

/** No caller-supplied facts or callback can cross validation and rendering. */
export function replayProjections(events: readonly StateEvent[]): Map<string, string> {
  const state = replayState(events)
  return renderProjections(state.items, events, state.domains)
}

/** Creation needs the same fresh item identities that its before views validated. */
export function replayProjectionSnapshot(events: readonly StateEvent[]) {
  const state = replayState(events)
  return { items: state.items, files: renderProjections(state.items, events, state.domains) }
}

function renderProjections(
  items: ReadonlyMap<string, Item>,
  events: readonly StateEvent[],
  facts?: ReturnType<typeof replayState>['domains'],
): Map<string, string> {
  const files = new Map<string, string>()
  const links: Record<string, string[]> = {}
  const workspaces = new Map(
    (facts?.workspaces ?? worktreeRecords(events)).map((record) => [record.subject, record]),
  )
  const environments = facts
    ? renderEnvironmentProjections(items, facts.environment)
    : environmentProjectionEntries(events)
  for (const item of [...items.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const { body, notes, links: refs, ...metadata } = item
    const noteText = notes.length
      ? `\n## Notes\n\n${notes.map((note) => `- ${note.ts} (${note.id}): ${note.text}`).join('\n')}\n`
      : ''
    const linkText = refs.length
      ? `\n## Links\n\n${refs.map((ref) => `- ${ref}`).join('\n')}\n`
      : ''
    const workspace = workspaces.get(item.id)
    const workspaceText = workspace
      ? `\n## Workspace\n\n- Mode: ${workspace.mode}; status: ${workspace.status}\n- Path: ${workspace.path}\n- Branch: ${workspace.branch}\n- Base: ${workspace.base.ref} (${workspace.base.sha})\n- Ports: ${workspace.ports.start}-${workspace.ports.end}\n`
      : ''
    files.set(
      `items/${item.id}/${item.kind}.md`,
      `---\n${stringify(metadata)}---\n\n${body}\n${workspaceText}${noteText}${linkText}`,
    )
    links[item.id] = refs
    const environment = environments.get(item.id)
    if (environment?.length) {
      files.set(`items/${item.id}/environment.json`, `${JSON.stringify(environment, null, 2)}\n`)
      files.set(
        `items/${item.id}/environment.md`,
        `# Environment receipt\n\n${renderEnvironmentReceipt(item.id, environment)}`,
      )
    }
    if (workspace)
      files.set(`items/${item.id}/worktree.json`, `${JSON.stringify(workspace, null, 2)}\n`)
  }
  const sharing = facts?.sharing ?? sharingState(events)
  if (sharing.modes.size) {
    const publications = groupBy(sharing.queue, ([, entry]) => entry.root)
    for (const [subject, mode] of sharing.modes)
      files.set(
        `items/${subject}/sharing.json`,
        `${JSON.stringify({ ...mode, publications: (publications.get(subject) ?? []).map(([key, entry]) => ({ key, ...entry })) }, null, 2)}\n`,
      )
  }
  for (const [key, entry] of sharing.queue)
    files.set(
      `items/${entry.root}/outbox/${key}.json`,
      `${JSON.stringify({ key, ...entry }, null, 2)}\n`,
    )
  const synchronization = facts?.sync ?? syncState(events)
  const synchronized = new Set<string>(),
    buildPlans: Extract<StateEvent, { type: 'build.planned' }>[] = [],
    artifacts: Extract<StateEvent, { type: 'step.completed' }>[] = []
  for (const entry of events) {
    const type = entry.type
    if (type.startsWith('sync.')) synchronized.add(entry.subject)
    else if (type === 'build.planned') buildPlans.push(entry)
    else if (type === 'step.completed') artifacts.push(entry)
  }
  if (synchronized.size) {
    const transitions = groupBy(synchronization.transitions.values(), (entry) => entry.subject)
    for (const [subject] of synchronization.items)
      if (synchronized.has(subject))
        files.set(
          `items/${subject}/sync.json`,
          `${JSON.stringify({ basis: syncBasis(synchronization, subject) ?? null, deliveryReady: syncReady(synchronization, subject), merge: synchronization.merged.get(subject) ?? null, transitions: transitions.get(subject) ?? [] }, null, 2)}\n`,
        )
  }
  for (const learning of facts?.learning ?? learningRuns(events)) {
    const body = `${JSON.stringify({ ...learning, followups: learningFollowups(learning) }, null, 2)}\n`
    files.set(`items/${learning.subject}/learning/${learning.plan.run}.json`, body)
    files.set(`items/${learning.subject}/learning.json`, body)
  }
  for (const delivery of facts?.impactDeliveries ?? impactDeliveries(events))
    files.set(
      `items/${delivery.subject}/impact/deliveries/${delivery.key}.json`,
      `${JSON.stringify(delivery, null, 2)}\n`,
    )
  for (const impact of facts?.impact ?? impactRuns(events)) {
    files.set(
      `items/${impact.subject}/impact/${impact.plan.run}.json`,
      `${JSON.stringify(impact, null, 2)}\n`,
    )
    files.set(
      `items/${impact.subject}/impact/${impact.plan.checkpoint}.json`,
      `${JSON.stringify(impactReport(impact), null, 2)}\n`,
    )
  }
  const ramps = facts?.ramps ?? rampRuns(events)
  if (ramps.length) {
    const proposals = groupBy(facts?.rampProposals ?? rampProposals(events), (entry) => entry.run)
    for (const ramp of ramps)
      files.set(
        `items/${ramp.subject}/ramps/${ramp.run}.json`,
        `${JSON.stringify({ ...ramp, proposals: proposals.get(ramp.run) ?? [] }, null, 2)}\n`,
      )
  }
  for (const delivery of facts?.launchDeliveries ?? launchDeliveries(events))
    files.set(
      `items/${delivery.subject}/launches/${delivery.run}/dispatches/${delivery.key}.json`,
      `${JSON.stringify(delivery, null, 2)}\n`,
    )
  for (const launch of facts?.launches ?? launchRuns(events)) {
    const root = `items/${launch.subject}/launches/${launch.plan.run}`
    files.set(`${root}/plan.json`, `${JSON.stringify(launch.plan, null, 2)}\n`)
    files.set(`${root}/measurement.json`, `${JSON.stringify(launch.plan.source.plan, null, 2)}\n`)
    for (const artifact of facts
      ? renderLaunchArtifacts(launch)
      : launchArtifacts(events, launch.subject, launch.plan.run))
      files.set(artifact.path, `${artifact.body}\n`)
  }
  for (const plan of facts?.pullRequests ?? pullRequestPlans(events))
    files.set(
      `items/${plan.subject}/pull-requests/${plan.event}.json`,
      `${JSON.stringify(plan, null, 2)}\n`,
    )
  for (const { subject, input } of facts?.reviews ?? reviewInputs(events))
    files.set(
      `items/${subject}/reviews/${input.run}/${input.round}.json`,
      `${JSON.stringify(input, null, 2)}\n`,
    )
  for (const suite of facts?.verification.suites ?? verificationRuns(events))
    files.set(
      `items/${suite.subject}/verification/${suite.run}/${suite.round}.json`,
      `${JSON.stringify(suite, null, 2)}\n`,
    )
  for (const entry of buildPlans)
    files.set(`items/${entry.subject}/build-plan.json`, `${JSON.stringify(entry.data, null, 2)}\n`)
  for (const run of facts?.verification.gates ?? gateRuns(events))
    for (const round of run.rounds)
      files.set(
        `items/${run.subject}/gates/${run.run}/${round.plan.round}.json`,
        `${JSON.stringify({ ...round, budget: run.budget }, null, 2)}\n`,
      )
  files.set('links.json', `${JSON.stringify(links, null, 2)}\n`)
  const mailbox = facts?.mailbox ?? replayMailbox(events)
  const threads = new Map<string, string[]>()
  for (const message of mailbox.messages) {
    const thread = threads.get(message.thread) ?? []
    thread.push(JSON.stringify(message))
    threads.set(message.thread, thread)
  }
  for (const [id, messages] of threads)
    files.set(`mailbox/${id}.ndjson`, `${messages.join('\n')}\n`)
  for (const entry of artifacts) files.set(entry.data.artifact.path, entry.data.artifact.content)
  files.set('cursors.json', `${JSON.stringify(mailbox.cursors, null, 2)}\n`)
  return files
}

/** Keep insertion order inside each view without rescanning other subjects. */
function groupBy<T>(entries: Iterable<T>, key: (entry: T) => string) {
  const groups = new Map<string, T[]>()
  for (const entry of entries) {
    const id = key(entry),
      group = groups.get(id)
    if (group) group.push(entry)
    else groups.set(id, [entry])
  }
  return groups
}
