# 0217 — Bind acceptance production to current identity and installed inputs

- **Status:** Accepted
- **Date:** 2026-11-05

**Amended 2026-11-14.** The core parses every assertion's `expected` value as JSON and refuses the plan with `assertion-json` otherwise. The frozen `wholeloop/acceptance-plan@1` schema the producer reads says only `string`. A live Codex attempt on `gpt-6.1-sol` wrote a bare commit hash as one expected value, and the artifact was refused. The producer brief now states the rule with an example that parses. The schema stays unchanged, because its declaration is part of the v1 compatibility baseline. The refusal was correct and stays strict.

## Context

The second actual implementation pilot completes its native producer call but stops before workspace allocation. Its acceptance artifact increments revision one to two, following an ambiguous instruction about definition/plan successors. Acceptance definitions describe the current delivery revision. The same artifact invents a flat HTTP input and an unavailable repository inspection capability because the producer receives the generic case schema without the installed observation formats or recipe identifiers. Existing validation correctly refuses the artifact; a successful native process is not valid production.

## Decision

Generate an acceptance response schema with exact current run, revision, delivery-plan digest and source constants. Only delivery-plan proposals for definition/plan stages create a successor. Preserve the original public schemas and strict readback: a producer's wrong identity remains blocked and its bytes are never normalized into eligibility.

The installed public implementation composer supplies the existing CLI/API behavior input schema, supported assertion subjects and observable headers, actual recipe fixture digests, service IDs, published ports and declared test command IDs. Metadata is copied from trusted installed inputs before production. It executes nothing, grants no capability and supplies no test or acceptance result. Other SDK compositions may describe their own installed inputs explicitly; a missing required observation never waives its criterion or creates a new host.

## Alternatives rejected

- Rewriting a model-produced revision would conceal a binding error and manufacture a valid artifact from rejected bytes.
- Adding a generic repository inspection or semantic execution capability would widen the installed controller's scope to accommodate an invented request.
- Retrying the same input repeatedly would spend quota while retaining its ambiguous identity and missing execution contract.

## Verification

Two generation-contract controls fail before the change and pass afterward. A wrong successor revision remains blocked across repeated inspection with unchanged captured bytes and one original call. The installed input declaration is checked against the actual behavior parser, refuses unavailable recipes, makes no journal transition and cannot mutate its shared schema. The stricter public-route fixture requires both the current response identity and installed input context. Full gates and new native acceptance remain separate requirements; both original implementation pilots remain failed.

[◀ Decisions index](./README.md)
