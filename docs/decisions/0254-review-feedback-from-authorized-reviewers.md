# 0254 — Review feedback from authorized reviewers

- **Status:** Proposed
- **Date:** 2026-11-08

## Context

Review comments on a run's pull request are kept with their identity and revision but never executed or adopted, and current review comments classify the CI repair request as `blocked` ([0187](./0187-bounded-ci-repair-requests.md)). Every comment therefore stops an unattended run, including routine requests from the people who own the repository. Comment text is untrusted input and can carry instructions aimed at the model.

## Decision (proposed)

- Comments on the run's own pull request from accounts with write access to the repository, observed through the code host at the pull request's current head, become review-feedback repair requests. Comments from anyone else stay retained and `blocked` as today.
- The builder receives the comment as bounded, quoted data inside a repair task, never as instructions, and the repair runs under the same grant, push budget and gates as any correction: verification, independent review and acceptance repeat on the new head.
- A comment that asks for something outside the run's scope or grant, such as another repository, a merge or a change to acceptance criteria, is not acted on and escalates (proposal 0253).
- The run replies on the pull request with the commit that addressed each comment, under the existing `pr.create` and publication authority.

## Alternatives rejected

- **Acting on every comment.** Anyone able to comment could steer the factory.
- **Asking a person about every comment.** It brings back the stop this record removes.

## Consequences

Routine review feedback from repository owners is handled without a person; everything else waits for one.

## Verification

Fixture comments from authorized and unauthorized accounts, an out-of-scope request that escalates, and a rehearsal where a comment leads to a repaired, re-verified head.

[◀ Decisions index](./README.md)
