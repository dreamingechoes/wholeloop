# Definition evaluation seed

The fixed seed contains thirty original Define problem/spec/criteria/scope artifacts,
labelled defects and look-alike negatives. It is a small regression corpus, not a
representative estimate of model quality. No model is called by the runner.

Run `npm run eval:definitions -- --json`, or build then call:

```sh
node dist/wl.mjs eval definitions test/evals/definition/corpus.json --json
```

The committed baseline scores core-definition-lint@1. It deliberately retains
two false negatives requiring semantic review: the prose HTTP-status conflict
and the cut bundling unrelated deliveries. The report includes TP/FP/TN/FN,
recall, precision and false-alarm rate per class, plus each missed or extra label.
A ratio with no denominator is null. A completed report exits zero even when
there are misses; assert the desired thresholds separately.

To score real host challenger output, collect one result for every case into:

```json
{
  "schema": "wholeloop/definition-predictions@1",
  "corpusSha256": "the exact digest printed by the runner",
  "evaluator": "the actual host/model/version and run configuration",
  "results": [
    { "case": "vague-fast", "defects": ["vague-wording"] }
  ]
}
```

The example is abbreviated: omitted, duplicate or unknown cases/classes fail.
Use `--predictions <file>` to score the complete result set. Blind the host to
expected labels, preserve raw findings for review, and report actual tool/model
execution independently; a supplied evaluator label is not proof of execution.
No response is never silently scored as a negative prediction.

The digest covers seed, labels, case metadata and exact artifact bytes. Changing
any of those invalidates earlier predictions. Review labels and baseline changes
explicitly, retain newly discovered real failures, and do not remove hard cases
to improve a score. The tests reproduce the baseline and independently verify
confusion-matrix arithmetic and byte-identical CLI runs.
