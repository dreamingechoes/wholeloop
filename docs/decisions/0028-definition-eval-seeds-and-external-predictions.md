# 0028 — Definition eval seeds and external predictions

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Definition checks need measurable misses and false alarms. A deterministic lint
baseline cannot stand in for real challenger quality, and predictions cannot be
compared honestly if the labelled artifacts changed between runs.

## Decision

1. Keep a fixed, versioned seed of original labelled artifacts and look-alike
   negatives. Include semantic defects the current lint cannot detect, rather
   than making every baseline case trivially pass.
2. Hash seed, case metadata, expected labels and exact artifact bytes. External
   predictions must match that digest and contain exactly one result per case.
   Unknown/duplicate labels and missing responses fail instead of becoming
   implicit negatives.
3. Report per-class and aggregate TP/FP/TN/FN, recall and false-alarm rate, with
   precision per class. Ratios without a denominator are null. Scoring does not
   fail merely because it discovers misses; threshold policy is separate.
4. Default to the deterministic core checker. Accept separately collected host
   predictions under an explicit evaluator label, without claiming the runner
   executed that host/model. Actual live challenger runs remain manual evidence.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Score only known-supported defects | It would hide the semantic gap behind a perfect baseline |
| Count silent workers as negative predictions | Missing execution would look like a correctness judgment |
| Compare only by seed name | A changed artifact could silently invalidate a score |
| Treat supplied evaluator names as execution proof | A JSON label says nothing about actual model calls |

## Consequences

The initial seed is a small regression set, not population evidence. Labels need
review and real failures should extend it. Host prompts must be blinded to
expected labels when measuring semantic challenger performance.

## Links

- [Testing](../architecture/determinism-and-testing.md)
- [Definition checks](./0025-explicit-criteria-constraints-and-challenge-modes.md)

[◀ Decisions index](./README.md)
