# 0238 — Select budget and queue facts in one pass

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Every live budget observation built its accounting report by matching each reservation against every usage receipt and filtering every stream again per currency. Each usage event filtered the whole usage history several times. Runtime policy readers deep-cloned every historical record to read a few scalars, and admission computed its budget twice (at 100/400 samples, 300/1200 irrelevant token reads). Admission also counted historical pushes and scanned unmetered work when no requirement needed them. Queue capacity searched every assignment for every active attempt (5050/80200 reads at 100/400) and hashed the same slot once per attempt.

## Decision

- **Reports.** Group receipts by known reservation once per report, accumulate currency observations only for currencies present in each stream, and keep receipt order, duplicate weighting, first-mode and latest-known semantics, the original currency ordering and every safe-integer overflow refusal.
- **Usage events.** Traverse the current usage vector once, keeping duplicate-key refusal ahead of damaged-stream or regression refusal and accumulating deltas left to right.
- **Borrowed views.** The public `effectiveBudget` snapshot stays an independent mutable copy. A deeply readonly `effectiveBudgetView` serves current synchronous internal decisions and borrows history from the supplied projection; it is never retained across a mutation or await and is never an authority receipt. Admission formats its clock payload from the calculation it already made.
- **Only required history.** Look for prior work only when the start marker is absent, count pushes only for a viable `git.push` and inspect unmetered work only when tokens or currency have a hard requirement. The order of actual refusals is unchanged.
- **Queue.** Build a fresh first-match attempt index per run with several active attempts and hash the selected slot once. The live queue still reads the current grant, clock and plan before selection.

## Alternatives rejected

Omitting accounting during polling would lose the overflow refusal. Removing public snapshot copies would let callers edit shared history. Caching outcomes, histories or capacity between polls could hide a new receipt, a revocation or a clock change.

## Verification

`test/unit/delivery/budget-usage-performance.test.ts`, `budget-replay-performance.test.ts`, `budget-view-performance.test.ts` and `queue-selection-performance.test.ts`: snapshot copies 3 → 0 and irrelevant history reads 300/1200 and 400/1600 → 0 for scalar admission; queue assignment reads 5050/80200 → 100/400 and slot hashes 100/400 → 1, with complete outputs and refusals preserved.

[◀ Decisions index](./README.md)
