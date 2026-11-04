# 0084 — Experimental integrations and scoped live verification

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The service catalogue names common tools, not accounts the maintainer holds. Requiring authenticated acceptance for every listed vendor prevents a release even when the local contracts and fixtures pass. The maintainer explicitly chose to ship remote integrations experimentally and validate them as accounts and actual needs arise. Native clients such as Claude Code and Codex are a different compatibility surface.

## Decision

- Label remote service integrations **experimental · fixture-tested · service-unverified**. This includes tracker, documentation, source, code-host and rollout integrations. Local stores/defaults and native client adapters do not acquire that label merely because they are used alongside a provider.
- Passing declared-operation fixtures, manifest validation and local safety tests is the integration acceptance bar for 1.0. Authenticated vendor certification is deferred and does not block that release. Missing implementation, failing tests and misleading capability claims remain implementation work.
- Replace P2-06's requirement for authenticated recorded responses with explicit synthetic fixture provenance and the experimental label. Preserve real-service checks unchecked in the manual verification backlog; do not relabel them passed.
- Keep native-client discovery/permissions/hooks, engine conformance, release CI, npm ownership, visibility and publication acceptance unchanged. In particular, the missing Amplitude dashboard bridge is not implemented by this policy.
- Promote only the operations actually observed against a real service after the maintainer supplies evidence. Record date, service/version where observable, exact operations, scope/permissions and limitations. Do not infer vendor-wide support, all failure modes or another operation's correctness from one successful call.

## Alternatives rejected

Marking unexecuted tests complete would erase the difference between synthetic contracts and real server behavior. Requiring accounts for every vendor would turn optional integration adoption into a universal release prerequisite. Removing all integration scaffolding would discard useful contract-tested extension work.

## Verification

The existing provider fixture runner reports remoteProbed=false; destination transcripts explicitly identify synthetic provenance. Provider, destination, source and rollout tests exercise validation and normalized host boundaries. These enforcers establish offline evidence only. Documentation records the release policy and the unchecked live backlog without changing runtime schemas, credentials or service access. Existing safe previews, explicit live selection and write authority remain unchanged.

## Current transport scope

[ADR-0085](./0085-client-owned-mcp-first-provider-transport.md) gives client-owned MCP priority and retains this implementation or policy within that scope. Existing safety constraints remain in force; a dedicated HTTP bridge per catalogue service is not a 1.0 requirement. Missing MCP contracts remain explicit pending work.

[◀ Decisions index](./README.md)
