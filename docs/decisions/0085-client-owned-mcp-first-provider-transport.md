# 0085 — Client-owned MCP-first provider transport

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The original provider architecture delegates tool invocation and authentication
to the native client through ProviderHost. Subsequent rollout work added four
HTTP flag readers and four HTTP dashboard writers. Those narrow bridges are useful
options, but requiring another HTTP implementation for every catalogue service
duplicates client integrations and makes provider adoption a core maintenance task.
The owner explicitly accepted restoring MCP priority while retaining existing
HTTP bridges as optional experimental transports.

## Decision

- Prefer a known MCP operation exposed by the selected client's actual tool
  inventory. The client owns connection, authentication, argument translation and
  response normalization. The core validates operation identity, transport choice
  and normalized results; it does not implement another MCP network client.
- Keep declarative provider mappings. A client may supply an explicit reviewed
  operation binding to an observed tool/schema, including a virtual rollout
  operation. Never infer a write mapping from a similar tool name or treat a
  configured server declaration as authenticated live discovery.
- If the tool or its contract is unavailable, retain the declared open question
  or local pending handoff. Native drafts and unapplied proposals stay local.
  Let an eligible delegated MCP operation run before a native dashboard handoff;
  otherwise the current handoff would hide available client capabilities.
- Select HTTP only explicitly. Retain the current opt-in bridge commands and
  tested SDK hosts. Neither missing MCP access nor an MCP exception authorizes
  HTTP credential resolution, retries, a different destination or a transport
  switch. Preserve ambiguous write intent and partial receipts.
- Freeze further built-in HTTP expansion. A new exception needs a concrete MCP
  capability gap, a bounded required operation and an explicit design decision.
  Do not remove existing bridges or their tests until a separately reviewed
  migration or retirement establishes what replaces them.
- P4-05 requires its manifests, safe operation bindings, tested transport policy
  and explicit degradation, not an HTTP client for each service. Amplitude's
  absent direct dashboard bridge is an optional future exception rather than a
  1.0 blocker. This does not claim that its MCP dashboard write is implemented
  or tested: it remains a pending handoff until a real contract is supplied.

## Relationship to existing decisions

ADR-0008's declarative extensions and ADR-0026's injected host remain in force.
ADR-0042's local handoffs and ADR-0084's experimental/service-unverified labels
remain in force. ADR-0076 through ADR-0083 describe retained optional HTTP
implementations; their safety constraints remain unchanged. This decision replaces
their use as a roadmap obligation to build more HTTP hosts. It does not erase
their technical history or relabel unexecuted service acceptance as passed.

## Alternatives rejected

A complete SDK per vendor expands maintenance without advancing orchestration.
Deleting all bridges immediately discards useful tested options and breaks
explicit callers. An automatic REST fallback can repeat an ambiguous write and
silently change credentials/permissions. Renaming a handoff as MCP success would
conceal missing implementation instead of preserving an honest pending result.

## Verification

Enforce default MCP priority, actual tool/schema membership, explicit HTTP
selection, safe native degradation and no exception-triggered fallback in core
tests. Exercise dispatch and source/ramp consumers with synthetic client hosts;
retain all existing HTTP tests. Record the enforcers in enforcement.yml. Native
authentication/tool semantics and real-service certification remain separate
observations, not conclusions drawn from metadata or fixtures.

[◀ Decisions index](./README.md)
