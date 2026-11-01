# 0181 — Supervised fixed dispatch requires exact-plan grants

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

[ADR-0178](./0178-recorded-human-decisions-for-supervised-routes.md) let the supervised plan stage pass an envelope-derived plan on a person's recorded `delivery-plan` acceptance. Effects under an envelope grant, however, accept a derived plan only through current machine decisions: workspace allocation, worker context, provisioning, assembly and the acceptance store all check `acceptedDecisionPlan`. A supervised envelope route could therefore pass its plan stage and then be refused at the next effect, after spending budget and with a misleading reason.

## Decision

Narrow the supervised composition. The opted-in plan stage passes only exact-plan grants, which already name the immutable plan bytes; under an envelope grant it keeps the existing refusal and opens no human request. Fixed-dispatch preflight reports `dispatcher-supervised-envelope-unavailable` for supervised and on-exception routes with an envelope grant, before any dispatch. Recorded human decisions for build plans and whole-product acceptance are unchanged. The `delivery-plan` decision identity remains in the closed record and output contract; no stage publishes it until derived-plan authority can accept recorded human decisions.

Supervised envelope-derived plans and definition approvals remain P6-10 work. They need one derived-plan acceptance rule that every effect check reads, covering a person's recorded acceptance of the exact plan digest as well as current machine decisions.

## Alternatives rejected

Letting the plan stage pass and relying on later refusals would spend budget and report the wrong cause. Writing the person's acceptance into the machine decision store would forge provenance. Patching one effect check would leave the other four inconsistent.

## Verification

The envelope plan-stage case now expects refusal with no human request, runtime or native call. The exact-plan case still passes as owned metadata. Evidence is in the journal.
