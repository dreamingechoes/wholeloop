# 0027 — Read-only source evidence and degradation

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

**Amended 2026-11-07 (P7-16).** The PostgreSQL process host described in item 3 was removed: nothing outside its tests used it, and wholeloop no longer runs service clients itself ([ADR-0085](./0085-client-owned-mcp-first-provider-transport.md)). The PostgreSQL provider remains a declarative psql mapping that the person's client runs under the provider guidance; a restricted read-only role is the protection that matters.

Research and later measurement need reusable queries against actual sources. Authentication, pending jobs and truncated output cannot become fabricated observations. Generic HTTP availability also does not establish a connected Zendesk service, and PostgreSQL needs more than a prompt saying read-only.

## Decision

1. Ship eleven source mappings with bounded, tool-specific guidance: PostHog, Mixpanel, Amplitude, Metabase, BigQuery, PostgreSQL, Sentry, Zendesk, Intercom, and Confluence/Notion knowledge. Every source query degrades to open-question.
2. Pin provider, operation, exact query, owner and explicit timestamp/timezone window in evidence receipts. Only complete successful observed content becomes evidence. Tool errors, pending jobs and partial results remain questions with an answerer; raw tool error contents are omitted.
3. Map BigQuery to its explicit read-only tool. Execute PostgreSQL through a conservative single-query scanner and psql stdin inside BEGIN READ ONLY, a local statement timeout and ROLLBACK. Require a non-secret libpq service name, never a credential URI. Restricted database roles remain necessary.
4. Allow only one known credential-free installation URL query parameter: mode=tools or mode=cli. PostHog uses tools mode for its named execute-sql tool. All other query parameters, duplicate modes, user info and fragments remain invalid. A generic curl executable does not detect service availability.
5. Clone built-in manifests per registry load. A caller refining one loaded manifest must not mutate later registries or the bundled canonical catalog.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Treat absent/partial data as zero | Missing observations would become invented baselines |
| Accept arbitrary installation URL query values | Credential values could leak into generated configurations |
| Infer Zendesk access from curl on PATH | Generic HTTP tooling says nothing about tenant/authentication |
| Trust a SELECT prefix for PostgreSQL safety | Transaction escapes, psql commands and modifying CTEs can hide writes |
| Use the unrestricted BigQuery SQL tool | The official read-only operation already expresses the needed boundary |

## Consequences

PostgreSQL scanning is deliberately conservative and rejects dollar quotes and backslash escapes. Server read-only semantics and least-privilege roles still matter for functions, temporary objects and external effects. Process tests use a real fake-psql executable; no database or live source was queried. Synthetic transcripts establish the host contract, while permissions, regions, costs, pagination and exact live window behavior remain manual verification.

## Links

- [Providers](../configuration/providers.md)
- [Research](../flow/define/research.md)
- [Host invocation](./0026-destination-host-contract-and-document-updates.md)

[◀ Decisions index](./README.md)
