# 0248 — CI correction continuation under the envelope grant

- **Status:** Accepted
- **Date:** 2026-11-08

**Accepted on 2026-11-16** by the maintainer. Implementation is tracked in [P8-01](../../roadmap/phase-8-software-factory.md#p8-01--ci-correction-continuation).

**Amended 2026-11-16 (implementation).** Implemented as accepted, with these placements and two findings from the model-free rehearsal:

- **Controller:** `selectEnvelopeContinuation` picks the continuation by reads only. A failed `ci` stage qualifies when the run is `none`, the plan has exactly one code unit, as in [0198](./0198-envelope-grant-continuation.md), the still-active envelope grant lists `git.push` besides the repair effects, and `continueCiDelivery` finds the original failure classified `repair` with push budget left. `acceptEnvelopeContinuation` then records it with authority `envelope-grant-continuation` and starts the successor in the same `runWithRepairs` invocation.
- **The mark:** it lives in the continuation receipt, not in the journal's registration payload, because that version-one schema is frozen. `DeliveryLifecycle.track`, the single writer of grant events, admits the envelope grant on a CI correction only when the receipt carries the mark and the grant lists `git.push`. An operator's CI proposal therefore still needs a new exact-plan grant.
- **Environments:** the failed request's environments keep holding the daemon's capacity, and the continuation's verification cannot run beside them. Before recording the continuation, the controller asks the host to stop them through the environment lifecycle. A stop keeps their data and evidence; retiring them stays the operator's decision. If any one is not observed stopped, nothing is recorded and the run ends as before. This applies to [0198](./0198-envelope-grant-continuation.md)'s continuations as well, whose synthetic tests never provisioned real environments.
- **Effect limit:** a grant's effect limit counts every effect issued under it, so a continuation under the same envelope grant spends what the original attempt left. Size the envelope grant's limit for the original attempt plus its repairs; the operator path gets a new grant and a new limit.

## Context

After publication, a failed required check becomes a bounded repair request ([0187](./0187-bounded-ci-repair-requests.md)), and the versioned CI correction producer builds the repaired head ([0214](./0214-versioned-ci-correction-production.md)). Starting that correction still needs a new exact-plan grant issued after the failure, so an unattended run stops at its first failed check. [0198](./0198-envelope-grant-continuation.md) lets integration and acceptance corrections continue under the run's envelope grant; CI corrections are not covered.

## Decision

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
