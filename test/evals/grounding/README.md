# Grounding evaluation seed

> **TL;DR** — Twenty original sandbox cases exercise the actual ramp/impact source
> collectors with finite observations and deliberately missing or incompatible
> metrics. A deterministic judge traces each structured numeric assertion to its
> exact query, unit, source and body hash. The baseline is synthetic, not a model run.

> [!NOTE]
> **Status: ✅ implemented locally.** Fixed corpus, blind inputs, digest-bound
> predictions, per-step reports and baseline reproduction are tested. Real worker
> execution, narrative grounding and production source truth remain manual.

## Run

```bash
npm run eval:grounding -- --json
wl eval grounding test/evals/grounding/corpus.json --inputs --json
wl eval grounding test/evals/grounding/corpus.json --predictions observations.json --json
```

Without predictions, the actual collectRampEvidence and collectImpact functions
read an isolated scripted ProviderHost. No model, network, database or production
query runs. A failed judge returns shape exit code 4, so a caller can enforce this
small seed directly. Invalid/missing predictions fail rather than count as silence.

## Corpus and baseline

Seed grounding-v1-2026-10-19 contains ten cases for each of ramp-exposure and
measure-impact: three real fixture scalars (17, zero and a signed -2 points delta)
and seven traps (absent metric, partial response, wrong unit, numeric-looking
string, empty dataset, non-finite parse and unsupported source operation).
These are original authored fixture values, not production measurements.

The exact corpus-byte digest is
7342426d30c616b89f69e3a5a9533002bed2dd0992f20030625718bf7ae78899.
The committed core-grounding-collectors@1 baseline has six numeric assertions,
all six grounded, and all fourteen traps unknown. Each step reports three grounded
assertions, seven unknown traps and zero failures. This proves deterministic
structured normalization for this seed; it is not an estimate of model behavior.

Every asserted value needs its exact unit, query SHA-256, source reference and
raw normalized-body hash. A coincidentally correct value from another source/query
fails. Unknown needs a reason and cannot carry an invented value or provenance.
Dropping an actually observed zero also fails: silence cannot earn a perfect score.

## External collection

Export --inputs and isolate workers from corpus.json, labels, this guide and the
baseline. Inputs use opaque metric IDs and deterministic shuffled ordering, omit
truth/reasons and do not expose counterfactual datapoints from unsupported queries.
Supply only the actual compatible source observations and named capabilities.

Return wholeloop/grounding-predictions@1 with corpusDigest, evaluator
(name/provenance/note) and cases covering every ID exactly once. Cases carry
id/step/metric/status/unit/queryDigest plus value/sourceRef/bodyDigest for observed,
or reason for unknown. provenance is synthetic or host-recorded; a metadata string
is not proof of actual execution or independent evaluation. Preserve real host
records separately and score the exact digest. Do not let the worker see labels.

Coverage is explicit: this seed evaluates ramp-exposure and measure-impact only.
Frame-problem, research, prepare-launch and decide-next are not evaluated here.
Free-form narrative numbers, qualitative quotes, causal interpretation and the
truth of actual queries need a separate semantic/host assessment. Add real escaped
failures with original fixtures and review labels before extending the seed.
