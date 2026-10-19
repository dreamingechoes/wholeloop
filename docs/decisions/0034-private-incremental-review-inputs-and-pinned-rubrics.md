# 0034 — Private incremental review inputs and pinned rubrics

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A branch diff repeats already reviewed code. Comparing commits alone misses fixes
that have not been committed. Using the repository index as a scratchpad changes
human state, and merely passing a rubric path does not make its content available
to a reviewer. A review also needs a standalone entry without invented build work.

## Decision

- Store changed-file blobs and trees in the external state store, using a private
  Git object directory, a read-only alternate to the repository objects and unique
  external scratch indexes. Read/hash raw file bytes without input filters. Disable
  hooks, fsmonitor, split indexes, external diff/textconv and automatic diff index
  refresh. The latter changed index stat entries in the restored-file fixture even
  with optional locks disabled; that observed mutation is now a regression test.
- Snapshot the union of changed paths and prior manifest paths. A newly changed
  path compares against its base blob; a prior path compares against its prior
  bytes or absence. This preserves deletions, new files, reverts, modes and symlink
  targets. Round one is base-to-change; later rounds contain only the delta.
- Bound snapshots to 1000 paths, 1 MiB per file and 2 MiB per Git command output.
  Reject credential filenames, recognized credential-shaped content and escaping
  directory symlinks before copying new content. These checks are conservative
  exclusions, not an exhaustive secret detector or encryption. No repository-wide
  file copy is performed. Private objects must be retained alongside the journal.
- Journal trees, file manifest, patch digest and rubric binding/origin/digest before
  observations. Reconstruct the same patch on resume; reject missing objects,
  missing prior inputs, changed rubric bindings/bytes and late/duplicate input.
  Return actual rubric content transiently to both reviewers and refuters, together
  with previous kept findings. Workers recheck those blockers against current code.
- Standalone review creates a review item and isolated workspace from a named branch
  after asking for owner/base and a host-resolved PR head when needed. It requires
  no fabricated criteria or earlier steps. Completion uses a canonical current-PASS
  receipt after this step began. Build uses the same review context automatically.
- Add codehost.comment-pr as a distinct opt-in operation. Local comment planning
  does not publish; only an explicitly requested typed host call can do so. Pass a
  stable idempotency key for host/provider reconciliation. Publication never means
  approval/request-changes. Actual GitHub/GitLab providers follow in P3-07.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Commit every review round | Mutates project history and misses work before a commit |
| Reuse the person's index | Changes staged state and creates conflicts with concurrent tools |
| Copy the whole checkout | Copies unrelated files and possible credentials into runtime state |
| Compare only the base on every round | Repeats code and loses the incremental acceptance criterion |
| Store raw patches/rubrics in the journal | Duplicates source text and weakens retention boundaries |

## Consequences

Objects use Git compression, not encryption. The owner must exclude additional
sensitive source paths and manage the external store accordingly. Generic gate
arithmetic remains usable independently; canonical review/build hosts load the
review context before workers. A malicious or mistaken host can still ignore an
old finding; client isolation and semantic inspection remain live verification.
Comment idempotency depends on host/provider reconciliation; an ambiguous network
outcome is not safe permission to retry. No authenticated comment was posted.

## Links

- [Git environment variables](https://git-scm.com/docs/git)
- [Private index entries](https://git-scm.com/docs/git-update-index)
- [Raw object hashing](https://git-scm.com/docs/git-hash-object)
- [Diff execution controls](https://git-scm.com/docs/git-diff)
- [Review workflow](../flow/build/review-code.md)
- [P3-06](../../roadmap/phase-3-build.md#p3-06--review-code)

[◀ Decisions index](./README.md)
