# 0180 — Trusted native bindings for unattended runs

- **Status:** Proposed
- **Date:** 2026-11-01

## Context

A public foreground run must launch native clients for planning, building, verification, review and delegated judgments. Which clients, versions and models an unattended run may launch is an authority choice for the owner, not a technical default. Native hosts already require trusted runtime proof before launch, and default proof is unavailable, but nothing yet states which clients a public runner may even attempt.

## Decision

Pending the owner's choice, adopt the most conservative default: trust no native client unless it is explicitly bound, and never relax containment.

- A closed `wholeloop/native-bindings@1` document lists explicit bindings. Each binding names one pinned reference target and version, one exact model and the worker roles it may serve. There are no wildcards, defaults or inheritance.
- The built-in default document is empty, so every native client is refused as unbound.
- A binding has no field for sandbox, tools, network, credentials or interaction. It can only narrow which client may be attempted, never widen what a launched client may do, and any extra field makes the whole document invalid rather than partly trusted.
- A binding is necessary, not sufficient. Every launch still needs the existing trusted runtime proof, containment and owned-output checks, which default to unavailable.

The implementation is limited to what this default allows: a deterministic evaluator and its refusal reasons. No command, configuration file or runner path supplies bindings yet, so no unattended native launch becomes possible.

## Options for the owner

1. Accept this default and later add bindings case by case, for example one Codex model for builder and verifier roles after its native conformance passes.
2. Bind the reference Claude and Codex recipes for all roles once P0-03 conformance and P6-27 native trials pass.
3. Defer unattended native execution entirely and keep fixed dispatch for supervised use.

## Alternatives rejected

Trusting every installed client would let a profile or an environment variable choose the model that acts without a person. Allowing sandbox or tool settings in a binding would turn an authority list into a containment override. Wildcard models would silently accept model changes.

## Verification

Unit cases refuse every client under the default, bind only exact pinned target, version, model and role matches, refuse unpinned and expanded targets, and invalidate documents that try sandbox or tool settings, wildcard models, unknown roles, duplicates, extra fields or another schema.
