# 0130 — Owned pre-builder acceptance definitions

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

The root route already places acceptance-definition before builders, and original artifact production can validate and pin complete cases. Production intentionally does not finish a root stage. A fixed adapter must distinguish the observation that definitions are ready from execution, product acceptance or a human testing receipt.

## Decision

Add an internal RunnerAcceptanceDefinitionStages adapter for the exact historical acceptance-definition route stage. Reuse original artifact production, captured bytes, private ownership and original deadline checks. Require host-observed ready output, closed invokers, the producer's recorded owned call prefix and the exact pinned acceptance plan before returning a passed definition stage.

Validate the pinned plan's run, revision, delivery-plan digest and source. Existing acceptance validation preserves complete coverage, applicability and inherited machine/human ownership, and refuses first-time pinning after builder admission. The adapter supplies no executor, test result, product acceptance or human agreement. A passed definition stage permits later route work; actual behavioral acceptance remains required on its exact candidate.

Paused inspection may recover lost pin-index metadata only from the original captured proposal and immutable definitions. It neither selects context nor constructs a native host, executes tests or resumes dispatch. Changed captured bytes, unknown owners, historical descriptors without producer ownership and fixture-only output cannot establish readiness. Cancellation still addresses only the original private scope after revocation.

No public schema, historical supervised record, native-purpose lease or default intervention policy changes. Full route-host composition and actual product acceptance remain separate implementation work.

## Alternatives rejected

Returning artifact production as a generic passed stage confuses definition with execution and allows the wrong artifact purpose. Treating a prepared plan as a green test run fabricates evidence. Rebuilding lost metadata by relaunching the producer can change test expectations after implementation. Requiring product execution at definition time defeats the pre-builder boundary and cannot test an implementation that does not exist yet.

## Verification

Exercise observed readiness, lost-index paused recovery, fixture refusal, malformed/wrong-basis/unknown production, purpose mismatch and changed captured bytes. Read the actual legacy state and acceptance stores to verify that no human approval or test result exists. Extend the finite definition evaluation with the same one-process recovery, retaining the independent definition-approval and rejection controls. Record actual results and limitations in the journal; synthetic normalized observations do not certify real model containment or complete-route acceptance.

The final directed regression passes 442 cases. All three complete definition controls pass on macOS Node 24 and Linux Node 20.0.0 using identical bundled code. Preserve the initial nonexistent projection-field assertion failure; corrected checks read the actual approval and result stores. Lint, types, build, docs, harness, Markdown, Mermaid and offline package checks pass.
