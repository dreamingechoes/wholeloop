# 0076 — Explicit read-only flag bridges and conservative cohorts

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

P4-05's virtual flag operation has no authenticated service implementation. This
is code work, separate from capturing actual owner credentials and service results.
The ramp accepts a complete enabled/percentage/audience/revision observation;
flattening arbitrary targeting rules into that shape would authorize false ramps.

## Decision

- Add an explicit non-secret versioned bridge configuration with service identity,
  canonical HTTPS base URL, exact project and a credential environment reference.
  Reject unknown fields, credential-bearing URLs and unsafe identifiers. The host
  resolves the credential from its own store only when a read actually executes;
  neither configuration nor results contain it.
- Add a pure read plan and a default-preview CLI. Require explicit live selection
  to perform a supported service GET. The first service implementation is
  LaunchDarkly's US/EU REST flag resource, filtered by exact environment. This uses
  a REST access token, not an SDK key. Expose the same implementation through the
  existing typed ProviderHost boundary so ramp's manifest binding/normalizer works.
- Bind provider/operation/tool/flag/environment and reject extra mutation args,
  mismatched services, writes/proposals and cancellation before credential lookup.
  Make one bounded HTTPS GET with no redirects/cookies, ten-second deadline and
  one-MiB JSON response limit. Cancel rejected bodies and redact every transport,
  authentication and normalization failure. Add no retry, cache, write or toggle.
- Normalize only a complete unrestricted boolean LaunchDarkly flag with distinct
  true/false variations, exact flag/environment, positive environment version,
  no targets/context-targets/rules/prerequisites and a false off variation. Accept
  a direct default variation or exact ordinary user/key percentage weights totaling
  100000. Reject experiments, other context kinds, custom buckets, untracked or
  malformed/duplicate weights and incomplete/archived configurations.
- Report audience=all only for that unrestricted subset, enabled from the explicit
  on field and zero exposure when off. Keep a content/version-derived revision and
  a query-free service resource reference. Omit response prose, target identities,
  raw JSON and headers. This is configured exposure, not measured traffic, context
  membership or permission to apply a ramp.
- Preserve existing local proposals/handoffs and unknown-on-failure behavior.
  The CLI records actual read completion time but imported response files remain
  unauthenticated observations. Other service bridges and remote dashboard creation
  remain independent P4-05 code work; native/authenticated acceptance stays open.

## Alternatives rejected

Calling every valid provider manifest connected would invent authentication.
Evaluating all targeting locally would require SDK/segment/context semantics the
scalar ramp contract does not represent. Assuming a missing targeting field means
empty would turn partial responses into global percentages. Disabling a flag after
an error would mutate production and conceal unknown state. Putting tokens in
configuration, command arguments, errors or stored results is unnecessary.

## Verification

Test exact plans/origins/identifiers and credential-free default compiled execution.
Exercise boolean/direct/reversed variations and ordinary percentage/off decoding;
reject complex/missing/contradictory targeting and experiment/weight variants.
Use local synthetic fetch responses for GET/header-only authentication, body/input
bounds, cancellation, redirects, denied/malformed/large responses, private-error
redaction and no mutation arguments. Feed the real built-in manifest and bridge
through ramp's existing flagEvidence: simple state is observed, complex state stays
unknown. Actual LaunchDarkly tokens, server/API versions, permissions, native hosts
and Linux execution remain owner verification; no real authenticated request runs.

## Sources

- [LaunchDarkly flag read](https://launchdarkly.com/docs/api/feature-flags/get-feature-flag)
- [LaunchDarkly REST authentication](https://apidocs.launchdarkly.com/reference)
- [LaunchDarkly variation weights](https://launchdarkly.com/docs/api/feature-flags/patch-feature-flag)

[◀ Decisions index](./README.md)
