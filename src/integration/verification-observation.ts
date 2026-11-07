// Recovers recorded integration verification observations without querying Docker or worktrees.
import { existsSync } from 'node:fs'
import { sameAcceptanceInputs } from '../acceptance/boundary.js'
import { observedDockerAcceptanceCase } from '../acceptance/case-observation.js'
import { acceptanceShape } from '../acceptance/contracts.js'
import { requiredPrivateSensitivity } from '../acceptance/sensitivity.js'
import { DeliveryAcceptance } from '../acceptance/store.js'
import { contractDigest } from '../contracts/compatibility.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { IntegrationAssembly } from './assembly.js'
import { IntegrationError } from './contracts.js'
import { IntegrationCandidates } from './store.js'
import {
  INTEGRATION_VERIFICATION_REPORT_SCHEMA,
  INTEGRATION_VERIFICATION_SCHEMA,
  type IntegrationVerification,
  type IntegrationVerificationRequest,
  integrationVerificationKey,
  integrationVerificationSelection,
} from './verification.js'

type OriginalReport = Omit<Awaited<ReturnType<IntegrationVerification['report']>>, 'artifact'>

/** Recover original machine observations, including failures, without querying Docker or current worktrees. */
export function observedIntegrationVerification(
  store: string,
  value: IntegrationVerificationRequest,
  artifact: string,
) {
  acceptanceShape(value, INTEGRATION_VERIFICATION_SCHEMA)
  const candidate = new IntegrationCandidates(store).get(value.candidate).candidate,
    assembly = new IntegrationAssembly(store).get(value.assembly).assembly,
    acceptance = new DeliveryAcceptance(store),
    retained = acceptance.artifacts.read(candidate.run, artifact)
  if (retained.artifact.mediaType !== 'application/json')
    throw new IntegrationError('integration-original-report-artifact-required')
  const report = JSON.parse(
    acceptance.artifacts.bytes(candidate.run, artifact).toString('utf8'),
  ) as OriginalReport
  acceptanceShape(report, INTEGRATION_VERIFICATION_REPORT_SCHEMA)
  const input = candidate.inputs.find((input) => input.kind === 'acceptance'),
    pinned = acceptance.get(input?.ref ?? ''),
    selection = integrationVerificationSelection(candidate, pinned.plan),
    resources = new EnvironmentResources(acceptance.planning.sources.files),
    runtime = resources.snapshot(value.environment, report.bindings.runtime),
    environment = runtime.record,
    vector = candidate.assemblies.map(({ repository, head, snapshot }) => ({
      repository,
      head,
      snapshot,
    })),
    sorted = (items: typeof vector) =>
      items
        .map(({ repository, head, snapshot }) => ({ repository, head, snapshot }))
        .sort((a, b) => a.repository.localeCompare(b.repository)),
    tests = pinned.plan.cases.filter((test) => selection.cases.includes(test.id))
  if (
    'artifact' in report ||
    report.candidate !== value.candidate ||
    report.assembly !== value.assembly ||
    report.environment !== value.environment ||
    report.run !== candidate.run ||
    report.milestone !== candidate.milestone ||
    report.acceptancePlan !== pinned.digest ||
    !Number.isFinite(Date.parse(report.at)) ||
    new Date(report.at).toISOString() !== report.at ||
    pinned.plan.run !== candidate.run ||
    pinned.plan.plan !== candidate.plan ||
    assembly.request.run !== candidate.run ||
    assembly.request.plan !== candidate.plan ||
    assembly.request.milestone !== candidate.milestone ||
    assembly.source !== candidate.source ||
    contractDigest(assembly.parts) !== contractDigest(candidate.parts) ||
    contractDigest(
      assembly.repositories.map(({ repository, path, branch, base }) => ({
        repository,
        path,
        ref: `refs/heads/${branch}`,
        base,
      })),
    ) !==
      contractDigest(
        candidate.assemblies.map(({ repository, path, ref, base }) => ({
          repository,
          path,
          ref,
          base,
        })),
      ) ||
    selection.missing.length ||
    !tests.length ||
    tests.some((test) => test.owner !== 'machine') ||
    report.bindings.environment !== environment.id ||
    report.bindings.recipe !== environment.recipe ||
    environment.run !== candidate.run ||
    environment.basis !== candidate.plan ||
    environment.grant !== assembly.grant ||
    environment.grantDigest !== assembly.grantDigest ||
    environment.provenance !== 'host-observed' ||
    environment.state !== 'ready' ||
    !candidate.inputs.some(
      (input) => input.kind === 'recipe' && input.ref === environment.recipe,
    ) ||
    contractDigest(sorted(vector)) !== contractDigest(sorted(report.bindings.candidates)) ||
    contractDigest(sorted(vector)) !== contractDigest(sorted(environment.candidates))
  )
    throw new IntegrationError('integration-original-report-binding')
  const originals: ReturnType<typeof observedDockerAcceptanceCase>[] = []
  let failed = false
  for (const id of selection.cases) {
    const entry = report.cases.find((entry) => entry.id === id)
    if (!entry) throw new IntegrationError('integration-original-case-missing')
    if (failed) {
      // The fixed executor stops at the first failure; later results cannot be
      // borrowed from a different attempt, even when their bindings match.
      if (
        entry.status !== 'unavailable' ||
        entry.evidence.length ||
        existsSync(
          acceptance.planning.sources.files.path(
            `delivery/acceptance-cases/${pinned.digest}/${id}/${integrationVerificationKey(value, id)}/intent.json`,
          ),
        )
      )
        throw new IntegrationError('integration-original-case-prefix')
      continue
    }
    const original = observedDockerAcceptanceCase(
      acceptance,
      pinned.digest,
      id,
      integrationVerificationKey(value, id),
    )
    if (
      original.result.provenance !== 'host-observed' ||
      !sameAcceptanceInputs(original.result.bindings, report.bindings) ||
      resources.snapshot(value.environment, original.result.bindings.runtime).sequence >
        runtime.sequence ||
      entry.status !== original.result.status ||
      contractDigest(entry.evidence) !== contractDigest([contractDigest(original.result)])
    )
      throw new IntegrationError('integration-original-case-binding')
    const test = tests.find((test) => test.id === id)
    if (
      test?.runner.capability === 'evaluator.private-http' &&
      original.result.status === 'passed' &&
      !requiredPrivateSensitivity(acceptance, pinned.digest, test, original.result).allowed
    )
      throw new IntegrationError('integration-original-private-sensitivity-required')
    originals.push(original)
    failed = original.result.status === 'failed'
  }
  const cases = tests.map((test) => {
      const original = originals.find((original) => original.result.case === test.id)
      return {
        id: test.id,
        owner: test.owner,
        status: original?.result.status ?? 'unavailable',
        evidence: original ? [contractDigest(original.result)] : [],
      }
    }),
    checks = selection.checks.map((check) => ({
      ...check,
      status: check.cases.every((id) =>
        cases.some((entry) => entry.id === id && entry.status === 'passed'),
      )
        ? 'passed'
        : 'not-established',
    })),
    status = failed ? 'failed' : 'passed',
    repairs = candidate.repairOwners.flatMap((owner) => {
      const matching = cases
        .filter(
          (entry) =>
            entry.status === 'failed' &&
            tests.some((test) => test.id === entry.id && test.criteria.includes(owner.criterion)),
        )
        .map((entry) => entry.id)
      return matching.length
        ? [
            {
              kind: owner.kind,
              id: owner.id,
              criteria: [owner.criterion],
              cases: matching,
              basis: value.candidate,
            },
          ]
        : []
    })
  if (
    contractDigest(cases) !== contractDigest(report.cases) ||
    contractDigest(checks) !== contractDigest(report.checks) ||
    contractDigest(repairs) !== contractDigest(report.repairs) ||
    report.status !== status ||
    report.acceptance !== (failed ? 'not-established' : 'delegated-machine')
  )
    throw new IntegrationError('integration-original-report-observation-mismatch')
  return {
    report,
    artifact,
    cases: originals,
    evidence: contractDigest({
      artifact,
      report,
      cases: originals.map((original) => original.evidence),
    }),
    nativeOwnership: 'not-established' as const,
    currentAcceptance: 'not-established' as const,
  }
}
