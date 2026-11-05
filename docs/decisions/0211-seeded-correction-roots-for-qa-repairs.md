# 0211 — Seeded correction roots for QA repairs

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

[ADR-0208](./0208-seeded-correction-producer.md) gives a continuation its own seeded workspace, implementation and correction commit. Later verification or review can find another defect in that correction. Two existing assumptions prevent its bounded repair:

- The implementation's builder lease was already fenced by the continuation correction. It cannot be selected as the new repair's predecessor.
- The existing repair checkpoint anchors to the implementation commit. A repair of the continuation correction instead descends from the correction's own commit and completed builder generation.

The correction stage also used current native completion and the current workspace head when inspecting production. Fencing that lease or committing a later owned repair consequently made completed production unknown. Production history, current lease eligibility and current candidate selection need separate proofs.

## Decision

1. **Read one original production root.** A fixed reader binds the exact current request, plan, unit and original correction stage to its retained failure, private intent, completed builder generation, original task, captured inputs/results, stopped native scope and controller-owned commit. Missing, substituted or unrelated evidence refuses.
2. **Locate an existing receipt from exact effects.** Reconstruct only the receipt locator from the immutable commit record and its two exact owned staging/commit effects. Read the already stored receipt and validate its original native effects; never create a receipt from descriptive metadata, scan for the newest file or accept an arbitrary ancestor.
3. **History grants no current lease.** Original production remains inspectable after fencing or supersession while the current request's authority remains valid. It supplies no QA verdict and does not make the old attempt current. A new repair must separately verify the correction's current completed lease before fencing/requeueing it under the ordinary one-shot protocol.
4. **Anchor the checkpoint to that root.** The first QA repair uses the latest passed, unreused correction of its own request and unit. Existing fixed checkpoint/store guards remain required; later repairs audit every explicit predecessor back to the exact correction commit. An unrelated owned commit remains ineligible.
5. **Keep original private cleanup available.** Bind cancellation to the exact recorded request/stage/invocation and host. It needs no current execution grant, and a caller cannot substitute a foreign invocation tuple. Cleanup neither dispatches a worker nor restores execution authority.
6. **Preserve every other boundary.** Keep original failure admission, deadlines, restart/no-progress limits, independent fresh QA and the five-field historical repair-production object. Keep existing version-one private bindings and public identities. Cross-invocation execution still needs a fresh exact-plan grant; this adds no envelope-grant continuation or credential authority.

## Alternatives rejected

- **Reuse the fenced implementation lease.** It no longer owns the slot and does not describe the code being repaired.
- **Accept any owned descendant.** Git ancestry does not prove which bounded worker produced a candidate or which failure it addressed.
- **Replay the correction stage.** A completed production stage cannot authorize another worker, commit or renewed deadline.
- **Drop the checkpoint root check.** That would turn a current-head observation into evidence of an unaudited producer.

## Implementation and verification

The fixed historical reader, existing-receipt locator and first-repair/checkpoint integration are implemented. A real owned-production/Git component regression fails before the fix when its lease is fenced, then passes after the fix even after a separately owned commit. Historical reads append no event, restore no current native lease and refuse changed feedback, a substituted commit locator and revoked authority. A later unbound head still has no candidate eligibility. Separate red/green guards keep original cleanup available after revocation and reject borrowed invocation tuples.

A negative control preserves the default two-restart refusal after the old build, seeded rebuild and correction. The positive control declares three restarts before its first grant, permitting the fourth builder generation without renewing a runtime limit. It observes an independent fixture finding, commits the exact repair and reopens its checkpoint without replay. Seven focused cases across lifetime, repair budgets and earlier seeded continuations pass.

`npm run eval:runner-verification-continuation -- --seeded-correction --retire-success` passes five actual Git/Docker observations: an immutable pre-builder suite fails, its exact corrected head is repaired, the same definition passes in a distinct captured environment with independent fixture judgments, a fresh checkpoint reopens without events/workers, and both exact environments retire. The earlier mapping-error and cancelled five-second case-window trials remain failures. The final new trial uses the existing Docker controls' thirty-second case/suite window for owned preparation; the application command remains limited to five seconds and the original controller window to 240 seconds. No original failing definition or deadline is rewritten.

The Linux arm64 component smoke passes original history, fenced-lease refusal and original cleanup on Node 20.0.0 and 24.22.0 with Git 2.39.5. The first cached Node 20 image contained Git 2.30.2, below the documented 2.36 minimum; its refused workspace is retained as an unsupported-prerequisite trial. These are component checks, not a full Linux suite. Synthetic clients and independent fixture judgments certify no actual native/model, containment or hosted route. The mandatory per-commit gate passes with `CHECK PASS (fast) in 373s`; the full gate remains required before task closure. CI-origin continuation remains separate P6-29 work.

[◀ Decisions index](./README.md)
