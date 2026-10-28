# 0148 — Observed repair progress across candidates

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Original correction review/verification can produce another actionable failure. Feedback and admission must select that exact corrected candidate, rather than falling back to the initial commit. The generic budget signature deliberately includes the candidate digest; using only that counter for an unattended repair loop lets each new commit reset repetition of an otherwise identical failure.

A failed actual suite can also lose its final negative gate write. Refusing model execution is correct, but leaving the known failure unsealed prevents subsequent original-feedback inspection.

## Decision

Thread the fixed current correction checkpoint through feedback and admission. Keep each budget failure's actual candidate, observation, fingerprint and idempotency key unchanged. Add a runner-specific pure fold over authoritative ordered budget events: count distinct observed failed-behavior keys for the same run, role and fingerprint across candidate changes. Interleaved findings do not prove that the original problem improved.

Only a new host-observed behavior, resolved finding or accepted candidate resets this repair counter. Deduplicate by progress kind/digest, matching the existing distinction between a new fact and a new key. Fixture claims, new artifacts and effect bookkeeping cannot reset repair repetition. Preserve the generic budget's schema, signature and public accounting semantics.

After recording the exact current failure once, use the original effective no-progress limit for the additional runner guard. Count and append terminal exhaustion within one delivery-journal lock, so concurrent real progress cannot race the stop. Retain evidence and limits, dispatch no further correction and create no reservation or human prompt. Existing original-window, authority and gate-exhaustion guards remain in force.

Recover a lost negative gate verdict only from the exact observed failed suite result, positively closed owners and current bound round. This emits no positive judgment and invokes no model or command. Positive verification still requires independent native evidence.

## Alternatives rejected

Dropping candidate identity from the generic failure signature would alter existing accounting and weaken provenance. Pretending another commit or artifact resolves a finding permits endless unattended retries. Resetting when another finding appears permits alternating failures to evade limits. A separate mutable counter can drift from the journal. Counting outside the terminal-transition lock races genuine progress. Rerunning a failed suite merely to reconstruct a negative metadata record duplicates work.

## Verification

Table controls cover candidate changes, failure-key deduplication, role/run scope, interleaved findings, actual progress, fixture/bookkeeping refusal and repeated fact deduplication. Run feedback/admission/verification/frozen regressions. Extend the finite actual Docker composition with an original limit of two and an unchanged suite that fails before and after correction. Recover its lost verdict, retain current second-round feedback and the same fingerprint, then require terminal exhaustion with two exact failures, no new reservation/worker, idempotent refusal and exact retirement. Record observed results and limitations in the journal; these controls establish no authenticated native, independent Linux application-host or complete-route acceptance.

All 460 directed regressions and three final actual Docker checks pass on macOS Node 24. The captured authoritative journal also replays unchanged on macOS Node 24 and Linux Node 20, retaining runner repetition two versus generic candidate-specific streak one. That Linux result is metadata replay only. Both exact environments are observed retired and static/docs/package checks pass.
