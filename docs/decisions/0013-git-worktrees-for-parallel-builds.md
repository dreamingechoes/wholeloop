# 0013 — Git worktrees for parallel builds

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

`build-slice` can run several builders at once. Where they work matters:

- Building in the person's own checkout forces one slice at a time per repository, needs a clean tree, and switches branches under any running dev server or editor.
- Independent slices in the *same* repository are common, and serialising them wastes most of the parallelism agents offer.
- People keep working while the harness builds; their checkout must not change under their feet.

## Decision

1. **One git worktree per slice or part**, created under the store at `$XDG_STATE_HOME/wholeloop/worktrees/<repo>/<slice-id>`, on its own branch from a named base. The base sha is recorded in the journal.
2. **The person's checkout is never touched** — it may be dirty, on any branch, with a server running.
3. **Parallel even within one repository.** `blocked-by` dependencies still decide what may start; chained slices may stack their branches.
4. **Ports and resources per worktree.** `wl worktree create` allocates a port range so dev servers in parallel worktrees do not collide.
5. **Lifecycle commands:** `wl worktree create | open | stop | list | prune`. `open` gives the path and run commands for the *test it* decision point.
6. **Cleanup after merge.** `sync` removes worktrees whose pull requests merged; `wl worktree prune` does it on demand.
7. **Opt-out:** `build.workspace: checkout` for repositories where worktrees are impractical (heavy per-checkout setup, unusual tooling). In that mode builds run one at a time and the tree must be clean.

## Consequences

### Positive

- Real parallelism, including inside a single repository.
- Zero interference with the person's own work.
- Gates check exactly the tree the builder produced; read-only verification is a simple diff.

### Negative

- Each worktree may need its own dependency install or build cache warm-up.
- Disk usage grows with parallel slices; `status` reports worktrees and `prune` reclaims them.
- Some tools assume a single checkout (absolute paths, global daemons) and need the opt-out.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Build in the person's checkout, one slice at a time | Blocks parallelism, needs a clean tree, disrupts the person's work |
| A full clone per slice | Heavier on disk and network; no shared object store |
| Containers per slice | Strong isolation, but a large setup cost and not available everywhere |

## Links

- [Build a slice](../flow/build/build-slice.md) · [State and messaging](../architecture/state-and-messaging.md)
- [P3-02 — worktree manager](../../roadmap/phase-3-build.md#p3-02--worktree-manager)

[◀ Decisions index](./README.md)
