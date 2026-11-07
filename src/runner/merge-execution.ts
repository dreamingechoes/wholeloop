// Executes an eligible merge through the installed merge host.
import { contractDigest } from '../contracts/compatibility.js'
import type { EffectIntent, EffectRecord } from '../delivery/effect-events.js'
import { DeliveryEffects, type EffectHost } from '../delivery/effects.js'
import type { RecoveryRead } from '../delivery/read-retry.js'
import type { MergeEligibility, MergeMethod } from './merge-eligibility.js'
import type { RunnerPublicationTarget } from './publication-stages.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerStore } from './store.js'

export interface RunnerMergeTarget extends RunnerPublicationTarget {
  pr: string
  method: MergeMethod
}
export interface RunnerMergeRead {
  state: 'open' | 'closed' | 'merged' | 'queued'
  head: string
  mergeCommit?: string
  mergedBy?: string
}
/**
 * Installed merge host. It merges only with the expected head and never uses an
 * admin bypass, auto-merge, a force operation or a protection change.
 */
export interface RunnerMergeHost {
  readonly provenance: 'fixture' | 'host-observed'
  actor(signal: AbortSignal): Promise<string>
  read(target: Readonly<RunnerMergeTarget>, signal: AbortSignal): Promise<RunnerMergeRead>
  merge(target: Readonly<RunnerMergeTarget>, signal: AbortSignal): Promise<void>
}
/**
 * Complete current pull-request facts for eligibility (ADR-0199). A read that
 * is incomplete, paginated beyond its bound or denied is `unknown`, never an
 * empty list or a guessed boolean.
 */
export interface RunnerMergeFacts {
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  head: string
  base: string
  mergeable: boolean | 'unknown'
  files: string[] | 'unknown'
  unresolvedDiscussions: number | 'unknown'
  allowedMethods: MergeMethod[] | 'unknown'
  baseCurrent: boolean | 'unknown'
  observedAt: string
}
export interface RunnerMergeFactsHost {
  readonly provenance: 'fixture' | 'host-observed'
  facts(target: Readonly<RunnerMergeTarget>, signal: AbortSignal): Promise<RunnerMergeFacts>
}
export type RepositoryMergeOutcome =
  | 'merged'
  | 'externally-merged'
  | 'queued'
  | 'pending'
  | 'ineligible'
  | 'not-attempted'
export interface MergeExecution {
  outcome: 'merged' | 'externally-merged' | 'queued' | 'pending' | 'ineligible' | 'partial'
  repositories: { repository: string; outcome: RepositoryMergeOutcome; reasons: string[] }[]
  rollback: 'not-proposed'
}

