# 0141 — Historical owned commit receipts

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

Current workspace receipts deliberately fence older commits. Candidate succession nevertheless needs to audit the original parent receipt after an owned correction advances HEAD. Reusing current-head validation for that audit rejects valid history; weakening current validation would resurrect stale candidates.

## Decision

Add an internal validateHistoricalWorkspaceCommit operation sharing the exact owned receipt/effect validation with current-head checks. Preserve receipt hash/schema, original workspace/source/plan/grant, record/files/index/parent and both applied host-observed closed native effects. Preserve active original authority and current-basis restrictions. Historical audit omits only the latest-effect and unrelated outstanding-effect requirements that establish currentness.

Keep validateWorkspaceCommit and currentWorkspaceCommit strict. A valid historical receipt supplies neither a current candidate nor dispatch, QA, progress or endpoint authority. Audit performs no journal mutation, head-pointer publication or native work. Candidate-chain selection and fresh QA remain separate composition work.

## Alternatives rejected

Allowing an old receipt through current-head validation revives superseded candidates. Trusting its checksum alone admits fabricated metadata without matching native effects. Copying a second validator would let ownership constraints drift. Replaying the original commit destroys the distinction between history and a new effect.

## Verification

Create two actual owned commits in sequence. Audit the first receipt while current validation rejects it, keep the second current and reject a forged head even with a recomputed receipt checksum. Assert the journal remains unchanged. Retain existing stale-locator refusal and recovery only for the actual latest commit. Run ordinary commit/root Git/repair/frozen regressions and the same independent two-commit control on macOS and Linux/Node 20, recording actual results in the journal. This does not establish candidate-chain or whole-route acceptance.

Four-file regressions pass 441 cases. The final focused real two-commit case passes; the same independent control passes on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5, with the journal unchanged and old/forged current claims refused. Static/docs/package checks pass. Current candidate selection remains unchanged.
