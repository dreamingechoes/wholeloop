import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import { lintCriteria, parseCriteria } from '../definition/criteria.js'
import { resolveSlot } from '../discovery/resolve.js'
import { discover } from '../discovery/tree.js'
import { FlowEngine } from '../flow/engine.js'
import { decisionTrail } from '../flow/plan.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { gateRuns } from '../gates/state.js'
import type { Profile } from '../profile/presets.js'
import { renderProfile } from '../profile/render.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { type ProviderHost, performOperation } from '../providers/operations.js'
import { blockingDependencies, buildChildren, buildReady } from '../slices/routing.js'
import { ITEM_ID, itemId } from '../state/events.js'
import { canonicalPath, inside } from '../state/paths.js'
import { worktreeRecords } from '../worktrees/contracts.js'
import { git } from '../worktrees/git.js'
import { WorktreeManager } from '../worktrees/manager.js'
import {
  assertBuildGreen,
  type BuildAgreement,
  type BuilderPlan,
  buildCriteria,
  latestBuilderPlan,
  validateBuilderPlan,
} from './contracts.js'

export interface BuildGuidance {
  slot: string
  ref: string
  origin: string
  content: string
  digest: string
}
export class BuildWorkflow {
  constructor(readonly engine: FlowEngine) {}

  engineFor(subject: string) {
    const item = this.engine.store.get(subject)
    const definition = [...this.engine.store.events()]
      .reverse()
      .find((entry) => entry.subject === subject && entry.type === 'slice.defined')
    const root =
      item.repository ??
      (definition?.type === 'slice.defined' ? definition.data.repositories[0]?.path : undefined) ??
      this.engine.root
    return new FlowEngine(this.engine.store, root, this.engine.userFile, this.engine.home)
  }

  route(input?: string) {
    if (!input)
      return {
        schema: 'wholeloop/build-route@1',
        kind: 'question',
        candidates: [],
        questions: [
          { id: 'work', prompt: 'Which scope, slice, issue URL or change should be built?' },
        ],
      }
    if (!ITEM_ID.test(input))
      return {
        schema: 'wholeloop/build-route@1',
        kind: /^https?:\/\//i.test(input) ? 'issue' : 'sentence',
        input,
        candidates: [],
        questions: [
          {
            id: 'criteria',
            prompt:
              'Confirm observable acceptance criteria and their falsifying tests before creating ad-hoc work.',
          },
        ],
      }
    const item = this.engine.store.get(input)
    if (item.status === 'closed' || !['scope', 'slice', 'part'].includes(item.kind))
      throw new Error('Choose an open scope, slice or repository part')
    const events = this.engine.store.events()
    const candidates: string[] = []
    const blocked: { id: string; by: string[] }[] = []
    const visit = (id: string) => {
      if (buildReady(events, id)) return
      const blockers = blockingDependencies(events, id)
      if (blockers.length) {
        blocked.push({ id, by: blockers })
        return
      }
      const children = buildChildren(events, id)
      if (children) for (const child of children) visit(child.id)
      else candidates.push(id)
    }
    visit(input)
    return {
      schema: 'wholeloop/build-route@1',
      kind: item.kind,
      input,
      candidates,
      blocked,
      questions: [],
    }
  }

  async readIssue(ref: string, host: ProviderHost) {
    const url = new URL(ref)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Use a credential-free HTTPS issue URL')
    const config = this.engine.config()
    const registry = loadProviders(
      loadExtensionOptions({ root: this.engine.root, userFile: this.engine.userFile }),
    )
    if (registry.problems.length)
      throw new Error('Resolve provider problems before reading an issue')
    const configured =
      isObject(config.providers) && typeof config.providers.tracker === 'string'
        ? config.providers.tracker
        : undefined
    if (!configured || configured === 'local-tracker')
      throw new Error('Select the tracker provider explicitly before adopting an issue')
    const result = await performOperation(
      resolveProvider(registry, 'tracker.read-item', configured),
      'tracker.read-item',
      { ref },
      host,
    )
    if (
      result.status !== 'succeeded' ||
      result.ref !== ref ||
      result.complete !== true ||
      !result.body?.trim() ||
      !result.revision?.trim()
    )
      throw new Error(
        'Issue adoption needs a complete same-reference read with a revision; pending data cannot become criteria',
      )
    return { body: result.body, source: { kind: 'issue' as const, ref, revision: result.revision } }
  }

