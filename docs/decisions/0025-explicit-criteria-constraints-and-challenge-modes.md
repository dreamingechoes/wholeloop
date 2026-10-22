# 0025 — Explicit criteria constraints and challenge modes

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Contradictory requirements should fail before building, but interpreting arbitrary prose as a numeric constraint risks false certainty. Challenge intensity must not change what gets inspected or silently hide defects from the person approving.

## Decision

1. Share deterministic criteria lint between spec completion and standalone criteria checks. Preserve the current vague-word lexicon, meaningful tests and unique IDs. Criteria may add an explicit numeric assertion naming subject, context, unit, comparison operator and value.
2. Detect impossible assertion pairs only when subject, context and unit match exactly. Compare equality, exclusion and open/closed numeric bounds. Treat the numeric domain as continuous; do not infer aliases, convert units or extract assertions from prose. Optional metadata preserves existing spec compatibility.
3. Render challenger plans for problem, spec, criteria and scopes from fixed coverage lists. Pin the input digest. Supportive/balanced/adversarial changes tone and the limit of additional counter-questions (1/2/3), never coverage, structural findings or approval requirements.
4. Keep structural lint and semantic critique separate. An empty lint report is not approval. Hosts still provide independent read-only critique and evidence; the command does not invoke a model or write state.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Infer inequalities from all requirement prose | Negation, context and units would invite false contradictions |
| Reduce checks at supportive intensity | Communication preference would change correctness coverage |
| Add inferred assertions silently | The machine would redefine what the person approved |
| Claim pairwise checks prove consistency | Multi-constraint and semantic conflicts still need review |

## Consequences

Authors must explicitly name comparable constraints for deterministic conflict detection. Pairwise lint deliberately leaves broader logical conflicts to the challenger. Fixed fixtures and instruction snapshots test the local boundary; live quality and read-only enforcement remain client conformance work.

## Links

- [Orchestration](../architecture/orchestration-and-gates.md)
- [Structured specs](./0023-structured-spec-plans-and-revision-approval.md)
- [Profile coverage](./0010-interaction-profile-never-changes-coverage.md)

[◀ Decisions index](./README.md)
