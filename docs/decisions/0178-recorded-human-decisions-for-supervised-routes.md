# 0178 — Recorded human decisions for supervised routes

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

Supervised and on-exception plans keep people at their decision points, but the fixed runner composed only explicitly delegated machine judgments. Under permitted intervention the plan, build-plan and acceptance adapters refused, the engine paused any host that needed a person, and the local handoff required delegated decisions. A supervised route therefore could not reach its endpoint, and the specification's `waiting-input` state was unreachable from a stage. This refines the supervised clause of [ADR-0176](./0176-static-fixed-dispatch-route-preflight.md), whose static preflight otherwise stands.

## Decision

Add a recorded human decision. A stage publishes a version-one request naming the decision (`delivery-plan`, `approve-build-plan` or `acceptance`) and the exact subject digest a person must judge. Only the new operator command `wl delivery human-decide` records the person's accept or reject, and only for that published subject while the stage is unresolved. A repeated identical decision is idempotent; a different one refuses. None-policy runs can neither publish nor record one.

Adapters use it only when explicitly configured with `humans` for the same store, so default adapters keep their existing refusals.

- **Plan.** An exact-plan grant already names the immutable plan bytes, so the stage passes as owned core metadata. An envelope-derived plan waits for a recorded `delivery-plan` acceptance of its exact plan artifact.
- **Build plan.** The builder plan is produced as before, and only host-observed production is offered for a recorded `approve-build-plan` decision.
- **Acceptance.** The stage requires current whole-product readiness, retains that exact product binding and waits for a recorded `acceptance` of its identity. It passes only while the product is unchanged.

The local handoff accepts either independent delegated decisions or a recorded human acceptance of the exact bound product, and its report names the decision digest.

The engine treats a host's `humanRequired` as blocking only under `none`. A `pending` stage under permitted intervention moves the run to `waiting-input`. After the decision is recorded, reconcile observes the stage, and resume returns the same run to `queued`. Fixed-dispatch preflight reports a supervised route available, with a person required, only when every plan, build-plan and acceptance stage has the opt-in and the route has no definition stage, which has no recorded-decision composition yet.

## Alternatives rejected

Writing human decisions as delegated machine decisions would forge provenance. An interactive prompt in the controller or a worker would break the no-prompt contract and ownership boundaries. Changing default adapter behavior would silently move existing supervised callers into production work. Reusing human acceptance-case notes would conflate observations of one case with a decision about the whole product.

## Verification

Command-level cases refuse unpublished, mismatched and none-policy decisions and keep repeats idempotent. Adapter cases cover exact-plan and envelope plans, accepted and rejected build plans, fixture-only production and acceptance before readiness. An engine case covers `waiting-input`, reconcile and resume, and a none-policy host that requires a person stays blocked. The supervised mode of the composed Docker evaluation accepts the exact product through the operator command and reaches a `code-ready` handoff. Evidence is in the journal.
