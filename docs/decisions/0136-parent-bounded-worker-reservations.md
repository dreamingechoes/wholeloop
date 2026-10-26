# 0136 — Parent-bounded worker reservations

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

A new worker attempt must not outlive the root stage that authorized it. Native process timeouts already retain that parent boundary, but a fresh queue claim previously reserved its entire per-attempt allowance. The persisted worker assignment could therefore advertise a later deadline than the actual parent.

## Decision

Allow an internal targeted queue claim to narrow budget admission with a canonical parent deadline. Reserve only the minimum of that deadline, the original grant expiration and the remaining attempt/global allowance. Invalid or exhausted parent bounds defer without reserving an attempt. The owned worker stage supplies its original context deadline. Existing callers without a parent bound preserve their behavior; public schemas and grant limits remain unchanged.

## Alternatives rejected

Clamping only the process timeout leaves durable assignments misleading after recovery. Renewing the parent deadline at every claim expands authority. Mutating global budget limits to encode a single child's window incorrectly affects unrelated work.

## Verification

Exercise shorter and later parent bounds, absent bounds, malformed/noncanonical timestamps and expired/equal deadlines against actual queue journals. Verify the root worker's persisted reservation matches its original stage deadline and retain ordinary queue, budget and worker regressions. The journal records actual outcomes; repair dispatch and complete-route acceptance remain separate work.
