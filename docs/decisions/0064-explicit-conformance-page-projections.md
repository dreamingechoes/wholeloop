# 0064 — Explicit conformance page projections

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The bounded matrix renderer distinguishes supplied native, simulated and missing evidence, but documentation still requires manual copying. Collection and issue activation can remain separate from a local, reviewable page update. The ordinary reference renderer cannot reconstruct external observations from source code.

## Decision

- Extend conformance matrix with an explicit documentation repository and as-of time. Compare the generated observation section without writing by default; require write explicitly to update it. Preserve the existing read-only renderer and reject write without a documentation destination. Require explicit time so repeated comparisons use the same snapshot instead of drifting with the clock.
- Reuse one strict generated-section replacement helper for code references and conformance observations. Require exactly one ordered marker pair; preserve all prose outside it, refuse missing/malformed ownership and skip unchanged writes.
- Select only docs/platforms/README.md under the resolved repository. Require a regular page of at most 1 MiB and real docs/platforms parent directories; refuse symlinked pages/parents before comparison or writing. Filesystem interruption and concurrent same-user changes are not claimed crash-atomic or race-proof.
- Project only the validated matrix rows and their original observation dates. Do not save raw reports, journals, paths or imported extra fields in Git. Retain unrun/simulation/native and stale distinctions plus the as-of time and evidence limitations. An explicit write authenticates no report and runs no client.
- Include a versioned documentation receipt in JSON. Exit 4 for a stale checked page or a regression candidate; a successful page write does not suppress candidate exit status. Markdown-only output remains separate from page receipts.
- Keep source-generated adapter declarations under docs check. External matrix currentness requires its explicit input/time comparison; ordinary docs check neither collects observations nor attests to their freshness. Scheduled native collection, latest resolution and issue automation remain independent work.

## Alternatives rejected

Treating adapter declarations as observed support would invent native evidence. Saving complete reports in the repository would mix runtime state with docs and could expose external journal paths. Silent page writes would make a renderer surprising, while using the current clock implicitly would make repeated checks fail despite identical input. Reimplementing marker ownership would allow the reference and observation writers to disagree about malformed pages.

## Verification

Check no-write drift, exact update/idempotency and unchanged modification time; preserve surrounding prose and source input. Exercise stale simulation dates, ignored private fixture fields, missing/reversed/duplicate markers, oversized pages and symlinked pages/parents. Execute compiled JSON compare/write commands, required explicit time, invalid-input refusal and the existing reference/matrix regressions. Initial checked-in rows are UNRUN; no native acceptance is inferred.

[◀ Decisions index](./README.md)
