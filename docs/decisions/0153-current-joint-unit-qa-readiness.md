# 0153 — Current joint unit QA readiness

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Verification and review can each retain a passing root-stage record while the workspace changes later. A corrected candidate also needs both kinds of QA against the same current owned commit. Stage flags alone cannot establish that relationship, and a unit's passing QA is still distinct from whole-feature behavior and acceptance.

## Decision

Compose fixed verification and review readers from the same canonical store and host identity. Require the current declared unit route, original completed stages and current plan basis. Select the current candidate through its fixed correction lineage when present. Reopen each reader's original captured observations, requiring passing host-observed results with closed invokers.

Capture the owned commit/workspace and actual byte snapshot before inspection, then recheck them, both root records and the plan basis after the asynchronous reads. A changed, unavailable, fixture-only, incomplete or stale proof remains blocked or unknown. Passing root flags never replace the underlying reports. Inspection selects no suite or native factory and dispatches no work; underlying readers may recover only their original metadata.

Return unit readiness for the exact commit and original evidence only. Preserve root state, failures, deadlines and native scopes; record neither progress nor feature acceptance. Further behavioral verification after review repairs, readiness consumption by the remaining domain stages and complete-route/public execution remain technical work.

## Alternatives rejected

Checking only stage flags accepts stale or unsupported claims. Checking only a commit digest proves identity, not observed QA. Reusing an old verification after a review repair skips current behavior. Replaying models to inspect readiness creates new work and may consume another budget. Promoting unit readiness directly to feature acceptance skips actual integration and whole-product checks.

## Verification

Run table-driven admission controls for pending stages and unsupported passing flags without selecting any execution factory. Refuse readers from another store. Extend the actual Docker/synthetic-worker control with two corrections, three verification rounds and a following independent review: record both original stages, establish readiness for that exact head, change bytes while keeping both flags passed and require refusal, restore the bytes and recover exactly the original evidence, then inspect while paused without another selector, command or native invocation. Preserve two failures and the original global deadline and retire all three exact environments. Keep authenticated-native, independent Linux application-host and complete-route acceptance separate; record actual results before commit.

The complete four-file regression passes all 435 cases on macOS Node 24.22.0. All eight actual Docker/synthetic-worker controls pass, including changed-byte refusal while both flags remain passed and identical restoration/paused evidence without another execution. All three exact environments retire; static/docs/package checks pass. Preserve the initial fixture's rejection by the existing runtime enforcer and its correction using actual closed non-QA version controls. Complete repository evidence remains at the preceding 3317-test macOS/Linux milestone; current component evidence does not establish authenticated models, an independent Linux application host or the complete delivery route.
