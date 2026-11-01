# 0192 — Revision impact and explicit adoption

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

Source intent can change while a run is active. New content must never silently replace the approved request or drop required outcomes. An operator needs to see exactly what a change affects before adopting it, and evidence may be reused only when its complete inputs are unchanged.

## Decision

Add `revisionImpact`, a pure calculation, and `wl delivery revise`, which previews by default.

- **Impact.** For the next revision of a run, the impact lists:
  - added, removed and changed criteria and removed outcomes;
  - whether authority must be renewed, meaning repositories, policy, budgets, capabilities, guidance, source or owner changed;
  - whether an envelope grant still covers the revision;
  - a reuse or invalidation decision with a reason for every route stage;
  - active attempts that need fencing and effects that need reconciliation.
- **Reuse.** The new plan bytes always need re-authorization. Any other stage is reused only when its own definition, its unit's work, its criteria, its milestone and every non-plan predecessor are unchanged; a missing or changed dependency invalidates it. Because builders consume the pinned acceptance definitions, a changed criterion invalidates every stage after them.
- **Adoption.** It is automatic only under an envelope grant when the revision stays inside the envelope, removes no criterion or outcome, keeps authority unchanged, is the exact next revision and no stage is unresolved. Otherwise a none-policy run is `blocked` and a supervised run needs the operator.
- **Preview.** `wl delivery revise --run <id> --file <plan.json>` validates the proposal and writes nothing.
- **Acceptance.** With `--accept`, the command needs an operator and a reason, refuses blocked or unadoptable revisions, and needs `--approve-removals` for removed criteria or outcomes. It writes only the immutable next revision and a `wholeloop/delivery-revision@1` adoption record linking the predecessor. The run keeps its approved basis until authority covering the new revision is tracked, and earlier records stay unchanged and historical.

## Alternatives rejected

Letting a model judge which evidence is still valid would make reuse a guess. Applying a source change directly would replace approved intent without anyone accepting it. Allowing an envelope to approve removed outcomes would let an unattended run drop requirements to finish.

## Verification

- Unit cases reuse every stage for an unchanged revision, cascade a changed criterion, keep unit evidence when only a milestone procedure changes, and flag removed outcomes and widened authority.
- Further cases list pending effects, refuse a skipped revision, and adopt automatically only inside an envelope while a none-policy run outside it is blocked.
- Adoption cases show that a preview writes nothing, that acceptance records only the revision without moving the basis or changing the journal, and that a repeat, unapproved removals and out-of-envelope none-policy revisions are refused.
