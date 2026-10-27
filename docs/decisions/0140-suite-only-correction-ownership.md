# 0140 — Suite-only correction ownership

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

A known nonzero repository suite blocks verification before constructing a model-backed verifier. Its original owned Docker observation is valid while the root native-call prefix is empty. The initial correction adapter incorrectly required a nonempty prefix for every failure, so it could correct retained reviewer findings but not this suite-only failure. Absence of reviewer calls must not erase observed command failure or invent reviewer approval.

## Decision

Permit an empty original native prefix only for a suite-failure admitted by the fixed original QA reader. Preserve exact current failure/candidate authority, observed suite commands, closed application ownership, historical builder production, original deadline and the same next-generation queue admission. Other failure categories still require their original native prefix. The correction's own captured calls must remain nonempty, closed and exactly appended to the original prefix. Recovery retains that original empty prefix rather than introducing a synthetic reviewer invocation.

Share the existing synthetic builder fixture components with the actual suite scenario. Pin the acceptance definition before admitting its builder, preserving the production admission invariant. Keep ordinary fixture defaults, original suite/controller deadlines and public schemas unchanged.

## Alternatives rejected

Running a reviewer merely to manufacture a prefix wastes budget and changes the original evidence. Allowing every missing native manifest would weaken retained-finding ownership. Treating a correction as a passing suite substitutes the builder's claim for independent execution. Defining acceptance after a builder has started violates the invariant the runtime already enforces; fix the fixture ordering rather than bypassing it.

## Verification

Run an actual Docker suite with exit seven after original synthetic builder production and a pre-builder pinned case plan. Observe zero original QA model calls, one correction call and a completed second builder generation. Preserve the original global window and one failure record; keep QA/commit pending, root stage active and original application ownership closed. Recover while paused without selectors or another model and retire only the exact fixture environment. Run ordinary worker, verification, suite and frozen-contract regressions. Record initial fixture failures and actual results in the journal; native containment and whole-route acceptance remain separate.

The actual Docker/synthetic-native scenario passes on macOS Node 24, including exact observed retirement. Preserve the first fixture-ordering rejection; final post-ordering regressions pass 436 cases, after the initial 453-case worker/verification/suite check. Static/docs/package checks pass. No separate Linux application-host or native-account acceptance is inferred.
