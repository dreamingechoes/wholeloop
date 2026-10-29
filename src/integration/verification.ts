import { DockerAcceptanceBoundary } from '../acceptance/boundary.js'
import type { AcceptancePlan } from '../acceptance/contracts.js'
import { acceptanceShape } from '../acceptance/contracts.js'
import { DockerBehaviorHost } from '../acceptance/docker-behavior.js'
import { type AcceptanceExecutionControl, DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { IntegrationAssembly } from './assembly.js'
import { IntegrationError } from './contracts.js'
import type { IntegrationCandidate } from './observe.js'
import requestSchema from './schemas/verification-request-v1.json' with { type: 'json' }
import reportSchema from './schemas/verification-v1.json' with { type: 'json' }
import { IntegrationCandidates } from './store.js'

export const INTEGRATION_VERIFICATION_SCHEMA = requestSchema
export const INTEGRATION_VERIFICATION_REPORT_SCHEMA = reportSchema
export interface IntegrationVerificationRequest {
  schema: 'wholeloop/integration-verification-request@1'
  candidate: string
  assembly: string
  environment: string
}
export function integrationVerificationKey(request: IntegrationVerificationRequest, id: string) {
  return `integration-${contractDigest({ candidate: request.candidate, assembly: request.assembly, environment: request.environment, case: id }).slice(0, 40)}`
}
/** Contract/procedure mappings must already exist in the immutable pre-builder acceptance definition. */
export function integrationVerificationSelection(
  candidate: IntegrationCandidate,
  plan: AcceptancePlan,
) {
  const checks: { kind: 'criterion' | 'contract' | 'procedure'; id: string; cases: string[] }[] = []
  for (const criterion of candidate.dependencies.criteria)
    checks.push({
      kind: 'criterion',
      id: criterion,
      cases: plan.cases
        .filter((c) => c.applicability === 'applicable' && c.criteria.includes(criterion))
        .map((c) => c.id),
    })
  for (const contract of candidate.contracts)
    checks.push({
      kind: 'contract',
      id: contract.id,
      cases: plan.cases
        .filter(
          (c) =>
            c.applicability === 'applicable' &&
            c.owner === 'machine' &&
            c.fixture.sha256 === contract.sha256 &&
            c.criteria.some((id) => candidate.dependencies.criteria.includes(id)),
        )
        .map((c) => c.id),
    })
  checks.push({
    kind: 'procedure',
    id: candidate.milestone,
    cases: plan.cases
      .filter(
        (c) =>
          c.applicability === 'applicable' &&
          c.owner === 'machine' &&
          c.actions.includes(candidate.dependencies.procedure) &&
          c.criteria.some((id) => candidate.dependencies.criteria.includes(id)),
      )
      .map((c) => c.id),
  })
  return {
    checks,
    cases: [...new Set(checks.flatMap((c) => c.cases))].sort(),
    missing: checks.filter((c) => !c.cases.length).map((c) => `${c.kind}:${c.id}`),
  }
}
/** Whole-milestone evidence is observed through existing fixed hosts, never imported from workers or isolated suites. */
export class IntegrationVerification {
  readonly candidates: IntegrationCandidates
  readonly assembly: IntegrationAssembly
  readonly acceptance: DeliveryAcceptance
  constructor(
    store?: string,
    readonly driver: DockerTransport = new DockerCli(),
    control?: AcceptanceExecutionControl,
  ) {
    this.candidates = new IntegrationCandidates(store)
    this.assembly = new IntegrationAssembly(this.candidates.planning.sources.files.root)
    this.acceptance = new DeliveryAcceptance(
      this.candidates.planning.sources.files.root,
      control ? { control } : {},
    )
  }
  private async context(value: unknown) {
    acceptanceShape(value, requestSchema)
    const request = value as IntegrationVerificationRequest,
      candidate = this.candidates.inspect(request.candidate),
      assembly = this.assembly.inspect(request.assembly)
    if (
      candidate.status !== 'current' ||
      assembly.status !== 'assembled' ||
      candidate.candidate.run !== assembly.record.assembly.request.run ||
      candidate.candidate.plan !== assembly.record.assembly.request.plan ||
      candidate.candidate.milestone !== assembly.record.assembly.request.milestone
    )
      throw new IntegrationError('integration-candidate-not-current')
    const actual = assembly.repositories.map((r) => ({
        repository: r.repository,
        path: r.path,
        ref: r.ref,
        head: r.head,
      })),
      expected = candidate.candidate.assemblies.map((r) => ({
        repository: r.repository,
        path: r.path,
        ref: r.ref,
        head: r.head,
      }))
    if (
      contractDigest(actual) !== contractDigest(expected) ||
      contractDigest(candidate.candidate.parts) !== contractDigest(assembly.record.assembly.parts)
    )
      throw new IntegrationError('integration-assembly-vector')
    const acceptanceInput = candidate.candidate.inputs.find((i) => i.kind === 'acceptance')
    if (!acceptanceInput) throw new IntegrationError('missing-integrated-acceptance')
    const pinned = this.acceptance.get(acceptanceInput.ref),
      selection = integrationVerificationSelection(candidate.candidate, pinned.plan)
    if (this.acceptance.control) this.acceptance.assertCurrent(pinned.digest)
    if (selection.missing.length)
      throw new IntegrationError('integration-contract-or-procedure-coverage')
    const resources = new EnvironmentResources(this.candidates.planning.sources.files),
      environment = resources.get(request.environment).record,
      boundary = new DockerAcceptanceBoundary(resources, request.environment, this.driver),
      bindings = await boundary.observe(pinned.plan)
    if (this.acceptance.control) this.acceptance.assertCurrent(pinned.digest)
    if (
      !candidate.candidate.inputs.some(
        (i) => i.kind === 'recipe' && i.ref === environment.recipe,
      ) ||
      environment.provenance !== this.driver.provenance ||
      contractDigest(bindings.candidates) !==
        contractDigest(
          candidate.candidate.assemblies.map((r) => ({
            repository: r.repository,
            head: r.head,
            snapshot: r.snapshot,
          })),
        )
    )
      throw new IntegrationError('integration-environment-vector')
    return { request, candidate, assembly, pinned, selection, boundary, bindings }
  }
  async run(value: unknown) {
    const { request, pinned, selection, boundary } = await this.context(value)
    for (const id of selection.cases) {
      const test = pinned.plan.cases.find((c) => c.id === id)
      if (!test || test.owner === 'human') continue
      // Reobserve the whole vector before every dispatch; a repair invalidates all dependent evidence.
      await this.context(value)
      const host =
        test.runner.kind === 'browser'
          ? new (await import('../acceptance/docker-browser.js')).DockerBrowserHost(
              this.acceptance,
              pinned.digest,
              request.environment,
              id,
              this.driver,
            )
          : test.runner.capability === 'evaluator.private-http'
            ? new (await import('../acceptance/docker-private.js')).DockerPrivateHost(
                this.acceptance,
                pinned.digest,
                request.environment,
                id,
                this.driver,
              )
            : new DockerBehaviorHost(
                this.acceptance,
                pinned.digest,
                request.environment,
                id,
                this.driver,
              )
      const result = await this.acceptance.executeCase(
        pinned.digest,
        id,
        integrationVerificationKey(request, id),
        boundary,
        host,
      )
      if (result.status !== 'passed') break
    }
    return this.report(value, true)
  }
  async report(value: unknown, retain = false) {
    const { request, candidate, pinned, selection, boundary, bindings } = await this.context(value),
      observed = await this.acceptance.report(pinned.digest, boundary)
    await this.context(value)
    const checks = selection.checks.map((check) => ({
      ...check,
      status: check.cases.every((id) =>
        observed.cases.some((c) => c.id === id && c.status === 'passed'),
      )
        ? 'passed'
        : 'not-established',
    }))
    const relevant = observed.cases.filter((c) => selection.cases.includes(c.id)),
      fixture =
        this.driver.provenance === 'fixture' ||
        observed.acceptance === 'fixture-only' ||
        relevant.some(
          (c) =>
            c.owner === 'machine' &&
            this.acceptance.observedResults(pinned.digest, c.id).at(-1)?.provenance === 'fixture',
        ),
      human = relevant.some((c) => c.owner === 'human')
    const established =
      checks.every((c) => c.status === 'passed') &&
      (!human || observed.acceptance === 'operator-and-machine')
    const status = established
      ? fixture
        ? 'fixture-only'
        : 'passed'
      : relevant.some((c) => c.status === 'failed')
        ? 'failed'
        : relevant.some((c) => c.status === 'stale')
          ? 'stale'
          : relevant.some((c) => c.status === 'pending-human')
            ? 'pending-human'
            : 'unavailable'
    const repairs = candidate.candidate.repairOwners.flatMap((owner) => {
      const cases = relevant
        .filter(
          (result) =>
            result.status === 'failed' &&
            pinned.plan.cases.some(
              (test) => test.id === result.id && test.criteria.includes(owner.criterion),
            ),
        )
        .map((result) => result.id)
      return cases.length
        ? [
            {
              kind: owner.kind,
              id: owner.id,
              criteria: [owner.criterion],
              cases,
              basis: request.candidate,
            },
          ]
        : []
    })
    const report = {
      ...request,
      schema: 'wholeloop/integration-verification@1',
      run: candidate.candidate.run,
      milestone: candidate.candidate.milestone,
      acceptancePlan: pinned.digest,
      bindings,
      checks,
      cases: relevant,
      repairs,
      status,
      acceptance:
        status === 'passed'
          ? human
            ? 'operator-and-machine'
            : 'delegated-machine'
          : 'not-established',
      wholeFeature: 'not-established-by-this-receipt',
      publication: 'not-performed',
      rollback: 'not-performed',
      at: new Date().toISOString(),
    }
    acceptanceShape(report, reportSchema)
    if (retain && this.acceptance.control) this.acceptance.assertCurrent(pinned.digest)
    const artifact = retain
      ? this.acceptance.artifacts.capture(
          candidate.candidate.run,
          Buffer.from(JSON.stringify(report)),
          'application/json',
        )
      : undefined
    return { ...report, ...(artifact ? { artifact: artifact.digest } : {}) }
  }
}
