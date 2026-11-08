# 0250 — Periodic delivery budgets

- **Status:** Proposed
- **Date:** 2026-11-08

## Context

Every run has finite budgets for time, attempts, repairs and reported usage, and a spent budget ends the run as exhausted ([0099](./0099-persistent-finite-delivery-budgets.md)). That bounds one run. A supervisor that admits work continuously (proposal 0249) also needs a limit on how much all runs together may consume in a day or a week, which per-run budgets cannot express.

## Decision (proposed)

- Add an operator-defined budget per period (day or week) covering the same measures as run budgets: run count, wall time, attempts, pushes and client-reported usage where a client reports it.
- The supervisor admits new work only while the period budget has room for the new run's own budget. When it does not, the queue pauses until the next period starts; running work finishes under its own budget.
- A period budget never extends a run's budget, and it is changed only by an explicit operator command recorded in the journal.

## Alternatives rejected

- **Raising run budgets instead.** It does not stop many small runs from adding up.
- **Stopping running work when the period is spent.** It wastes completed progress and leaves partial effects to reconcile.

## Consequences

Unattended operation has a predictable ceiling the operator chose. Unknown client usage stays unknown and counts against nothing, as with run budgets.

## Verification

Unit tests for admission at the boundary, a rehearsal that pauses the queue at the end of a period and resumes at the next, and the overview showing the period's consumption.

[◀ Decisions index](./README.md)
