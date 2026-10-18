# Worktree lifecycle

- ⛔ `worktree-owned-provisioning` — pin the named base and allocation intent
  before provisioning a topic branch/worktree. Resume only matching owned Git
  identity; default worktrees remain external and preserve the person's checkout.
- ⛔ `worktree-safe-cleanup` — cleanup touches recorded stopped work only, after
  merge into its integration target or reasoned abandonment. Retain dirty,
  locked, active or changed-identity work; never force-remove or delete branches.
- ⛔ `worktree-port-leases` — port blocks are disjoint within the selected store
  and remain reserved until prune. Exhaustion is a precondition, not permission
  to reuse another environment's range.

Open supplies the environment and suggested commands; it neither runs them nor
records test-it approval. Stop retains files and records lease state; worker and
server process control belongs to the later builder integration. Inspect stale
lock owners before recovery. Checkout mode is an explicit clean/exclusive opt-out.
