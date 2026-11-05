# 0219 — Pin artifact producer transport before native generation

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The fourth actual implementation pilot passes current acceptance generation, including the new repository-diff case, and allocates its owned workspace. The next native call returns a valid builder-plan JSON body but labels its outer artifact plan. The fixed artifact stage requires report at artifacts/production.json and correctly blocks it before independent approval. The generic native response schema advertises both artifact kinds, while the producer instruction requests only report.

## Decision

Narrow the generated inline proposal schema for the exact controller artifact cells definition, plan, acceptance-definition and build-plan. Bind artifact kind to report and ref to artifacts/production.json before native generation, preserving every other generic input constraint and the exact assignment digest. Declare the same literal output descriptor in the producer brief. This describes transport metadata; a JSON plan body remains a plan proposal subject to its independent decision.

Keep the public worker schema, generic decoder and historical readers unchanged. A previously captured plan-labelled artifact stays blocked with its original bytes and receipt. Do not normalize it into eligibility or widen the fixed consumer. Other cells, including research and delegated judgments, retain their own artifact contracts. Empty blocked outputs and explicit unknowns remain expressible; the new schema forces no completion or approval.

## Alternatives rejected

- Accepting both labels in the fixed stage would hide the producer/consumer disagreement rather than publish its actual contract.
- Rewriting captured metadata would manufacture eligibility and break historical evidence.
- Narrowing every planner or researcher would silently impose this producer's file contract on unrelated transports.
- Repeating unchanged generation would spend quota while advertising the same invalid alternative.

## Verification

Generation controls validate all four exact producer cells, reject the alternative kind/ref, preserve unknown blocked outputs and leave separate/malformed cells generic. The generic decoder retains the rejected kind. A deliberately wrong-kind stage fixture remains blocked across repeated inspection without changing its receipt, captured bytes or original call count. Native acceptance and platform gates retain separate results in the journal.

[◀ Decisions index](./README.md)
