# 0081 — PostHog dashboard creation and partial receipts

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

PostHog creates dashboards and insights separately. Creating an insight can attach it to a new dashboard, but a failure between requests may leave useful partial state. The project's timezone governs query dates; an insight's cached timezone field is not reliable evidence of the current project setting.

## Decision

- Add wholeloop/posthog-dashboard-bridge@1 with exact deployment, organization, numeric project, host credential reference, explicit HogQL selection and completed launch artifact digest. Reuse shared exact artifact/base binding and bounded credential-store transport; preserve Grafana contracts and local handoffs.
- Preserve the metric's PostHog product-analytics source query as text. Require an explicit filters placeholder, construct a DataVisualizationNode/ActionsTable with HogQLQuery source and the pinned day window/date range. Read the exact organization's project first and require matching identity/organization/timezone before mutation. This verifies configuration, not SQL syntax, placeholder semantics or traffic.
- POST a new dashboard, then POST an insight with dashboards=[new ID]. This documented write field remains supported but is deprecated in current upstream source; use the non-deprecated dashboard_tiles field for readback and require actual version acceptance before use. Do not guess a replacement mutation route.
- GET the exact insight and dashboard from constructed URLs. Require exact stored query/name/provenance, one matching active insight attachment, project identity, unshared/non-deleted dashboard and no effective/persisted filter or variable overrides. Dashboard tile serialization omits deleted, while insight attachment serialization includes it; bind both views rather than requiring an absent field.
- Share one ten-second deadline and one-MiB per JSON body across the five requests. Never return raw project fields (which may include tokens), service prose or query results. Add no update/delete/overwrite/retry or automatic rollback path.
- If a dashboard ID is known and a later phase fails, return a pending incomplete receipt with its safe constructed reference and structural phase. The launch ledger retains/caches that pending reference and never blindly republishes it. Unknown create outcomes retain the original ambiguous intent. Actual partial state requires manual inspection, not a fabricated success or cleanup.

## Alternatives rejected

A single dashboard POST does not establish an attached measurement insight. Query translation would invent semantics, and trusting a cached insight timezone could hide a mismatch. Deleting a partially created dashboard or retrying an insight could destroy evidence or duplicate a write. Treating a known partial result as fully observed would claim a chart that was never verified.

## Verification

Exercise exact plans/source/window/scope, project preconditions before mutation, new resource creation and both attachment views. Cover missing/deleted/duplicate/ changed content, effective/persisted overrides, null empty overrides, lost responses, redaction and inspectable pending receipts. Use the actual manifest/launch ledger and compiled no-key preview; completed and pending receipts both suppress further writes. All HTTP responses remain synthetic; actual API versions, permissions, deprecated-field support, query/rendering/traffic and Linux remain manual checks.

## Sources

- [PostHog dashboards API](https://posthog.com/docs/api/dashboards)
- [PostHog insights API](https://posthog.com/docs/api/insights)
- [PostHog project settings API](https://posthog.com/docs/api/projects)
- [PostHog insight serializer](https://github.com/PostHog/posthog/blob/master/products/product_analytics/backend/presentation/insight.py)
- [PostHog query contract](https://github.com/PostHog/posthog/blob/master/frontend/src/queries/schema/schema-general.ts)

## Current transport scope

[ADR-0085](./0085-client-owned-mcp-first-provider-transport.md) gives client-owned MCP priority and retains this implementation or policy within that scope. Existing safety constraints remain in force; a dedicated HTTP bridge per catalogue service is not a 1.0 requirement. Missing MCP contracts remain explicit pending work.

[◀ Decisions index](./README.md)
