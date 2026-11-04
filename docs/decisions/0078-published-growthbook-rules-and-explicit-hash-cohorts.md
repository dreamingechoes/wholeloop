# 0078 — Published GrowthBook rules and explicit hash cohorts

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

GrowthBook's resource contains published per-environment values and may also contain drafts. Boolean values use JSON strings in its management API. A hashed rollout skips contexts without its hash attribute and retains the default value; calling its percentage a rollout to all contexts would misrepresent that cohort. Binary floating-point multiplication can also turn a configured 0.29 into a value slightly below 29, causing false exact-percentage mismatches in ramp checks.

## Decision

- Extend the existing explicit read host with GrowthBook's feature GET and Bearer authentication. Preserve the configured HTTPS API base/subpath. Keep the same non-secret v1 configuration, preview/live selection, bounded transport, in-memory credential resolver, redacted unknown failures and no write/retry behavior.
- Match exact feature/project/environment, non-archived boolean type, published revision/version/date and explicit live enabled/default/rule fields. Parse only JSON boolean values. Ignore draft metadata completely. Accept consistent owning- project or all-project scope; refuse other/ambiguous scopes, dependencies, holdouts, config indirections and unsupported rule controls.
- Support no rule, one unrestricted force, or one ordinary rollout over id. Require enabled rules, no conditions/groups/prerequisites/schedules/ramps/sparse behavior, supported hash versions and bounded seeds. Reject experiments/bandits, unions, other hash attributes and unsupported targeting instead of inferring percentages.
- If a compiled SDK definition is supplied, cross-check its default/force/coverage/ hash controls and reject incompatible or extra targeting. Keep that definition in the revision digest without returning it. Do not require an optional SDK text field when the management resource provides the explicit published controls.
- Preserve both forward and reverse boolean rollout percentages. Shift canonical decimal coefficients with integer arithmetic before producing a numeric percentage, avoiding an extra binary multiplication/subtraction error. Refuse unrepresentable partial values that round to zero/full instead of claiming a boundary state.
- Label a distinct nonzero hashed rollout contexts with id. Missing IDs keep the default, so that observation must not satisfy a ramp stage labelled all. Pure defaults/forces, zero-coverage defaults and equal-value rules retain all. Disabled environments report their explicit configured zero state. These labels describe configured cohorts, not measured traffic or proof of application fallback behavior.
- Derive revision from consumed published state/version/date and supplied compilation; emit only scalar observation fields and a query-free resource reference. Existing formats remain unchanged; PostHog/dashboard code and actual service/native/Linux acceptance remain separate work.

## Alternatives rejected

Reading the latest draft would report a change that was never published. Truthy strings would interpret the JSON text false as enabled. Multiplying decimal fractions directly would introduce avoidable percentage drift. Treating every hashed rule as all would ignore missing IDs. Implementing a complete SDK evaluator or flattening targeting would exceed the scalar read contract and invent context membership. Writing a proposal to validate a read is outside this host's authority.

## Verification

Test exact cloud/self-hosted paths, published/draft separation, direct/force/forward/ reverse/zero/full rules, owning/global project scope, content revisions and cohort labels. Test decimal/exponent arithmetic and unrepresentable boundary refusal. Reject missing identities/revisions, nonboolean values, targeting, experiments, prerequisites, holdouts, config references, schedules, custom hashes and conflicting compiled definitions. Exercise Bearer GET-only transport and the actual built-in manifest/ramp normalizer with local synthetic HTTP responses. Actual API access, SDK/application behavior and Linux remain manual verification; no real service runs.

## Sources

- [GrowthBook OpenAPI contract](https://docs.growthbook.io/openapi.yaml)
- [GrowthBook API authentication](https://docs.growthbook.io/api/introduction)
- [GrowthBook SDK rule semantics](https://docs.growthbook.io/lib/build-your-own)

## Current transport scope

[ADR-0085](./0085-client-owned-mcp-first-provider-transport.md) gives client-owned MCP priority and retains this implementation or policy within that scope. Existing safety constraints remain in force; a dedicated HTTP bridge per catalogue service is not a 1.0 requirement. Missing MCP contracts remain explicit pending work.

[◀ Decisions index](./README.md)
