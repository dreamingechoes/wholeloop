# 0085 — Client-owned MCP-first provider transport

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The original provider architecture delegates tool invocation and authentication to the native client through ProviderHost. Subsequent rollout work added four HTTP flag readers and four HTTP dashboard writers. Those narrow bridges are useful options, but requiring another HTTP implementation for every catalogue service duplicates client integrations and makes provider adoption a core maintenance task. The maintainer explicitly accepted restoring MCP priority while retaining existing HTTP bridges as optional experimental transports.

**Amended 2026-11-07 (P7-16).** The maintainer always intended services to be reached through the MCP servers of the person's client or through command-line clients the person installed, not through code in this repository. The package was never published, so no user depended on the bridges. The built-in HTTP flag readers (LaunchDarkly, PostHog, GrowthBook, Unleash), HTTP dashboard writers (Grafana, PostHog, Metabase, Mixpanel), their shared HTTP code, the PostgreSQL process host and the `http` transport are removed; ADR-0076 to ADR-0083 are superseded. The decision below states the final rule.

## Decision

- Prefer a known MCP operation exposed by the selected client's actual tool inventory. The client owns connection, authentication, argument translation and response normalization. The core validates operation identity, transport choice and normalized results; it does not implement another MCP network client.
- Keep declarative provider mappings. A client may supply an explicit reviewed operation binding to an observed tool/schema, including a virtual rollout operation. Never infer a write mapping from a similar tool name or treat a configured server declaration as authenticated live discovery.
- If the tool or its contract is unavailable, retain the declared open question or local pending handoff. Native drafts and unapplied proposals stay local. Let an eligible delegated MCP operation run before a native dashboard handoff; otherwise the current handoff would hide available client capabilities.
- **wholeloop never talks to a third-party service itself.** It reaches services only through the client's MCP connection or a command-line client the person installed: code hosts through `gh` and `glab`, sources such as PostgreSQL or Zendesk through `psql` or `curl` run by the client. Only two transports exist, `mcp` and `native`; native means local state, drafts, unapplied proposals, local configuration reads and handoffs. Neither missing MCP access nor an MCP exception switches transport, retries or resolves a credential. Preserve ambiguous write intent and partial receipts.
- `wl provider read-flags <id>` and `wl launch dispatch` only plan. With a reviewed binding in the client's MCP inventory they print the exact call for the client to make; without one, a flag state stays an open question and a dashboard stays the local pending handoff. A virtual `wholeloop.*` tool with no local implementation is never routed natively, so a provider that declares no MCP server — LaunchDarkly, Unleash and GrowthBook today — reads as unknown until a reviewed manifest declares one.
- The only network code in `src/` is local: the behavioural probe of the person's application in Docker, the local Docker Engine socket (ADR-0244) and loopback sandbox probes. A test fails on any other network primitive.
- P4-05 requires its manifests, safe operation bindings, tested transport policy and explicit degradation, not a client for each service. Amplitude's dashboard operation remains a pending handoff until a real MCP contract is supplied.

## Relationship to existing decisions

ADR-0008's declarative extensions and ADR-0026's injected host remain in force. ADR-0042's local handoffs and ADR-0084's experimental/service-unverified labels remain in force. ADR-0076 through ADR-0083 described the retired HTTP implementations and are superseded by this decision. Their reasoning about exact identities, conservative cohorts and once-only writes still guides how a client MCP binding is reviewed. Removing them does not relabel unexecuted service acceptance as passed.

## Alternatives rejected

A complete SDK per vendor expands maintenance without advancing orchestration. Keeping the HTTP bridges as experimental options (this decision's original form) left wholeloop holding credentials and service code that duplicated what the person's client already does; with no published users, retirement cost nothing to callers. An automatic REST fallback can repeat an ambiguous write and silently change credentials/permissions. Renaming a handoff as MCP success would conceal missing implementation instead of preserving an honest pending result.

## Verification

Enforce MCP priority, actual tool/schema membership, the two-transport set, safe native degradation and no exception-triggered fallback in core tests. Exercise read-flags, launch dispatch and source/ramp consumers with synthetic client inventories and hosts. `test/unit/providers/network-boundary.test.ts` scans `src/` for network primitives and fails on a planted connection or a stale exception. Record the enforcers in enforcement.yml under `provider-mcp-first` and `core-no-service-network`. Native authentication/tool semantics and real-service certification remain separate observations, not conclusions drawn from metadata or fixtures.

[◀ Decisions index](./README.md)
