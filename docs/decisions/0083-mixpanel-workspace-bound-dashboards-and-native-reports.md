# 0083 — Mixpanel workspace-bound dashboards and native reports

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Mixpanel's official Headless API exposes dashboard/report creation independently of a conversational MCP host. Entity operations need an explicit workspace; project-only routing can miss view restrictions. A dashboard's layout/contents are opaque in the public models, so interpreting arbitrary nested content to identify a created report would invent a response contract.

## Decision

- Add wholeloop/mixpanel-dashboard-bridge@1 with exact official US/EU/IN origin, positive project/workspace IDs, host OAuth Bearer reference, artifact digest, native-report-json selection and reviewed-in-native-params time acknowledgement. Use the published App API contract without installing the Python SDK or copying its orchestration/retry behavior. Existing default local handoffs remain pending.
- Preserve an explicit Insights report definition from metric.source.query JSON: only type and nonempty params, with no prose/query translation. Expose expected days/timezone as owner-reviewed and verified=false; neither native parameter semantics nor traffic/rendering follows from storing a definition.
- Read the selected project's workspace inventory and require one exact matching project/workspace before writes. Create a new private/restricted dashboard, then create a new v2 bookmark owned by that returned dashboard ID. Both operations are new-resource POSTs; no existing dashboard/report is modified.
- Read the exact bookmark with v=2, requiring exact identity/project/owner/name/ type/provenance/params and inclusion. Read its dedicated dashboard-ID list and require exactly the new dashboard. Read the dashboard itself to verify identity, provenance, privacy, no public links and no dashboard filter/time overrides. The dedicated relationship read avoids guessing opaque layout/contents fields.
- Accept only bounded explicit results envelopes and complete scope responses, refusing conflicting IDs/pagination URLs. Construct every request/reference from verified numeric IDs and configured origin. Keep scalar receipts free of service prose and credentials. Source hosts fix the service's authentication scheme; a caller cannot turn a Bearer service into API-key authentication accidentally.
- Share one ten-second deadline and one-MiB per JSON body across all six requests. Keep known partial dashboard references pending/cached; retain unknown create intent. No cleanup, retry, overwrite, PATCH or delete is introduced.

## Alternatives rejected

The hosted MCP roster alone does not supply a deterministic argument schema. Installing a Python SDK would add an unnecessary runtime dependency. Inline report rows are supported, but extracting their assigned report ID from opaque dashboard contents weakens verification. A separate dashboard-owned create yields an explicit ID and a documented relationship read. Project-only or automatically selected workspaces would hide scope assumptions; rebuilding native report parameters from prose would invent measurement semantics.

## Verification

Exercise three official origins, workspace/project identity and incomplete inventory refusal before writes, explicit native definitions, bounded envelope decoding and Bearer-only routing. Verify exact owned report and dedicated attachment/privacy readback, changed/missing state, redaction and known/unknown cancellation outcomes. Use actual built-in manifest/launch dispatch, compiled no-key preview and cached complete/partial receipts. All HTTP responses are synthetic. Actual API/version, OAuth/roles/workspaces, native query/time scope, rendering/traffic and Linux remain owner verification.

## Sources

- [Mixpanel Headless entity API](https://mixpanel.github.io/mixpanel-headless/guide/entity-management/)
- [Official App API contracts at the inspected revision](https://github.com/mixpanel/mixpanel-headless/blob/fbed0c596f6856a705e54ef528c03e943527410d/src/mixpanel_headless/_internal/api_client.py)
- [Official request/response models at that revision](https://github.com/mixpanel/mixpanel-headless/blob/fbed0c596f6856a705e54ef528c03e943527410d/src/mixpanel_headless/types.py)

## Current transport scope

[ADR-0085](./0085-client-owned-mcp-first-provider-transport.md) gives client-owned MCP priority and retains this implementation or policy within that scope. Existing safety constraints remain in force; a dedicated HTTP bridge per catalogue service is not a 1.0 requirement. Missing MCP contracts remain explicit pending work.

[◀ Decisions index](./README.md)
