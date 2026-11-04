# 0167 — Owned local handoff endpoints

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

A passing acceptance stage is not a completed local handoff. The endpoint must identify the exact accepted topics, retain its report and remain current when inspected later. A root passed flag, missing report locator or changed candidate must not establish code-ready. This terminal metadata work has one deterministic answer and needs no additional model session.

## Decision

Add a fixed local-handoff adapter over the same store's acceptance controller. Expose the acceptance controller's validated original input identity separately from its current verdict. Require the latest completed acceptance record and its matching current observed verdict, closed owners, decision evidence and unchanged original input before selecting topics for a report. Recheck that chain when inspecting the report or observing the endpoint.

Capture the original handoff context, signal and deadline. Consume one original report binding before registering actual owned-core metadata work or capturing a budgeted artifact. Bind that original runtime to the authoritative stage record. Its PID is descriptive and never a cancellation target. A separate completion timestamp must establish that the report was captured inside the original window. Losing a consumed binding or report cannot buy another artifact or a new deadline.

The versioned local report identifies the exact source, accepted product and repository topics. It records neither human approval nor publication. Reopen exact bytes through their observed artifact ledger, original consumption, runtime and completion time; then require unchanged current acceptance. Preserve metadata recovery after pause and exact environment retirement without any model, command or Git mutation. Original nonce-bound cancellation remains available for a known native prefix; core PID fields are never signalled.

Return current code-ready endpoint evidence only when the actual handoff stage is passed and its current observed report still matches that original record. Support only the declared local-handoff policy. Publication and merge endpoints cannot inherit this local outcome or silently fall back to it. A failed eligibility check exposes no current endpoint.

## Alternatives rejected

An extra reporter model adds a new uncertain judgment to deterministic data. A passed flag omits the actual accepted product and report. Treating a stored report as permanently current misses later candidate edits. Reconstructing a lost report consumes another allowance and obscures its original producer. Signalling a stored core PID risks an unrelated process after reuse. Declaring local delivery for a requested remote endpoint misstates the operator's authorization and requested outcome.

## Verification

Exercise cancellation, expiration, fencing, replaced signals, invalid deadlines, unaccepted products, remote policies, revoked grants, lost reports, unsupported passing flags and foreign readers without report capture or model selection. Compose actual disposable Git/Docker QA, synthetic independent acceptance and one owned-core handoff; observe code-ready without a new native process. Refuse missing locators and changed candidate bytes, restore identical report/endpoint evidence and journal, and recover from a fresh controller after pause/retirement with denying selectors. All 25 directed handoff/acceptance tests pass on macOS Node 24.22.0. Eleven actual disposable Git/Docker controls pass, including original within-window report capture, current code-ready, changed-candidate and lost-locator refusals, identical restoration and exact environment retirement. A fresh denying controller recovers identical endpoint evidence after retirement without replay or journal changes. Complete isolated Linux arm64/Node 24.22.0 checks pass 3412 tests in 181 files and every remaining check. The journal records exact frozen bundle/archive identities; full public-route composition, hosted endpoints, real-model and independent Linux application-host acceptance remain separate.
