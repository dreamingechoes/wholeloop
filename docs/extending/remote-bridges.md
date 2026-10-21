# Remote rollout bridges — explicit reads and conservative normalization

> **TL;DR** — A provider manifest does not execute a service. The flag bridge plans a fixed read without credentials and runs it only on explicit live selection. LaunchDarkly, Unleash, GrowthBook and PostHog have separate conservative normalizers; complex targeting remains unknown.

> [!NOTE]
> **Status: 🚧 partial.** The local LaunchDarkly/Unleash/GrowthBook/PostHog REST readers, typed host integration and CLI preview/live boundary are fixture-tested. Actual authenticated server/native/Linux acceptance, remote dashboard creation remain open.

---

## Configure a read

Use a non-secret user-maintained configuration containing references only; keep the actual credential in your encrypted store or native credential store
and expose it to the invocation as an ephemeral environment variable:

```json
{
  "schema": "wholeloop/flag-bridge@1",
  "provider": "launchdarkly",
  "baseUrl": "https://app.launchdarkly.com/",
  "project": "store",
  "tokenEnv": "WHOLELOOP_LD_REST_TOKEN"
}
```

Choose the exact project/environment keys and official US/EU origin. The EU origin
is `https://app.eu.launchdarkly.com/`. Use a restricted REST access token with the
required read permission; LaunchDarkly SDK keys do not authorize this REST API.
Do not put its value in JSON, argv, a shell profile or a response fixture.

```bash
node "$WHOLELOOP_CLI" provider read-flags --bridge "$BRIDGE_CONFIG" \
  --flag orders --environment production --json
```

The default is a read-only plan with effects=not-performed. It neither looks up a
credential nor calls the service. After explicit authorization and credential-store
setup, add --live to execute the planned read (PostHog uses list then detail GETs). The resulting observed receipt includes actual
completion time and a normalized result; no repository/store write is performed.
Failed/unsupported reads exit with an explicit unknown-state error, never a disabled
flag. There is no send, toggle, update or automatic retry path.

## What can be represented

The reader requires the exact complete named flag/environment and version, two
distinct boolean variations, no targeting/prerequisites and a false off variation.
It accepts a default variation or ordinary user/key rollout whose integer weights
sum to 100000. This unfiltered subset has audience=all. Disabled flags have zero
configured exposure. Reversed true/false variation ordering is handled explicitly.

Experiments, custom buckets, non-user contexts, individual targets, rules, segments,
missing fields and unsupported/archived configurations remain unknown. The scalar
result does not measure actual traffic or prove a particular context's evaluation.
Do not rename audience=all into a restricted cohort or treat failure as zero.

## Unleash environments and strategies

Use provider=unleash with the same v1 bridge configuration fields. Select the
actual canonical HTTPS deployment base (including its subpath and trailing slash),
project and credential environment reference. The shared preview/live command reads
one exact Admin feature with variantEnvironments=true and selects one exact named
environment. It does not infer the environment from a Client API token.

Only explicit non-archived, dependency-free configuration with no variants and one
unrestricted strategy is normalized. The default strategy means 100%; an ordinary
flexibleRollout needs integer rollout 0–100, default stickiness and a nonempty
bounded groupId. Constraints, segments and strategy variants must be empty. Other
strategies/stickiness, unions, dependencies, active release plans/safeguards and
incomplete fields remain unknown. The documented absent disabled field defaults to
false; an explicitly disabled strategy is refused.

The audience label all describes the unrestricted eligible context population,
not measured traffic or every SDK context's evaluation. Disabled environments
retain their explicit state with zero configured exposure. No proposal/toggle is
performed. See [ADR-0077](../decisions/0077-explicit-unleash-environments-and-unrestricted-strategies.md).

## GrowthBook published rules and cohorts

Use provider=growthbook and the same v1 configuration. GrowthBook Cloud uses
`https://api.growthbook.io/api/`; select the exact HTTPS API prefix for a self-hosted
deployment. The reader uses a Bearer credential from the host store and fetches
one named feature, then binds its owning project and exact environment.

Only published revision/live environment controls are used; draft values are
ignored. The reader parses JSON booleans, supports defaults/unrestricted force
and one ordinary id rollout, and checks any supplied compiled SDK definition for
consistent controls. Dependencies, holdouts, indirections, targeting, schedules,
experiments, unions and custom hash attributes remain unknown.

A distinct nonzero hashed rollout is labelled **contexts with id**. Contexts without
id retain the default and must not be silently included in a ramp labelled all.
Defaults/forces and equal-value rules have audience=all. Forward/reverse coverage
uses decimal coefficient arithmetic so a configured 0.29 compares as 29%, while
unrepresentable partial boundary percentages are refused. This describes configured
exposure; actual SDK context behavior and application fallback still need verification.
See [ADR-0078](../decisions/0078-published-growthbook-rules-and-explicit-hash-cohorts.md).

## PostHog project scope and exact lookup

PostHog uses numeric projects rather than deployment environment resources. Use
an explicit owner-maintained mapping and the separate configuration declaration:

```json
{
  "schema": "wholeloop/posthog-flag-bridge@1",
  "provider": "posthog",
  "baseUrl": "https://eu.posthog.com/",
  "project": "42",
  "environment": "production",
  "tokenEnv": "WHOLELOOP_POSTHOG_READ_KEY"
}
```

Select the actual canonical HTTPS API host/subpath and a restricted read credential
from your store. The requested environment must match this configuration before
credential lookup. The receipt labels environmentBasis=configured-project-mapping;
this mapping needs owner review and does not prove application deployment routing.

The reader requires one complete exact-case key match before fetching the numeric
ID. Incomplete pagination, duplicates and changed identities remain unknown; server
pagination URLs are never followed. Both GETs share one deadline. Only one empty-
property person condition group with an explicit numeric percentage, runtime=all,
distinct_id bucketing and no experiments/evaluation contexts is represented.
Targeting, variants, holdouts, enrollment, continuity, group flags, remote config,
frozen exposure and unknown controls are refused. The configured audience label
persons with distinct_id is not all-context or measured traffic evidence. See
[ADR-0079](../decisions/0079-exact-posthog-reads-and-configured-environment-scope.md).

## Host composition and ramp

Source hosts can supply a credential-store resolver and optional transport/signal
to remoteFlagHost from src/providers/flag-bridge.ts. It implements the existing
ProviderHost contract and accepts only the exact flags.read-state virtual call.
Use it as rolloutHost's delegate for remote reads; native drafts and unapplied
proposals keep their existing local behavior. No default host gains remote access.

For an explicit CLI handoff, first obtain ramp requests for the exact run/stage/
mode/time. Place the live reader's normalized result under the matching fingerprint
in that request's ramp-read-responses envelope; preserve the requested identity and
record the separate actual read completion time for review. Other evidence requests
still need their own actual hosts or explicit unavailable entries. Then use the
existing ramp observe/confirm import. Imported files do not authenticate themselves,
and no bridge result authorizes a manual exposure change or approval.

## Remaining work

Actual dashboard creation/normalization needs its own service-specific contracts. Existing dashboard files remain handoffs with
createdRemotely=false. Current tests use local synthetic HTTP responses, not captured
live service evidence. Owner checks are in [manual verification](../../roadmap/manual-verification.md).
See [ADR-0076](../decisions/0076-explicit-read-only-flag-bridges-and-conservative-cohorts.md).

<!-- docnav -->
[◀ Writing a provider](providers.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Compatibility ▶](compatibility.md)
