# 0198 — Envelope-grant continuation under none intervention

- **Status:** Proposed
- **Date:** 2026-11-02

## Context

[0193](./0193-cross-invocation-correction-protocol.md) allows a `none` run to continue after a repairable failure under a grant that already carries the repair effects and budgets, without an operator. [0197](./0197-correction-revisions-and-stage-reuse.md) implements the conservative reading instead: every correction revision needs a new exact-plan grant, issued after the failure. The wider option changes who can approve a continuation, so AGENTS.md leaves it to the owner.

## Proposal

Allow the first grant on a correction revision to be the run's still-active envelope grant when all of these hold:

- the run's intervention is `none`;
- the envelope grant already lists `code.write`, `git.commit` and `test.run`;
- the correction revision is inside the envelope;
- the journal-derived repair budget remains.

The controller could then register and run the continuation in the same foreground invocation that observed the failure, with no human step.

## Consequences

Fully unattended repair of integration and acceptance failures within the original authority. A grant would authorize work after the run it was first used for had ended, which is exactly the widening ADR-0197 avoids. Accepting this needs the owner's decision and a native trial showing that the bounded repair loop stays within its budget.

## Alternatives

Keep ADR-0197's rule, under which an operator issues each continuation grant. This is the current behavior.
