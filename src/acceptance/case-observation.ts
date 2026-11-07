// Reopens recorded Docker acceptance observations without executing or approving current inputs.
import { contractDigest } from '../contracts/compatibility.js'
import { DeliveryEffects } from '../delivery/effects.js'
import { EnvironmentResources } from '../environment/runtime.js'
import { AcceptanceError } from './contracts.js'
import type { DeliveryAcceptance } from './store.js'

/** Reopen exact fixed-host observations without executing or approving current inputs. */
export function observedDockerAcceptanceCase(
  acceptance: DeliveryAcceptance,
  digest: string,
  caseId: string,
  key: string,
) {
  try {
    const { plan } = acceptance.get(digest),
      test = plan.cases.find((test) => test.id === caseId),
      result = acceptance.observedCase(digest, caseId, key),
      host =
        test?.runner.kind === 'browser'
          ? 'docker-browser-mcp'
          : test?.runner.capability === 'evaluator.private-http'
            ? 'docker-private-http'
            : test?.runner.kind === 'cli' && test.runner.capability === 'repository.diff'
              ? 'docker-repository-diff'
              : 'docker-behavior'
    if (
      test?.owner !== 'machine' ||
      test.applicability !== 'applicable' ||
      !['cli', 'api', 'browser', 'semantic'].includes(test.runner.kind) ||
      result.host.id !== host ||
      result.host.version !== '1' ||
      result.host.capability !== test.runner.capability ||
      result.invocationState !== 'stopped' ||
      !['passed', 'failed'].includes(result.status)
    )
      throw new AcceptanceError('original-docker-case-host-required')
    const first = result.artifacts[0]
    if (
      !first ||
      acceptance.artifacts.read(plan.run, first).artifact.mediaType !== 'application/json'
    )
      throw new AcceptanceError('original-docker-case-artifact-required')
    const body = JSON.parse(acceptance.artifacts.bytes(plan.run, first).toString('utf8')) as {
      observation?: unknown
      execution?: unknown
      effect?: string
      provenance?: string
      captures?: { label: string; artifact: string }[]
    }
    if (
      !body.effect ||
      body.observation === undefined ||
      body.provenance !== result.provenance ||
      (body.captures !== undefined && !Array.isArray(body.captures))
    )
      throw new AcceptanceError('original-docker-case-evidence-required')
    const effects = new DeliveryEffects(acceptance.planning.sources.files.root),
      effect = effects.get(plan.run, body.effect),
      observed = effect.observations.at(-1),
      captures = (body.captures ?? []).map((capture) => {
        if (
          !capture ||
          typeof capture.label !== 'string' ||
          !capture.label ||
          typeof capture.artifact !== 'string'
        )
          throw new AcceptanceError('original-docker-case-capture-required')
        const { artifact } = acceptance.artifacts.read(plan.run, capture.artifact)
        return { label: capture.label, bytes: artifact.bytes, sha256: artifact.sha256 }
      }),
      assertions = result.assertions.map(({ id, status }) => ({ id, status })),
      environment = new EnvironmentResources(acceptance.planning.sources.files).get(
        result.bindings.environment,
      ).record,
      candidates = environment.candidates
        .map(({ repository, head, snapshot }) => ({ repository, head, snapshot }))
        .sort((a, b) => a.repository.localeCompare(b.repository)),
      expectedCandidates = [...result.bindings.candidates].sort((a, b) =>
        a.repository.localeCompare(b.repository),
      )
    if (
      effect.intent.key !== `behavior-${contractDigest(result.invocation).slice(0, 32)}` ||
      effect.intent.operation !== 'test.run' ||
      effect.intent.basis !== plan.plan ||
      effect.intent.inputDigest !==
        contractDigest({
          plan: digest,
          case: caseId,
          invocation: result.invocation,
          bindings: result.bindings,
        }) ||
      effect.status !== 'applied' ||
      !effect.invocation ||
      effect.admission?.provenance !== result.provenance ||
      observed?.provenance !== result.provenance ||
      observed?.invocationState !== 'stopped' ||
      observed.status !== 'applied' ||
      observed.resource?.ref !== effect.intent.ref ||
      observed.resource.revision !== contractDigest(body.observation) ||
      observed.evidence !==
        contractDigest({ observation: body.observation, assertions, completed: true, captures }) ||
      contractDigest(result.artifacts.slice(1)) !==
        contractDigest((body.captures ?? []).map((capture) => capture.artifact)) ||
      result.assertions.some((assertion) => assertion.evidence !== first) ||
      result.status !==
        (assertions.every((assertion) => assertion.status === 'passed') ? 'passed' : 'failed') ||
      environment.run !== plan.run ||
      environment.basis !== plan.plan ||
      environment.recipe !== result.bindings.recipe ||
      environment.grantDigest !== effect.intent.grantDigest ||
      environment.provenance !== result.provenance ||
      contractDigest(candidates) !== contractDigest(expectedCandidates)
    )
      throw new AcceptanceError('original-docker-case-observation-mismatch')
    // The original effect records assertions and captures, not native process
    // ownership. Embedded execution metadata needs its separate scope audit.
    return {
      result,
      observation: body.observation,
      execution: body.execution,
      effect,
      captures,
      evidence: contractDigest({ result, effect, artifact: first, captures }),
      nativeOwnership: 'not-established' as const,
      currentAcceptance: 'not-established' as const,
    }
  } catch (error) {
    if (error instanceof AcceptanceError) throw error
    throw new AcceptanceError('original-docker-case-evidence-unavailable')
  }
}
