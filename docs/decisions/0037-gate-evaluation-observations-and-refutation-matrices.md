# 0037 — Gate evaluation observations and refutation matrices

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A green gate is not evidence of a low false-positive or false-negative rate. Refutation may remove noise, preserve cautious false alarms or incorrectly discard real defects. Its arithmetic can be measured independently of model quality, but synthetic worker observations must not be presented as actual model execution.

## Decision

- Add a fixed seed with twenty-four original labelled snippets: two defects and two look-alikes per built-in lens under explicit contracts/repository standards. Bind normalized labels/metadata and exact bytes into a corpus digest. Require positive/negative coverage, unique IDs and contained regular snippet paths.
- Export blind inputs with opaque IDs and stable shuffled-looking ID order, fixed lens questions and source content. Exclude gold labels/reasons and descriptive paths. Hosts may shuffle assignments while retaining IDs; this is an evaluation convention, not a security boundary against reading the repository.
- Require explicit complete predictions with evaluator, synthetic/recorded provenance, supported quorum, existing gate results and unique assigned votes. Never infer observations or turn a missing worker into a clean result. Validate both programmatic and CLI input through the same public gate contracts.
- Compute case-level finding-presence TP/FP/TN/FN before and after the actual runtime gateReport refutation algorithm. Keep fail-safe unanimity and ordinary majority behavior identical. Track unavailable observations as unknown, exclude them from confusion cells and report coverage; undefined ratios are null.
- Commit a deliberately imperfect synthetic arithmetic baseline and reproduce it in tests. It demonstrates noise reduction and retained fail-safe false positives, not model skill or population rates. An evaluator/provenance name does not prove a host ran. Actual independent sessions and semantic finding/label matching need separate evidence. The runner executes no snippet, model or external operation.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Report only post-refutation accuracy | Hides whether verification removed noise or lost real defects |
| Count unavailable workers as negative | Invents observations and distorts rates |
| Implement a second refutation algorithm | Can drift from the runtime policy being evaluated |
| Treat a synthetic perfect baseline as quality evidence | Tests arithmetic while pretending to measure a model |
| Give labelled filenames/reasons to workers | Leaks the expected answer into their input |
| Infer semantic correctness from any finding on a positive case | Case-level classification cannot establish finding-level precision |

## Consequences

The seed is small and intentionally constructed. A human/host must validate labels, reasoning and locations before broader conclusions, run blinded real workers and preserve their evidence separately. Thresholds are caller policy; scoring exits zero even when the report includes misses. Custom lenses need their own calibrated corpus/extension rather than silently inheriting the built-in labels.

## Links

- [Corpus and baseline](../../test/evals/gates/README.md)
- [Determinism and testing](../architecture/determinism-and-testing.md)
- [P3-10](../../roadmap/phase-3-build.md#p3-10--gate-eval-corpus)

[◀ Decisions index](./README.md)
