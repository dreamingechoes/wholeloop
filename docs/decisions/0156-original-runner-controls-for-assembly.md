# 0156 — Original runner controls for assembly

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Owned integration assembly already journals every Git operation separately and recovers original effects without replay. Joining it to the foreground runner additionally requires the root invocation's narrower deadline, cancellation signal, current ownership and actual wrapper registration. The broader delivery effect budget alone cannot establish those controller bounds.

## Decision

Accept the existing fixed Git control as an optional assembly dependency. When configured, reject cancelled, expired, malformed or fenced control before preparation and execution, and before admitting each new effect. Pass that same control to every original assembly Git wrapper, which enforces the narrower deadline, combines original cancellation signals, watches live ownership and registers its actual private operation before input.

Keep the original effect ledger, keys, request/record schemas, Git arguments, committed-part vector, conflict/repair behavior and unconfigured domain API unchanged. Read-only reconciliation and inspection do not require current controller authority; they reopen only original observations. A fresh controller can request cancellation of pending or unknown operations through each exact retained private nonce, including after revocation. Never signal a remembered PID, cancel a foreign operation, reset a deadline or infer integration QA from an assembled Git tree.

## Alternatives rejected

Relying only on the delivery deadline ignores a narrower root stage. Wrapping assembly in a new generic subprocess loses per-operation ownership. Checking control only once allows later effects after fencing. Requiring live dispatch authority for metadata recovery prevents inspection and original cancellation after revocation. Signalling stored process IDs risks unrelated processes after identifier reuse.

## Verification

Exercise cancelled, expired and fenced control before preparation/effects. Execute an actual complete three-operation Git assembly and require every original wrapper registration and exact narrower deadline; reopen it while paused without replay. Revoke authority immediately after original wrapper registration and require a fresh controller's cancellation to contain only that operation's original nonce, with no later effect. Retain existing assembly/conflict/repair, process and frozen-contract regressions. Record actual results before commit; complete-route and whole-product acceptance remain separate.

All 437 directed assembly/process/frozen-contract cases pass on Linux Node 24.22.0. The initial macOS run passes eighteen controls and catches an incorrect new exception assertion: original revocation retains a stale assembly with an unknown issued operation. The corrected control requires that exact state and nonce, then passes without another effect. Complete isolated Linux checks pass 3337 tests and all remaining checks. Root-route and whole-product acceptance remain unestablished.