/** One persisted intent per candidate, an expected-head merge and an exact read-back. */
export class RunnerMerger {
  readonly effects: DeliveryEffects
  constructor(
    readonly store: RunnerStore,
    readonly host: RunnerMergeHost,
  ) {
    this.effects = new DeliveryEffects(store.files.root, store.now, store.budgets.clock)
  }
  key(repository: string) {
    return `merge-${contractDigest(repository).slice(0, 16)}`
  }
  private effectHost(target: RunnerMergeTarget, eligibility: MergeEligibility): EffectHost {
    const host = this.host,
      observation = (
        intent: Readonly<EffectIntent>,
        status: 'applied' | 'not-applied' | 'unknown',
        evidence: unknown,
        revision?: string,
      ): RecoveryRead<NonNullable<EffectRecord['observations'][number]>> => ({
        available: true,
        value: {
          binding: contractDigest(intent),
          status,
          reason: 'observed',
          provenance: host.provenance,
          invocationState: status === 'unknown' ? 'unknown' : 'stopped',
          evidence: contractDigest(evidence),
          ...(status === 'applied' && revision ? { resource: { ref: intent.ref, revision } } : {}),
        },
      })
    return {
      eligible: () => ({
        allowed: eligibility.status === 'eligible',
        provenance: host.provenance,
        evidence: eligibility.evidence,
      }),
      invoke: (_intent, _invocation, signal) => host.merge(target, signal),
      observe: async (intent, _invocation, signal) => {
        try {
          const [read, actor] = await Promise.all([host.read(target, signal), host.actor(signal)])
          // Only our own merge of the exact head applies this effect; anyone else's
          // merge is observed distinctly and never claimed.
          if (read.state === 'merged' && read.head === target.head && read.mergedBy === actor)
            return observation(intent, 'applied', { read, actor }, read.mergeCommit ?? read.head)
          if (read.state === 'open' && read.head === target.head)
            return observation(intent, 'not-applied', { read, actor })
          return observation(intent, 'unknown', { read, actor })
        } catch {
          return { available: false, reason: 'unavailable-read' }
        }
      },
    }
  }
  /**
   * Merge each repository in order. Eligibility is evaluated freshly just before
   * the single issue; a refusal, race or lost response is never retried.
   */
  async merge(
    run: string,
    targets: readonly RunnerMergeTarget[],
    eligibility: (target: Readonly<RunnerMergeTarget>) => Promise<MergeEligibility>,
    signal: AbortSignal,
  ): Promise<MergeExecution> {
    const repositories: MergeExecution['repositories'] = []
    let stopped = false
    for (const target of targets) {
      if (stopped || signal.aborted) {
        repositories.push({ repository: target.repository, outcome: 'not-attempted', reasons: [] })
        continue
      }
      const before = await this.host.read(target, signal)
      if (before.state === 'merged' || before.state === 'queued') {
        // A merge or queue entry made by someone else is reported, never claimed.
        repositories.push({
          repository: target.repository,
          outcome: before.state === 'merged' ? 'externally-merged' : 'queued',
          reasons: [],
        })
        if (before.state === 'queued') stopped = true
        continue
      }
      const verdict = await eligibility(target)
      if (
        verdict.status !== 'eligible' ||
        !(Date.parse(verdict.expiresAt) > Date.parse(this.store.now()))
      ) {
        repositories.push({
          repository: target.repository,
          outcome: 'ineligible',
          reasons: verdict.status === 'eligible' ? ['eligibility-expired'] : verdict.reasons,
        })
        stopped = true
        continue
      }
      const prepared = this.effects.prepare(run, {
          key: this.key(target.repository),
          operation: 'pr.merge',
          repository: target.repository,
          ref: target.branch,
          expectedHead: target.head,
          inputDigest: contractDigest({ target, eligibility: verdict.evidence }),
        }),
        host = this.effectHost(target, verdict)
      let effect = await this.effects.execute(run, prepared.intent.id, host)
      // A lost response is resolved by reading; the merge itself is never invoked again.
      if (['pending', 'unknown'].includes(effect.status))
        effect = await this.effects.reconcile(run, prepared.intent.id, host)
      this.resume(run)
      const after = effect.status === 'applied' ? undefined : await this.host.read(target, signal)
      const outcome: RepositoryMergeOutcome =
        effect.status === 'applied'
          ? 'merged'
          : after?.state === 'merged'
            ? 'externally-merged'
            : after?.state === 'queued'
              ? 'queued'
              : effect.status === 'not-applied'
                ? 'ineligible'
                : 'pending'
      repositories.push({
        repository: target.repository,
        outcome,
        reasons: outcome === 'ineligible' ? ['server-refused-merge'] : [],
      })
      if (outcome !== 'merged' && outcome !== 'externally-merged') stopped = true
    }
    const merged = repositories.filter((entry) =>
        ['merged', 'externally-merged'].includes(entry.outcome),
      ),
      outcomes = new Set(repositories.map((entry) => entry.outcome))
    const outcome: MergeExecution['outcome'] =
      merged.length && merged.length < repositories.length
        ? 'partial'
        : outcomes.has('merged')
          ? 'merged'
          : outcomes.has('externally-merged')
            ? 'externally-merged'
            : outcomes.has('queued')
              ? 'queued'
              : outcomes.has('pending')
                ? 'pending'
                : 'ineligible'
    return { outcome, repositories, rollback: 'not-proposed' }
  }
  private resume(run: string) {
    this.store.lifecycle.journal.transaction(
      { kind: 'controller', name: 'delivery-runner-merge' },
      (view, append) => {
        const state = view().get(run)
        if (
          state?.state === 'waiting-external' &&
          !this.effects.inspect(run).some((entry) => ['pending', 'unknown'].includes(entry.status))
        )
          append(run, {
            schema: 'wholeloop/delivery-control-event@1',
            from: state.state,
            to: 'queued',
            basis: state.basis.digest,
            reason: 'The exact owned merge effect is positively observed.',
          })
      },
    )
  }
}
export function assertMergeTarget(target: Readonly<RunnerMergeTarget>) {
  if (!/^https:\/\/github\.com\/[^?#]+\/pull\/[1-9][0-9]*$/.test(target.pr))
    throw new DeliveryRunnerError('merge-target-pull-request')
}
