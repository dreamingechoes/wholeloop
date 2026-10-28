# 0144 — Original review continuation after correction

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

An observed correction commit is a new candidate, not a passing review. The original failed review still owns its subject, run, round allowance and controller deadline. Starting a new run would silently replenish that allowance; reusing its old verdict would approve unreviewed bytes.

## Decision

Add an internal review continuation through the fixed original correction checkpoint. Reopen the exact historical failed round and correction producer, require a current direct-successor commit, positive closure of the original native scope and the existing unattended authority. Reject exhausted, passing, extended, unrelated or replaced runs. The continuation retains the narrower original correction/controller deadline and advances only the same gate run by one round with its unchanged allowance.

Persist original intent before planning. Reopen a lost planning response from the exact next round in the original journal; never plan again when that intent already exists. Persist a separate dispatch marker before invoking independent review workers. Existing dispatch markers permit observation only. An interrupted marker with no captured work remains unresolved rather than authorizing replay. Missing planning evidence also remains unresolved.

Bind the active private review locator to that exact round and corrected HEAD. Recovery can restore this locator and seal a lost final verdict from already submitted, independently audited original outputs while paused. Recovery constructs no native host and supplies no new invocation, gate budget, root-stage completion or human approval. Missing submissions remain unknown. Pass the fixed checkpoint through the native gate host so its admission and observation recheck the same successor. Cap each reviewer/refuter reservation at the retained parent deadline. Existing strict candidate checks and complete native-scope closure still apply.

This increment supports the first direct correction and its independent review. Repeated correction generations, fresh behavioral verification, whole-route composition and public execution remain separate technical work.

## Alternatives rejected

A fresh gate run would reset failure history. Reusing the old round would bind judgments to the wrong HEAD. Calling the planner again after an unknown response could allocate another round. Dispatching again after an ownership marker could duplicate native work. Treating an original correction receipt as QA would collapse production and independent review.

## Verification

Run the existing review/native-gate/repair/frozen regressions. Add a finite model-free process composition with an initially retained finding, actual owned correction and commit, a lost second-round planning response, independent review of the corrected HEAD and paused recovery after a lost final verdict write and locator. Preserve the run, allowance, global deadline, failure history and root-stage status. Reject deadline expansion before another plan. Run identical compiled controls on macOS and Linux Node 20; record actual outcomes and limitations in the journal. Synthetic native clients do not establish authenticated model or containment acceptance.

All 434 directed regressions pass serially without increasing test deadlines. All four final complete controls pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5 with identical compiled code. Preserve earlier timing and unknown-audit failures in the journal; a missing proof continues to refuse passage. Static/docs/package checks pass.
