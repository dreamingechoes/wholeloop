# 0152 — Candidate lineage and stage continuations

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

A verified candidate may include several corrections produced under the verification stage. Its following review must inspect that exact current owned commit through the original correction chain. The candidate checkpoint belongs to verification, while the new review invocation has its own native scope and gate. Treating candidate provenance as continuation ownership rejects that valid handoff before independent review can finish.

## Decision

Use the fixed correction checkpoint for current candidate selection across stages. Derive a correction continuation namespace only when that checkpoint's workers own the current invocation. Otherwise use the current stage's original flat locator; never adopt the predecessor stage's continuation, gate verdict, native calls or budget.

Keep all existing continuation admission checks. An earlier-stage checkpoint alone cannot advance a failed current gate: its exact producer and failure origin still have to match the current invocation and round. Candidate lineage proves what to inspect, never that another stage has already approved it.

The following review declares its own finite original window before dispatch and retains the same global delivery budget. Paused inspection reopens the original reviewed head and outputs without selecting another host or replaying either stage. Root-stage completion, further cross-stage repairs and complete-route execution remain separate.

## Alternatives rejected

Discarding the checkpoint falls back to a stale initial commit. Rebinding the old producer to the new invocation falsifies ownership. Copying an old continuation or verdict skips independent work. Rejecting every cross-stage checkpoint prevents a corrected verified candidate from reaching review at all.

## Verification

Extend the actual Docker/synthetic-worker composition with an explicit review-after-verification mode: produce two corrections, pass the unchanged third suite and independent verification, record that original verification stage, then independently review the exact same corrected head in a new stage. Preserve prior native calls and original global deadline, and recover the new review while paused without a host factory or replay. Do not count a fixture as authenticated model, independent Linux application-host or full-route acceptance. Run directed review/verification and frozen-contract regressions, static/docs checks and record actual results before commit.

All 440 directed regressions pass with macOS Node 24. The six-control actual Docker/synthetic-worker composition passes with macOS Node 25.5.0 in the isolated copy, using the same implementation source bytes. It independently reviews the verified second correction, preserves original native scopes/global deadline and recovers while paused without replay. All three exact environments retire. Static/docs/package checks pass. Complete repository checks remain the preceding 3317-test macOS/Linux milestone; no current full-suite, authenticated-native, independent Linux application-host or full-route acceptance is inferred.
