// The acceptance boundary: the exact inputs that must match before a result counts as current.
import { contractDigest } from '../contracts/compatibility.js'
import { DockerCli, type DockerTransport } from '../environment/docker-command.js'
import { inspectEnvironment } from '../environment/inspect.js'
import type { EnvironmentResources } from '../environment/runtime.js'
import { type AcceptanceBindings, AcceptanceError, type AcceptancePlan } from './contracts.js'

export interface AcceptanceBoundary {
  provenance: 'fixture' | 'host-observed'
  observe(plan: AcceptancePlan): Promise<AcceptanceBindings>
}
/** An environment name or caller-supplied candidate digest cannot establish current application readiness. */
export class DockerAcceptanceBoundary implements AcceptanceBoundary {
  readonly provenance: DockerTransport['provenance']
  constructor(
    readonly resources: EnvironmentResources,
    readonly environment: string,
    readonly driver: DockerTransport = new DockerCli(),
  ) {
    this.provenance = driver.provenance
  }
  async observe(plan: AcceptancePlan): Promise<AcceptanceBindings> {
    const result = await inspectEnvironment(this.resources, this.environment, this.driver)
    const record = result.environment.record
    if (
      result.state !== 'ready' ||
      record.run !== plan.run ||
      record.provenance !== this.provenance
    )
      throw new AcceptanceError('environment-not-current')
    const candidates = record.candidates
      .map(({ repository, head, snapshot }) => ({ repository, head, snapshot }))
      .sort((a, b) => a.repository.localeCompare(b.repository))
    if (
      !candidates.length ||
      new Set(candidates.map((c) => c.repository)).size !== candidates.length
    )
      throw new AcceptanceError('candidate-bindings')
    return {
      environment: record.id,
      recipe: record.recipe,
      runtime: result.environment.digest,
      candidates,
    }
  }
}
export function sameAcceptanceInputs(a: AcceptanceBindings, b: AcceptanceBindings) {
  return (
    a.environment === b.environment &&
    a.recipe === b.recipe &&
    contractDigest(a.candidates) === contractDigest(b.candidates)
  )
}
