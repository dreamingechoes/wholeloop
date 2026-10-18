# 0023 — Structured spec plans and revision approval

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Later steps must reuse the spec's stories and measurement queries rather than
infer new criteria or windows from prose. Teams also need their own readable
format, and a rejected spec must be editable without weakening the approval stop.

## Decision

1. Store a versioned `wholeloop/spec@1` metadata block in artifact YAML front
   matter. It contains impact, stories, identified criteria and tests, metric
   plans and the rollout outline. Narrative sections and the technical appendix
   remain readable and follow selected repository guidance.
2. Pin each metric's provider, taxonomy query operation, stored query, unit,
   baseline, target and window/timezone. Unknown baselines require missing
   evidence, an answerer and an existing tracking story. An explicit measurement
   exception is allowed only when no metrics are defined, with a reason and owner.
3. Repository spec guidance wins over manifest templates. A manifest can add
   sections, but core metadata and required sections remain additive checks.
4. Complete standalone specs without inventing earlier skip events. Flow progress
   continues after completed output; explicit future skips do not falsely imply
   earlier work was completed.
5. Every completed revision needs its own human approval. The producing step can
   reopen for correction after rejection, while downstream steps remain blocked.
   A started revision cannot be approved before its completion.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Parse metric plans from narrative tables | Heading and layout changes would silently alter machine inputs |
| Replace a team's spec format wholesale | Repository guidance carries context beyond the core schema |
| Treat an unknown baseline as zero | Missing evidence would become a fabricated observation |
| Block edits while approval is pending | A rejected spec could never be corrected |
| Reuse approval across revisions | A person would approve content they had never reviewed |

## Consequences

Metadata and narrative must describe the same intended behavior; semantic review
still matters. Structural checks do not prove a baseline, provider authentication
or test execution. Live drafting, critique and source queries remain conformance
work; fixture tests verify schema, routing, persistence and decision arithmetic.

## Links

- [write-spec](../flow/define/write-spec.md)
- [Standalone steps](./0007-standalone-steps-opt-in-flow.md)
- [Profile coverage](./0010-interaction-profile-never-changes-coverage.md)

[◀ Decisions index](./README.md)
