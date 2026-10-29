# 0154 — Recorded correction checkpoint reconstruction

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Later corrections retain an explicit chain of original producer invocations and parent receipts. In-memory checkpoint objects are convenient during one controller lifetime, but a fresh controller must recover that chain from retained evidence without selecting another worker or guessing which file is newest.

## Decision

Reconstruct correction checkpoints from the authoritative current owned commit receipt. Catalog only the current unit's original verification/review invocation namespaces under the current plan. Bound each namespace and the parent chain by the original one-hundred-generation worker ceiling. Retained atomic temporary files grant no locator and remain untouched.

Treat catalog entries only as hints. Each receipt must have exactly one canonical, non-aliased locator; reopen the complete original worker production, historical native prefix, commit effects and historical receipt before following its explicit parent. Require the same original invocation throughout a correction chain. Finally reopen the complete current owned candidate and require the exact initially observed receipt. Missing, ambiguous, foreign, changed or unavailable evidence refuses reconstruction; there is no timestamp or newest-file fallback.

Use fresh store, queue and fixed factory instances without calling admission, context, native configuration or execution selectors. Reconstruction grants no current lease, dispatch, progress, budget, deadline extension or feature acceptance. Original flat version-one paths remain unchanged. Cross-invocation correction production still needs its own explicit protocol and is not inferred from this catalog.

## Alternatives rejected

Serializing live controller objects would retain process-local authority and stale closures. Choosing the newest locator makes directory order or timestamps authoritative. Trusting a hint without the original production and Git proofs accepts substituted state. Replaying workers to recover ownership repeats effects and consumes another allowance. Accepting a foreign-stage parent silently changes the producer protocol.

## Verification

Require initial-only heads and foreign identities to refuse without selecting work or changing the journal. Extend the actual two-correction, three-suite and independent-review evaluation with fresh checkpoint reconstruction, identical paused QA, internal-symlink and duplicate-locator refusal, exact restoration and unchanged journal/failure/deadline/native-call history. Retire only the original owned environments. Record actual results in the journal before commit; component evidence remains separate from complete-route and authenticated-native acceptance.

Actual fresh-process metadata controls on macOS Node 24.22.0 recover the exact retained two-correction candidate and passing closed verification/review observations without a selector or journal change. Alias and duplicate locators refuse; exact restoration recovers the same candidate. Directed repair/Git controls pass 15 cases; frozen/admission controls pass 420 cases with serial file execution, preserving the first inactive-lease failure. Complete isolated Linux checks pass 3322 tests and all remaining checks. These results do not establish a fresh complete-route execution or authenticated models.
