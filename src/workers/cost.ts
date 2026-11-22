// Estimates declared work before dispatch without inventing tokenizer, pricing or client overhead.
import { bundledCanonical } from '../adapters/canonical.js'
import { isObject } from '../config/schema.js'
import { frontmatter } from '../harness/frontmatter.js'

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

export function workerCost(roles: readonly string[], assignments?: readonly object[]) {
  const groups = new Map<Tier, number>()
  for (const role of roles) {
    const tier = tierFor(role)
    groups.set(tier, (groups.get(tier) ?? 0) + 1)
  }
  return {
    workers: roles.length,
    modelTiers: [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tier, workers]) => ({ tier, workers })),
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
    basis:
      'Current planned assignments; requested tiers, not observed client models. Later findings, read evidence and client overhead are unknown.',
  }
}
export type WorkerCost = ReturnType<typeof workerCost>

export function assignmentCost(
  jobs: readonly { role: string }[],
  examinations: readonly { role: string }[] = [],
) {
  const assignments = [...jobs, ...examinations]
  return workerCost(
    assignments.map(({ role }) => role),
    assignments,
  )
}

export function costText(cost: WorkerCost): string {
  const tiers =
      cost.modelTiers.map(({ tier, workers }) => `${tier} × ${workers}`).join(' · ') || 'none',
    size =
      cost.estimate.declaredInputBytes === null
        ? 'context not prepared'
        : `${Math.ceil(cost.estimate.declaredInputBytes / 1024)} KiB declared input`
  return `Cost estimate: ${cost.workers} worker ${cost.workers === 1 ? 'call' : 'calls'} · requested tiers ${tiers} · ${size}. Tokens, time and price unknown.`
}
