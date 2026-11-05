# 0215 — Review the actual public research plan before source work

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The first Codex EVAL-10 attempt on 0.166.0 authenticates and completes both independent judgment calls, then blocks correctly. The research-plan rubric asks whether the proposed angles can answer the question, but the public composer supplies only the delivery plan. That plan contains a generic research work item; the concrete native-web angle and verifier configuration are selected later, after the judgment. Earlier permissive synthetic judgments and passing Claude trials did not establish that those missing inputs were available.

## Decision

The public composer pins its concrete research plan in the external private store before requesting research-plan acceptance. Both judges receive the delivery plan and the exact research-plan artifact and evidence hashes. The native-web angle states the generic primary-source, coverage, version/date, citation and unknown-preservation method that source workers will actually receive; it does not contain scenario-specific answers or fabricated evidence.

The research stage reads the same private plan. Missing or changed bytes, a foreign run/revision/digest or a changed selector refuse execution instead of silently selecting another plan. Existing research limits, independent judgments, source acceptance, runtime boundaries and grants remain required. Frozen public schemas, runtime flags and legacy historical decisions remain unchanged.

## Alternatives rejected

- Weakening the rubric or forcing an accepting judgment would hide the observed coverage failure.
- Changing only the campaign's delivery-plan text would leave the actual runtime-selected research plan outside the decision's evidence.
- Regenerating an absent or changed plan after approval would execute unreviewed bytes.

## Verification

The retained live attempt remains blocked, with two successful host-observed model calls and zero human waits. A stricter synthetic judge reproduces that rejection before the fix. Focused controls then verify delivery-plan plus research-plan evidence, byte-identical execution, idempotency, tampering refusal and run/revision/digest/endpoint scope. Native campaign acceptance still requires new retained trials on the corrected core.

[◀ Decisions index](./README.md)
