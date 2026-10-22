# Gate lens evaluation seed

> **TL;DR** — Twenty-four original snippets cover two labelled defects and two look-alike negatives for each built-in lens. Score complete reviewer/refuter observations through the runtime's actual gate arithmetic, before and after refutation. The committed baseline is synthetic, not a model measurement.

> [!NOTE]
> **Status: ✅ implemented locally.** Corpus validation, blind input export, digest-bound predictions, per-lens matrices and baseline reproduction are tested. Live independent reviewer execution and broader label calibration remain manual.

## Run

```bash
npm run eval:gates -- --json
wl eval gates test/evals/gates/corpus.json --inputs --json
wl eval gates test/evals/gates/corpus.json --predictions <observations.json> --json
```

The default npm script explicitly supplies baseline-predictions.json. The CLI never invents observations when --predictions is absent. It makes no network/model calls, executes no snippets and writes no runtime state. Scoring returns zero even when it reports misses; regression thresholds belong to the caller.

## Corpus and labels

corpus.json pins seed gate-v1-2026-10-19, stable opaque IDs, assigned lens, snippet path, binary defect label and its reason. The digest binds normalized metadata, labels and exact snippet bytes. Paths stay inside the corpus, including symlinks; each built-in lens must retain positive and negative coverage.

These are intentionally authored examples of defects under stated contracts and repository standards, not copied incidents or executed production regressions. The unit of analysis is **finding presence per assigned snippet/lens**, not the semantic correctness of every individual finding. Independent human/host review must check labels, locations and reasoning before drawing quality conclusions.

For blind collection give workers only --inputs output: opaque ID, assigned lens, fixed question and snippet content, sorted by opaque ID. It omits gold labels, reasons and descriptive filenames. Preserve IDs when shuffling assignments. Do not give workers corpus.json, this baseline or the prediction fixture as their rubric.

## Observation contract

wholeloop/gate-predictions@1 contains corpusSha256, evaluator, provenance (synthetic or recorded), verifiers (3/5/7/9), and exactly one result per corpus ID:

```json
{
  "case": "opaque-case-id-from-inputs",
  "result": {
    "unit": "correctness",
    "status": "ok",
    "evidence": ["Actual inspected behavior and its location"],
    "findings": []
  },
  "votes": []
}
```

Result and vote objects use the existing gate schemas (`wl gate schema --json`). Findings need stable IDs/locations/evidence. Votes reference lens:finding-id and a unique verifier slot. An unavailable result needs a reason and empty findings; its votes are empty. Missing cases, duplicate slots, wrong lenses, unknown findings and a changed digest fail validation. Silence is never a negative observation.

A recorded provenance value is caller-supplied metadata, not proof that independent workers ran. Keep actual execution evidence separately and sanitize credentials.

## Baseline

baseline-predictions.json deliberately simulates both missed defects and false alarms. Three synthetic verifiers confirm positives; two refute a look-alike while one remains unconvinced. Ordinary lenses drop that false alarm; fail-safe correctness/security keep it. No live worker ran.

| Stage | TP | FP | TN | FN | Recall | False-alarm rate |
| --- | --- | --- | --- | --- | --- | --- |
| Before refutation | 6 | 6 | 6 | 6 | 0.5 | 0.5 |
| After refutation | 6 | 2 | 10 | 6 | 0.5 | 0.16666666666666666 |

Every lens begins at TP 1 / FP 1 / TN 1 / FN 1. The four ordinary lenses end at TP 1 / FP 0 / TN 2 / FN 1; correctness/security retain their false alarm. Coverage is 1. Unavailable results are counted as unknown and excluded from confusion cells; zero denominators yield null. Reports also include verifier response coverage. Incorrect unanimous refutations can increase false negatives; tests preserve that possibility rather than assuming the second stage always improves.

See [ADR-0037](../../../docs/decisions/0037-gate-evaluation-observations-and-refutation-matrices.md) and the [runtime testing guide](../../../docs/architecture/determinism-and-testing.md).
