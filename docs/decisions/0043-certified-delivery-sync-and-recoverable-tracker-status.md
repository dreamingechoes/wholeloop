# 0043 — Certified delivery sync and recoverable tracker status

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A closed PR is not necessarily merged, a manually closed slice does not prove all repository parts shipped, and a merge is not a final product decision. Scheduled synchronization also must not repeat uncertain tracker writes, erase later human edits or remove an active developer workspace.

## Decision

- Read published PR status through its exact provider and repository context. Certify only complete matching URL/repository/head/base/commit observations with merged=true/state=merged/draft=false. Missing, partial, closed-unmerged and changed heads remain unresolved. Label imported normalized observations separately.
- Close slices/parts only from certified merge receipts. Require every repository part before closing a parent slice, even when it also owns a PR. Manual status alone establishes no delivery. Explicit reopening invalidates its old publication eligibility; a new tested PR plan is required before automatic closure.
- Scope delivery-ready is a milestone, not final item closure. Every current slice needs certified closure; route the scope to prepare-launch without fabricating intermediate step history. decide-next retains final scope/initiative closure. Reopening/new work invalidates stale readiness and refreshes its projection.
- Tracker transitions require an explicit provider/ref/target state and certified closure/delivery basis. Never guess a remote item or vendor state ID. Read a complete matching current state/revision, journal unique intent before writing and observe the desired state afterward. Lost outcomes reconcile through reads; no ambiguous write is repeated. Later external edits are reported and preserved.
- Reuse WorktreeManager pruning outside the journal lock, only for certified merges and stopped allocations. Retain active, dirty, locked, non-owned or not-locally- merged worktrees. Preserve branches and run no process shutdown or force delete. Remote squash/rebase merges may remain retained until integration is confirmed locally or the owner follows explicit conservative cleanup.
- Repeated unchanged sync adds no journal events. Unbound tracker targets remain handoffs; the CLI uses code-host read commands or explicit imported observations, while actual tracker bridges are supplied through the SDK conductor boundary.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Treat a closed PR or matching branch name as merged | Can close rejected work or the wrong commit |
| Close a multi-repository slice after one PR | Loses unmerged implementation parts |
| Close the product scope at merge | Skips launch, measurement and its human decision |
| Reapply a cached tracker target after human edits | Moves external state against newer intent |
| Retry a lost transition | Can repeat an external workflow effect |
| Stop/prune active work after a remote merge | Can remove a workspace still in use |

## Consequences

Local proofs, routing, state changes, explicit tracker transitions and real Git cleanup fixtures run without a live provider. Actual code-host authentication, tracker revision semantics, imported-observation truth, scheduling and cleanup across merge strategies/platforms remain owner verification. No authenticated remote read/write or actual project cleanup ran during implementation.

[◀ Decisions index](./README.md)
