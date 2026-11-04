# 0044 — Grounding fixtures and exact numeric provenance

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A data step can invent the most reassuring possible value by treating an absent metric as zero. A judge that only checks numbers can also accept the right value from the wrong query, ignore a genuine zero or imply that a deterministic fixture measured model quality. Missing-data traps need exact, reproducible provenance.

## Decision

- Author twenty original sandbox cases, ten each for ramp/impact, with real finite fixture scalars and deliberately absent/incompatible observations. Pin exact dataset bytes, labels and reason text to a versioned seed/digest. Query strings identify sandbox data only; no production query or network operation executes.
- Run the actual collectRampEvidence and collectImpact functions against an isolated scripted ProviderHost. Keep the backend data-only; production collectors own unit/completeness/finite-value validation and unavailable-source degradation.
- Judge structured assertions against authored labels and exact metric identity, unit, query hash, source reference and normalized-body hash. A wrong provenance fails even for a coincidentally correct value. Unknown cannot contain invented values/provenance, and an omitted genuine observation cannot earn a perfect score.
- Require complete duplicate-free external predictions, exact digest and explicit evaluator/provenance. Export opaque, deterministically shuffled inputs without labels/reasons or unsupported-query counterfactual values. Metadata does not prove independent worker execution; real host records remain separate.
- Report per-step assertion/trap counts and individual failures. The synthetic baseline grounds six values and keeps fourteen traps unknown. Return shape exit 4 for a failed judge, rather than a success exit hiding hallucinated data.
- Explicitly report unevaluated steps and semantic limits. This seed covers the two implemented structured numeric collectors, not free-form research/framing prose, qualitative statistics, production query truth or causal interpretation.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Count missing data as zero | Invents a datapoint and silently passes a trap |
| Judge by value alone | Accepts correct-looking values from unrelated queries |
| Permit missing cases or unknown-with-value | Rewards omission or hidden estimates |
| Let workers read gold labels | Contaminates an external grounding measurement |
| Call the core baseline a model evaluation | No model or independent semantic worker ran |
| Claim this seed covers all narrative data steps | Those assertion formats and semantics were not evaluated |

## Consequences

The seeded structural boundary is locally reproducible and suitable for regression checks. Actual model/host grounding, independently reviewed labels, narrative numbers and production/cohort semantics remain manual verification. New failures should become original fixtures; the small seed is not a population estimate.

[◀ Decisions index](./README.md)
