import { contractDigest } from '../contracts/compatibility.js'
import { IntegrationAssembly } from '../integration/assembly.js'
import { shareReadObservation } from '../state/read-observation.js'
import { RunnerMilestoneReadiness } from './milestone-readiness.js'
import { DeliveryRunnerError } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface RunnerAssemblyReadinessResult {
  status: 'ready' | 'blocked' | 'unknown'
  assembly?: string
  candidates?: { repository: string; path: string; ref: string; head: string }[]
  evidence: string
  provenance: 'fixture' | 'host-observed'
  integrationQa: 'not-established'
  acceptance: 'not-established'
  reason: string
}

/** Join current original unit QA to the actual owned assembly, before product QA. */
export class RunnerAssemblyReadiness {
  readonly assembly: IntegrationAssembly
  constructor(
    readonly store: RunnerStore,
    readonly units: RunnerMilestoneReadiness,
  ) {
    if (!(units instanceof RunnerMilestoneReadiness) || units.store.files.root !== store.files.root)
      throw new DeliveryRunnerError('assembly-readiness-fixed-unit-reader-required')
    this.assembly = new IntegrationAssembly(store.files.root)
  }
  async inspect(
    request: Readonly<RunnerRequest>,
    milestone: string,
    assembly: string,
  ): Promise<RunnerAssemblyReadinessResult> {
    return shareReadObservation(() => this.observe(request, milestone, assembly))
  }
  private async observe(
    request: Readonly<RunnerRequest>,
    milestone: string,
    assembly: string,
  ): Promise<RunnerAssemblyReadinessResult> {
    const digest = contractDigest(request),
      proofs: unknown[] = [],
      unavailable = (
        status: 'blocked' | 'unknown',
        reason: string,
      ): RunnerAssemblyReadinessResult => ({
        status,
        evidence: contractDigest({ request: digest, milestone, assembly, proofs, reason }),
        provenance: 'fixture',
        integrationQa: 'not-established',
        acceptance: 'not-established',
        reason,
      })
    try {
      this.store.get(digest)
      const basis = this.store.basis(request),
        units = await this.units.inspect(request, milestone)
      proofs.push(units)
      if (units.status !== 'ready' || units.provenance !== 'host-observed' || !units.parts)
        return unavailable(
          units.status === 'blocked' ? 'blocked' : 'unknown',
          'assembly-current-unit-vector-unavailable',
        )
      const before = this.assembly.inspect(assembly),
        origin = before.record.assembly
      if (
        origin.request.run !== request.run ||
        origin.request.plan !== basis.digest ||
        origin.request.milestone !== milestone ||
        origin.grant !== request.grant ||
        origin.source !== basis.plan.source ||
        contractDigest(origin.request.parts) !== contractDigest(units.parts)
      )
        return unavailable('blocked', 'assembly-original-unit-vector-mismatch')
      if (before.status !== 'assembled')
        return unavailable(
          before.status === 'unknown' ? 'unknown' : 'blocked',
          'assembly-owned-candidate-unavailable',
        )
      // The assembled precondition already requires every original effect to
      // be applied. Recovery here only repeated the same complete inspection.
      const reopened = await this.units.inspect(request, milestone),
        current = this.assembly.inspect(assembly),
        ids = current.repositories.flatMap((repository) => repository.effects),
        effects = this.assembly.effects
          .inspect(request.run)
          .filter((effect) => ids.includes(effect.intent.id))
      proofs.push({ before, reopened, current, effects })
      if (
        contractDigest(units) !== contractDigest(reopened) ||
        contractDigest(before) !== contractDigest(current) ||
        this.store.basis(request).digest !== basis.digest
      )
        return unavailable('unknown', 'assembly-or-unit-qa-changed-during-inspection')
      if (
        current.status !== 'assembled' ||
        !effects.length ||
        effects.length !== ids.length ||
        effects.some(
          (effect) =>
            effect.status !== 'applied' ||
            effect.admission?.provenance !== 'host-observed' ||
            effect.observations.at(-1)?.provenance !== 'host-observed' ||
            effect.observations.at(-1)?.invocationState !== 'stopped',
        )
      )
        return unavailable('unknown', 'assembly-original-effects-not-closed')
      const candidates = current.repositories.map((repository) => {
        if (!repository.head) throw new DeliveryRunnerError('assembly-current-head-required')
        return {
          repository: repository.repository,
          path: repository.path,
          ref: repository.ref,
          head: repository.head,
        }
      })
      return {
        status: 'ready',
        assembly,
        candidates,
        evidence: contractDigest({
          request: digest,
          milestone,
          basis: basis.digest,
          proofs,
          candidates,
        }),
        provenance: 'host-observed',
        integrationQa: 'not-established',
        acceptance: 'not-established',
        reason:
          'The exact current unit QA vector is assembled through closed owned Git effects; whole-product QA remains required.',
      }
    } catch {
      return unavailable('unknown', 'assembly-original-qa-evidence-unavailable')
    }
  }
}
