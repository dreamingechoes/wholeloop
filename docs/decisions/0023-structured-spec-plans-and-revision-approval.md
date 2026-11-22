# 0023 — Structured spec plans and revision approval

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

**Amended 2026-11-22 (P9-11).** A syntactically valid provider name could leave a measurement plan impossible to execute. Specification entry now offers registered source tools with current-client access labels, reuses only explicit preferences and validates provider operations before completion. Detection remains evidence about configuration, never authentication or permission to query.

Later steps must reuse the spec's stories and measurement queries rather than infer new criteria or windows from prose. Teams also need their own readable format, and a rejected spec must be editable without weakening the approval stop.

## Decision

1. Store a versioned `wholeloop/spec@1` metadata block in artifact YAML front matter. It contains impact, stories, identified criteria and tests, metric plans and the rollout outline. Narrative sections and the technical appendix remain readable and follow selected repository guidance.
2. Pin each metric's provider, taxonomy query operation, stored query, unit, baseline, target and window/timezone. Unknown baselines require missing evidence, an answerer and an existing tracking story. An explicit measurement exception is allowed only when no metrics are defined, with a reason and owner.
3. Repository spec guidance wins over manifest templates. A manifest can add sections, but core metadata and required sections remain additive checks.
4. Complete standalone specs without inventing earlier skip events. Flow progress continues after completed output; explicit future skips do not falsely imply earlier work was completed.
5. Every completed revision needs its own human approval. The producing step can reopen for correction after rejection, while downstream steps remain blocked. A started revision cannot be approved before its completion.
6. Ready `write-spec` entry returns `metricProviders`, grouping providers by each registered `source.*` query capability with the access labels defined in ADR-0021. Ask where each metric lives; detection never selects a provider. Explicit preferences use `metric:<source-capability>` answers at the existing run, initiative, project or user scope. Remember a repository choice only when requested; a stale preference is unselected with a warning.
7. `spec check` and new specification completion reject unknown providers and unsupported capability/operation pairs in the effective registry, including validated local extensions. `spec check` warns without blocking when the current client does not detect the chosen provider. It accepts `--client` under the executing adapter's existing identity boundary. No check executes a query or proves authentication. Historical artifact parsing and replay retain their original structural contract; removing a provider must not invalidate recorded approvals.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Parse metric plans from narrative tables | Heading and layout changes would silently alter machine inputs |
| Replace a team's spec format wholesale | Repository guidance carries context beyond the core schema |
| Treat an unknown baseline as zero | Missing evidence would become a fabricated observation |
| Block edits while approval is pending | A rejected spec could never be corrected |
| Reuse approval across revisions | A person would approve content they had never reviewed |
| Accept any provider string after checking the taxonomy alone | A known operation does not establish that the named tool implements it |
| Select whichever measurement tool is detected | Configuration cannot establish where the person's metric lives |
| Refuse an undetected registered provider | A plan may precede client setup; report missing access without fabricating a connection |
| Revalidate recorded history against today's registry | Removing an extension would invalidate previously recorded work |

## Consequences

Metadata and narrative must describe the same intended behavior; semantic review still matters. Structural checks do not prove a baseline, provider authentication or test execution. Live drafting, critique and source queries remain conformance work; fixture tests verify schema, routing, persistence and decision arithmetic.

## Verification

`test/unit/spec/providers.test.ts` exercises invented providers, unsupported operations, nonblocking detection warnings, all seven clients' access labels and rendered instructions, explicit repository preferences, stale choices, refusal before writes and completion, and replay after provider removal. Existing specification, scope, slice and launch fixtures register their fictional analytics provider through a validated inherited manifest instead of changing historical artifact bytes.

## Links

- [write-spec](../flow/define/write-spec.md)
- [Standalone steps](./0007-standalone-steps-opt-in-flow.md)
- [Profile coverage](./0010-interaction-profile-never-changes-coverage.md)

[◀ Decisions index](./README.md)
