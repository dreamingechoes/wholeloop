# 0212 — Retained CI correction evidence

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The cross-invocation correction protocol requires a retained, repairable CI failure on the run's original published head. A failed stage label or a digest copied from another PR cannot establish that origin. The current classification also collapsed completed timeouts, action-required results and missing conclusions into code failures, and selected tied latest attempts by input order. A later plan could advertise a larger push allowance than the already started run's ledger retained. The observer and merge predicate also need an exact repository/base binding rather than trusting candidate and PR identifiers alone.

## Decision

- Preserve the exact conclusion of the unique latest trusted required check at the candidate. Only a literal failure becomes `code-test`. A timeout or action-required result still prevents success but does not admit code repair; missing conclusions and tied latest attempts remain unknown. Neither comments nor guessed infrastructure authorize a correction.
- Use the smaller of the current plan's push limit and the already started run's pinned limit. Before execution has pinned a budget, the exact authorized plan supplies it. Counting issued pushes continues across requests and revisions.
- Read original CI failure evidence through one fixed, private SDK reader. Bind the retained stage, original plan and consumed intent to its exact result, original owned publication effects, repository, branch, PR, base, candidate, observation and typed repair request. Recompute the verdict and request using the original policy. Missing or substituted bytes refuse; no newest-file search supplies a replacement.
- Label this evidence historical. Revocation and a later revision do not erase it, and reading it neither performs an effect nor contacts a host. It supplies no current grant, push allowance, remote head or approval. Current continuation admission and publication must independently verify those facts. The historical reader exposes fixed check failures; it certifies no complete current PR-comment set or feedback adoption.
- Bind every observed CI result to the requested repository and base before retaining it or admitting a merge. A different base or repository remains ineligible even when its check names, candidate and PR string match.
- Keep every frozen public v1 declaration unchanged. This increment supplies the conservative evidence prerequisite, not a CI execution route. A versioned correction plan and original-topic/PR publication remain separate implementation work; wider envelope-grant authority remains Proposed.

## Alternatives rejected

Treating every failed CI wait as a code failure would dispatch a builder for permission, policy or infrastructure problems. Breaking ties by array order could turn the same observation into success or a repair. Reading the latest repair file could bind another head or PR. Reusing a historical grant would turn feedback into authority.

## Verification

Focused controls reproduce literal-conclusion and tied-attempt failures before the classifier fix. A started-budget control reproduces the higher advertised limit before the ceiling fix. The first budget fixture had no started ledger; correct that setup and preserve first-execution plan behavior rather than claiming an unobserved pinned budget. Component controls exercise actual owned publisher effects and the fixed CI stage against an explicitly synthetic accepted-product binding and stub remote. They prove exact historical reads, missing/damaged/rehash substitutions, and authority separation after revocation and revision. They certify no native/model, hosted publication or CI repair execution. The compiled component smoke also passes on Linux arm64 with Node 20.0.0 and 24.22.0, using disposable state in read-only, network-disabled containers with a stub remote. This is not a full Linux suite. The mandatory per-commit gate passes 461 tests in 23 files with `CHECK PASS (fast) in 115s`; the repeated full gate remains required before task closure.

[◀ Decisions index](./README.md)
