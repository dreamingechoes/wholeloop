import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { readSourceFile } from '../delivery/input.js'
import { integrationScope } from '../integration/contracts.js'
import { IntegrationCandidates } from '../integration/store.js'
import type { IntegrationVerificationRequest } from '../integration/verification.js'
import { observedIntegrationVerification } from '../integration/verification-observation.js'
import { RunnerEnvironmentScope } from './environment-scope.js'
import { RunnerIntegrationStages } from './integration-stages.js'
import { DeliveryRunnerError, runnerRoute } from './route.js'
import type { RunnerRequest, RunnerStore } from './store.js'

export interface RunnerFeatureReadinessResult {
  status: 'ready' | 'blocked' | 'unknown'
  milestone?: string
  candidate?: string
  assembly?: string
  acceptancePlan?: string
  report?: string
  evidence: string
  provenance: 'fixture' | 'host-observed'
  acceptance: 'not-established'
  reason: string
}

/** Passing milestones do not establish a feature until one tested assembly covers all work. */
export class RunnerFeatureReadiness {
  constructor(
    readonly store: RunnerStore,
    readonly integration: RunnerIntegrationStages,
  ) {
    if (
      !(integration instanceof RunnerIntegrationStages) ||
      integration.store.files.root !== store.files.root
    )
      throw new DeliveryRunnerError('feature-readiness-fixed-integration-required')
  }
  private snapshot(request: Readonly<RunnerRequest>, milestone: string) {
    const digest = contractDigest(request),
      basis = this.store.basis(request),
      record = this.store.stage(digest, `integration:${milestone}`)
    if (!record || record.basis !== basis.digest || record.status !== 'passed')
      throw new DeliveryRunnerError('feature-original-integration-not-complete')
    const base = `delivery/runner-integrations/${record.invocation}`,
      binding = JSON.parse(
        readSourceFile(this.store.files.root, `${base}/binding.json`, 65536),
      ) as {
        request: string
        plan: string
        stage: string
        invocation: string
        selection: IntegrationVerificationRequest
      },
      locator = JSON.parse(readSourceFile(this.store.files.root, `${base}/report.json`, 1024)) as {
        artifact: string
      }
    if (
      binding.request !== digest ||
      binding.plan !== basis.digest ||
      binding.stage !== record.id ||
      binding.invocation !== record.invocation ||
      readSourceFile(this.store.files.root, `${base}/consumed`, 128).trim() !==
        contractDigest(binding) ||
      Object.keys(locator).join(',') !== 'artifact'
    )
      throw new DeliveryRunnerError('feature-original-product-binding')
    const product = observedIntegrationVerification(
        this.store.files.root,
        binding.selection,
        locator.artifact,
      ),
      candidate = new IntegrationCandidates(this.store.files.root).inspect(
        binding.selection.candidate,
      ),
      assembly = this.integration.readiness.assembly.inspect(binding.selection.assembly),
      ids = assembly.repositories.flatMap((repository) => repository.effects),
      effects = this.integration.readiness.assembly.effects
        .inspect(request.run)
        .filter((effect) => ids.includes(effect.intent.id)),
      native = new RunnerEnvironmentScope(this.store, record.invocation).inspect(),
      scope = integrationScope(basis.plan, milestone),
      units = scope.units.map((unit) => ({
        unit: unit.id,
        records: ['verification', 'review'].map((kind) =>
          this.store.stage(digest, `${kind}:${unit.id}`),
        ),
      }))
    if (
      product.report.status !== 'passed' ||
      candidate.status !== 'current' ||
      candidate.candidate.milestone !== milestone ||
      assembly.status !== 'assembled' ||
      !ids.length ||
      effects.length !== ids.length ||
      effects.some(
        (effect) =>
          effect.status !== 'applied' ||
          effect.admission?.provenance !== 'host-observed' ||
          effect.observations.at(-1)?.provenance !== 'host-observed' ||
          effect.observations.at(-1)?.invocationState !== 'stopped',
      ) ||
      native.invocationState !== 'stopped' ||
      native.provenance !== 'host-observed'
    )
      throw new DeliveryRunnerError('feature-original-product-unavailable')
    return {
      record,
      binding,
      locator,
      product,
      scope,
      snapshot: contractDigest({
        record,
        binding,
        locator,
        product: product.evidence,
        candidate,
        assembly,
        effects,
        native,
        units,
      }),
    }
  }
  async inspect(request: Readonly<RunnerRequest>): Promise<RunnerFeatureReadinessResult> {
    const digest = contractDigest(request),
      proofs: unknown[] = [],
      unavailable = (
        status: 'blocked' | 'unknown',
        reason: string,
      ): RunnerFeatureReadinessResult => ({
        status,
        reason,
        evidence: contractDigest({ request: digest, proofs, reason }),
        provenance: 'fixture',
        acceptance: 'not-established',
      })
    try {
      this.store.get(digest)
      const basis = this.store.basis(request),
        route = runnerRoute(basis.plan),
        full = basis.plan.milestones.filter((milestone) => {
          const scope = integrationScope(basis.plan, milestone.id)
          return (
            scope.milestones.length === basis.plan.milestones.length &&
            scope.units.length === basis.plan.work.length &&
            scope.criteria.length === basis.plan.criteria.length
          )
        })
      const complete = full[0]
      if (basis.plan.policy.endpoint === 'research-report' || full.length !== 1 || !complete)
        return unavailable('blocked', 'feature-one-complete-product-assembly-required')
      const originals: ReturnType<RunnerFeatureReadiness['snapshot']>[] = []
      for (const milestone of basis.plan.milestones) {
        const stage = route.find((stage) => stage.id === `integration:${milestone.id}`),
          record = this.store.stage(digest, `integration:${milestone.id}`)
        if (
          stage?.kind !== 'integration' ||
          !record ||
          record.basis !== basis.digest ||
          record.status !== 'passed'
        )
          return unavailable('blocked', 'feature-original-integration-stages-not-complete')
        const before = this.snapshot(request, milestone.id),
          observed = await this.integration.inspect(request, record),
          after = this.snapshot(request, milestone.id)
        proofs.push({ milestone: milestone.id, observed, snapshot: before.snapshot })
        if (
          observed.status !== 'passed' ||
          observed.invocationState !== 'stopped' ||
          observed.provenance !== 'host-observed' ||
          before.snapshot !== after.snapshot
        )
          return unavailable('unknown', 'feature-original-product-proof-unavailable')
        originals.push(before)
      }
      const selected = originals.find((entry) => entry.record.id === `integration:${complete.id}`)
      if (!selected) return unavailable('unknown', 'feature-complete-product-proof-required')
      // Each original procedure must also map to an actually passed case in
      // the complete product report, not merely to another assembly's result.
      const pinned = new DeliveryAcceptance(this.store.files.root).get(
        selected.product.report.acceptancePlan,
      )
      if (
        basis.plan.milestones.some(
          (milestone) =>
            !pinned.plan.cases.some(
              (test) =>
                test.owner === 'machine' &&
                test.actions.includes(milestone.procedure) &&
                selected.product.report.cases.some(
                  (entry) => entry.id === test.id && entry.status === 'passed',
                ),
            ),
        )
      )
        return unavailable('blocked', 'feature-complete-product-procedure-coverage-required')
      if (
        originals.some(
          (entry) => entry.product.report.acceptancePlan !== selected.product.report.acceptancePlan,
        )
      )
        return unavailable('blocked', 'feature-one-pre-builder-acceptance-plan-required')
      for (const original of originals)
        if (
          this.snapshot(request, original.record.id.slice('integration:'.length)).snapshot !==
          original.snapshot
        )
          return unavailable('unknown', 'feature-product-vector-changed-during-inspection')
      if (this.store.basis(request).digest !== basis.digest)
        return unavailable('unknown', 'feature-plan-changed-during-inspection')
      return {
        status: 'ready',
        milestone: complete.id,
        candidate: selected.binding.selection.candidate,
        assembly: selected.binding.selection.assembly,
        acceptancePlan: selected.product.report.acceptancePlan,
        report: selected.locator.artifact,
        evidence: contractDigest({
          request: digest,
          basis: basis.digest,
          proofs,
          selected: selected.snapshot,
        }),
        provenance: 'host-observed',
        acceptance: 'not-established',
        reason:
          'Complete current integration QA covers one exact whole-product assembly; feature acceptance remains required.',
      }
    } catch {
      return unavailable('unknown', 'feature-original-product-evidence-unavailable')
    }
  }
}
