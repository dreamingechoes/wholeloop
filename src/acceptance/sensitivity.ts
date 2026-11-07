// Checks that private acceptance detects a known regression before its result can count.
import { contractDigest } from '../contracts/compatibility.js'
import { DeliveryEffects } from '../delivery/effects.js'
import { EnvironmentOperations } from '../environment/operations.js'
import type { AcceptanceCaseResult } from './contracts.js'
import { type AcceptanceCase, AcceptanceError, acceptanceShape } from './contracts.js'
import { relevantBaselineFailure } from './private-identity.js'
import type { PrivateAcceptancePlan } from './private-input.js'
import { PrivateAcceptance } from './private-plan.js'
import observationSchema from './schemas/private-observation-v1.json' with { type: 'json' }
import requestSchema from './schemas/sensitivity-request-v1.json' with { type: 'json' }
import schema from './schemas/sensitivity-v1.json' with { type: 'json' }
import type { DeliveryAcceptance } from './store.js'

export const SENSITIVITY_REQUEST_SCHEMA = requestSchema
export const SENSITIVITY_SCHEMA = schema
export interface SensitivityReference {
  environment: string
  key: string
}
export interface SensitivityRequest {
  schema: 'wholeloop/acceptance-sensitivity-request@1'
  plan: string
  case: string
  baseline?: SensitivityReference
  candidate: SensitivityReference
}
interface PrivateProof {
  private: {
    schema: string
    definition: string
    runner: string
    complete: boolean
    assertions: { id: string; status: string; evidence: string }[]
  }
  baseline: { status: string; evidence: string }
  executionIdentity: string
  mutation?: { status: 'observed' | 'unavailable'; reason: string }
}
function proof(
  acceptance: DeliveryAcceptance,
  digest: string,
  test: AcceptanceCase,
  reference: SensitivityReference,
) {
  const result = acceptance.observedCase(digest, test.id, reference.key)
  if (
    result.bindings.environment !== reference.environment ||
    result.provenance !== 'host-observed' ||
    result.invocationState !== 'stopped' ||
    result.host.id !== 'docker-private-http' ||
    result.host.version !== '1' ||
    result.host.capability !== 'evaluator.private-http' ||
    !result.process?.pid ||
    result.process.code !== 0
  )
    throw new AcceptanceError('sensitivity-not-observed')
  const artifact = result.artifacts[0]
  if (!artifact) throw new AcceptanceError('sensitivity-artifact-unavailable')
  const envelope = JSON.parse(
    Buffer.from(acceptance.artifacts.bytes(acceptance.get(digest).plan.run, artifact)).toString(
      'utf8',
    ),
  ) as {
    observation: PrivateProof
    execution: { container: string; controllerOperation: string; clientExit: number }
    effect: string
    provenance: string
  }
  const observed = envelope.observation
  acceptanceShape(observed.private, observationSchema)
  const manifest = new PrivateAcceptance(acceptance).forCase(digest, test)
  const completion = new EnvironmentOperations(
    acceptance.planning.sources.files,
    reference.environment,
    'host-observed',
  ).completion(
    ['container', 'start', '--attach', '--interactive', envelope.execution.container],
    result.process.pid,
  )
  const effect = new DeliveryEffects(acceptance.planning.sources.files.root).get(
    manifest.plan.run,
    envelope.effect,
  )
  if (
    observed.private.definition !== manifest.digest ||
    envelope.provenance !== 'host-observed' ||
    completion?.operation !== envelope.execution.controllerOperation ||
    completion?.code !== 0 ||
    envelope.execution.clientExit !== 0 ||
    effect.status !== 'applied' ||
    effect.intent.operation !== 'test.run' ||
    effect.intent.inputDigest !==
      contractDigest({
        plan: digest,
        case: test.id,
        invocation: result.invocation,
        bindings: result.bindings,
      }) ||
    contractDigest(observed.private.assertions.map((a) => a.id)) !==
      contractDigest(manifest.plan.assertions.map((a) => a.id))
  )
    throw new AcceptanceError('sensitivity-proof-binding')
  return { result, observed }
}
function compareRegression(
  candidate: ReturnType<typeof proof>,
  baseline: ReturnType<typeof proof>,
  plan: PrivateAcceptancePlan,
) {
  if (
    candidate.result.bindings.environment === baseline.result.bindings.environment ||
    baseline.result.invocation === candidate.result.invocation ||
    baseline.observed.baseline?.status !== 'observed-clean-base' ||
    baseline.result.endedAt > candidate.result.startedAt ||
    baseline.observed.private.runner !== candidate.observed.private.runner ||
    baseline.observed.executionIdentity !== candidate.observed.executionIdentity
  )
    return { status: 'unproven' as const, reason: 'baseline-or-execution-identity-not-comparable' }
  if (
    baseline.result.status !== 'failed' ||
    !relevantBaselineFailure(baseline.observed.private.assertions, plan.sensitivity.relevant)
  )
    return { status: 'unproven' as const, reason: 'no-observed-relevant-baseline-failure' }
  return {
    status: 'proven' as const,
    reason: 'same-private-definition-and-runner-fail-on-clean-base-and-pass-on-current-candidate',
  }
}
/** Required applicability also gates aggregate acceptance/sealing; a candidate-only pass cannot bypass it. */
export function requiredPrivateSensitivity(
  acceptance: DeliveryAcceptance,
  digest: string,
  test: AcceptanceCase,
  result: AcceptanceCaseResult,
) {
  try {
    const manifest = new PrivateAcceptance(acceptance).forCase(digest, test)
    const candidate = proof(acceptance, digest, test, {
      environment: result.bindings.environment,
      key: result.key,
    })
    if (
      candidate.result.status !== 'passed' ||
      candidate.observed.private.assertions.some((a) => a.status !== 'passed')
    )
      return { allowed: false, reason: 'candidate-not-passed' }
    if (manifest.plan.sensitivity.mode !== 'regression')
      return { allowed: true, reason: 'regression-not-applicable' }
    for (const prior of acceptance.observedResults(digest, test.id).slice().reverse()) {
      if (prior.sequence >= result.sequence || prior.status !== 'failed') continue
      try {
        const baseline = proof(acceptance, digest, test, {
          environment: prior.bindings.environment,
          key: prior.key,
        })
        if (compareRegression(candidate, baseline, manifest.plan).status === 'proven')
          return { allowed: true, reason: 'observed-regression-sensitivity' }
      } catch {}
    }
    return { allowed: false, reason: 'relevant-baseline-failure-not-proven' }
  } catch {
    return { allowed: false, reason: 'private-observation-unavailable' }
  }
}
/** A bounded read of controller observations; no JSON result import and no command dispatch. */
export async function acceptanceSensitivity(acceptance: DeliveryAcceptance, value: unknown) {
  acceptanceShape(value, requestSchema)
  const request = value as SensitivityRequest,
    pinned = acceptance.get(request.plan)
  const test = pinned.plan.cases.find((test) => test.id === request.case)
  if (!test) throw new AcceptanceError('unknown-sensitivity-case')
  const manifest = new PrivateAcceptance(acceptance).forCase(request.plan, test)
  const report: {
    schema: string
    plan: string
    case: string
    definition: string
    status: 'proven' | 'unproven' | 'not-applicable' | 'stale' | 'unavailable'
    reason: string
    baseline?: SensitivityReference & { result?: string }
    candidate: SensitivityReference & { result?: string }
    mutation: { status: 'observed' | 'unavailable'; reason: string; evidence?: string }
    semanticSensitivity: 'unknown'
    publication: 'not-performed'
  } = {
    schema: 'wholeloop/acceptance-sensitivity@1',
    plan: request.plan,
    case: test.id,
    definition: manifest.digest,
    status: 'unavailable',
    reason: 'candidate-observation-unavailable',
    ...(request.baseline ? { baseline: { ...request.baseline } } : {}),
    candidate: { ...request.candidate },
    mutation: { status: 'unavailable', reason: 'not-observed' },
    semanticSensitivity: 'unknown',
    publication: 'not-performed',
  }
  try {
    const candidate = proof(acceptance, request.plan, test, request.candidate)
    report.candidate.result = contractDigest(candidate.result)
    const current = await acceptance.currentObservedCase(
      request.plan,
      test.id,
      acceptance.boundary(request.candidate.environment),
    )
    if (
      !current.current ||
      !current.result ||
      contractDigest(current.result) !== report.candidate.result
    ) {
      report.status = 'stale'
      report.reason = 'candidate-is-not-the-latest-current-pass'
    } else if (
      candidate.result.status !== 'passed' ||
      candidate.observed.private.assertions.some((a) => a.status !== 'passed')
    ) {
      report.status = 'unproven'
      report.reason = 'candidate-does-not-pass'
    } else {
      const mutation = candidate.observed.mutation
      if (mutation)
        report.mutation = {
          status: mutation.status,
          reason: mutation.reason,
          evidence: contractDigest(mutation),
        }
      if (manifest.plan.sensitivity.mode !== 'regression') {
        report.status = 'not-applicable'
        report.reason =
          manifest.plan.sensitivity.mode === 'new-feature'
            ? 'new-feature-absence-is-not-regression-proof'
            : 'regression-sensitivity-not-applicable'
      } else if (!request.baseline) {
        report.status = 'unproven'
        report.reason = 'baseline-not-observed'
      } else {
        const baseline = proof(acceptance, request.plan, test, request.baseline)
        if (report.baseline) report.baseline.result = contractDigest(baseline.result)
        Object.assign(report, compareRegression(candidate, baseline, manifest.plan))
      }
    }
  } catch {
    report.status = 'unavailable'
    report.reason = 'current-or-historical-observed-proof-unavailable'
  }
  acceptanceShape(report, schema)
  return report
}
