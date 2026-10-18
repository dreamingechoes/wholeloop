import type { GatePlan, GateReport, GateResult, GateVote } from './contracts.js'

/** Missing responses never become refutations, and budget exhaustion never grants approval. */
export function gateReport(
  plan: GatePlan,
  results: readonly GateResult[],
  votes: readonly GateVote[],
  observed: string,
  budget = plan.budget,
): GateReport {
  const missing = plan.units
    .filter((unit) => !results.some((result) => result.unit === unit.id && result.status === 'ok'))
    .map(({ id }) => id)
  const kept: GateReport['kept'] = []
  const dropped: GateReport['dropped'] = []
  for (const unit of plan.units) {
    const result = results.find((entry) => entry.unit === unit.id)
    for (const finding of result?.findings ?? []) {
      const id = `${unit.id}:${finding.id}`
      const examinations = votes.filter((vote) => vote.finding === id)
      const refutations = examinations.filter((vote) => vote.outcome === 'refute').length
      const safe =
        !unit.failSafe ||
        (examinations.length === plan.verifiers &&
          examinations.every((vote) => vote.outcome === 'refute'))
      const drop = refutations >= plan.refutations && safe
      const entry = {
        id,
        unit: unit.id,
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
