# 0112 — Private delegation and independent machine decisions

- **Status:** Accepted
- **Date:** 2026-10-25

## Context

An unattended run cannot pass through the existing human approval API by putting the owner's name in an automated response. A plan generated after initial authorization also needs an independent semantic judgment: structural envelope equality alone says nothing about whether the implementation plan addresses the selected request. Worker-provided JSON and communication profiles cannot create this authority.

## Decision

1. Reuse original private exact-plan/envelope grants and their explicit named decision IDs. Pin closed purpose-specific rubric bytes in the controller store. Require their original digests, required evidence IDs, current complete artifact/evidence bytes and the unchanged source/plan/policy/grant. Structural envelope checks preserve repositories, outcomes, exclusions, evidence requirements, effects and budgets before any semantic judgment.
2. Give trusted controller hosts the selected source, exact plan and original authorization, bounded selected artifact/evidence inputs and a finite original deadline. Require independently completed planner/challenger identities, exact basis/judgment hashes and current observed evidence. Neither a CLI result import nor a broker method can create a decision. Fixture observations stay fixture-only and cannot accept a derived plan for actual execution.
3. Keep a separate machine record with rubric, actor kind, exact evidence observations, uncertainties, independent challenge and timestamp. Never populate legacy human by/approval/test records. Decision success changes no required gate, external review requirement, effect grant or production flag. Failed tests and human-only prerequisites cannot become affirmative machine acceptance. Rejection and authorized unknown outcomes retain their actual reasons.
4. Retain immutable records and publish the latest decision separately. Starting a replacement judgment immediately fences its predecessor, including when the replacement crashes. Late older results cannot overwrite the newer intent. New rejection, changed bytes/base/plan, revocation or expiry invalidate future eligibility without deleting history. A published immutable observation may repair only its own missing key/plan locators after interrupted writes, without another host invocation or republishing a superseded decision. Stable keys return existing observations; interrupted/unknown judgments require a new explicitly selected attempt rather than blind replay. Existing environment, worker, acceptance and assembly hosts use the current private plan-decision reader by default; stricter host callbacks remain possible.
5. Preserve the original wall/attempt deadlines and artifact budget. Reject unsupported hard model-token/currency metering before invocation. Fence late or cancelled results, retain uncertain intent and pass cancellation to the trusted host without claiming it stopped. Native hosts remain responsible for actual contained process ownership, model admission and per-attempt metering.
6. None-policy preflight and fallback never emit a human prompt or waiting-input result. Keep missing facts as owned unknowns under a pinned permitted default, bounded investigation, independent least-scope assessment, complete-with-unknowns or on-hold rule; otherwise block. Existing supervised/on-exception behavior and the journal's no-human-wait rule remain unchanged. Runtime capabilities are observed separately; policy-only preflight never certifies them. Complete native route orchestration remains P6-10/P6-33.

## Alternatives rejected

Reusing the human answer command would fabricate attribution and silently satisfy unrelated approvals. Accepting raw machine-result JSON would erase the trusted host boundary. An autopilot profile cannot select permissions. Treating an old accepted plan as current after a newer rejection would preserve authority the latest decision removed. A hidden prompt in none mode would make successful completion depend on an absent person. Increasing budgets after interruption would lose the original finite authorization.

## Verification

Exercise all ten decisions, wrong rubrics, required evidence, independent identities, hostile input, positive/negative outcomes, unknown policies, fixture refusal, revocation, latest rejection, changed bases/revisions/bytes, interrupted deadlines and artifact/hard-metering limits. Run compiled CLI contracts, actual disposable Git/control-store evaluations and the Node 20 minimum. Preserve native/model/hosted acceptance as separate evidence requirements.

[◀ Decisions index](./README.md)
