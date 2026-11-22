// Aggregates a gate round into a report; missing responses never count as refutations.
import type { GateClassification, GatePlan, GateReport, GateResult, GateVote } from './contracts.js'

/** Advisory findings reach the person in the hand-back; the reason names their severity. */
export const ADVISORY = 'Advisory'

/** Missing responses never become refutations, and budget exhaustion never grants approval. */
export function gateReport(
  plan: GatePlan,
  results: readonly GateResult[],
  votes: readonly GateVote[],
  observed: string,
  budget = plan.budget,
  classifications: readonly GateClassification[] = [],
): GateReport {
  const firstResults = results.length ? new Map<string, GateResult>() : undefined,
    covered = results.length ? new Set<string>() : undefined
  let suiteFailed = false
  if (firstResults && covered)
    for (const result of results) {
      const { unit, status } = result
      // Preserve find's first match and some's any-ok coverage independently.
      // Even a duplicate input must not silently become last-write-wins.
      if (!firstResults.has(unit)) firstResults.set(unit, result)
      if (status === 'ok') covered.add(unit)
      if (unit === 'suite' && result.execution?.status === 'failed') suiteFailed = true
    }
  const missing: string[] = []
  const kept: GateReport['kept'] = []
  const dropped: GateReport['dropped'] = []
  let examinations: Map<string, { count: number; refutations: number }> | undefined
  for (const unit of plan.units) {
    const unitId = unit.id
    if (!covered?.has(unitId)) missing.push(unitId)
    const findings = firstResults?.get(unitId)?.findings
    if (!findings?.length) continue
    const failSafe = unit.failSafe
    for (const finding of findings) {
      // No finding means no vote work. Otherwise aggregate once for this exact
      // immutable input vector; duplicate votes retain their original weight.
      if (!examinations) {
        examinations = new Map()
        for (const vote of votes) {
          const { finding, outcome } = vote,
            entry = examinations.get(finding) ?? { count: 0, refutations: 0 }
          entry.count++
          if (outcome === 'refute') entry.refutations++
          examinations.set(finding, entry)
        }
      }
      const id = `${unitId}:${finding.id}`
      // Only an optional lens can lower a finding; replay already refuses the rest. Historical
      // rounds have no classification, so their reports stay byte-identical.
      const severity = failSafe
        ? undefined
        : classifications.find((entry) => entry.finding === id)?.severity
      if (severity) {
        dropped.push({
          id,
          unit: unitId,
          finding,
          refutations: 0,
          reason: `${ADVISORY} (${severity}): reported to the person; does not fail the round`,
        })
        continue
      }
      const examined = examinations.get(id),
        count = examined?.count ?? 0,
        refutations = examined?.refutations ?? 0
      const safe = !failSafe || (count === plan.verifiers && refutations === count)
      const drop = refutations >= plan.refutations && safe
      const entry = {
        id,
        unit: unitId,
        finding,
        refutations,
        reason: drop
          ? 'Active refutation quorum met'
          : !safe
            ? 'Fail-safe lens: safety not established by every verifier'
            : 'Active refutation quorum not met',
      }
      ;(drop ? dropped : kept).push(entry)
    }
  }
  if (suiteFailed) missing.push('suite-execution')
  const unchanged = observed === plan.snapshot.digest
  const green = unchanged && !missing.length && !kept.length
  return {
    verdict: green ? 'PASS' : plan.round >= budget ? 'EXHAUSTED' : 'FAIL',
    unchanged,
    missing,
    kept,
    dropped,
  }
}
