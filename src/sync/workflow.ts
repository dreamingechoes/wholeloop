// `wl sync`: reconciles published merges with slice delivery and closes items only after proving
// each closure.
import { BuildWorkflow } from '../build/workflow.js'
import { loadExtensionOptions } from '../config/load.js'
import { isObject } from '../config/schema.js'
import type { FlowEngine } from '../flow/engine.js'
import { measurementDigest } from '../launch/measurement.js'
import { loadProviders, resolveProvider } from '../providers/load.js'
import { safeEvidenceReference } from '../providers/numeric.js'
import { type ProviderHost, performOperation } from '../providers/operations.js'
import { parsePullRequest } from '../pull-requests/codehost.js'
import { type PullRequestPlan, pullRequestPlans } from '../pull-requests/contracts.js'
import { WorktreeManager } from '../worktrees/manager.js'
import {
  syncBasis,
  syncClosed,
  syncProofs,
  syncReady,
  syncState,
  type TrackerTransition,
} from './contracts.js'

export interface SyncHosts {
  codehost(plan: PullRequestPlan, context: { subject: string; event: string }): ProviderHost
  tracker?: ProviderHost
  origin?: 'host' | 'import'
}
export class SyncWorkflow {
  constructor(readonly engine: FlowEngine) {}
  async run(
    hosts: SyncHosts,
    options: {
      subject?: string
      targets?: Record<string, TrackerTransition>
      prune?: boolean
    } = {},
  ) {
    const before = this.engine.store.events().length
    const registry = loadProviders(
      loadExtensionOptions({ root: this.engine.root, userFile: this.engine.userFile }),
    )
    if (registry.problems.length) throw new Error('Resolve provider registry problems before sync')
    const items = this.engine.store.list()
    const selected = new Set(
      options.subject ? [this.engine.store.get(options.subject).id] : items.map((item) => item.id),
    )
    let previous = -1
    while (previous !== selected.size) {
      previous = selected.size
      for (const item of items) if (item.parent && selected.has(item.parent)) selected.add(item.id)
    }
    const observations: { subject: string; status: string; reason?: string }[] = []
    const latest = new Map(
      pullRequestPlans(this.engine.store.events()).map((plan) => [plan.subject, plan]),
    )
    for (const [subject, entry] of latest) {
      if (
        !selected.has(subject) ||
        !entry.pr ||
        !['slice', 'part'].includes(this.engine.store.get(subject).kind)
      )
        continue
      const currentSync = syncState(this.engine.store.events())
      if (currentSync.merged.has(subject)) continue
      if (currentSync.invalidatedPlans.has(entry.event)) {
        observations.push({
          subject,
          status: 'reopened',
          reason: 'Publish a newly tested PR plan before closing explicitly reopened work',
        })
        continue
      }
      try {
        const itemEngine = new BuildWorkflow(this.engine).engineFor(subject)
        const itemRegistry = loadProviders(
          loadExtensionOptions({ root: itemEngine.root, userFile: itemEngine.userFile }),
        )
        if (itemRegistry.problems.length) throw new Error('Resolve item provider problems')
        const provider = resolveProvider(itemRegistry, 'codehost.pr-status', entry.plan.provider)
        const read = await performOperation(
          provider,
          'codehost.pr-status',
          { ref: entry.pr.url, remote: entry.plan.remote },
          hosts.codehost(entry.plan, { subject, event: entry.event }),
        )
        if (
          read.status !== 'succeeded' ||
          !read.complete ||
          read.ref !== entry.pr.url ||
          !read.body
        )
          throw new Error('No complete PR observation')
        const pr = parsePullRequest(JSON.parse(read.body))
        if (
          ['url', 'repository', 'head', 'base', 'sha'].some(
            (key) => pr[key as keyof typeof pr] !== entry.pr?.[key as keyof typeof pr],
          )
        )
          throw new Error('PR identity changed')
        if (!pr.merged || pr.state !== 'merged') {
          observations.push({ subject, status: 'not-merged' })
          continue
        }
        this.engine.store.transaction((events, append) => {
          if (!syncState(events).merged.has(subject))
            append(subject, {
              type: 'sync.merged',
              data: { plan: entry.event, pr, origin: hosts.origin ?? 'host' },
            })
        })
        observations.push({ subject, status: 'merged' })
      } catch {
        observations.push({
          subject,
          status: 'unknown',
          reason:
            'No complete matching merged PR was observed; inspect access, normalization and source identity',
        })
      }
    }
    this.engine.store.transaction((events, append) => {
      // Parts precede slices; each closure is proven before the generic item status changes.
      for (const kind of ['part', 'slice'])
        for (const item of items.filter((item) => selected.has(item.id) && item.kind === kind)) {
          const state = syncState(events)
          const proofs = syncProofs(state, item.id)
          if (proofs && !syncClosed(state, item.id)) {
            append(item.id, { type: 'sync.closed', data: { proofs } })
            append(item.id, { type: 'item.closed', data: {} })
          }
        }
      for (const item of items.filter((item) => selected.has(item.id) && item.kind === 'scope')) {
        const state = syncState(events)
        const slices = [...state.items]
          .filter(([, child]) => child.kind === 'slice' && child.parent === item.id)
          .map(([id]) => id)
          .sort()
        if (
          slices.length &&
          !syncReady(state, item.id) &&
          slices.every((id) => syncClosed(state, id))
        )
          append(item.id, {
            type: 'sync.delivery-ready',
            data: { slices, proofs: slices.flatMap((id) => syncProofs(state, id) ?? []).sort() },
          })
      }
    })
    const tracker = []
    for (const [subject, target] of Object.entries(options.targets ?? {})) {
      if (!selected.has(subject))
        throw new Error('Tracker target is outside the selected sync subtree')
      if (!hosts.tracker) {
        tracker.push({
          subject,
          status: 'handoff',
          reason: 'An explicit tracker host is required; no remote transition was attempted',
        })
        continue
      }
      tracker.push(await this.transition(subject, target, hosts.tracker))
    }
    const cleanup = []
    if (options.prune !== false)
      for (const [subject] of syncState(this.engine.store.events()).merged) {
        if (!selected.has(subject)) continue
        const manager = new WorktreeManager(this.engine)
        const allocation = manager.list().find((entry) => entry.subject === subject)
        if (!allocation || allocation.status === 'pruned') continue
        // Active leases remain owned by the worker/person; sync never stops a possibly live process.
        if (allocation.status !== 'stopped') {
          cleanup.push({
            subject,
            action: 'retained',
            reason: 'Stop the active lease explicitly before scheduled cleanup',
          })
          continue
        }
        cleanup.push(...manager.prune(subject).actions)
      }
    const state = syncState(this.engine.store.events())
    return {
      schema: 'wholeloop/sync@1',
      changed: this.engine.store.events().length !== before,
      observations,
      tracker,
      cleanup,
      items: items
        .filter((item) => selected.has(item.id))
        .map((item) => ({
          id: item.id,
          closedBySync: syncClosed(state, item.id),
          deliveryReady: syncReady(state, item.id),
        })),
      handoff:
        'Scope delivery readiness does not close the learning outcome; continue prepare-launch, then decide-next. Unbound remote tracker references remain explicit handoffs.',
    }
  }
  async transition(subject: string, target: TrackerTransition, host: ProviderHost) {
    if (!target.provider.trim() || !target.state.trim() || !safeEvidenceReference(target.ref))
      throw new Error('Confirm a non-secret tracker provider/reference and exact target state')
    const state = syncState(this.engine.store.events())
    const basis = syncBasis(state, subject)
    if (!basis)
      return {
        subject,
        status: 'blocked',
        reason: 'No certified merge/complete delivery authorizes this tracker transition',
      }
    const key = measurementDigest({ subject, basis, target })
    const existing = state.transitions.get(key)
    const itemEngine = new BuildWorkflow(this.engine).engineFor(subject)
    const registry = loadProviders(
      loadExtensionOptions({ root: itemEngine.root, userFile: itemEngine.userFile }),
    )
    if (registry.problems.length) throw new Error('Resolve tracker provider problems')
    const provider = resolveProvider(registry, 'tracker.transition', target.provider)
    const read = async () => {
      const result = await performOperation(
        provider,
        'tracker.read-item',
        { ref: target.ref },
        host,
      )
      const body: unknown = result.body ? JSON.parse(result.body) : undefined
      if (
        result.status !== 'succeeded' ||
        !result.complete ||
        result.ref !== target.ref ||
        !result.revision ||
        !isObject(body) ||
        body.ref !== target.ref ||
        typeof body.state !== 'string' ||
        !body.state.trim()
      )
        throw new Error('No complete revision-bound tracker state')
      return { state: body.state, revision: result.revision }
    }
    try {
      const observed = await read()
      if (existing?.result)
        return observed.state === target.state
          ? { subject, status: 'succeeded', cached: true, ref: existing.result }
          : {
              subject,
              status: 'drifted',
              cached: true,
              reason:
                'The tracker changed after its receipt; preserve the external edit and inspect it explicitly',
            }
      if (existing && observed.state !== target.state)
        return {
          subject,
          status: 'ambiguous',
          reason: 'Prior transition intent is retained; no write was repeated',
        }
      if (!existing)
        this.engine.store.transaction((_events, append) =>
          append(subject, {
            type: 'sync.transition-planned',
            data: { key, basis, target, from: observed.state, revision: observed.revision },
          }),
        )
      if (observed.state !== target.state) {
        await performOperation(
          provider,
          'tracker.transition',
          {
            ref: target.ref,
            state: target.state,
            from: observed.state,
            revision: observed.revision,
          },
          host,
        )
        if ((await read()).state !== target.state)
          throw new Error('The desired tracker state was not observed')
      }
      this.engine.store.transaction((events, append) => {
        if (!syncState(events).transitions.get(key)?.result)
          append(subject, { type: 'sync.transition-recorded', data: { key, ref: target.ref } })
      })
      return { subject, status: 'succeeded', cached: false, ref: target.ref }
    } catch {
      return {
        subject,
        status: 'unknown',
        reason:
          'Tracker read/transition is incomplete; retain any intent and reconcile before another write',
      }
    }
  }
}
