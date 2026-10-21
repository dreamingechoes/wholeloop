# 0079 — Exact PostHog reads and configured environment scope

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

PostHog exposes feature flags within numeric projects, not named deployment
environments. Its key list filter is case-insensitive; treating the first search
result as an exact unique flag can select the wrong resource. A percentage also
cannot summarize targeted, multivariate, group or experiment configuration.

## Decision

- Add wholeloop/posthog-flag-bridge@1 with an explicit owner-maintained project to
  environment mapping. Preserve the existing generic configuration declaration.
  Reject mismatched requested environments before credentials or network access.
  Label that mapping in the plan and normalized result as configured evidence,
  never an API-observed environment or proof of application routing.
- Plan a key-filtered list GET with limit=2 and offset=0. Require count=1, null
  next/previous and one exact-case key with positive numeric ID. Then GET that ID
  from the configured project/base, requiring unchanged resource identity.
  Never follow server-supplied URLs. Both requests share one ten-second deadline;
  each response retains the existing one-MiB JSON bound and redacted error path.
- Use a host-resolved Bearer credential, GET only, no redirects/cookies/retries.
  A read consumes no personal configuration, stores no credential and changes no
  flag. The CLI keeps default-preview and explicit live behavior.
- Normalize only explicit non-archived/non-deleted boolean state, positive version,
  no experiments/evaluation contexts/continuity/remote configuration, runtime=all
  and distinct_id bucketing. Require one condition group with explicit empty
  properties and finite numeric percentage 0–100. Refuse multivariate/holdout/
  enrollment/group aggregation/frozen exposure and unknown filter/group controls.
- Describe the configured cohort as persons with distinct_id, not measured traffic
  or all SDK/application contexts. Inactive flags have zero configured exposure.
  Hash consumed identity/version/controls into the revision; omit service prose.

## Alternatives rejected

Echoing the requested environment as a server observation would hide a scope
assumption. Reusing the generic v1 declaration with a new required field would
break frozen clients. Using the first list result, or following pagination URLs
with a credential, would weaken identity and request boundaries. Summing groups
or evaluating dependencies requires actual context and cannot produce this scalar.

## Verification

Exercise exact preview/configuration, lookup completeness/case/identity, live
list/detail routing, one shared deadline, cancellation between requests, redaction
and built-in manifest/ramp normalization. Cover numeric boundaries, disabled state,
content revisions and unsupported controls with synthetic HTTP responses. Actual
PostHog authentication/version/permissions, project mapping, SDK behavior and Linux
acceptance remain owner verification. No authenticated service call is performed.

## Sources

- [PostHog feature flags API](https://posthog.com/docs/api/feature-flags)
- [PostHog filter contract](https://github.com/PostHog/posthog/blob/master/products/feature_flags/backend/api/filters_schema.py)
- [PostHog serializer and exact-key filter](https://github.com/PostHog/posthog/blob/master/products/feature_flags/backend/api/feature_flag.py)
- [PostHog flag model](https://github.com/PostHog/posthog/blob/master/products/feature_flags/backend/models/feature_flag.py)

## Current transport scope

[ADR-0085](./0085-client-owned-mcp-first-provider-transport.md) gives client-owned
MCP priority and retains this implementation or policy within that scope. Existing
safety constraints remain in force; a dedicated HTTP bridge per catalogue service
is not a 1.0 requirement. Missing MCP contracts remain explicit pending work.

[◀ Decisions index](./README.md)
