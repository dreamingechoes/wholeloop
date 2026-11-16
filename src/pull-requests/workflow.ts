// The open-pr workflow: plan, human testing of the exact snapshot and draft-only publication.
import { createHash } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { assertBuildGreen } from '../build/contracts.js'
import { BuildWorkflow } from '../build/workflow.js'
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import { environmentReceipt } from '../environment/ledger.js'
import type { FlowEngine } from '../flow/engine.js'
import { decisionTrail } from '../flow/plan.js'
import { checkShape } from '../flow/registry.js'
import { readRegularText } from '../fs/regular-file.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { hasToolAttribution } from '../git/commit.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { type ProviderHost, performOperation } from '../providers/operations.js'
import { itemId, type StateEvent } from '../state/events.js'
import { canonicalPath, inside } from '../state/paths.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { git, namedBase } from '../worktrees/git.js'
import { WorktreeManager } from '../worktrees/manager.js'
import { codehostRepository, parsePullRequest } from './codehost.js'
import { pullRequestPlans } from './contracts.js'

export interface PrOptions {
  subject?: string
  owner?: string
  base?: string
  branch?: string
  provider?: string
  remote?: string
  title?: string
  body?: string
}
const latest = (events: readonly StateEvent[], subject: string) =>
  pullRequestPlans(events)
    .filter((entry) => entry.subject === subject)
    .at(-1)
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

function convention(engine: FlowEngine, root: string) {
  const inventory = discover(root, engine.store.files, engine.home)
  const slots = engine.config().slots
  const selected = resolveSlot('open-pr.convention', inventory.repo, {
    user: inventory.user,
    ...(isObject(slots) && typeof slots['open-pr.convention'] === 'string'
      ? { binding: slots['open-pr.convention'] }
      : {}),
  })
  if (!selected.selected || selected.questions.length)
    throw new Error('Resolve open-pr.convention before preparing a PR')
  const { ref, origin } = selected.selected
  let content = ''
  if (origin !== 'harness') {
    const base = origin === 'user' ? engine.home : root
    const file = canonicalPath(isAbsolute(ref) ? ref : join(base, ref))
    // The canonical path is checked, then read through one descriptor that refuses a link
    // swapped in after the check.
    const text = inside(canonicalPath(base), file) ? readRegularText(file, 1024 * 1024) : undefined
    if (text === undefined) throw new Error('PR convention must be a local file under 1 MiB')
    content = text
  }
  return { ref, origin, digest: hash(content), content }
}

