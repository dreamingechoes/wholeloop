# 0020 — Journal atomicity and lock recovery

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

The journal is the only source of truth. An interrupted append can leave a
partial JSON line; independently updated projections can lag a committed event.
Recovering a stale lock automatically can create two writers when the original
writer is merely slow or suspended.

## Decision

- Events are logically append-only. Under one directory lock, validate the
  complete batch, preserve every existing event and atomically replace the
  monthly NDJSON file through a temporary file, fsync and rename. A batch has
  one timestamp so it never spans monthly files.
- Read commands replay the journal. Projections are disposable; rebuild repairs
  a crash between journal commit and projection writes.
- Reject malformed or incomplete journal lines without truncating evidence.
- Locks contain PID and start time. Wait at most five seconds, then explain
  recovery. Never automatically steal a lock; the owner confirms the process
  has stopped before removing it.
- Resolve symlinks and reject repository-contained or escaping destinations at
  the file boundary, including lock and temporary files.

## Consequences

**Positive** — complete batches survive interrupted writes; recovery preserves
evidence; slow writers cannot silently lose their lock.

**Negative** — writes copy the current month's journal and replay history.
Large stores may eventually need a rebuildable index. A crashed lock requires
manual recovery.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Direct append with automatic tail truncation | A torn line requires guessing what was committed and destroys evidence |
| Time-based stale-lock stealing | A paused live writer can resume after another writer acquires its lock |
| Read projections directly | A crash between updates would make queries return stale state |

## Links

- [State and messaging](../architecture/state-and-messaging.md)
- [ADR-0004](./0004-state-outside-the-repo.md)

[◀ Decisions index](./README.md)
