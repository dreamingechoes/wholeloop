# Remote rollout bridges — explicit reads and metric-pinned creation

> **TL;DR** — A provider manifest does not execute a service. The flag bridge plans a fixed read without credentials and runs it only on explicit live selection. LaunchDarkly, Unleash, GrowthBook and PostHog have separate conservative normalizers; complex targeting remains unknown.

> [!NOTE]
> **Status: 🚧 partial.** Remote integrations are **experimental · fixture-tested · service-unverified** under [ADR-0084](../decisions/0084-experimental-integrations-and-scoped-live-verification.md). The existing four HTTP flag readers and four HTTP dashboard hosts are retained opt-in implementations. [ADR-0085](../decisions/0085-client-owned-mcp-first-provider-transport.md) prioritizes client MCP and freezes further API expansion without a concrete justified gap. Missing Amplitude MCP contracts retain pending handoffs; no dedicated HTTP bridge is required for 1.0. Native-client and platform acceptance remain separate.

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

## Grafana dashboard creation

The explicit Grafana bridge targets the v1 API available in Grafana 12 and later.
Configure dashboards=grafana for the launch and complete its kit first. Its metric
must already use provider=grafana, operation=source.observability.query and an
actual reviewed PromQL query. The bridge preserves that query; it does not convert
prose, SQL or Loki into PromQL, resolve templates or infer a datasource.

Use a separate non-secret configuration with your actual deployment and IDs:

```json
{
  "schema": "wholeloop/grafana-dashboard-bridge@1",
  "provider": "grafana",
  "baseUrl": "https://grafana.example.com/",
  "tokenEnv": "WHOLELOOP_GRAFANA_CREATE_KEY",
  "namespace": "default",
  "dashboardUid": "wl-order-errors",
  "folderUid": "launches",
  "datasourceUid": "prometheus-main",
  "queryLanguage": "promql",
  "artifactDigest": "replace-with-the-exact-artifact-body-digest"
}
```

The digest is measurementDigest(target.body), the same SHA-256 of JSON-encoded
artifact body used by launch dispatch intent. Obtain the exact body from launch
report; the placeholder above is deliberately invalid. Do not put a token in the
configuration. Use an existing folder/datasource and a new dashboard UID, with
restricted create/read access resolved from your credential store.

```bash
node "$WHOLELOOP_CLI" launch dispatch --for "$SCOPE_ID" \
  --key dashboards/order-errors --bridge "$DASHBOARD_BRIDGE" --json
```

The default preview shows the exact create payload and readback URL without
credentials, HTTP or a dispatch event. Review its source pointer/query, folder,
namespace, datasource and configured window/timezone. Explicit --live journals
intent before one create POST, then reads back that same UID. Existing UIDs conflict;
there is no overwrite/update/delete or automatic retry. Default rolloutHost still
produces pending local handoffs unless the remote host is selected explicitly.

A successful readback proves matching stored configuration only. It does not
validate PromQL, permissions to query the datasource, rendered values or traffic.
Strict panel comparison may reject server-injected defaults; inspect rather than
retry. A failure, missing key after live dispatch, timeout or lost response retains
intent and may require inspecting a partially created remote dashboard. Completed
receipts are cached by run/key even if bridge configuration later changes. See
[ADR-0080](../decisions/0080-create-only-grafana-dashboards-from-pinned-metrics.md).

## PostHog dashboard creation

Use the same launch dispatch preview/live boundary with a separate non-secret
configuration. The completed metric must already use PostHog's product-analytics
query operation and a reviewed HogQL query containing the literal {filters}
placeholder. Its semantics remain an owner responsibility; no SQL is translated.

```json
{
  "schema": "wholeloop/posthog-dashboard-bridge@1",
  "provider": "posthog",
  "baseUrl": "https://eu.posthog.com/",
  "tokenEnv": "WHOLELOOP_POSTHOG_CREATE_KEY",
  "organization": "11111111-2222-3333-4444-555555555555",
  "project": "42",
  "queryLanguage": "hogql",
  "artifactDigest": "replace-with-the-exact-artifact-body-digest"
}
```

Replace example scope and digest with reviewed actual values. The host first reads
project identity/organization/timezone and refuses a mismatch before creating
anything. It creates a new dashboard and table insight, binding only that returned
dashboard ID, then reads both back to verify query/provenance and one active
attachment. It requires no effective/persisted filter or variable overrides.
Credentials require the corresponding project read, dashboard create/read and
insight create/read permissions; keep values in your credential store.

The documented dashboards write field on insight creation is currently supported
but deprecated upstream; actual version acceptance remains required. Readback uses
dashboard_tiles. This bridge stores configuration, without proving query validity,
rendered values or traffic. A known dashboard followed by failure becomes an
incomplete pending receipt with a safe inspection link; an unknown create outcome
retains ambiguous intent. Neither can trigger automatic cleanup or retry. The five
requests share one deadline. See
[ADR-0081](../decisions/0081-posthog-dashboard-creation-and-partial-receipts.md).

