# 0077 — Explicit Unleash environments and unrestricted strategies

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The common read-only flag host supports LaunchDarkly, but Unleash represents
configuration as a feature with environment-specific strategies and optional
parent dependencies. A Client API token's implicit environment is insufficient
proof of the named ramp environment. Multiple strategies, constraints or variants
cannot be flattened into the existing scalar exposure observation.

## Decision

- Extend the existing explicit host/CLI with the authenticated Admin GET for one
  exact project/feature, requesting variantEnvironments=true so environment variants
  are visible. Preserve an explicitly configured canonical HTTPS deployment subpath.
  Reuse the credential-store resolver, bounded JSON/deadline/cancellation handling,
  no redirects/cookies, redacted errors and query-free resource reference.
- Match exact project/name, explicit non-archived state and an empty dependency
  array. Select exactly one named environment with boolean enabled, explicit empty
  variants and exactly one strategy. Refuse missing/duplicate identity, active
  release-plan/safeguard metadata, dependencies and incomplete observations.
- Accept only an unrestricted default strategy with no parameters, or one ordinary
  flexibleRollout with an explicit integer percentage 0–100, default stickiness
  and bounded nonempty groupId. Require empty constraints/segments/strategy variants;
  reject custom strategies/parameters, disabled strategies and non-default stickiness.
  The documented missing disabled field means false; explicit null/other types do
  not become that default.
- The accepted subset has audience=all over the strategy's eligible contexts.
  Preserve configured percentage and boolean enabled; disabled environments report
  zero exposure. Derive revision from the consumed observation/strategy without
  returning raw descriptions, targeting fields or server metadata. This is not
  measured traffic, SDK context evaluation or authorization to change a flag.
- Replace the shared transport's AbortSignal.any composition, introduced in Node
  20.3, with abort-controller subscriptions available at the declared Node 20.0
  floor. Recheck cancellation after credential lookup and release both signal
  subscriptions on success/failure; do not raise the supported minimum.
- Preserve the original v1 bridge/output/command declarations. The service field
  already is an extensible bounded identity; no existing format changes. Other
  service readers/dashboard bridges remain P4-05 code work. Actual native/server
  acceptance remains owner verification, separate from implementation.

## Alternatives rejected

Using Client API state with an assumed token environment could bind the wrong
scope. Omitting the variants query would hide data required for conservative
normalization. Combining strategies by adding percentages would double-count
unions and ignore dependencies. Treating constraints, missing fields or failed
access as zero would create false evidence for a ramp. Reading or applying a
proposal is not part of this GET-only host.

## Verification

Test exact HTTPS subpath/query and project/feature/environment binding; ordinary,
default, zero/full and disabled configuration; version hashes and raw-field omission.
Reject dependency/identity/variant/strategy/constraint/segment/percentage/stickiness/
custom-parameter/release-plan/safeguard cases. Feed the built-in manifest through
the actual shared transport and ramp normalizer using synthetic HTTP responses:
only complete supported configuration is observed, and complex state stays unknown.
Retain all LaunchDarkly transport tests and existing v1 declaration fingerprints.
Actual isolated Node 20.0.0 on macOS arm64 executes the compiled preview and
the signal-bearing shared host with a local synthetic response while AbortSignal.any
is absent. This is subset runtime evidence, not a complete Node 20/Linux/native
suite. No authenticated Unleash request, native model, container or service instance
runs.

## Sources

- [Official feature Admin route and variant selection](https://github.com/Unleash/unleash/blob/main/src/lib/features/feature-toggle/feature-toggle-controller.ts)
- [Feature response schema](https://github.com/Unleash/unleash/blob/main/src/lib/openapi/spec/feature-schema.ts)
- [Environment response schema](https://github.com/Unleash/unleash/blob/main/src/lib/openapi/spec/feature-environment-schema.ts)
- [Strategy parameters/defaults](https://docs.getunleash.io/api/get-feature-strategies)

- [Node 20.3 AbortSignal.any introduction](https://nodejs.org/en/blog/release/v20.3.0)

[◀ Decisions index](./README.md)
