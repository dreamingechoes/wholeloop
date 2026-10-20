# Remote rollout bridges — explicit reads and conservative normalization

> **TL;DR** — A provider manifest does not execute a service. The flag bridge plans a fixed read without credentials and runs it only on explicit live selection. LaunchDarkly and Unleash have separate conservative normalizers; complex targeting remains unknown.

> [!NOTE]
> **Status: 🚧 partial.** The local LaunchDarkly/Unleash REST readers, typed host integration and CLI preview/live boundary are fixture-tested. Actual authenticated server/native/Linux acceptance, other flag services and remote dashboard creation remain open.

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
setup, add --live to execute one GET. The resulting observed receipt includes actual
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

GrowthBook/PostHog readers and actual dashboard creation/normalization need
their own service-specific contracts. Existing dashboard files remain handoffs with
createdRemotely=false. Current tests use local synthetic HTTP responses, not captured
live service evidence. Owner checks are in [manual verification](../../roadmap/manual-verification.md).
See [ADR-0076](../decisions/0076-explicit-read-only-flag-bridges-and-conservative-cohorts.md).

<!-- docnav -->
[◀ Writing a provider](providers.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Compatibility ▶](compatibility.md)
