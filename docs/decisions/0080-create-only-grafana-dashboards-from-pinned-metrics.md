# 0080 — Create-only Grafana dashboards from pinned metrics

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

A local dashboard handoff is not a remote chart. A concrete writer also needs the actual deployment, folder and datasource, which a metric's provider name cannot supply. Translating a prose measurement into an invented query would disconnect launch charts from the source later used by impact checks. A lost create response must not authorize a duplicate or overwrite on retry.

## Decision

- Add an explicit Grafana v1 dashboard API host (Grafana 12 or later) and a strict non-secret configuration. Require canonical HTTPS deployment/subpath, namespace, new dashboard UID, existing folder/Prometheus datasource UIDs, host credential reference, explicit PromQL selection and the exact launch artifact body digest.
- Build one time-series panel from an already completed launch artifact. Bind exact metric/source pointer/revision/digest, title and query; require the metric's own grafana/source.observability.query source. Preserve unit/target in descriptive text without guessing Grafana unit codes or asserting target attainment. Use the metric's exact day window/timezone. Refuse unresolved template variables, query translation, arbitrary payload overrides and extra mutation arguments.
- Use the built-in virtual dashboard mapping through an explicitly selected host; retain default local handoff behavior. Add launch dispatch with a default preview that uses the actual resolved manifest arguments, creates no intent and resolves no credential. Live selection goes through the existing once-intent dispatcher.
- POST only to the create endpoint with an explicit name, then GET the constructed exact resource. Require matching kind/API/name/namespace, revision, folder, provenance description, panels/targets/datasource, time/timezone and no template changes. Strict readback may refuse servers that inject panel defaults; inspect those differences before relaxing normalization. Never trust returned URLs.
- Bound each JSON body to one MiB and both requests to one ten-second deadline; use in-memory Bearer authentication without redirects/cookies. Redact failures, retain possible partial creation, and add no PUT/PATCH/delete/retry/overwrite path. A verified receipt establishes stored configuration, not a valid PromQL query, datasource access, rendered values or observed traffic.
- Cache completed delivery by launch run/artifact key. A changed destination or bridge does not authorize republishing that key; prepare a separately reviewed artifact. Missing credentials after live dispatch conservatively retain intent.

## Alternatives rejected

Enabling arbitrary MCP writes would exceed the built-in read-only roster. Generating SQL/PromQL from metric prose would invent measurement semantics. The legacy combined create/update endpoint has more overwrite authority than the v1 create endpoint. A POST receipt alone does not establish the stored panel. Automatic cleanup or retries can destroy useful evidence or duplicate a partially completed creation.

## Verification

Exercise strict configuration/call/artifact refusal, exact generated query/window/ provenance, bounded POST/GET, conflict and readback failure/cancellation. Use the actual manifest and launch ledger to verify once-only completion and retained ambiguous outcomes. Run compiled preview and missing-key behavior in an isolated external store. HTTP responses are synthetic; actual Grafana permissions/version/ normalization, datasource/PromQL/rendering and Linux acceptance remain owner checks.

## Sources

- [Grafana dashboard v1 HTTP API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/dashboard/)

## Current transport scope

[ADR-0085](./0085-client-owned-mcp-first-provider-transport.md) gives client-owned MCP priority and retains this implementation or policy within that scope. Existing safety constraints remain in force; a dedicated HTTP bridge per catalogue service is not a 1.0 requirement. Missing MCP contracts remain explicit pending work.

[◀ Decisions index](./README.md)
