import { contractDigest } from '../contracts/compatibility.js'
import { workspaceSnapshot } from '../gates/snapshot.js'
import { ENVIRONMENT_SNAPSHOT_LIMITS } from './candidates.js'
import {
  DockerCli,
  DockerEnvironmentError,
  type DockerTransport,
  dockerJson,
} from './docker-command.js'
import { DockerResources } from './docker-resources.js'
import { environmentFenced } from './operations.js'
import { EnvironmentRecipes } from './recipe-store.js'
import type { EnvironmentResources } from './runtime.js'

/** Observe the exact owned environment after restart; historical ready is not current readiness. */
export async function inspectEnvironment(
  records: EnvironmentResources,
  id: string,
  driver: DockerTransport = new DockerCli(),
  now = () => new Date().toISOString(),
) {
  const environment = records.get(id),
    record = environment.record
  const result = {
    schema: 'wholeloop/environment-status@1',
    environment,
    state: 'not-ready' as 'ready' | 'not-ready' | 'unknown' | 'stale' | 'expired',
    inputs: 'current' as 'current' | 'changed-or-unavailable',
    evidence: environment.digest,
    authority: 'not-granted-by-this-command',
    acceptance: 'not-established',
  }
  if (record.state !== 'ready' || environmentFenced(records.files, id)) return result
  if (now() >= record.lifetimeDeadline) return { ...result, state: 'expired' as const }
  try {
    const info = dockerJson(await driver.call(['info', '--format', '{{json .}}'])) as {
      ID?: unknown
    }
    if (info.ID !== record.daemon?.id) throw new DockerEnvironmentError('daemon-identity-changed')
    const runtime = new DockerResources(records, id, driver, () => {}, new AbortController().signal)
    for (const { resource, observed } of await runtime.ownedSnapshot()) {
      if (
        ['service', 'proxy'].includes(resource.purpose) &&
        (observed.State as { Running?: unknown }).Running !== true
      )
        throw new DockerEnvironmentError('service-not-running')
    }
  } catch {
    return { ...result, state: 'unknown' as const }
  }
  try {
    const inspected = new EnvironmentRecipes(records.files.root).inspect(record.recipe)
    if (inspected.inputs !== 'current') throw new Error('Changed selected input')
    for (const candidate of record.candidates) {
      const value = workspaceSnapshot(candidate.path, ENVIRONMENT_SNAPSHOT_LIMITS)
      if (value.head !== candidate.head || value.digest !== candidate.snapshot)
        throw new Error('Changed candidate')
    }
  } catch {
    return { ...result, state: 'stale' as const, inputs: 'changed-or-unavailable' as const }
  }
  return {
    ...result,
    state: 'ready' as const,
    evidence: contractDigest({ environment: environment.digest, observed: true, at: now() }),
  }
}
