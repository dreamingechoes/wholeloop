# 0187 — Bounded CI repair requests

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

After publication, a required check can fail or a reviewer can comment. The repair must stay within the original scope and a finite push budget, must not trust comment text, and must not dismiss a failed check as flaky by guessing. Running the repair means a builder produces a new head, which then needs fresh local, behavioral, integration and remote evidence. That is a continuation across route invocations. [ADR-0154](./0154-recorded-correction-checkpoint-reconstruction.md) records that the cross-invocation correction protocol is still missing, and that protocol was assigned to P6-29.

## Decision

P6-22 adds the deterministic half and leaves the continuation to P6-29.

- **Classification.** `classifyCiFailures` is pure. Only an observed failure of a trusted required check at the candidate is `code-test`. A stale check or moved PR head is `stale`, a spoofed or issuer-less check and an empty required set are `policy`, unknown protection is `permissions`, and cancelled, skipped, neutral, missing and partial results are `unknown`. `infrastructure` needs structured host evidence that no current host supplies, so a guess never produces it.
- **Feedback.** Every PR comment becomes an identified, unadopted feedback item bound to its revision. Its text is never executed or searched for commands. No delegated decision covers adopting review feedback, so current feedback blocks the request rather than widening scope or waiting for a person.
- **Budget.** `ciRepairAdmission` counts issued pushes from the run's journal against `ciPushes`, which defaults to two: the initial push and one repair. A restart cannot reset it, and the ledger already refuses a push beyond the limit (`ci-push-limit`).
- **Request.** `ciRepairRequest` turns one observation into `none`, `pending`, `repair` or `blocked`, with every reason. It is `repair` only for code or test failures within budget, with no non-code failure and no current feedback. Requests are retained content-addressed beside the observations. A request authorizes nothing by itself.

Running a `repair` request, which means building the new head and re-entering verification, review, integration, acceptance and publication for it, moves to P6-29 together with the integration and acceptance continuations. Until then a failed required check ends the run honestly with its retained request.

## Alternatives rejected

Letting an agent label a failure as infrastructure would let a guess dismiss a real failure. Parsing comments for suggested commands would execute untrusted text. Counting repairs in memory would reset on restart. Re-running stages inside the same invocation would repeat or reorder issued effects.

## Verification

- Table-driven cases classify trusted failures, cancelled, skipped, stale and spoofed checks and unknown protection without producing `infrastructure`.
- Request cases cover passed, pending, within-budget, exhausted, current-feedback and older-feedback observations.
- Hostile comment text stays identified and unadopted.
- A journal case counts pushes across a restart, refuses a third push with `ci-push-limit` and retains the blocked request.
