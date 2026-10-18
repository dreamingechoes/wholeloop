# 0024 — Atomic scope plans and parent approval

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

A person must inspect concrete scopes before approving a cut. Revising that cut
must preserve identity and metric coverage without leaving half-created tracker
records or allowing a child ID to bypass the parent's approval.

## Decision

1. Author a versioned scope plan in YAML front matter, pinning the completed spec
   artifact. Every spec metric and story has at least one scope owner. Standalone
   entry declares a minimal metric catalog or an accountable measurement exception.
2. A stable plan key maps to one child scope within an initiative. Revisions reuse
   its typed ID and local tracker reference. Omitting a scope does not delete it;
   closed scopes require explicit reopening before refinement.
3. Validate definitions, source identity and dependency cycles in the same journal
   transaction as child creation and completion. Dependencies can name plan keys
   or existing scopes belonging to the same initiative. Remote trackers remain
   pending host handoffs until the actual operation succeeds and its link is stored.
4. Store concrete child drafts before the human decision. Downstream begin and
   complete operations inspect ancestor approvals, so selecting a child ID cannot
   evade a pending or rejected parent decision. Upstream corrections remain possible.
5. An initiative continues through its sole open scope or asks for a choice. A
   fresh scope starts at slice-work without pretending its own framing/spec ran.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Allocate new IDs on every cut | Revisions would duplicate tracker items and break references |
| Create children only after approval | The person would approve an abstract result without concrete records |
| Check only the selected item's decisions | Explicit child continuation could bypass parent review |
| Treat omitted scopes as deletions | A partial refinement could silently remove unrelated work |
| Parse metric ownership from prose | Formatting changes would silently alter the measurement contract |

## Consequences

Tracker records can exist as unapproved drafts. Remote mirroring still depends on
host execution and live conformance; local tests establish structural validation,
identity, atomic rollback and decision propagation, not semantic independence.

## Links

- [cut-scopes](../flow/define/cut-scopes.md)
- [Structured specs](./0023-structured-spec-plans-and-revision-approval.md)
- [External state](./0004-state-outside-the-repo.md)

[◀ Decisions index](./README.md)
