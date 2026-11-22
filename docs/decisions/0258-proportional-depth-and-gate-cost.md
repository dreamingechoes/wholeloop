# 0258 — Proportional depth and gate cost

- **Status:** Accepted
- **Date:** 2026-11-21

## Context

**Amended 2026-11-22 (P9-15).** A person can now map each canonical tier to a model per client, which is the cheaper-verifier part of point 1. The mapping is an explicit remembered answer (`model:<client>:<tier>`), set through setup and never chosen by detection or a profile. `wl install` renders it into each role's native model field from the installation scope's own configuration file; plugin builds and unmapped installs keep their exact bytes. The cost preview names the configured model per tier for the executing client and keeps it distinct from an observed model. Coverage, quorums and authority are unchanged.

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

Tier-to-model mappings are explicit, per client and per tier:

- **Storage.** Remembered answers `model:<client>:<tier>` in the user or project configuration, written by `wl setup --models` or the setup skill's per-tier questions for the executing client. The frozen configuration schema is unchanged; values are validated by the core as `inherit` or a bounded model identifier, and a malformed value is refused rather than skipped.
- **Default.** An unmapped tier renders exactly as before: Claude Code keeps its native aliases ([ADR-0048](./0048-native-target-layouts-and-checked-launcher-roots.md)) and the other six clients inherit the session model. `inherit` is an explicit choice; it changes only Claude Code's output, where it replaces the alias.
- **Rendering.** `wl install` reads only the installation scope's own file: user installs the user file, project installs the project file. The mapped value goes into the native model field of every client (YAML `model` header; `model` in Codex TOML) with a sentence naming it as configured. `wl build`, marketplace plugins and maintainer renders never read configuration. Doctor compares an installation against the same scoped mapping, so a changed choice reports the installation as out of date.
- **Preview.** Native previews for research, framing, verification and review add the configured model per mapped tier and a "configured for" line naming the client, read only when a packaged client launched the command. Headless previews stay unmapped, because headless workers do not receive the mapping.

For cost previews, count current unfinished jobs and independent examinations from the same plan that dispatches them. Exclude deterministic suite/testability execution from model-worker counts, retain submitted results/votes, and refresh the preview for each later batch. Framing's definition challenge is one challenger, regardless of communication style. Model tiers are requested classes; custom unmapped roles remain unknown. Estimate declared input bytes only after inputs are prepared, excluding later read evidence and client overhead. Do not turn bytes into guessed tokens or monetary prices. Native clients show the returned display before dispatch; shared execution hosts can observe a preview before each phase, and checked headless progress emits core-formatted cost text before launching processes. An attached preview that fails stops before work rather than silently spending.

## Alternatives rejected

- **Lower the defaults silently.** It would change what a verdict means without the person knowing.
- **Let the interaction profile choose rigor.** ADR-0010 exists so that a gentler profile never means weaker checks; rigor must be an explicit, visible choice.
- **Name the setting depth.** It would collide with the profile's `depth` dial, which changes vocabulary, and suggest that a profile preset sets it.
- **Guess prices, tokens or completion time from worker counts.** Client packing, tokenizers, model mappings and account rates are not measured by these plans. Worker calls and declared bytes provide an honest estimate while the remaining quantities stay unknown.
- **Count completed or deterministic work as future model calls.** It inflates the preview and disagrees with actual dispatch. Current findings can add independent examinations, so each batch needs its own preview.
- **Change Claude Code's default to inherit.** It would silently move its verifiers and reviewers from `sonnet` to whatever the session runs, often the most expensive model, which is the opposite of this point. The alias mapping stays until a person maps a tier.
- **A new configuration key for models.** The `config@1` declaration is frozen; a key would need a new schema version. Remembered answers already hold explicit per-scope choices, as specification providers do.
- **Merge user and project mappings when installing.** A personal choice would be written into files a repository commits, or a repository would change every personal installation. Each scope uses its own file.
- **Render mappings into plugin builds or headless workers.** Builds must stay reproducible and personal-data free, and headless recipes pass no model; claiming a mapping there would misreport what runs.
- **Offer model names the person did not choose.** Account availability is unknown to the core; questions offer `inherit` (and Claude Code's aliases) with free text.
- **Change frozen plan declarations to store presentation metadata.** Costs are derived observations; additive response fields leave historical plans and coverage unchanged.

## Consequences

Small questions and changes become cheap, and the cost of each check is visible before it is spent. Points 1 and 2 alone leave a floor: any research question still costs one worker per chosen source plus three verifiers per load-bearing claim, and any change still runs the mandatory lenses with three refuters per blocker; only point 3 lets a quick question cost one worker. Point 3 adds a dimension every artifact must record and every reader must understand; the compatibility baseline gains new schema versions.

## Verification

Aggregation tables per severity, lens applicability tables, schema compatibility tests for any new verifier counts, and the experience check budgets (P9-20).

`test/unit/workers/models.test.ts` checks model identifiers and choice parsing, refusal of malformed remembered values, no configuration read without an executing client, the native model field and configured sentence for every role on all seven clients, byte-identical unmapped and non-Claude `inherit` output, preview tiers, labels and display rows, setup questions per tier for the executing client only, refused and run-scope choices that write nothing, per-scope installation files, the installed Claude role, doctor's current/stale comparison and the compiled `wl setup --models` command. Native loading of a mapped model remains manual verification.

`test/unit/workers/cost.test.ts` checks requested tiers, UTF-8 input bytes, unknown usage, framing style parity, pending research/gate work, preview ordering and all seven client renderers. Gate tests exercise actual persisted plans and unfinished votes. Headless fixtures assert that the cost callback precedes any process log and that compiled progress prints cost before the unchanged completion lines. Frozen-plan tests retain their existing schema identities.

[◀ Decisions index](./README.md)
