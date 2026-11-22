# 0258 — Proportional depth and gate cost

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

**Amended 2026-11-22 (P9-13).** Research, framing and gate plans now expose a deterministic cost preview before worker dispatch. The estimate uses worker calls and declared input bytes; tokens, duration and price remain unknown without measurements. Requested tiers come from the bundled role metadata and never claim which model a client actually runs. These observations are additive output metadata, not changes to pinned plans, budgets or coverage.

[ADR-0010](./0010-interaction-profile-never-changes-coverage.md) keeps coverage fixed: the profile changes communication and concurrency, never checks, lenses or questions. The defaults follow it at full strength for every input:

- research gives every load-bearing claim three independent verifiers;
- verify plans the suite, one unit per criterion, a testability unit and a changed-tests unit; review runs all six built-in lenses, even on a four-line change;
- every finding is a blocker until a majority of three independent refuters argues it away, so a cosmetic note costs a repair, a verify round and a review round;
- `verifiers` is an enum of 3, 5, 7 or 9 in the configuration, research and gate plan schemas, so a person cannot lower the cost even deliberately.

A research question answerable from the repository in a few minutes took 14.6 minutes and about nine workers on 2026-11-17. Part of that came from scheduling and broken worker roles, fixed separately in Phase 9; the rest is this fixed cost.

## Decision

Reduce cost first without reducing coverage, then let coverage vary only by an explicit choice:

1. **Without changing coverage (no change to ADR-0010):** deterministic checks the core can do itself (code citations at a commit), cost shown before every fan-out, parallel read-only workers, a cheaper model tier for verifiers when the person maps one, and lens applicability by changed paths for optional lenses only.
2. **Severity of findings:** findings carry `blocker`, `should` or `nit`; only blockers fail a round; the others reach the person in the hand-back. Mandatory lenses (correctness, security) keep fail-safe behaviour. This changes what fails a round, not what is inspected.
3. **Explicit rigor (amends ADR-0010):** `quick`, `standard` and `deep` for research and gates, chosen by the person or proposed by the step, never silently by the profile. Reduced coverage is recorded in the artifact and shown in the result ("not independently verified"); nothing is dropped below the existing refutation quorum, so a quick claim is unverified rather than retained or dropped. Verifier counts below three need new schema versions under [ADR-0066](./0066-v1-compatibility-baseline-and-deprecation.md).

The setting is called rigor, not depth, because the profile already has a `depth` dial that sets vocabulary and level of detail. `standard` is the default and keeps today's coverage; `quick` and `deep` are always chosen or confirmed by the person for that run.

For cost previews, count current unfinished jobs and independent examinations from the same plan that dispatches them. Exclude deterministic suite/testability execution from model-worker counts, retain submitted results/votes, and refresh the preview for each later batch. Framing's definition challenge is one challenger, regardless of communication style. Model tiers are requested classes; custom unmapped roles remain unknown. Estimate declared input bytes only after inputs are prepared, excluding later read evidence and client overhead. Do not turn bytes into guessed tokens or monetary prices. Native clients show the returned display before dispatch; shared execution hosts can observe a preview before each phase, and checked headless progress emits core-formatted cost text before launching processes. An attached preview that fails stops before work rather than silently spending.

## Alternatives rejected

- **Lower the defaults silently.** It would change what a verdict means without the person knowing.
- **Let the interaction profile choose rigor.** ADR-0010 exists so that a gentler profile never means weaker checks; rigor must be an explicit, visible choice.
- **Name the setting depth.** It would collide with the profile's `depth` dial, which changes vocabulary, and suggest that a profile preset sets it.
- **Guess prices, tokens or completion time from worker counts.** Client packing, tokenizers, model mappings and account rates are not measured by these plans. Worker calls and declared bytes provide an honest estimate while the remaining quantities stay unknown.
- **Count completed or deterministic work as future model calls.** It inflates the preview and disagrees with actual dispatch. Current findings can add independent examinations, so each batch needs its own preview.
- **Change frozen plan declarations to store presentation metadata.** Costs are derived observations; additive response fields leave historical plans and coverage unchanged.

## Consequences

Small questions and changes become cheap, and the cost of each check is visible before it is spent. Points 1 and 2 alone leave a floor: any research question still costs one worker per chosen source plus three verifiers per load-bearing claim, and any change still runs the mandatory lenses with three refuters per blocker; only point 3 lets a quick question cost one worker. Point 3 adds a dimension every artifact must record and every reader must understand; the compatibility baseline gains new schema versions.

## Verification

Aggregation tables per severity, lens applicability tables, schema compatibility tests for any new verifier counts, and the experience check budgets (P9-20).

`test/unit/workers/cost.test.ts` checks requested tiers, UTF-8 input bytes, unknown usage, framing style parity, pending research/gate work, preview ordering and all seven client renderers. Gate tests exercise actual persisted plans and unfinished votes. Headless fixtures assert that the cost callback precedes any process log and that compiled progress prints cost before the unchanged completion lines. Frozen-plan tests retain their existing schema identities.

[◀ Decisions index](./README.md)
