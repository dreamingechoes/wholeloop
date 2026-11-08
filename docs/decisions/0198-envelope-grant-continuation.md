# 0198 — Envelope-grant continuation under none intervention

- **Status:** Accepted
- **Date:** 2026-11-02

**Amended 2026-11-08.** Implemented as accepted, with one narrowing and these placements:

- **Reducer:** it allows the run's own envelope grant only when that grant is the one the run already ran under and it is still active, not revoked or expired.
- **Repair effects:** `DeliveryLifecycle.track`, the single writer of grant events, checks that the grant lists the repair effects. `checkPlanEnvelope` already keeps the revision inside the envelope, and registration already enforces the repair budget.
- **Controller:** `DeliveryRunner.runWithRepairs` records the continuation itself, with the receipt's authority set to `envelope-grant-continuation` and the controller as its author, and runs the successor request in the same foreground invocation.
- **Narrowing:** this applies only when the plan has exactly one code unit, because the owning unit is never guessed from failure text. Other plans keep the operator path.

**Accepted on 2026-11-08** by the maintainer. Implementation is tracked in [P6-41](../../roadmap/phase-6-autonomous-delivery.md#p6-41--envelope-grant-continuation); until it lands, [0197](./0197-correction-revisions-and-stage-reuse.md)'s new-grant rule still applies, and a native trial must still show the bounded repair loop staying within its budget.

## Context

[0193](./0193-cross-invocation-correction-protocol.md) allows a `none` run to continue after a repairable failure under a grant that already carries the repair effects and budgets, without an operator. [0197](./0197-correction-revisions-and-stage-reuse.md) implements the conservative reading instead: every correction revision needs a new exact-plan grant, issued after the failure. The wider option changes who can approve a continuation, so AGENTS.md leaves it to the maintainer.

## Proposal

Allow the first grant on a correction revision to be the run's still-active envelope grant when all of these hold:

- the run's intervention is `none`;
- the envelope grant already lists `code.write`, `git.commit` and `test.run`;
- the correction revision is inside the envelope;
- the journal-derived repair budget remains.

The controller could then register and run the continuation in the same foreground invocation that observed the failure, with no human step.

## Consequences

Fully unattended repair of integration and acceptance failures within the original authority. A grant would authorize work after the run it was first used for had ended, which is exactly the widening ADR-0197 avoids. Accepting this needs the maintainer's decision and a native trial showing that the bounded repair loop stays within its budget.

## Alternatives

Keep ADR-0197's rule, under which an operator issues each continuation grant. This is the current behavior.
