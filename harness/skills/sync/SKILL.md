---
name: sync
description: Reconcile exact published PR merges with slice delivery, explicit tracker targets and conservative stopped-worktree cleanup.
---
# Synchronize delivery

Read output-contract and synchronization. Read speaking-to-person.

1. Run `wl sync --for <item> --json`, or omit --for for all stored work. The CLI reads PR status with gh/glab credential stores. It never pushes, merges or invents a tracker destination. Use --prune off to retain all worktrees.
2. Import explicit normalized host observations with --file when the client owns reads. wholeloop/sync-observations@1 entries name the exact published PR plan event/ref and either a complete result or an unavailable reason. Imports are labelled; they do not prove authentication or actual remote execution.
3. A matching non-draft merged PR closes its slice/part. Every repository part must have certified merge evidence before the parent slice can close. Manual closure alone cannot establish delivery. Unknown/mismatched reads stay open.
4. Every certified slice makes its scope delivery-ready and routes to prepare-launch. The scope stays open for learning; decide-next owns its final human outcome.
5. An explicit SDK conductor can supply SyncWorkflow.run with a tracker host and per-item provider/ref/state targets. The core reads current revision/state, journals intent, transitions only certified delivery and verifies final state. Missing targets/hosts are handoffs. Unknown target state IDs are questions.
6. Retain interrupted transition intents. Reconcile with read-only observations; never repeat an uncertain write. Preserve later external tracker edits and explicitly reopened local work; old publication plans cannot re-close it.
7. Cleanup reuses conservative worktree prune outside the journal lock. Retain active/dirty/locked/non-owned or not-locally-merged work. Stop leases yourself; sync never stops worker/dev-server processes or deletes branches.
8. Report changes, unknowns, tracker outcomes and retained worktrees. Repeating unchanged work creates no new journal events. Report an actual missing remote observation or retained workspace with its reason.
