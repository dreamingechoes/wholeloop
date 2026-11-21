# 0258 — Proportional depth and gate cost

- **Status:** Proposed
- **Date:** 2026-11-18

## Context

[ADR-0010](./0010-interaction-profile-never-changes-coverage.md) keeps coverage fixed: the profile changes communication and concurrency, never checks, lenses or questions. The defaults follow it at full strength for every input:

- research gives every load-bearing claim three independent verifiers;
- verify plans the suite, one unit per criterion, a testability unit and a changed-tests unit; review runs all six built-in lenses, even on a four-line change;
- every finding is a blocker until a majority of three independent refuters argues it away, so a cosmetic note costs a repair, a verify round and a review round;
- `verifiers` is an enum of 3, 5, 7 or 9 in the configuration, research and gate plan schemas, so a person cannot lower the cost even deliberately.

A research question answerable from the repository in a few minutes took 14.6 minutes and about nine workers on 2026-11-17. Part of that came from scheduling and broken worker roles, fixed separately in Phase 9; the rest is this fixed cost.

## Decision (proposed)

Reduce cost first without reducing coverage, then decide whether coverage may vary:

1. **Without changing coverage (no change to ADR-0010):** deterministic checks the core can do itself (code citations at a commit), cost shown before every fan-out, parallel read-only workers, a cheaper model tier for verifiers when the person maps one, and lens applicability by changed paths for optional lenses only.
2. **Severity of findings:** findings carry `blocker`, `should` or `nit`; only blockers fail a round; the others reach the person in the hand-back. Mandatory lenses (correctness, security) keep fail-safe behaviour. This changes what fails a round, not what is inspected.
3. **Explicit depth (amends ADR-0010 if accepted):** `quick`, `standard` and `deep` for research and gates, chosen by the person or proposed by the step, never silently by the profile. Reduced coverage is recorded in the artifact and shown in the result ("not independently verified"); nothing is dropped below the existing refutation quorum, so a quick claim is unverified rather than retained or dropped. Verifier counts below three need new schema versions under [ADR-0066](./0066-v1-compatibility-baseline-and-deprecation.md).

Points 1 and 2 can be accepted independently of point 3.

## Alternatives rejected

- **Lower the defaults silently.** It would change what a verdict means without the person knowing.
- **Let the interaction profile choose depth.** ADR-0010 exists so that a gentler profile never means weaker checks; depth must be an explicit, visible choice.

## Consequences

Small questions and changes become cheap, and the cost of each check is visible before it is spent. Points 1 and 2 alone leave a floor: any research question still costs one worker per chosen source plus three verifiers per load-bearing claim, and any change still runs the mandatory lenses with three refuters per blocker; only point 3 lets a quick question cost one worker. Point 3 adds a dimension every artifact must record and every reader must understand; the compatibility baseline gains new schema versions.

## Verification

Aggregation tables per severity, lens applicability tables, schema compatibility tests for any new verifier counts, and the experience check budgets (P9-20).

[◀ Decisions index](./README.md)