export class PullRequestWorkflow {
  constructor(readonly engine: FlowEngine) {}
  context(subject: string) {
    const engine = new BuildWorkflow(this.engine).engineFor(subject)
    const item = engine.store.get(subject)
    if (!['slice', 'part', 'review'].includes(item.kind) || item.status !== 'open')
      throw new Error('Publish an open slice, part or standalone item')
    const workspace = worktreeRecords(engine.store.events()).find(
      (entry) => entry.subject === subject,
    )
    if (workspace) {
      if (workspace.status !== 'active' || workspace.abandoned)
        throw new Error('Publication requires an active workspace')
      new WorktreeManager(engine).open(subject)
    }
    return { engine, item, root: workspace?.path ?? engine.root, workspace }
  }
  prepare(options: PrOptions) {
    const context = options.subject ? this.context(options.subject) : undefined
    const engine = context?.engine ?? this.engine
    const root = context?.root ?? engine.root
    const guidance = convention(engine, root)
    const settings = engine.config().providers
    const configured =
      options.provider ??
      (isObject(settings) && typeof settings.codehost === 'string' ? settings.codehost : undefined)
    const questions: { id: string; prompt: string }[] = []
    if (!configured)
      questions.push({
        id: 'codehost',
        prompt: 'Which configured code-host provider should open the draft?',
      })
    if (!options.subject && !options.owner?.trim())
      questions.push({ id: 'owner', prompt: 'Who owns this standalone PR?' })
    const baseInput = options.base ?? context?.workspace?.target.ref
    if (!baseInput)
      questions.push({ id: 'base', prompt: 'Which named branch should receive this draft PR?' })
    const title = options.title ?? context?.item.title
    if (!title?.trim())
      questions.push({
        id: 'title',
        prompt: 'What is the PR title, following repository conventions?',
      })
    if (!options.body?.trim())
      questions.push({
        id: 'body',
        prompt: 'Provide the completed repository PR template and actual validation evidence.',
      })
    if (questions.length)
      return {
        schema: 'wholeloop/pr-prepare@1',
        status: 'question' as const,
        questions,
        convention: guidance,
      }
    const branch = git(root, ['branch', '--show-current']).trim()
    if (!branch || (options.branch && options.branch !== branch))
      throw new Error('Use the currently checked-out named branch; no checkout is implicit')
    namedBase(root, branch)
    const base = namedBase(root, baseInput ?? '')
      .ref.replace(/^refs\/heads\//, '')
      .replace(/^refs\/remotes\/[^/]+\//, '')
    if (branch === base) throw new Error('A PR cannot publish its target branch')
    if (git(root, ['status', '--porcelain', '-z']))
      throw new Error('Commit authorized changes before final gates, human testing and PR planning')
    if (Number(git(root, ['rev-list', '--count', `${baseInput}..HEAD`]).trim()) < 1)
      throw new Error('The branch has no commits beyond its named base')
    const body = options.body ?? ''
    if (hasToolAttribution(`${title}\n${body}`))
      throw new Error('PR text must not contain tool attribution')
    const sections = [...guidance.content.matchAll(/^#{2,6}\s+(.+?)\s*#*\s*$/gm)].map(
      (match) => match[1] ?? '',
    )
    if (checkShape(body, sections).length)
      throw new Error('Complete every required repository PR template section')
    const remote = options.remote ?? 'origin'
    const repository = codehostRepository(root, remote).url
    const registry = loadProviders(
      loadExtensionOptions({ root: engine.root, userFile: engine.userFile }),
    )
    if (registry.problems.length)
      throw new Error('Resolve provider manifest problems before publication')
    const provider = resolveProvider(registry, 'codehost.open-draft-pr', configured)
    const events = engine.store.events()
    const gated =
      !!options.subject &&
      events.some(
        (event) =>
          event.subject === options.subject &&
          ['slice.defined', 'part.defined', 'build.agreed', 'build.planned'].includes(event.type),
      )
    if (gated) assertBuildGreen(events, options.subject ?? '', root)
    const snapshot = workspaceSnapshot(root)
    const { content: _content, ...reference } = guidance
    return engine.store.transaction((current, append) => {
      if (workspaceSnapshot(root).digest !== snapshot.digest)
        throw new Error('PR workspace changed during planning')
      const subject = options.subject ?? itemId('slice')
      if (!options.subject)
        append(subject, {
          type: 'item.created',
          data: {
            kind: 'slice',
            title: title ?? '',
            owner: options.owner ?? '',
            body: 'Standalone draft publication; no prior machine gates are implied.',
            repository: canonicalPath(root),
          },
        })
      const related = current
        .filter(
          (event) =>
            (event.subject === subject || event.subject === context?.item.parent) &&
            event.type === 'link.added',
        )
        .map((event) => (event.type === 'link.added' ? event.data.url : ''))
      for (const event of current)
        if (
          (event.subject === subject || event.subject === context?.item.parent) &&
          (event.type === 'slice.defined' || event.type === 'part.defined')
        )
          related.push(event.data.tracker.ref)
      const finalBody = `${body.trim()}\n\nWork item: ${subject}.${related.length ? `\nRelated: ${[...new Set(related)].join(' · ')}` : ''}\nMachine gates: ${gated ? 'current verify and review PASS' : 'not run by this standalone publication workflow'}.\n`
      const plan = {
        root: canonicalPath(root),
        repository,
        remote,
        branch,
        base,
        head: snapshot.head,
        snapshot: snapshot.digest,
        title: title ?? '',
        body: finalBody,
        provider: provider.manifest.id,
        convention: reference,
        gated,
      }
      const prior = latest(current, subject)
      if (prior?.pr)
        throw new Error('This item already has a PR; update the existing PR explicitly')
      let entry = prior?.event
      if (!prior || JSON.stringify(prior.plan) !== JSON.stringify(plan)) {
        append(subject, { type: 'pr.planned', data: { plan } })
        entry = current.at(-1)?.id
      }
      if (!entry) throw new Error('Missing PR plan event')
      return {
        schema: 'wholeloop/pr-prepare@1',
        status: 'planned' as const,
        subject,
        plan: entry,
        draft: plan,
        convention: guidance,
        questions: [],
        next: 'Open the environment, test these exact bytes and record pr tested; no push has occurred.',
      }
    })
  }
  current(subject: string) {
    const context = this.context(subject)
    const entry = latest(context.engine.store.events(), subject)
    if (!entry || entry.plan.root !== canonicalPath(context.root))
      throw new Error('Prepare the PR before testing or publication')
    if (
      workspaceSnapshot(context.root).digest !== entry.plan.snapshot ||
      git(context.root, ['status', '--porcelain', '-z'])
    )
      throw new Error('PR plan is stale; prepare and test the changed snapshot again')
    if (codehostRepository(context.root, entry.plan.remote).url !== entry.plan.repository)
      throw new Error('PR remote changed after planning')
    const { content: _content, ...reference } = convention(context.engine, context.root)
    if (JSON.stringify(reference) !== JSON.stringify(entry.plan.convention))
      throw new Error('PR convention changed after planning')
    if (entry.plan.gated) assertBuildGreen(context.engine.store.events(), subject, context.root)
    return { ...context, entry }
  }
  tested(subject: string, by: string, note: string) {
    if (!by.trim() || !note.trim()) throw new Error('Record the person and what they tested')
    const { engine, entry } = this.current(subject)
    return engine.store.transaction((events, append) => {
      if (latest(events, subject)?.event !== entry.event)
        throw new Error('PR plan advanced before testing approval')
      if (workspaceSnapshot(entry.plan.root).digest !== entry.plan.snapshot)
        throw new Error('PR snapshot changed before testing approval')
      append(subject, {
        type: 'pr.tested',
        data: { plan: entry.event, by, note, snapshot: entry.plan.snapshot },
      })
      append(subject, {
        type: 'decision.recorded',
        data: { decision: 'test-it', outcome: 'approved', by, basis: entry.event },
      })
      return {
        schema: 'wholeloop/pr-tested@1',
        subject,
        plan: entry.event,
        by,
        snapshot: entry.plan.snapshot,
      }
    })
  }
  async publish(subject: string, host: ProviderHost) {
    const { engine, entry } = this.current(subject)
    if (entry.pr)
      return {
        schema: 'wholeloop/pr-open@1',
        subject,
        status: 'published',
        cached: true,
        pr: entry.pr,
      }
    if (entry.requested)
      throw new Error(
        'PR request outcome is ambiguous; reconcile its remote URL instead of retrying',
      )
    const events = engine.store.events()
    const decision = events.findLast(
      (event) =>
        event.subject === subject &&
        event.type === 'decision.recorded' &&
        event.data.decision === 'test-it' &&
        event.data.basis === entry.event,
    )
    if (
      !entry.tested ||
      decision?.type !== 'decision.recorded' ||
      decision.data.outcome !== 'approved'
    )
      throw new Error('A person must test and approve this exact PR plan before any push or PR')
    if (decisionTrail(events, subject).length)
      throw new Error('Resolve ancestor and build decisions before publication')
    const begun = engine.begin('open-pr', { subject })
    if (begun.code !== 0) throw new Error('Resolve open-pr preconditions before publication')
    engine.store.transaction((current, append) => {
      if (workspaceSnapshot(entry.plan.root).digest !== entry.plan.snapshot)
        throw new Error('PR workspace changed before publication intent')
      if (latest(current, subject)?.event !== entry.event)
        throw new Error('PR plan advanced concurrently')
      append(subject, { type: 'pr.requested', data: { plan: entry.event } })
    })
    const provider = resolveProvider(
      loadProviders(loadExtensionOptions({ root: engine.root, userFile: engine.userFile })),
      'codehost.open-draft-pr',
      entry.plan.provider,
    )
    const result = await performOperation(
      provider,
      'codehost.open-draft-pr',
      { ...entry.plan, draft: true, approved: true },
      host,
    )
    if (result.status !== 'succeeded' || !result.complete || !result.body)
      return { schema: 'wholeloop/pr-open@1', subject, status: 'pending', result }
    return this.record(subject, entry.event, result.body, result.ref)
  }
  async reconcile(subject: string, ref: string, host: ProviderHost) {
    const engine = new BuildWorkflow(this.engine).engineFor(subject)
    const entry = latest(engine.store.events(), subject)
    if (!entry?.requested || entry.pr) throw new Error('Reconcile one pending PR request')
    const provider = resolveProvider(
      loadProviders(loadExtensionOptions({ root: engine.root, userFile: engine.userFile })),
      'codehost.read-pr',
      entry.plan.provider,
    )
    const result = await performOperation(
      provider,
      'codehost.read-pr',
      { ref, remote: entry.plan.remote },
      host,
    )
    if (result.status !== 'succeeded' || result.ref !== ref || !result.complete || !result.body)
      throw new Error('Reconciliation requires a complete read of the same PR')
    return this.record(subject, entry.event, result.body, result.ref)
  }
  private record(subject: string, plan: string, body: string, ref: string) {
    let value: unknown
    try {
      value = JSON.parse(body)
    } catch {
      throw new Error('Incomplete normalized PR JSON; contents omitted')
    }
    const pr = parsePullRequest(value)
    if (pr.url !== ref) throw new Error('PR observation reference does not match its body')
    this.engine.store.transaction((_events, append) => {
      append(subject, { type: 'pr.published', data: { plan, pr } })
      append(subject, { type: 'link.added', data: { url: pr.url } })
      const item = this.engine.store.get(subject)
      if (item.kind === 'part' && item.parent)
        append(item.parent, { type: 'link.added', data: { url: pr.url } })
    })
    this.current(subject)
    const receipt = this.engine.complete(
      'open-pr',
      subject,
      pullRequestReceipt(this.engine.store.events(), subject),
    )
    return {
      schema: 'wholeloop/pr-open@1',
      subject,
      status: 'published',
      cached: false,
      pr,
      receipt,
    }
  }
}

export function pullRequestReceipt(events: readonly StateEvent[], subject: string) {
  const entry = latest(events, subject)
  if (!entry?.pr || workspaceSnapshot(entry.plan.root).digest !== entry.plan.snapshot)
    throw new Error('PR completion requires a published matching draft and current tested code')
  const started = events.findLastIndex(
    (event) =>
      event.subject === subject && event.type === 'step.started' && event.data.step === 'open-pr',
  )
  const published = events.findIndex(
    (event) =>
      event.subject === subject && event.type === 'pr.published' && event.data.plan === entry.event,
  )
  if (started < 0 || published <= started)
    throw new Error('Begin open-pr before its published draft receipt')
  return `# Draft PR receipt\n\n## Pull request\n\n${entry.pr.url}\nHead: ${entry.plan.branch} (${entry.plan.head}); target: ${entry.plan.base}.\n\n## Human testing\n\nEvidence: ${entry.tested}; approved plan: ${entry.event}.\n\n## Links\n\nWork item: ${subject}. Tracker and sibling references are carried in the PR body; unavailable remote tracker writes remain pending.\n\n## Environment\n\nWorkspace: ${entry.plan.root}. Retained for inspection; stop its lease and use conservative worktree prune after merge. ${environmentReceipt(events, subject)} No server shutdown or data rollback is implied.\n\n## Next\n\nHuman review and merge. This workflow never marks ready, requests reviewers or merges.\n`
}