  agree(input: string, owner: string, agreement: BuildAgreement) {
    parseCriteria({ schema: 'wholeloop/criteria@1', criteria: agreement.criteria })
    if (
      !input.trim() ||
      !owner.trim() ||
      !agreement.by.trim() ||
      lintCriteria(agreement.criteria).length
    )
      throw new Error('Ad-hoc work needs an owner and explicitly agreed testable criteria')
    if (agreement.source.kind === 'issue') {
      const url = new URL(agreement.source.ref)
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !agreement.source.revision?.trim()
      )
        throw new Error(
          'Issue agreement needs a credential-free HTTPS reference and pinned revision',
        )
    }
    return this.engine.store.transaction((_events, append) => {
      const id = itemId('slice')
      append(id, {
        type: 'item.created',
        data: {
          kind: 'slice',
          title: input,
          owner,
          body: input,
          repository: canonicalPath(this.engine.root),
        },
      })
      append(id, { type: 'build.agreed', data: agreement })
      return { schema: 'wholeloop/build-agree@1', subject: id, criteria: agreement.criteria }
    })
  }

  preflight(subject: string) {
    const engine = this.engineFor(subject)
    const item = this.engine.store.get(subject)
    if (!['slice', 'part'].includes(item.kind))
      throw new Error('Preflight needs an individual slice or repository part')
    const criteria = buildCriteria(this.engine.store.events(), subject)
    const events = this.engine.store.events()
    const source = item.kind === 'part' ? item.parent : subject
    const definition = [...events]
      .reverse()
      .find((entry) => entry.subject === source && entry.type === 'slice.defined')

    const config = engine.config()
    const inventory = discover(engine.root, this.engine.store.files, engine.home)
    const configured = isObject(config.slots) ? config.slots : {}
    const slots = [
      ...new Set([
        'build.backend',
        'build.frontend',
        'build.mobile',
        'build.infra',
        'build.data',
        'build.design-system',
        'commit.convention',
        'verify.suite',
        'review.rubric',
        ...Object.keys(configured).filter((slot) => slot.startsWith('build.')),
        ...inventory.repo.assets.flatMap((asset) =>
          asset.slots.filter((slot) => slot.startsWith('build.')),
        ),
      ]),
    ].sort()
    const bindings = slots.map((slot) =>
      resolveSlot(slot, inventory.repo, {
        user: inventory.user,
        ...(typeof configured[slot] === 'string' ? { binding: configured[slot] } : {}),
      }),
    )
    const questions = bindings.flatMap((binding) => binding.questions)
    const guidance: BuildGuidance[] = []
    for (const binding of bindings) {
      const selected = binding.selected
      if (!selected || selected.origin === 'harness') continue
      // Commands are suite assignments, not instruction files; the suite workflow executes them.
      if (
        binding.slot === 'verify.suite' &&
        inventory.repo.commands.some((command) => command.ref === selected.ref)
      )
        continue
      const root = selected.origin === 'user' ? engine.home : engine.root
      const file = canonicalPath(isAbsolute(selected.ref) ? selected.ref : join(root, selected.ref))
      if (
        !inside(canonicalPath(root), file) ||
        !statSync(file).isFile() ||
        statSync(file).size > 1024 * 1024
      )
        throw new Error('Selected build guidance must be a readable local file under 1 MiB')
      const content = readFileSync(file, 'utf8')
      guidance.push({
        slot: binding.slot,
        ref: selected.ref,
        origin: selected.origin,
        content,
        digest: createHash('sha256').update(content).digest('hex'),
      })
    }
    return {
      schema: 'wholeloop/build-preflight@1',
      subject,
      title: item.title,
      source: item.body,
      definition: definition?.type === 'slice.defined' ? definition.data.definition : null,
      criteria,
      profile: renderProfile(config.profile as Profile),
      bindings,
      guidance,
      questions,
      gates: config.gates,
      workspace: config.build,
      stop: 'Finish with current verify and review PASS; hand back for human testing. No push or pull request.',
    }
  }

  prepare(subject: string, options: { base?: string; after?: string } = {}) {
    const preflight = this.preflight(subject)
    if (options.after) {
      const predecessor = worktreeRecords(this.engine.store.events()).find(
        (entry) => entry.subject === options.after,
      )
      if (predecessor && git(predecessor.path, ['status', '--porcelain=v1', '-z']).length)
        throw new Error(
          'Commit or preserve predecessor work explicitly before stacking; a branch cannot include its uncommitted files',
        )
    }
    if (preflight.questions.length)
      throw new Error('Resolve build skill choices before provisioning')
    const started = this.engineFor(subject).begin('build-slice', { subject })
    if (started.code !== 0 || !started.payload.run)
      throw new Error('Resolve the build-slice preconditions before provisioning')
    const workspace = new WorktreeManager(this.engineFor(subject)).create(subject, options)
    return {
      schema: 'wholeloop/build-prepare@1',
      preflight,
      run: started.payload.run,
      workspace: workspace.record,
      snapshot: workspaceSnapshot(workspace.record.path).digest,
    }
  }

  recordPlan(subject: string, plan: BuilderPlan, basis: string) {
    validateBuilderPlan(plan)
    const context = this.preflight(subject)
    if (context.questions.length) throw new Error('Resolve build skill choices before planning')
    const workspace = new WorktreeManager(this.engineFor(subject)).open(subject)
    if (workspaceSnapshot(workspace.record.path).digest !== basis)
      throw new Error(
        'Builder changed code before recording its plan; preserve and inspect the changes',
      )
    return this.engine.store.transaction((events, append) => {
      const active = [...events]
        .reverse()
        .find(
          (entry) =>
            entry.subject === subject &&
            ['step.started', 'step.completed', 'step.skipped'].includes(entry.type) &&
            'step' in entry.data &&
            entry.data.step === 'build-slice',
        )
      if (active?.type !== 'step.started')
        throw new Error('Prepare build-slice before recording its plan')
      append(subject, {
        type: 'build.planned',
        data: {
          run: active.data.run,
          plan,
          snapshot: basis,
          guidance: context.guidance.map(({ slot, ref, digest }) => ({ slot, ref, digest })),
        },
      })
      return {
        schema: 'wholeloop/build-plan@1',
        subject,
        run: active.data.run,
        pending: plan.assumptions.some((assumption) => assumption.status !== 'verified')
          ? ['approve-build-plan']
          : [],
      }
    })
  }

  ready(subject: string) {
    const events = this.engine.store.events()
    const plan = latestBuilderPlan(events, subject)
    if (plan?.type !== 'build.planned') throw new Error('Record a builder plan before code')
    const pending = decisionTrail(events, subject)
    if (pending.length)
      throw new Error(`Required decisions: ${pending.map(({ id }) => id).join(', ')}`)
    const workspace = new WorktreeManager(this.engineFor(subject)).open(subject)
    if (blockingDependencies(events, subject).length)
      throw new Error('Build dependencies are not ready')
    return { plan: plan.data.plan, workspace: workspace.record, context: this.preflight(subject) }
  }

  complete(subject: string) {
    const events = this.engine.store.events()
    const workspace = worktreeRecords(events).find((record) => record.subject === subject)
    if (!workspace) throw new Error('No build workspace')
    return this.engine.complete(
      'build-slice',
      subject,
      buildReceipt(events, subject, workspace.path),
    )
  }
}

export function buildReceipt(
  events: Parameters<typeof gateRuns>[0],
  subject: string,
  root: string,
) {
  assertBuildGreen(events, subject, root)
  const plan = latestBuilderPlan(events, subject)
  const runs = gateRuns(events).filter((run) => run.subject === subject)
  const gate = (kind: string) => {
    const run = runs.filter((run) => run.gate === kind).at(-1)
    return `${kind}: PASS (${run?.run}, round ${run?.rounds.length}/${run?.budget})`
  }
  return `# Build receipt\n\n## Plan\n\n${plan?.type === 'build.planned' ? plan.data.plan.steps.map((step) => `- ${step}`).join('\n') : ''}\n\n## Criteria\n\n${buildCriteria(
    events,
    subject,
  )
    .map((criterion) => `- ${criterion.id}: ${criterion.text}`)
    .join(
      '\n',
    )}\n\n## Verification\n\n${gate('verify')}\n\n## Review\n\n${gate('review')}\n\n## Workspace\n\n${root}\nSnapshot: ${workspaceSnapshot(root).digest}\n\n## Environment\n\nExternal writes require declared undo steps. Human testing is still pending. No push or pull request was performed by this workflow.\n`
}
