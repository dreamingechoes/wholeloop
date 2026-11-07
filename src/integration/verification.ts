// Whole-milestone verification requests, selections and reports.
import { existsSync } from 'node:fs'
import { DockerAcceptanceBoundary, sameAcceptanceInputs } from '../acceptance/boundary.js'
import type {
  AcceptanceCaseResult,
  AcceptancePlan,
  AcceptanceReport,
} from '../acceptance/contracts.js'
import { acceptanceShape } from '../acceptance/contracts.js'
import { DockerBehaviorHost } from '../acceptance/docker-behavior.js'
import { DockerRepositoryDiffHost } from '../acceptance/docker-repository-diff.js'
import type { RepositoryDiffReader } from '../acceptance/repository-diff.js'
import { requiredPrivateSensitivity } from '../acceptance/sensitivity.js'
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
  const byCriterion = new Map<string, string[]>(),
    byContract = new Map<string, string[]>(),
    procedure: string[] = [],
    selected = new Set<string>()
  for (const id of candidate.dependencies.criteria)
    if (!byCriterion.has(id)) byCriterion.set(id, [])
  for (const contract of candidate.contracts)
    if (!byContract.has(contract.sha256)) byContract.set(contract.sha256, [])
  if (byCriterion.size)
    for (const test of plan.cases) {
      if (test.applicability !== 'applicable') continue
      const criteria = test.criteria
      let relevant = false
      // includes() selected a case once per criterion even if its list repeated an id.
      for (const id of criteria.length > 1 ? new Set(criteria) : criteria) {
        const cases = byCriterion.get(id)
        if (cases) {
          cases.push(test.id)
          relevant = true
        }
      }
      if (!relevant) continue
      selected.add(test.id)
      if (test.owner !== 'machine') continue
      if (byContract.size) byContract.get(test.fixture.sha256)?.push(test.id)
      if (test.actions.includes(candidate.dependencies.procedure)) procedure.push(test.id)
    }
  const checks: { kind: 'criterion' | 'contract' | 'procedure'; id: string; cases: string[] }[] =
      [],
    missing: string[] = []
  const check = (kind: (typeof checks)[number]['kind'], id: string, cases: string[]) => {
    // Repeated declarations still produce independently mutable check arrays.
    checks.push({ kind, id, cases: [...cases] })
    if (!cases.length) missing.push(`${kind}:${id}`)
  }
  for (const id of candidate.dependencies.criteria)
    check('criterion', id, byCriterion.get(id) ?? [])
  for (const contract of candidate.contracts)
    check('contract', contract.id, byContract.get(contract.sha256) ?? [])
  check('procedure', candidate.milestone, procedure)
  return { checks, cases: [...selected].sort(), missing }
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
    readonly repositoryRead?: RepositoryDiffReader,
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
            : test.runner.kind === 'cli' && test.runner.capability === 'repository.diff'
              ? new DockerRepositoryDiffHost(
                  [this.acceptance, pinned.digest, request.environment, id, this.driver],
                  this.repositoryRead,
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
      observed = pinned.plan.cases.some(
        (test) => selection.cases.includes(test.id) && test.owner === 'human',
      )
        ? await this.acceptance.report(pinned.digest, boundary)
        : undefined
    await this.context(value)
    // Ordinary reports select the latest case. That is useful for operator
    // notes, but machine integration must retain its exact original attempt.
    const entries =
      observed?.cases ??
      pinned.plan.cases.map((test) => ({
        id: test.id,
        owner: test.owner,
        status: 'unavailable' as const,
        evidence: [] as string[],
      }))
    const originals = new Map<string, AcceptanceCaseResult>(),
      relevant: AcceptanceReport['cases'] = entries
        .filter((entry) => selection.cases.includes(entry.id))
        .map((entry) => {
          if (entry.owner === 'human') return entry
          const key = integrationVerificationKey(request, entry.id),
            files = this.acceptance.planning.sources.files
          if (
            !existsSync(
              files.path(
                `delivery/acceptance-cases/${pinned.digest}/${entry.id}/${key}/result.json`,
              ),
            )
          )
            return { ...entry, status: 'unavailable', evidence: [] }
          const original = this.acceptance.observedCase(pinned.digest, entry.id, key),
            test = pinned.plan.cases.find((test) => test.id === entry.id)
          if (!test) throw new IntegrationError('integration-original-case-missing')
          originals.set(entry.id, original)
          return {
            ...entry,
            status: !sameAcceptanceInputs(original.bindings, bindings)
              ? 'stale'
              : original.status === 'passed' &&
                  test.runner.capability === 'evaluator.private-http' &&
                  !requiredPrivateSensitivity(this.acceptance, pinned.digest, test, original)
                    .allowed
                ? 'unavailable'
                : original.status,
            evidence: [contractDigest(original)],
          }
        })
    const checks = selection.checks.map((check) => ({
      ...check,
      status: check.cases.every((id) => relevant.some((c) => c.id === id && c.status === 'passed'))
        ? 'passed'
        : 'not-established',
    }))
    const fixture =
        this.driver.provenance === 'fixture' ||
        observed?.acceptance === 'fixture-only' ||
        relevant.some(
          (c) => c.owner === 'machine' && originals.get(c.id)?.provenance === 'fixture',
        ),
      human = relevant.some((c) => c.owner === 'human')
    const established =
      checks.every((c) => c.status === 'passed') &&
      (!human || observed?.acceptance === 'operator-and-machine')
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
