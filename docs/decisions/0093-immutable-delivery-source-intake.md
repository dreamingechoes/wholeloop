# 0093 — Pin delivery inputs without granting execution authority

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

An unattended run needs to know which request it is implementing after the source changes or the client restarts. An issue URL alone does not identify its content, tenant or revision. Intake also consumes untrusted prose: a request to merge is not permission to merge. The accepted expanded scope requires this boundary before plans and workers exist.

## Decision

1. Add closed version-one request, observation and snapshot contracts. Accept explicit inline text, one regular UTF-8 file, an existing item, or an explicitly scoped tracker/document observation. Preserve exact text bytes, including line endings and BOM; use SHA-256 as local/item content revision. Bind reference, provider, repository/tenant scope, observed revision, content, attachment digests, extraction mapping and provenance into the snapshot identity. Fetch time records the first accepted observation and does not change repeat identity.
2. Store immutable content-addressed snapshots through StoreFiles outside repositories, with bounded reads, private permissions and the existing writer lock. Repeated identical intake returns the verified old snapshot; damaged content is refused rather than repaired silently. Snapshots are inputs, not another item hierarchy or a replacement journal. Delivery lifecycle events belong to P6-04.
3. Use explicit inclusive one-based line ranges for criterion/context extraction. Reject duplicate IDs, overlapping, blank, reversed and out-of-range selections. An empty map preserves context without inventing criteria. Dedicated external-format importers remain deferred.
4. Require complete remote reads with nonempty content/revision and exact canonical reference/provider/scope. The CLI imports explicitly labelled observations; it does not authenticate them. The programmatic host path invokes only existing tracker.read-item/docs.read operations through ProviderHost. A client normalizer must report scope observed in its response, not guess it from the requested URL. No new HTTP client, account discovery or fallback is added.
5. Refuse recognizable credentials before persistence and omit raw contents/errors from diagnostics. This bounded detector cannot prove arbitrary prose secret-free. Reject oversized input, invalid UTF-8, nonregular files, final symlinks and escaped real destinations. Resolve platform aliases before checking boundaries and recheck descriptor identity after reading. This is a cooperative input boundary, not containment against an unrestricted same-user adversary.
6. Start no worker and create no decision, grant or remote write. Return a structured missing-input receipt when a source is unavailable/unsafe instead of guessing requirements or asking a question. A later runner applies the selected intervention policy. Preserve all existing public declarations and append only new contract fingerprints.

## Consequences

Intake is usable without a model or remote account and can be replayed in another process. The private store contains request text, so callers must supply redacted source material. Host provenance states which path performed a read; it does not certify the service, server truth or a security boundary. A changed mapping or provenance changes snapshot identity even when content bytes match. Plans, delegated authority, scheduling and automatic execution remain separate future increments.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Keep only a mutable issue URL or file path | Cannot reproduce the request or invalidate stale work |
| Trim/reflow source text | Changes verbatim criteria and byte-bound evidence |
| Let the model infer an extraction map or authorization | Conflates interpretation with explicit requirements and authority |
| Treat an imported JSON receipt as an authenticated read | Allows caller assertions to acquire stronger provenance |
| Add vendor-specific fetching | Duplicates the existing client-owned MCP/native host boundary |
| Add delivery events to the old item journal immediately | Couples input storage to lifecycle transitions that have not been implemented |

## Links

- [Intake tutorial](../tutorials/delivery-intake.md).
- [Phase 6](../../roadmap/phase-6-autonomous-delivery.md#p6-01--revision-bound-request-intake).
- [Contract and authorization](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md).

[◀ Decisions index](./README.md)
