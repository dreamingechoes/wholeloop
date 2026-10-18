# 0030 — Worktree intents, leases and conservative pruning

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Git mutations and the external journal cannot share one filesystem transaction.
A crash between worktree creation and its receipt must remain recoverable, while
cleanup must preserve unrelated checkouts and unmerged or dirty work. Parallel
environments also need disjoint port reservations and a usable test handoff.

## Decision

1. Journal an allocation intent before provisioning, then ready or failed status.
   Pin canonical repository/common-directory identity, deterministic topic branch,
   named base/ref SHA, integration target, original checkout identity and ports.
   Retry adopts only the matching owned branch/worktree descending from that base.
2. Coordinate lifecycle operations under a separate external lock, always before
   acquiring the journal lock. Never call the manager inside a journal transaction.
   Preserve stale locks for explicit owner inspection, as in ADR-0020.
3. Default to external linked worktrees on `wl/<slice-or-part>`. Require an explicit
   named local/remote base or a recorded stacked predecessor. A stack inherits its
   predecessor's integration target so cleanup never mistakes the topic below it
   for the default integration branch.
4. Reserve ten-port blocks from 5200 through 6199 within the selected store.
   Stopped/failed allocations retain their range; successful prune releases it.
   Reservations prevent wholeloop collisions, not conflicts with unrelated processes.
5. Disable checkout hooks only for lifecycle Git mutations, using a process-scoped
   empty hooks directory. This prevents provisioning hooks touching the person's
   checkout; later builder commits still use normal repository hooks.
6. Stop records the lease state and preserves files/branches. This manager does
   not run or kill workers/dev servers. Open prints actual HEAD, environment and
   detected commands without executing them or recording the human test decision.
7. Prune only recorded, stopped, clean allocations whose branch is merged into
   the integration target or explicitly abandoned with a reason. Honor Git locks,
   ownership and changed-branch checks, use no force, and retain every topic branch.
   A blocked record does not prevent cleanup of other eligible records.
8. The explicit checkout opt-out requires a clean, exclusive workspace. It creates
   the topic branch in that checkout; eligible cleanup restores its original branch
   or detached commit and never removes the person's directory. Dry-run records no
   lifecycle change. Projections/status/resume expose recorded workspace references.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Record only after Git succeeds | An interruption would leave an untracked orphan checkout |
| Hold the journal lock around every Git operation | Git side effects still cannot be rolled back atomically with the journal |
| Broad git worktree prune or force removal | It could sweep unrelated metadata or discard uncommitted evidence |
| Reuse ports when stopping | Preserved environments or manually running servers may still use them |
| Run checkout hooks during provisioning | Arbitrary hook side effects could violate checkout isolation |
| Infer a base from a raw commit or current feature branch | The integration/cleanup target would be ambiguous |

## Consequences

Failed intents and branches remain visible for recovery. Physical interruption
may need stale-lock inspection; observed recovery paths are tested by removing a
ready receipt after real provisioning. Process control, actual port binding and
live project setup remain later builder/owner work. Git 2.49.0 was exercised on
macOS; the other supported platform has not been executed in this session.

## Links

- [Worktree decision](./0013-git-worktrees-for-parallel-builds.md)
- [Store recovery](./0020-journal-atomicity-and-lock-recovery.md)
- [Build environments](../flow/build/build-slice.md)
- [Git worktree reference](https://git-scm.com/docs/git-worktree)
- [Git reference resolution](https://git-scm.com/docs/git-rev-parse)

[◀ Decisions index](./README.md)
