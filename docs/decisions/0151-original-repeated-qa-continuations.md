# 0151 — Original repeated QA continuations

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

A second owned correction has its own predecessor and exact commit lineage. Reusing the first continuation locator would bind it to the earlier failure and overwrite recovery ownership. Likewise, always reopening the first suite ignores the immediate predecessor's observed behavior and environment.

## Decision

Namespace later review and verification continuations by the fixed correction worker's predecessor receipt. Preserve the original flat version-one continuation and existing intent schema. Read and dispatch through the exact scoped checkpoint; retain all existing same-run, immediate-round, allowance, candidate, original-deadline and one-shot marker checks.

For each corrected suite, resolve the exact predecessor gate digest from the correction producer's authoritative feedback. Reopen the original flat suite or that exact digest-namespaced phase, validate its closed shape, original request/stage/run/round and nonpassing nonexhausted decision, and inspect its own original environment scope. Preserve unchanged acceptance, command mapping, timeout and original narrower window, and require a distinct captured environment. Do not select by directory order or latest timestamp.

A fresh journal observation shares its fully validated event replay with get/list and transaction admission instead of rebuilding the same state twice. Every call rereads authoritative bytes; no projection or authority is cached across calls. Flat journal segments check their shared external directory before and after reading, reject each leaf alias and retain descriptor/byte/chain validation. A changed directory device/inode refuses the observation; new append-only leaves do not invalidate an otherwise original prefix. Every mutation still uses the original full external-store boundary. The controller's live-poll regression counts that fresh observation and still sees immediate pause/revocation. Caller mutation of an observation cannot poison a subsequent read. Acceptance authority checks share one fresh budget/state/grant observation within each check; behavior effect checks select the exact effect from that same validated state instead of rereading it. Polls still reload all authority. Binary reads allocate for the descriptor's observed length plus one byte rather than its entire upper quota, preserving finite bounds, complete-length checks, no-follow descriptors and final size/time/inode/path rechecks. Safe suite-audit categories reach verification diagnostics; raw process output never does. Native scope inspection reads all original nonce-bound registrations before one fresh bounded process-table query. Every member uses that same observation, with no cache across inspections and no retry per member after an unavailable table. This preserves exact original group/outcome evidence and never grants permission to signal a stored PID.

Paused recovery reopens the same final round and captured outputs, restores the active locator and dispatches nothing. Earlier continuations, rounds, failures, global deadline and root-stage status remain unchanged. This enables repeated original review or verification independently; it does not yet compose behavioral verification after review repairs, cross-stage readiness or the public complete route.

## Alternatives rejected

Overwriting one continuation destroys recovery lineage. Starting a fresh gate run bypasses the original allowance. Always comparing with the first suite skips the immediate predecessor. Treating a commit as passing QA confuses production with observed behavior. Broader deadlines and replay after lost responses would hide missing ownership rather than recover it.

## Verification

Run directed verification/review/suite/feedback, journal/store freshness and frozen-contract regressions. Run a finite actual Docker composition with an unchanged pre-builder script that fails on the original and first correction, then passes only on the second correction. Require three rounds of the same original gate, independent synthetic judgments only after the suite passes, exact paused locator recovery, two retained failures, unchanged allowance/deadline and retirement of all three environments. The original reservation permits only two live environments: retire the oldest exact environment before provisioning the third, retaining its observation records.

Run a separate finite synthetic-process review composition with two independently confirmed failed rounds and a passing third round after the second correction. Require unchanged first-continuation bytes, exact original run/budget, parent lineage and paused recovery without models, planning, failure reset or root-stage completion. Keep authenticated-native, independent Linux application-host and whole-route acceptance separate; actual results belong in the journal.

Complete final checks pass 3317 tests in 169 files on macOS Node 24 and isolated Linux Node 24, with all remaining checks green. The actual Docker composition passes five controls and retires all three exact environments. Both process-batched three-round review controls pass on macOS Node 24 and Linux Node 20.0.0; the final flat-read control also passes both checks on Linux Node 20.0.0. The journal retains exact bundle/archive identities, earlier failures and the scopes of these observations. No authenticated model, independent Linux application-host or complete-route acceptance is inferred.
