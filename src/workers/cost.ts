// Estimates declared work before dispatch without inventing tokenizer, pricing or client overhead.
import { bundledCanonical } from '../adapters/canonical.js'
import { isObject } from '../config/schema.js'
import { frontmatter } from '../harness/frontmatter.js'
import type { WorkerModels } from './models.js'

type Tier = 'fast' | 'standard' | 'deep' | 'unknown'
let tiers: ReadonlyMap<string, Tier> | undefined
function tierFor(role: string): Tier {
  // Only bundled immutable metadata is retained; runtime plans and authority are never cached.
  tiers ??= new Map(
    [...bundledCanonical()].flatMap(([path, content]) => {
      const name = /^harness\/agents\/([a-z0-9-]+)\.md$/.exec(path)?.[1]
      if (!name) return []
      const metadata = frontmatter(content)?.metadata,
        tier = isObject(metadata) ? metadata['wholeloop.tier'] : undefined
      return [[name, tier === 'fast' || tier === 'deep' || tier === 'standard' ? tier : 'standard']]
    }),
  )
  return tiers.get(role.replace(/^wl-/, '')) ?? 'unknown'
}

export function workerCost(
  roles: readonly string[],
  assignments?: readonly object[],
  models?: WorkerModels,
) {
  const groups = new Map<Tier, number>()
  for (const role of roles) {
    const tier = tierFor(role)
    groups.set(tier, (groups.get(tier) ?? 0) + 1)
  }
  const mapped = (tier: Tier) => (tier === 'unknown' ? undefined : models?.tiers[tier])
  return {
    workers: roles.length,
    modelTiers: [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tier, workers]) => ({
        tier,
        workers,
        ...(mapped(tier) ? { model: mapped(tier) as string } : {}),
      })),
    ...(models && [...groups.keys()].some(mapped) ? { modelClient: models.client } : {}),
    estimate: {
      unit: 'worker-calls' as const,
      value: roles.length,
      declaredInputBytes:
        assignments === undefined
          ? null
          : assignments.reduce<number>(
              (sum, assignment) => sum + Buffer.byteLength(JSON.stringify(assignment)),
              0,
            ),
      tokens: null,
      durationMs: null,
      price: null,
    },
    basis: `Current planned assignments; requested tiers${models && [...groups.keys()].some(mapped) ? `, with models configured for ${models.client} that apply to roles installed after the choice` : ''}, not observed client models. Later findings, read evidence and client overhead are unknown.`,
  }
}
export type WorkerCost = ReturnType<typeof workerCost>

export function assignmentCost(
  jobs: readonly { role: string }[],
  examinations: readonly { role: string }[] = [],
  models?: WorkerModels,
) {
  const assignments = [...jobs, ...examinations]
  return workerCost(
    assignments.map(({ role }) => role),
    assignments,
    models,
  )
}

export function costText(cost: WorkerCost): string {
  const tiers =
      cost.modelTiers
        .map(
          ({ tier, workers, model }) =>
            `${tier} × ${workers}${model ? ` (${model === 'inherit' ? 'session model' : model})` : ''}`,
        )
        .join(' · ') || 'none',
    size =
      cost.estimate.declaredInputBytes === null
        ? 'context not prepared'
        : `${Math.ceil(cost.estimate.declaredInputBytes / 1024)} KiB declared input`
  return `Cost estimate: ${cost.workers} worker ${cost.workers === 1 ? 'call' : 'calls'} · requested tiers ${tiers} · ${size}. Tokens, time and price unknown.`
}
