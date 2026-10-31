# 0175 — Original milestone product production

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

[ADR-0173](./0173-fixed-product-environment-selection.md) lets the fixed dispatcher prepare a product environment, but only from candidate and assembly digests that a caller produced beforehand. The owned assembly is itself a Git effect of the integration stage, and its candidate pins a recipe rooted at the assembled worktree, whose path exists only once the assembly is prepared. Leaving both outside dispatch means a caller must run Git effects under the stage's invocation and choose the recipe that QA will execute.

## Decision

Accept a second per-milestone configuration: a helper image, a prepared template recipe, the static acceptance, data and gate-policy inputs, and repair owners. The template's repositories must be exactly the milestone's repositories; the identifier recipe and the recipe kind are reserved for the derived input, and exactly one acceptance input is required. Validate and copy the configuration at construction.

On dispatch, read current complete unit QA under the original controls and consume a version-one production binding, holding the request, stage, invocation, deadline, configuration, unit evidence and assembly request, before any Git effect. The assembly key derives from the original invocation. Prepare the owned assembly with the original deadline, signal, ownership predicate and a single stage registration, and publish its digest as a locator. Before execution, check the complete candidate request structurally with provisional heads so malformed coverage, contracts, owners or input dependencies refuse without a Git effect. Execute the assembly, rebind each template repository root to its assembled worktree, prepare that recipe and the integration candidate, then continue the existing ADR-0173 selection with the derived digests.

A retained production binding observes its original assembly and never issues Git again; an unassembled original remains unresolved. Historical product selection additionally requires the locator, assembly key and helper image to match the production binding. Stop reads only that binding and locator, so a fresh controller can request cancellation of in-flight assembly operations after revocation without current configuration.

The digest configuration and its explicit-selection callers are unchanged. Multiple recipes per product, complete runtime preflight, public foreground execution and other route composition remain P6-10 work.

## Alternatives rejected

Configuring a finished recipe digest cannot name the assembled worktree before it exists. Recomputing the assembly digest during stop calls authority checks that refuse after revocation. Executing assembly again after a lost or partial result can duplicate Git effects. Validating the candidate only after assembly wastes an owned effect on a configuration error that was knowable beforehand.

## Verification

Table-driven cases reject malformed production configuration and refuse cancellation, fencing, expiry, an unverified unit vector, a missing or foreign-repository template and a lost production consumption before any binding, locator, assembly history or journal change; original signal and predicate survive asynchronous unit readiness. The opt-in product-production mode of the composed assembly evaluation lets the dispatcher assemble, derive and verify the product inside the original window and retains every existing control. Evidence is in the journal.
