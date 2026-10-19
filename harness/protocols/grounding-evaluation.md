# Grounding evaluation

- ⛔ `grounding-exact-provenance` — Score every numeric assertion against the exact
  metric/unit/query hash/source/body hash and authored datapoint. A matching number
  from another source cannot pass. Unknown cannot carry an invented value.
- ⛔ `grounding-complete-observations` — Require exact corpus digest, evaluator/
  provenance and complete duplicate-free predictions. Missing genuine observations
  and numeric assertions for trap metrics fail; silence earns no perfect score.
- ⛔ `grounding-blind-boundary` — Export opaque shuffled inputs without truth labels,
  reason text or unsupported-query counterfactual values. Keep actual host execution
  evidence separate from metadata and report unevaluated steps explicitly.

The default runner uses real ramp/impact collectors with scripted data only.
It runs no model, network or production query. Semantic narrative grounding and
source truth remain separate checks; never relabel the synthetic baseline as live.
