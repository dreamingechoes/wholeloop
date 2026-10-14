# 0004 — State lives outside every repository

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The harness has to remember a lot between sessions: the initiatives in progress, every artifact produced, questions asked and answered, gate rounds and verdicts, messages between agents, decisions and who made them. That memory must:

- survive compaction, crashes and switching from one CLI to another;
- be shared by agents running in parallel without sharing a context window;
- span more than one repository, since one slice can touch several;
- stay out of product diffs and history;
- not tie the harness to a single tracker vendor.

## Decision

1. **One store per person**, at `$XDG_STATE_HOME/wholeloop` (default `~/.local/state/wholeloop`). `WL_WORKSPACE` selects an isolated store (for example `work` and `personal`).
2. **An append-only journal** of events is the source of truth.
3. **Projections** — Markdown with front matter — are regenerated from the journal; `wl state rebuild` must reproduce them byte for byte.
4. **A mailbox** of threads carries messages between agents and steps (`contract`, `handoff`, `status`, `question`, `note`).
5. **Single writer.** Only `wl` writes the store: validated, write-then-rename, appends under a lock.
6. **Sharing goes through providers.** Steps publish to the configured `docs` and `tracker` destinations; another person adopts the work into their own store from those artifacts. External trackers are **sync adapters**, never the source of truth.
7. The only harness file a repository holds is **configuration** (`.wholeloop/config.yml`), written by people on purpose. Git worktrees used for builds also live under the store ([ADR-0013](./0013-git-worktrees-for-parallel-builds.md)).

## Consequences

### Positive

- Any session, in any CLI, resumes from `wl resume`.
- Plain text: inspectable, greppable, recoverable by hand.
- Replayable projections make the state layer fully testable.
- Repositories stay clean; nothing to `.gitignore`.

### Negative

- The store is personal; collaboration needs a `docs`/`tracker` provider configured.
- Backups are the user's responsibility (the store is small and plain text).
- Concurrent writes from many processes need careful locking — a core responsibility with dedicated tests.

## Alternatives considered

| Option | Why not |
| --- | --- |
| `.wholeloop/` inside the repository | Pollutes diffs, leaks across branches, breaks for multi-repo work |
| beads or another task-graph tool as the store | Couples the harness to one tool and its install; kept as a possible sync adapter |
| An external tracker as the store | Network on every write, vendor lock-in, slow for agent chatter |
| SQLite | Fast queries, but binary and opaque to people; rejected for now — may return as a rebuildable index next to the journal |
| Keep state in the agent session | Lost on compaction or crash; invisible to other agents and CLIs |

## Links

- [State and messaging](../architecture/state-and-messaging.md)
- [P1-03, P1-04 — store, mailbox, resume](../../roadmap/phase-1-walking-skeleton.md#p1-03--state-store--journal-ids-projections)

[◀ Decisions index](./README.md)
