# 0029 — Vertical slice contracts and repository parts

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Builders need concrete acceptance criteria before code. Cross-repository slices need an agreed interface without creating more parts than participating repositories. Revisions must retain tracker identity and must not silently weaken approved requirements or bypass dependencies through an explicit child ID.

## Decision

1. Author wholeloop/slice-plan@1 metadata with explicit repository roots and slices. Each slice declares one user-visible outcome, a demonstration entry, steps and expected result, testable criteria, and linked test cases covering every criterion. Narrative sections remain readable and team guidance applies.
2. Pin the scope-definition event and completed spec artifact where available. Every inherited criterion remains owned by a slice and unchanged. A changed requirement belongs in a new approved spec, not a weaker downstream copy.
3. Slices default to a chain in plan order. Explicit blockedBy keys/IDs override that default; an empty array declares independence. Resolve IDs and validate cycles across both new and stored definitions inside the journal transaction.
4. For N greater than one repositories, create exactly N parts. The contract repository's part includes its implementation and is first; every other part depends on it. A single-repository slice needs no extra part. Repository keys map to distinct canonical absolute paths; actual Git eligibility is checked by the later worktree manager, not inferred from a declaration.
5. Stable slice keys and repository-part keys reuse IDs. Existing parts cannot change repository identity, and closed work needs explicit reopening. Omission does not delete work. Child creation, local tracker refs and completion are one transaction; remote publication remains a pending host handoff.
6. Standalone entry creates a minimal initiative/scope hierarchy without fake earlier completions. Next routes ready slices and contract-first parts, asks between independent choices and honors dependencies. Parent approvals also remain visible in bounded resume context.

## Alternatives considered

| Option | Why not |
| --- | --- |
| One extra contract-only part | It would violate the one-part-per-repository budget |
| Split a slice by API/UI layers | Neither layer gives the person an end-to-end demonstration |
| Rewrite inherited criteria during slicing | A builder would implement requirements the person never approved |
| Guess dependencies from plan prose | Routing would depend on interpretation rather than recorded identities |
| Delete omitted work on refinement | A partial revision could remove unrelated tracked work |

## Consequences

The contract-owning repository's implementation finishes before parallel peer parts. Structural checks verify declared outcomes and demonstrations, not their semantic quality; the slicing challenger inspects that boundary. Worktrees, building, real remote mirroring and live host critique remain subsequent tasks or owner verification.

## Links

- [slice-work](../flow/build/slice-work.md)
- [Parent approvals](./0024-atomic-scope-plans-and-parent-approval.md)
- [Git worktrees](./0013-git-worktrees-for-parallel-builds.md)

[◀ Decisions index](./README.md)
