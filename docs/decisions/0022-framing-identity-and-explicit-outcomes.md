# 0022 — Framing identity and explicit outcomes

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Rerunning an idea should refine known work without creating duplicates. The store spans repositories, so titles alone are unsafe identities: two projects can both have an initiative called "Add search". A no-go also needs to survive that rerun rather than silently becoming a fresh project.

## Decision

1. Explicit initiative IDs and recorded completed-brief relations establish identity. Record the source artifact path so a later research run cannot rewrite which evidence a framing adopted.
2. Automatic title reuse normalizes case and whitespace within the same canonical repository path. Several matches or a legacy item without a repository identity require a person to choose the ID. Cross-repository work uses explicit IDs; checkout relocation or worktree aliasing is not inferred.
3. Framing requires eight questions and ownership. Unresolved placeholders use `TBD: <missing evidence>; who: <person or role>`. Structural validation cannot prove a claim true; evidence review remains part of the skill workflow.
4. Record go, dropped or on-hold in the journal. A no-go closes the initiative with its reason, and on-hold also needs a reopening condition. Reopening is an explicit state change and retains the earlier decision.
5. Local docs/tracker destinations refer to the stored artifact and initiative, avoiding duplicate local copies. Remote destinations produce a pending handoff and durable note until a host executes and links the operation.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Match titles globally | Independent projects would silently share ownership and state |
| Infer semantic identity with a model | The deterministic core could not reproduce or explain the match |
| Treat unknown legacy scope as the current repository | A missing identity would become an unsupported assumption |
| Start a new initiative after no-go | The reason for rejecting or pausing the idea would disappear from view |
| Report external publication from configuration alone | A provider declaration does not prove a remote write succeeded |

## Links

- [Framing](../flow/define/frame-problem.md)
- [External state](./0004-state-outside-the-repo.md)
- [Research evidence](./0021-journaled-research-plans-and-refutations.md)

[◀ Decisions index](./README.md)
