# 0092 — Plan expanded V1 autonomous delivery without changing runtime authority

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

The owner requested a detailed roadmap expansion inside 1.0 for recoverable unattended implementation, actual behavioral QA, adversarial review, integrated validation, PR delivery and an opt-in conditional merge. The owner also explicitly requested complete research and implementation flows with zero human intervention after an initial authorization. The owner subsequently reviewed and accepted all tasks, authorized sequential implementation without further signals and delegated pragmatic implementation decisions. Manual checks are deferred, not passed.

Existing contracts intentionally retain human decision points, human testing before draft publication and no automatic merge. The core already has journaled work, dependency scheduling, gates, native adapters and an environment-effects ledger; those foundations do not establish a persistent contained delivery service.

## Decision

1. Accept the planning scope: add Phase 6 and linked detailed specifications as part of expanded 1.0, before P5-07 release closure. Keep original task IDs, completion evidence and fourteen open original tasks intact.
2. Record the owner's completed review and acceptance of all 34 tasks inside 1.0. Sequential implementation and pragmatic refinements are authorized. Native/account choices, actual hosted mutations and release readiness remain separate. Design acceptance passes no implementation criterion.
3. Specify endpoint and intervention independently. Research, local handoff, PR and conditional merge have distinct authority. A separately selected none-intervention policy can delegate all supported decisions for a complete route through one initial exact-plan or request-envelope authorization.
4. Require truthful machine decision/acceptance provenance. Do not forge the owner's identity, rewrite old human receipts, weaken quality gates or infer permissions from an interaction profile.
5. Specify conditional merge as an opt-in trusted controller operation with actual server preconditions and protections. Ordinary declarative providers remain non-executable and cannot enable dangerous effects.
6. Preserve today's behavior until implementation. Do not supersede earlier runtime decisions merely because this plan exists. Each implementation that changes a human-decision, publication, guard or provider boundary must add the appropriate technical ADR and explicitly reconcile affected contracts, enforcers and documentation.
7. Keep cloud services, marketplaces, new vendor HTTP APIs, automatic deployment/production changes/messages and atomic cross-repository merge outside this expansion. Reuse client-owned native/MCP capabilities and a local controller/backend.
8. Keep source state external, previous native failures visible and experimental service certification distinct. Planned tests are unchecked; implemented local code does not imply account/native/hosted acceptance.

## Consequences

The roadmap now contains substantive future implementation rather than only original acceptance work. Existing compatibility and release candidates must be extended through explicit versioned contracts before expanded 1.0 can ship. Local implementation can proceed after owner authorization without waiting for unrelated account checks; actual new native/backend/merge acceptance remains required at its stated scope.

A none-intervention run may terminate blocked or exhausted when prerequisites cannot be met; it must not introduce a hidden human wait or fabricate a successful result. Some clients/backends will remain ineligible for particular expanded capabilities until effective boundaries are observed.

## Alternatives considered

| Option | Why rejected for this planning scope |
| --- | --- |
| Interpret autopilot as permission to skip people/gates | A communication preset cannot convey operator authority |
| Remove all human stops globally | Changes supervised operation and conceals which decisions were actually delegated |
| Keep a mandatory human confirmation after every generated plan | Prevents the explicitly requested single-authorization unattended route |
| Merge whenever local tests are green | Ignores authorization, integrated behavior, remote checks, protections and revision races |
| Give workers controller credentials and ask them to obey | Does not provide an enforceable authority boundary |
| Mark a draft roadmap as implemented or waive old failures | Replaces required evidence with documentation |
| Build a cloud platform or more service APIs first | Expands operational/dependency scope without being necessary for the requested local route |

## Links

- [Expanded V1 specification](../../roadmap/specifications/autonomous-delivery/README.md).
- [Phase 6](../../roadmap/phase-6-autonomous-delivery.md).
- [Current orchestration decision](./0006-orchestration-tiers.md), [manifest boundary](./0008-extensibility-through-manifests.md), [profile invariants](./0010-interaction-profile-never-changes-coverage.md).

[◀ Decisions index](./README.md)
