# 0150 — Owned correction successors

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

The first corrected candidate may still fail observed QA. Its completed builder slot can support another authorized generation, but reusing the first correction's locator would overwrite ownership and invalidate earlier commit evidence. Selecting only direct children of the initial commit also prevents a legitimate later correction from becoming the current candidate.

## Decision

Bind later correction workers to a fixed recorded predecessor checkpoint and receipt digest in the same store, request and root invocation. Construction binds only the locator so original cancellation remains available after revocation; read/dispatch reopens the actual historical checkpoint and production. Use a separate version-two worker namespace keyed by that predecessor receipt. Keep version-one paths and proof objects unchanged.

Require current original QA feedback/admission to name that exact predecessor, retain its narrower producer deadline, and require its original builder lease still current and positively complete before fencing. Recheck admission after selecting context, persist one-shot intent, then fence/requeue the same slot and claim its next generation under existing restart/global/no-progress limits. Lost ownership remains unresolved rather than granting another claim or model. A completed correction still leaves commit and independent QA pending.

Store each later correction commit in its own predecessor namespace. Reopen known historical commit receipts through the fixed worker/commit proof, preserving actual effects and previous production digests. Current selection must follow every explicit predecessor checkpoint back to the initial root commit, validate historical receipts and immediate parent/workspace relationships, reject cycles and then retain all existing latest-effect/owned branch/files/index checks. A matching HEAD or file timestamp cannot replace that lineage.

Paused recovery reconstructs the same scoped worker/checkpoint without selectors, factories or replay. Equivalent fixed checkpoint instances can reopen the same recorded parent; object identity is not durable authority. This implements later production, commits and current candidate selection. Repeated verification/review continuation and complete-route/public execution remain technical work.

## Alternatives rejected

Overwriting the first worker/commit locator destroys history. Creating another builder cell bypasses restart accounting. Selecting a historical parent by timestamp or latest filename is ambiguous. Treating a previous receipt as a current lease revives fenced work. Requiring one JavaScript object instance across restarts confuses process identity with recorded ownership. Marking the new commit as QA-passed would skip independent observation.

## Verification

Run repair/root-Git/commit/frozen regressions and factory refusal controls. Extend the actual Docker/synthetic-worker composition with the original no-progress limit of three: observe the same failure on the first correction, dispatch one further worker in generation three, preserve the original production object, commit distinct corrected bytes, require exact parent lineage and current selection only through the new checkpoint, then recover while paused without inputs/hosts or another worker. Preserve two accounted failures and the original global deadline; retire both exact environments. Record actual results and remaining QA/platform limits in the journal.

All 441 directed regressions and three new actual Docker/synthetic-worker controls pass on macOS Node 24. The updated factory-refusal case separately passes; static/docs/package checks pass. Both exact environments are observed retired. The later commit is selected only through its audited lineage and retains QA pending; no repeated-gate, authenticated-native, independent Linux application-host or full-route acceptance is claimed.
