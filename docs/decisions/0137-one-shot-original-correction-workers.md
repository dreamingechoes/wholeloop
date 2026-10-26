# 0137 — One-shot original correction workers

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Original failure admission accounts for a diagnosis but starts no work. A correction must preserve the observed candidate, cancellation window, builder history and failed gate, including when a controller loses a claim or native response. Treating another builder claim as QA success would erase the reason for independent verification.

## Decision

Add an internal RunnerRepairWorkers component over fixed review/verification readers. Admit the original unattended failure, audit the original passed and closed builder production, select bounded context and recheck admission before persisting a one-shot intent. Fence and requeue the same builder slot, then claim exactly its next generation with the original parent deadline. Preserve attempt/restart/global limits and the original failure record. Add only an internal builder repair briefing; verifier, reviewer and refuter roles cannot acquire it. Existing public worker and purpose schemas remain unchanged.

Bind the private intent to original failure accounting, queue predecessor, immutable plan, workspace, stage and pre-existing native call prefix. Register every correction through the same original owned native scope. Keep source production audit separate from current workspace identity: the controller's legitimate commit changes HEAD after production. Audit original receipts, captured inputs, finished time and native closure before fencing the old lease.

Recovery inspects retained intent, exact successor lease, captured result, complete owned call prefix and current produced bytes. It never reselects context, reconstructs a host or buys another claim. Missing intent or sidecars and uncertain response loss remain unavailable rather than authorizing replay. Read-only inspection may run while paused. Cancellation uses original private native channels only.

Return correction production separately from root-stage observations, with commit and independent QA explicitly pending. No worker output, unchanged deadline or successful process establishes repaired behavior. Candidate succession, repeated QA, full-route composition and acceptance remain implementation work.

## Alternatives rejected

A new builder cell would bypass the original slot's restart history. Fresh queue entries would separate repair from the original attempt budget. Replaying after a lost claim can duplicate code production. Recovering from the latest arbitrary receipt loses identity. Requiring the pre-commit workspace snapshot for historical production incorrectly rejects the controller's own legitimate commit. Marking the verification stage passed from a correction report replaces independent evidence with the builder's claim.

## Verification

Use actual external Git worktrees, synthetic native production, retained adversarial review findings and one bounded correction. Check exact generation/deadline, unchanged global window, one original failure, no progress fabrication, changed-byte refusal and paused recovery with no selectors or native replay. Separately lose a claim response after journal commit and retain its reservation without dispatch or reclaim. Keep cheap authority, historical-production and role controls in unit tests; run complete multi-worker compositions through the existing standalone evaluation pattern without increasing unit deadlines. Record failures and final results in the journal. These controls do not establish authenticated native containment or complete-route acceptance.

The complete dispatch controls pass on macOS Node 24 and Linux Node 24/20.0.0 with Git 2.39.5 and exact schema parity. Six-file regressions pass 486 cases. A separate final cancellation-helper correction keeps original ownership available after revocation; its focused/frozen regression passes 420 cases. The complete dispatch controls precede only that helper change, which they do not exercise. Static/docs/package checks pass. The Git 2.30 probe exposes existing unsupported metadata/listing flags and remains separate follow-up; it is not a passing compatibility claim.
