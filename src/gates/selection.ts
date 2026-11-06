import type { GateFinding, GateResult, GateVote } from './contracts.js'

interface FindingSource {
  id: string
  unit: string
  finding: GateFinding
}

/** Fixed synchronous audits discard this selection before an effect or fresh observation. */
export function gateAuditSelection(results: readonly GateResult[], votes: readonly GateVote[]) {
  let units: Map<string, GateResult> | undefined, sources: Map<string, FindingSource> | undefined
  return {
    result: (id: string) => {
      if (results.length <= 1) return results.find((result) => result.unit === id)
      if (!units) {
        units = new Map()
        for (const result of results) {
          const unit = result.unit
          if (!units.has(unit)) units.set(unit, result)
        }
      }
      return units.get(id)
    },
    source: (id: string) => {
      if (!results.length) return undefined
      if (votes.length <= 1) return gateFindingSource(results, id)
      // Construct no finding objects until a submitted vote actually needs
      // them. One fresh native query instead short-circuits without an index.
      if (!sources) {
        sources = new Map()
        for (const result of results) {
          const unit = result.unit
          for (const finding of result.findings) {
            const key = `${unit}:${finding.id}`
            if (!sources.has(key)) sources.set(key, { id: key, unit, finding })
          }
        }
      }
      return sources.get(id)
    },
  }
}

/** A fresh native refutation selects only its original finding, without retaining authority. */
export function gateFindingSource(
  results: readonly GateResult[],
  id: string,
): FindingSource | undefined {
  for (const result of results) {
    const unit = result.unit
    for (const finding of result.findings)
      if (`${unit}:${finding.id}` === id) return { id, unit, finding }
  }
  return undefined
}
