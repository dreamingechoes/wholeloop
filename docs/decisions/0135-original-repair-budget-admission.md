# 0135 — Original repair budget admission

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Read-only failure feedback supplies no permission to correct code. Before dispatch, an unattended controller must check its original active stage, grant, deadline and gate allowance and account for the exact observed failure. Losing the response after that journal write must not count the same failure twice or reserve another worker. Existing budget event schemas already provide the necessary immutable observation.

## Decision

Add an internal admitRunnerRepair boundary using only fixed verification/review readers. Require the exact active original stage/plan/invocation, explicit unattended policy, active report/code/commit/test authority and the original live cancellation/deadline window. Require actionable original feedback; exhausted gates and unavailable QA refuse before failure accounting. A caller may narrow the original deadline but cannot extend the deadline stored in the original gate binding.

Journal the observed failure through the existing budget implementation with an idempotent key bound to the original invocation, gate and candidate. Use the existing failed-behavior category and the SHA-256 commit-receipt identity required by the closed budget schema; preserve detailed failure classification in the bound feedback. Retain the stable finding fingerprint and audited observation. Recheck original window, candidate receipt and native closure after accounting. Existing budget exhaustion still blocks admission.

The journal entry accounts for a failure, not an attempt, progress claim, exclusive queue reservation or correction dispatch. Repeating admission after a lost response reuses the same key and payload. Actual one-shot worker intent, candidate succession, repeated-fingerprint handling across later candidates and fresh QA remain separate implementation work. Do not change historical budget signatures, add another runtime allowance or relax supervised entrypoints.

Pin the exhaustion control to an explicit single review round before execution. Configuration defaults allow four verify rounds and three review rounds; a first-round failure under those defaults is not evidence that exhaustion was tested. Preserve ordinary defaults and original test deadlines.

## Alternatives rejected

Treating read-only feedback as write authorization bypasses the original grant and cancellation window. Reserving another worker during failure accounting consumes work before a dispatch identity exists. Counting lost responses as new failures inflates no-progress accounting. Recording fresh commits as progress hides unresolved findings. Extending closed budget categories or storing a forty-character Git SHA in a SHA-256 identity field breaks existing contracts. A separate mutable admission file duplicates the existing budget journal without providing one-shot worker ownership.

## Verification

Exercise supervised refusal, cancellation, pause, expiration, changed plans, revocation and unavailable evidence with no attempts or failure records. Pin and observe an exhausted unattended review and refuse admission. Separately use an actual Docker nonzero suite under explicit unattended authority: lose the response after failure commit, recover identical admission, retain one journal entry and unchanged reservations/deadline, refuse deadline extension and pause, and observe exact retirement. Record actual results and correct the earlier insufficient exhaustion-control claim in the journal. No actual correction or whole-route acceptance is inferred.

The final five-file regression passes 468 cases. All ten complete controls pass on macOS Node 24 and Linux Node 20.0.0 using identical bundled code, including explicitly exhausted and still-authorized review cases. The focused actual Docker admission scenario passes journal response-loss recovery, deduplication, unchanged reservations/deadline, pause/extension refusal and exact retirement. Lint, types, build, docs, harness, Markdown, Mermaid and offline package checks pass. Actual repair dispatch and full-route acceptance remain open.
