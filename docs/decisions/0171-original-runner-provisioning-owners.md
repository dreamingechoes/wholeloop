# 0171 — Original runner provisioning owners

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

The existing environment scope binds QA operations to an already recorded resource. Provisioning starts earlier: backend context, image and daemon observations precede resource admission. Parent deadline enforcement alone cannot recover or cancel those original preflight clients from a fresh controller. Requiring a resource first would reserve it before actual preflight.

## Decision

Extend the existing scope with a distinct private preparation phase. Capture the complete original request, selected candidate content and expected resource identity under the current original verification/integration invocation. Refuse an already existing environment rather than attributing another producer's work to this phase. Also require the backend to win actual resource admission after asynchronous preflight: its newly generated ownership token must equal the saved token. Capture that internal strictness request with the original parent; caller replacements cannot disable it. Preserve default standalone reinspection. Consume the exact preparation before starting any backend client, and require that original consumption digest during inspection.

Use a separate version-three private binding for this phase; preserve existing version-one and version-two shapes and observation digests. Before the runtime history exists, only the intact captured preparation can supply its expected identity. A present but damaged history never falls back to that expectation. Once the backend creates its resource, require the same run, plan, grant, recipe, helper, key and captured candidates. Read the original consumption marker with a finite byte limit. Verification cancellation discovers phase-only owners even when no main QA scope exists yet.

Reuse original managed process owners for inert reads and the existing nonce-bound environment operation claims for mutations. Permit context inspection only for preparation. Do not nest native wrappers around registered operation clients. Register the actual first owner with the root and retain the original captured parent bounds throughout provisioning. Fresh metadata inspection and cancellation remain possible after revocation; no stored PID becomes cancellation authority.

Preparation-owner closure establishes no application readiness or semantic acceptance. The existing backend still owns actual setup/readiness and its effect observations. Complete-route selection, producer-result recovery, public execution and runtime capability negotiation remain separate implementation work.

## Alternatives rejected

Creating a resource before preflight reverses existing capacity and admission checks. Checking absence only before preflight loses a concurrent admission race; matching the fresh token at actual admission closes that gap. Treating parent cancellation as durable ownership loses original clients after controller interruption. Allowing arbitrary commands into the shared native-model registry widens unrelated ownership contracts. Reusing a QA phase overwrites original locators and changes historical evidence. Reconstructing an input or repeating provisioning after losing its locator risks another effect; retained consumption refuses replay instead.

## Verification

Exercise cancelled, expired, fenced, foreign-run and missing-phase refusal before backend execution; actual failed preflight recovery before any resource exists; original consumption/input corruption and exact restoration; replay refusal; original-client cancellation from a fresh controller after revocation; and replacement signal/predicate resistance. Retain every existing environment-scope case. Extend the fixed-dispatch Docker evaluation with an opt-in original preparation phase, actual preflight and mutation owners, unchanged root deadlines and fresh-controller owner comparison, followed by the existing QA, independent synthetic acceptance, handoff, adversarial recovery and exact retirement controls. Native accounts and independent Linux application-host acceptance remain separate.

The initial actual fixed-dispatch composition passes twelve controls, including product preparation, product QA, independent synthetic acceptance, code-ready, recovery and exact retirement. A fresh controller recovers the identical retired preparation proof with twelve mutation owners and 67 read owners, preserving the journal after fault restoration. Final review reproduces a concurrent resource-admission failure before the strict token guard; all 89 directed Mac cases and the final journal-preservation regression pass after it. The strict real-Docker parent-control mode passes all 21 controls and retires every owned resource. Complete final Linux checks pass 3453 tests in 184 files and every remaining check on archive 73a66ab3504e8c80118473dcdd5fce6555b42fab2b800a0edce9e20e19a94aae. The initial scoped composition precedes that final admission guard; the journal records each evidence boundary and bundle.
