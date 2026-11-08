# 0252 — Evidence-based failure diagnosis

- **Status:** Proposed
- **Date:** 2026-11-08

## Context

The operator report explains a run's outcome, waits and next permitted actions read-only, and a failed observation becomes a `repair` or `blocked` request ([0187](./0187-bounded-ci-repair-requests.md)). It does not say why something failed. A test that fails intermittently, a broken environment and a contradictory specification all look like a failed check, and each needs a different response; guessing between them is exactly what the harness refuses to do.

## Decision (proposed)

- Add a diagnosis stage after a failed integration, acceptance or CI observation. A read-only diagnostician receives the retained failure, its evidence and the pinned definitions, and returns one of four classes, each with its evidence: **product defect**, **intermittent test**, **environment** or **specification conflict**. Anything else is **unknown**.
- An intermittent test is claimed only from repetition: the controller reruns the same suite at the same commit in a fresh environment a bounded number of times. Differing outcomes with identical inputs make it intermittent; it is never treated as a pass.
- Each class routes to one action: a product defect becomes a repair task within budget; an environment failure gets one fresh environment and then escalates; an intermittent test and a specification conflict escalate to a person with the evidence (proposal 0253); unknown escalates.
- The diagnosis is advice with evidence, not authority: it cannot change acceptance definitions, skip a check or widen a grant.

## Alternatives rejected

- **Letting the builder decide why its own change failed.** The producer of a change is the wrong judge of it.
- **Automatic quarantine of intermittent tests.** It changes what passing means without a person.

## Consequences

Fewer repairs are spent on failures code cannot fix, and escalations arrive with a classification and its evidence instead of a raw failure.

## Verification

Fixture failures for each class, a seeded intermittent test in a rehearsal, and checks that no class can turn a failed check into a pass.

[◀ Decisions index](./README.md)