## Metabase dashboard creation

The same dispatch boundary supports a new dashboard with one dashboard-owned table
question. The completed metric must already use provider=metabase,
operation=source.bi.query and reviewed native SQL. A separate configuration binds
the real deployment/database/collection and acknowledges time scope explicitly:

```json
{
  "schema": "wholeloop/metabase-dashboard-bridge@1",
  "provider": "metabase",
  "baseUrl": "https://metabase.example.com/",
  "tokenEnv": "WHOLELOOP_METABASE_CREATE_KEY",
  "database": 2,
  "collection": 3,
  "queryLanguage": "native-sql",
  "windowBinding": "reviewed-in-native-sql",
  "artifactDigest": "replace-with-the-exact-artifact-body-digest"
}
```

Replace example IDs/digest with reviewed values. Keep the key in your credential
store and restrict the underlying database role to reads: saving a question may
validate/run query metadata inside Metabase. The bridge preserves SQL text and
uses no query execution endpoint. Its simple SELECT/no separators/comments/templates
subset is conservative syntax, not a SQL safety or semantic proof.

The preview exposes expected days/timezone as owner-reviewed-in-native-sql with
verified=false. Confirm those predicates in the actual dialect yourself; the host
does not inject dates, translate queries or claim time scope from SQL text.
Live dispatch creates a dashboard, creates its owned question, and reads both back.
The explicit legacy-mbql=true card read permits exact native-query comparison after
Metabase's ordinary MBQL 5 conversion. No existing dashboard is updated/replaced.
Sharing, attachment, parameter/series overrides and unsupported normalization prevent
success. Known partial resources retain a pending inspection link; no retry or
cleanup occurs. The API is unversioned; actual deployment/version, query/time scope
and rendering remain owner acceptance. See
[ADR-0082](../decisions/0082-metabase-owned-questions-and-explicit-sql-window-review.md).

## Mixpanel workspace-bound dashboards

The explicit Mixpanel host uses the official App API contract; it requires no
Python runtime or SDK installation. Its completed metric must use
provider=mixpanel, operation=source.product-analytics.query and native source query
JSON of the form below, with your actual reviewed report parameters:

```json
{"type":"insights","params":{"event":["order_error"]}}
```

This shape illustrates the handoff, not a verified query/time window for your
project. The bridge preserves parameters and requires explicit owner review:

```json
{
  "schema": "wholeloop/mixpanel-dashboard-bridge@1",
  "provider": "mixpanel",
  "baseUrl": "https://eu.mixpanel.com/",
  "tokenEnv": "WHOLELOOP_MIXPANEL_OAUTH_TOKEN",
  "project": 42,
  "workspace": 7,
  "queryLanguage": "native-report-json",
  "windowBinding": "reviewed-in-native-params",
  "artifactDigest": "replace-with-the-exact-artifact-body-digest"
}
```

Use your actual scope/digest and official US/EU/IN deployment. Keep the OAuth token
in your credential store; this host supports the Bearer subset. Preview with the
same launch dispatch command. The plan exposes expected days/timezone with
verified=false. Query/cohort/date semantics remain your review responsibility.

The host requires one matching project/workspace from the inventory before any
write, creates a private/restricted dashboard, then creates its owned v2 Insights
report. It reads the original report and dedicated dashboard relationship before
verifying dashboard privacy/provenance and absence of overrides/public links.
Opaque layout/contents are not interpreted. All six requests share one deadline.
No existing dashboard/report is updated. Known partial references stay pending and
cached; unknown creation keeps intent. Actual API/permissions/workspace, native
query/time scope and rendering remain owner acceptance. See
[ADR-0083](../decisions/0083-mixpanel-workspace-bound-dashboards-and-native-reports.md).

## Remaining work

Amplitude dashboard creation/normalization still needs a concrete authenticated
tool contract. Its official MCP documentation requires current tool description/
progressive discovery, while the public Dashboard REST API describes data reads.
The [examined plugin manifest](https://github.com/amplitude/mcp-marketplace/blob/5b688be467553f38edb79b89f24d0ac8109c9f27/plugins/amplitude/.codex-plugin/plugin.json) does not provide the dashboard argument/response schema. Capture the actual create-only action, project identity, native chart
binding and matching readback schema before implementing that host; a broad tool
name is insufficient. See [Amplitude MCP discovery](https://amplitude.com/docs/amplitude-ai/amplitude-mcp#progressive-tool-discovery). Existing dashboard files remain handoffs with
createdRemotely=false. Current tests use local synthetic HTTP responses, not captured
live service evidence. Owner checks are in [manual verification](../../roadmap/manual-verification.md).
See [ADR-0076](../decisions/0076-explicit-read-only-flag-bridges-and-conservative-cohorts.md).

<!-- docnav -->
[◀ Writing a provider](providers.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Compatibility ▶](compatibility.md)
