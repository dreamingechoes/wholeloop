# 0248 — CI correction continuation under the envelope grant

- **Status:** Proposed
- **Date:** 2026-11-08

## Context

After publication, a failed required check becomes a bounded repair request ([0187](./0187-bounded-ci-repair-requests.md)), and the versioned CI correction producer builds the repaired head ([0214](./0214-versioned-ci-correction-production.md)). Starting that correction still needs a new exact-plan grant issued after the failure, so an unattended run stops at its first failed check. [0198](./0198-envelope-grant-continuation.md) lets integration and acceptance corrections continue under the run's envelope grant; CI corrections are not covered.

## Decision (proposed)

- Extend [0198](./0198-envelope-grant-continuation.md) to CI corrections: the first grant on a CI correction revision may be the run's still-active envelope grant when the run's intervention is `none`, the envelope grant lists `code.write`, `git.commit`, `test.run` and `git.push`, the correction stays inside the envelope, the failure is classified `repair` (a trusted code or test failure, never a cancelled, skipped, stale or unreadable result) and the push budget counted from the journal remains.
- The controller verifies those conditions against the private grant, records the continuation with an `envelope-grant` authority mark, and runs it in the same foreground invocation. The journal reducer accepts the envelope grant on a correction revision only when that mark is present.
- Review comments are not covered here; proposal 0254 decides them separately.

## Alternatives rejected

- **Retrying the failed check.** A rerun can hide a real failure and does not change the code.
- **A general standing grant for every correction kind.** It would authorize effects the original envelope never listed.

## Consequences

An unattended run reaches a green pull request across repairable check failures, bounded by its push budget. Exhausting that budget, or any `blocked` classification, still ends the run with its request.

## Verification

Reducer tests for each condition, a model-free rehearsal with a seeded failing check, and one live scenario on a reference client.

[◀ Decisions index](./README.md)
