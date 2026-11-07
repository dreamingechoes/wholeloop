// Guard decisions for state writes, commits, pushes and tool calls coming from client hooks.
import { existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { assertBuildGreen } from '../build/contracts.js'
import { decisionTrail } from '../flow/plan.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { codehostRepository } from '../pull-requests/codehost.js'
import { pullRequestPlans } from '../pull-requests/contracts.js'
import { replay, type StateEvent } from '../state/events.js'
import { assertExternal, canonicalPath } from '../state/paths.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { ancestor, git, repository } from '../worktrees/git.js'
import { gitInvocation } from './command.js'
import type { GuardTool } from './normalize.js'

export interface GuardDecision {
  schema: 'wholeloop/guard@1'
  decision: 'allow' | 'deny'
  policies: string[]
  reasons: string[]
  subject?: string
}
const allowed = (): GuardDecision => ({
  schema: 'wholeloop/guard@1',
  decision: 'allow',
  policies: [],
  reasons: [],
})
const denied = (policy: string, reason: string): GuardDecision => ({
  schema: 'wholeloop/guard@1',
  decision: 'deny',
  policies: [policy],
  reasons: [reason],
})
export function runtimePath(root: string, path: string) {
  return [resolve(path), canonicalPath(path)].some((candidate) => {
    const name = relative(canonicalPath(root), candidate).split('\\').join('/')
    return /^\.wholeloop\/(?:state|runtime|journal|items|mailbox|worktrees|artifacts)(?:\/|$)/.test(
      name,
    )
  })
}
export function guardStateWrite(path: string): GuardDecision {
  try {
    assertExternal(path)
    return allowed()
  } catch {
    return denied(
      'external-runtime-state',
      'Runtime state must stay outside every Git repository, including symlinked destinations.',
    )
  }
}
export function guardCommit(
  cwd: string,
  events: readonly StateEvent[],
  subject?: string,
): GuardDecision {
  replay(events)
  const root = repository(cwd).path
  const paths = git(root, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean)
  if (paths.some((path) => runtimePath(root, resolve(root, path))))
    return denied(
      'external-runtime-state',
      'Move staged runtime state outside the repository; project configuration and distribution artifacts are separate.',
    )
  const records = worktreeRecords(events)
  const workspace = subject
    ? records.find((record) => record.subject === subject)
    : records.find(
        (record) =>
          canonicalPath(record.path) === root &&
          (record.mode !== 'checkout' || record.status !== 'stopped'),
      )
  if (subject && !workspace)
    return denied(
      'build-topic-commits',
      'Use the recorded prepared build workspace before committing for this subject.',
    )
  if (workspace) {
    if (
      workspace.status !== 'active' ||
      canonicalPath(workspace.path) !== root ||
      git(root, ['branch', '--show-current']).trim() !== workspace.branch
    )
      return denied(
        'build-topic-commits',
        'Build commits must use the active assigned topic workspace, never its base/default or personal checkout.',
      )
  }
  return { ...allowed(), ...(workspace ? { subject: workspace.subject } : {}) }
}
export interface PushUpdate {
  localRef: string
  localSha: string
  remoteRef: string
  remoteSha: string
}
export interface PushInput {
  cwd: string
  remote: string
  url: string
  updates: PushUpdate[]
  subject?: string
}
export function guardPush(input: PushInput, events: readonly StateEvent[]): GuardDecision {
  replay(events)
  const no = () =>
    denied(
      'open-pr-publication-only',
      'Push only the exact clean, human-tested open-pr request to its pinned remote/branch; no deletes, extra refs or changed code.',
    )
  if (input.updates.length !== 1) return no()
  const update = input.updates[0]
  if (
    !update ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(update.localSha) ||
    /^0+$/.test(update.localSha) ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(update.remoteSha) ||
    update.remoteSha.length !== update.localSha.length
  )
    return no()
  const root = repository(input.cwd).path
  const current = workspaceSnapshot(root)
  const branch = git(root, ['branch', '--show-current']).trim()
  if (!branch || git(root, ['status', '--porcelain', '-z'])) return no()
  const remote = codehostRepository(root, input.remote)
  const configured = git(root, ['remote', 'get-url', '--push', '--all', input.remote]).trim()
  if (configured !== input.url) return no()
  const entries = pullRequestPlans(events).filter(
    (entry) =>
      canonicalPath(entry.plan.root) === root &&
      (!input.subject || entry.subject === input.subject),
  )
  const candidate = entries.at(-1)
  if (
    !candidate?.requested ||
    candidate.pr ||
    candidate.plan.remote !== input.remote ||
    candidate.plan.repository !== remote.url ||
    candidate.plan.branch !== branch ||
    candidate.plan.head !== current.head ||
    candidate.plan.snapshot !== current.digest ||
    update.localSha !== candidate.plan.head ||
    ![candidate.plan.head, `refs/heads/${branch}`].includes(update.localRef) ||
    update.remoteRef !== `refs/heads/${branch}` ||
    decisionTrail(events, candidate.subject).length
  )
    return no()
  if (candidate.plan.gated) assertBuildGreen(events, candidate.subject, root)
  if (!/^0+$/.test(update.remoteSha) && !ancestor(root, update.remoteSha, update.localSha))
    return no()
  return { ...allowed(), subject: candidate.subject }
}
export function guardTool(tool: GuardTool, readEvents: () => readonly StateEvent[]): GuardDecision {
  if (tool.kind === 'state-write') {
    if (!tool.paths.length)
      return denied('external-runtime-state', 'State writes need an explicit external destination.')
    return (
      tool.paths.map(guardStateWrite).find((decision) => decision.decision === 'deny') ?? allowed()
    )
  }
  if (tool.kind === 'write') {
    if (!tool.paths.length)
      return denied(
        'external-runtime-state',
        'Known write tools need explicit destinations before execution.',
      )
    for (const path of tool.paths) {
      let directory = dirname(path)
      while (!existsSync(directory) && dirname(directory) !== directory)
        directory = dirname(directory)
      let root: string
      try {
        root = repository(directory).path
      } catch {
        continue
      }
      if (runtimePath(root, path))
        return denied(
          'external-runtime-state',
          'Write runtime artifacts through the external store, not reserved repository runtime paths.',
        )
    }
  }
  if (tool.kind === 'shell' && tool.command) {
    const invocation = gitInvocation(tool.command, tool.cwd)
    if (invocation) {
      if (invocation.bypass)
        return denied(
          'guard-bypass',
          'Do not bypass the configured hooks for a guarded Git mutation.',
        )
      if (invocation.action === 'commit')
        return guardCommit(invocation.cwd, readEvents(), tool.subject)
      const args = invocation.args[0] === '--' ? invocation.args.slice(1) : invocation.args
      const events = readEvents()
      const root = repository(invocation.cwd).path
      const entry = pullRequestPlans(events)
        .filter(
          (entry) =>
            canonicalPath(entry.plan.root) === root &&
            (!tool.subject || entry.subject === tool.subject),
        )
        .at(-1)
      if (
        !entry ||
        args.length !== 2 ||
        args[0] !== entry.plan.remote ||
        args[1] !== `${entry.plan.head}:refs/heads/${entry.plan.branch}`
      )
        return denied(
          'open-pr-publication-only',
          'Use the exact object-pinned push issued by the tested open-pr request.',
        )
      return guardPush(
        {
          cwd: root,
          remote: entry.plan.remote,
          url: git(root, ['remote', 'get-url', '--push', entry.plan.remote]).trim(),
          updates: [
            {
              localRef: entry.plan.head,
              localSha: entry.plan.head,
              remoteRef: `refs/heads/${entry.plan.branch}`,
              remoteSha: '0'.repeat(entry.plan.head.length),
            },
          ],
          ...(tool.subject ? { subject: tool.subject } : {}),
        },
        events,
      )
    }
  }
  return allowed()
}
