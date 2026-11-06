# 0243 — Single-writer store trust model

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The runner re-observed every fact at every internal guard as if another program could rewrite the store or the repository between two lines of the same decision. Each store access canonicalized its path twice and probed for repository markers on every ancestor up to the filesystem root, and the delivery base guard started five Git processes for every guard of a decision. In the measured EVAL-09 route this was most of 3.2 million `existsSync` calls and 3546 of 6302 Git processes. Collecting a missing path's suffix also shifted every earlier component.

The store's writers are known: only `wl` processes write it — the waiting CLI, its controller, owned wrappers and concurrent `wl` commands. Planned user interfaces only read it and submit input through `wl` commands. What genuinely changes from outside is the person's repository, the Docker daemon and process state.

## Decision

Trust the store's own writers and keep observing what is external.

- **Single writer.** Only `wl` writes the store. Dashboards and notification tools read projections and the read-only change feed and submit decisions through `wl` commands. Locks, atomic replacement, journal hash chains and committed-fact flushes remain, because several `wl` processes run concurrently and can crash.
- **Store containment per root.** Resolving a root still canonicalizes it twice and refuses repository markers on every ancestor. An access below a root this process resolved canonicalizes once, refuses an escape from the root and probes markers on the root itself and on the components below it, which `wl` creates. A marker added above an already resolved root is refused by the next resolution. Any other boundary keeps the complete walk. Missing suffix components are collected leaf-first and reversed once.
- **External facts once per decision.** The base guard reuses its last successful observation only within the same synchronous job and only while this process has announced no effect: every store mutation, launch and Git write increments an effect counter, and the observation expires when the job ends. A refusal is never reused; sealed read observations keep their own reads.
- **Fewer processes per observation.** `repository()` asks for the top level and the common directory in one `rev-parse`; the base guard adds the verified commit of `target^{commit}` to that same query and keeps the symbolic resolution and remote URL as separate queries. A joined answer is used only when it is exactly the expected number of newline-free lines; any other output runs the original separate queries. Every failure of the guard is the same refusal, so only the accepted set must match, and it does: acceptance requires the symbolic name to equal the requested ref.

This supersedes the earlier requirement that every store access repeat the complete ancestry walk so that a marker inserted and removed between two sibling accesses is refused; that protected against an adversary writing in or above the store during one decision, which is outside this model.

## Alternatives rejected

Caching a root's verification for the whole process would let a new resolution miss a later repository. Caching base observations across awaits or effects would let a decision act on a base observed before its own push or merge. Reading refs from the filesystem bypasses packed refs and Git's resolution rules; reimplementing `remote get-url --push --all` would have to reproduce `pushurl` and `insteadOf` exactly.

## Verification

`test/unit/state/store-root-containment.test.ts`: an access 4 or 16 levels below a resolved root makes at most eight `existsSync` calls (34 and 58 before); markers inside the store or at its root still refuse, as `test/unit/delivery/journal.test.ts` requires; a marker above the root is refused by a new resolution; an escaping link still refuses. `test/unit/worktrees/git-joined-queries.test.ts` compares every joined answer with the original queries across primary and linked checkouts, spaces and newlines in paths, bare repositories, missing, nested-ambiguous, remote-tracking, tag and tag-pointing targets; shows one process for `repository()` and three for a remote-bound guard; and shows reuse within one job and renewal after an await, a Git write and a store mutation. `test/unit/state/path-suffix-performance.test.ts` removes the quadratic suffix shifts. The repository-marker controls in `test/unit/state/read-observation.test.ts` keep their complete walk because their boundary is not a resolved root.

[◀ Decisions index](./README.md)
