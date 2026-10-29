# 0155 — QA-ready predecessor incorporation

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

A downstream unit must start from the exact code its predecessors verified and reviewed. The original internal Git adapter only consumes a current initial commit and a passing review flag. That path cannot select a corrected predecessor, while a flag alone is insufficient evidence for a fully composed unattended route.

## Decision

Allow the fixed Git adapter to receive an explicit map of unit IDs to current joint-QA readers from the same canonical store. Copy the map at construction so caller mutation cannot silently change admission. When configured, require a reader for every transitive code predecessor; never fall back to the legacy flag-based path for a missing reader.

Reopen each predecessor's original verification and independent review, require current host-observed readiness, and select the exact owned receipt through that reader's fixed correction lineage. Incorporate only that commit, branch and worktree. After all asynchronous readers finish, recheck every selected candidate and both root records before preparing the downstream resource. Recheck original controller ownership, root stage, cancellation and deadline after the await as well. Workspace preparation retains its existing plan/authority, committed-byte, ancestry, snapshot and Git effect checks.

Keep the unconfigured adapter's existing initial-commit behavior for compatibility with earlier internal composition. The complete-route composer must explicitly supply its fixed readers; configuring one unit does not authorize an unconfigured predecessor. Neither path grants feature acceptance, integration QA, publication, a new worker allowance or a deadline extension. Paused recovery of an already issued downstream workspace reopens its original Git evidence without rerunning predecessor models or checkout.

## Alternatives rejected

Using only a passing root flag accepts stale or unsupported QA. Falling back to the initial receipt after correction selects the wrong candidate. Falling back when a configured reader is absent hides incomplete route configuration. Holding only the caller's mutable map allows admission to change unexpectedly. Checking authority only before asynchronous inspection can prepare resources after cancellation or expiry.

## Verification

Refuse missing readers and absent original QA before creating any downstream resource or selecting execution. Mutate the caller's map and require the originally fixed reader to remain selected. Exercise cancellation, expiration and fencing in the microtask gap before preparation, preserving all original time limits. Keep existing Git and frozen-contract regressions.

Extend the actual Docker/synthetic-worker evaluation with a contract successor declared in the original plan: produce and verify two corrections, independently review the current head, reconstruct the checkpoint, refuse changed predecessor bytes without a journal mutation, restore them, incorporate the exact QA-ready corrected commit and inspect the issued downstream workspace while paused without replay. Preserve the existing criterion-ownership rule; the successor owns a separate unproduced fixture contract, not the predecessor's criterion. Record actual results before commit, keeping authenticated-model, independent Linux application-host and complete-route acceptance separate.

All 435 directed predecessor/Git/frozen controls pass. The identical predecessor source snapshot passes complete macOS and Linux checks with 3328 tests in 172 files, excluding the later evaluation-only queued-transition correction. The corrected complete actual Docker/synthetic-worker trial passes all eleven controls, including current corrected-head incorporation, changed-byte refusal and paused downstream recovery; all three exact environments retire. Preserve the initial criterion-ownership and invalid lifecycle-transition failures rather than weakening either rule. Later complete Linux evidence passes 3340 tests with the additional assembly components. Full-route and authenticated-model acceptance remain unestablished.
