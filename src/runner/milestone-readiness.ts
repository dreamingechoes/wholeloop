import { contractDigest } from '../contracts/compatibility.js'
import { type IntegrationPart, integrationScope } from '../integration/contracts.js'
import { shareReadObservation } from '../state/read-observation.js'
import { RunnerGitStages } from './git-stages.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'
import { RunnerUnitReadiness } from './unit-readiness.js'

export interface RunnerMilestoneReadinessResult {
  status: 'ready' | 'blocked' | 'unknown'
  parts?: IntegrationPart[]
  evidence: string
  provenance: 'fixture' | 'host-observed'
  integrationQa: 'not-established'
  acceptance: 'not-established'
  reason: string
}

/** Unit QA supplies an assembly input vector, never whole-product acceptance. */
export class RunnerMilestoneReadiness {
  private readonly readers: ReadonlyMap<string, RunnerUnitReadiness>
  constructor(
    readonly store: RunnerStore,
    readers: ReadonlyMap<string, RunnerUnitReadiness>,
  ) {
    this.readers = new Map(readers)
    for (const reader of this.readers.values())
      if (!(reader instanceof RunnerUnitReadiness) || reader.store.files.root !== store.files.root)
        throw new DeliveryRunnerError('milestone-readiness-fixed-readers-required')
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    milestone: string,
  ): Promise<RunnerMilestoneReadinessResult> {
    return shareReadObservation(() => this.observe(request, milestone))
  }
  private async observe(
    request: Readonly<RunnerRequest>,
    milestone: string,
  ): Promise<RunnerMilestoneReadinessResult> {
    const digest = contractDigest(request),
      proofs: unknown[] = [],
      unavailable = (
        status: 'blocked' | 'unknown',
        reason: string,
      ): RunnerMilestoneReadinessResult => ({
        status,
        evidence: contractDigest({ request: digest, milestone, proofs, reason }),
        provenance: 'fixture',
        integrationQa: 'not-established',
        acceptance: 'not-established',
        reason,
      })
    try {
      this.store.get(digest)
      const basis = this.store.basis(request),
        scope = integrationScope(basis.plan, milestone),
        git = new RunnerGitStages(this.store),
        parts: IntegrationPart[] = [],
        recheck: (() => void)[] = []
      if (!scope.units.length || scope.units.some((unit) => unit.role === 'research'))
        return unavailable('blocked', 'milestone-code-qa-scope-unavailable')
      for (const unit of scope.units) {
        const reader = this.readers.get(unit.id)
        if (!reader) return unavailable('blocked', 'milestone-unit-reader-required')
        const ready = await reader.inspect(request, unit.id)
        proofs.push({ unit: unit.id, ready })
        if (ready.status !== 'ready' || ready.provenance !== 'host-observed')
          return unavailable(
            ready.status === 'blocked' ? 'blocked' : 'unknown',
            'milestone-unit-qa-not-current',
          )
        const correction =
            reader.review.options.correction ?? reader.verification.options.correction,
          candidate = () => git.candidate(request, unit.id, correction),
          current = () => {
            const selected = candidate()
            return {
              commit: selected.receipt.digest,
              head: selected.receipt.head,
              workspace: selected.allocation.digest,
            }
          },
          records = () =>
            ['verification', 'review', 'reverification'].map((kind) =>
              this.store.stage(digest, `${kind}:${unit.id}`),
            ),
          original = contractDigest(records()),
          selected = candidate()
        if (contractDigest(current()) !== contractDigest(ready.candidate))
          return unavailable('unknown', 'milestone-unit-candidate-changed')
        recheck.push(() => {
          if (
            contractDigest(current()) !== contractDigest(ready.candidate) ||
            contractDigest(records()) !== original
          )
            throw new DeliveryRunnerError('milestone-unit-proof-changed')
        })
        parts.push({
          work: unit.id,
          repository: selected.allocation.repository.repository,
          path: selected.allocation.repository.path,
          ref: `refs/heads/${selected.allocation.repository.branch}`,
          head: selected.receipt.head,
        })
      }
      // A later unit can take time to inspect. Do not return an earlier stale
      // part merely because its own reader passed before that asynchronous gap.
      for (const check of recheck) check()
      if (this.store.basis(request).digest !== basis.digest)
        return unavailable('unknown', 'milestone-basis-changed')
      return {
        status: 'ready',
        parts,
        evidence: contractDigest({
          request: digest,
          milestone,
          basis: basis.digest,
          scope,
          proofs,
          parts,
        }),
        provenance: 'host-observed',
        integrationQa: 'not-established',
        acceptance: 'not-established',
        reason:
          'The complete required unit vector has current original QA; assembly and whole-product QA remain separate.',
      }
    } catch {
      return unavailable('unknown', 'milestone-original-unit-evidence-unavailable')
    }
  }
}
