// Stops the environments a failed request left running before its unattended continuation.
import { contractDigest } from '../contracts/compatibility.js'
import type { DockerTransport } from '../environment/docker-command.js'
import { EnvironmentLifecycle } from '../environment/lifecycle.js'
import { EnvironmentResources } from '../environment/runtime.js'
import type { RunnerRequest, RunnerStore } from './store.js'

// States that hold no daemon capacity (see EnvironmentProvision's reservation).
const SETTLED = new Set(['retired', 'unavailable', 'stopped', 'retained'])

/**
 * Stops every environment of the request's run that still holds capacity, so the
 * continuation can provision its own (ADR-0248). Stop, not retire: data, logs and
 * evidence stay, and retiring them remains the operator's decision. True only when
 * each one is observed stopped (`stopped` or, with its evidence kept, `retained`); any other outcome leaves the continuation unstarted.
 */
export async function stopRunEnvironments(
  store: RunnerStore,
  request: Readonly<RunnerRequest>,
  driver: DockerTransport,
): Promise<boolean> {
  const resources = new EnvironmentResources(store.files),
    lifecycle = new EnvironmentLifecycle(store.files, driver),
    predecessor = contractDigest(request).slice(0, 12)
  for (const entry of resources
    .list()
    .filter((item) => item.record.run === request.run && !SETTLED.has(item.record.state))) {
    try {
      const receipt = await lifecycle.execute({
        schema: 'wholeloop/environment-lifecycle-request@1',
        id: `continuation-stop-${predecessor}-${entry.record.id.slice(-12)}`,
        environment: entry.record.id,
        expected: entry.digest,
        action: 'stop',
        reason:
          "Stop the failed request's environment, keeping its data and evidence, before its unattended continuation provisions its own (ADR-0248).",
      })
      // An observed stop retains the environment's evidence and reports `retained`.
      if (!['stopped', 'retained'].includes(receipt.state)) return false
    } catch {
      return false
    }
  }
  return true
}
