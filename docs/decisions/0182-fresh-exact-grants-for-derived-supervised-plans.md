# 0182 — Fresh exact-plan grants for derived supervised plans

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

[ADR-0181](./0181-supervised-plans-require-exact-grants.md) refused supervised routes under envelope grants because every effect check accepts a derived plan only through current machine decisions. Two paths remained open: a person's recorded approval could become derived-plan authority, or the operator could issue a new exact-plan grant for each derived plan. The owner chose on 2026-11-01.

## Decision

The operator issues a fresh exact-plan grant for each envelope-derived plan that a supervised route should execute. A person's recorded approval never becomes authority for later steps; it remains a decision about the exact subject a stage published. Supervised and on-exception routes under an envelope grant stay refused before dispatch, and supervised definition approvals follow the same rule: the definition result is executed under a new exact-plan grant, not under the envelope.

This adds no code. It removes the derived-plan authority item from P6-10's remaining work.

## Alternatives rejected

Letting recorded human approvals authorize derived plans would add a second authority path to five effect checks and let anyone who can run the operator command extend an envelope grant.

## Verification

The existing preflight case refuses supervised envelope routes, and the envelope plan-stage case opens no human request.
