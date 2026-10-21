# 0082 — Metabase-owned questions and explicit SQL window review

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Metabase can create a question inside a new dashboard without updating another
resource. It converts legacy native queries into MBQL 5; ordinary response equality
would mistake that documented conversion for a changed query. Native SQL already
contains its time predicates and timezone semantics, which cannot be inferred or
safely rewritten from a generic measurement window.

## Decision

- Add wholeloop/metabase-dashboard-bridge@1 with exact canonical deployment,
  positive database/collection IDs, credential reference, native-sql selection,
  reviewed-in-native-sql window acknowledgement and the completed artifact digest.
  Reuse explicit launch dispatch, shared artifact binding and bounded transport.
- Preserve the metric's exact Metabase/source.bi.query text. Support only a simple
  SELECT prefix with no statement separators, comments or unresolved templates.
  This conservative syntax restriction is not a SQL safety proof. Use a reviewed
  query and a database role restricted to reads; Metabase may validate/run query
  metadata while saving. The bridge sends no query execution endpoint itself.
- Create a new dashboard in the selected collection, then create a table question
  with its dashboard_id and size. Do not update an existing dashboard or replace
  its dashcards. Preserve unit/target/source/window provenance descriptively, without
  translating query text or guessing engine-specific time expressions.
- Acknowledge expected days/timezone as owner-reviewed native SQL and expose
  window.verified=false. Validate the timezone identifier, but do not claim the
  stored SQL enforces that window or that data/traffic/rendering has been observed.
- Read the exact card with the documented legacy-mbql=true option, compare the
  explicit classic native database/query/template configuration, and verify one
  matching dashboard-owned card/attachment with no parameter/series/visualization
  overrides. Require the dashboard collection/provenance and no public/embedded
  sharing. Unknown normalization stays pending, not an invented successful match.
- Use host-resolved X-API-Key authentication and only the fixed legacy read query
  option. Preserve Bearer behavior for other hosts. Share existing deadline/body
  bounds and redact failures. A known partial dashboard gets an incomplete cached
  inspection reference; an unknown create outcome retains intent. Never add
  update/delete/overwrite/retry or automatic cleanup authority.

## Alternatives rejected

A full dashcards PUT would carry replacement authority over an existing dashboard.
Treating opaque MBQL 5 as the old native format would miscompare legitimate
responses. Injecting engine-specific SQL/date parameters would change the pinned
measurement and invent dialect semantics. A source syntax prefix or a stored
question cannot prove read-only database permissions, query validity or time scope.

## Verification

Test exact config/artifact/SQL/window preview, API-key transport, create-only
question ownership and classic-query readback. Refuse malformed IDs, missing window
review, mutations/templates, changed query/database/ownership, sharing and extra
parameters/series/visualization state. Exercise actual built-in manifest/launch
ledger, compiled no-key preview and cached complete/partial receipts. All HTTP
responses are synthetic; actual Metabase versions, datasource permissions, SQL/time
scope, normalization/rendering and Linux remain owner verification.

## Sources

- [Metabase OpenAPI contract](https://www.metabase.com/docs/latest/api.json)
- [Metabase API keys](https://www.metabase.com/docs/latest/people-and-groups/api-keys)
- [Metabase API setup examples](https://www.metabase.com/articles/set-up-metabase-from-code-with-the-api)
- [Metabase v0.64.1 card API contract](https://github.com/metabase/metabase/blob/v0.64.1/src/metabase/queries_rest/api/card.clj)

## Current transport scope

[ADR-0085](./0085-client-owned-mcp-first-provider-transport.md) gives client-owned
MCP priority and retains this implementation or policy within that scope. Existing
safety constraints remain in force; a dedicated HTTP bridge per catalogue service
is not a 1.0 requirement. Missing MCP contracts remain explicit pending work.

[◀ Decisions index](./README.md)
