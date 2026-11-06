# 0242 — Flush only committed facts

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Every store replacement used the durable writer: temporary file, file flush, rename and directory flush. In the measured EVAL-09 route all 7020 controller flushes came from it, and 2596 of them were lock owner metadata, 468 were disposable delivery projections (10.7 MB of formatted JSON) and about 78 state projections rewrote identical bytes. [ADR-0020](./0020-journal-atomicity-and-lock-recovery.md) already makes projections disposable and never steals a lock; repair accepts only a well-formed owner whose PID is positively absent, and a missing or malformed owner is `unknown`. The lock directory's own creation and removal were never flushed.

## Decision

- **Lock owner.** After creating the lock directory exclusively, write `owner.json` once inside it with exclusive creation and mode 0600, through the containment-checked store path, with no temporary file, rename or flush. A process crash keeps the bytes in the page cache; an interrupted write leaves an `unknown` owner that blocks repair.
- **Journal-derived views.** `StoreFiles.project` publishes item, mailbox, cursor, link and artifact views and `delivery/state/<run>.json` through the same contained path and atomic rename, without flushes, and skips a replacement whose current bytes already equal the planned view. The journal is flushed before any view is written, so a view can lag but never lead the facts; rebuild repairs it.
- **Everything else** — journal segments, grants, receipts, process ownership records, environment history — keeps `StoreFiles.atomic` with file and directory flushes.

## Alternatives rejected

Flushing only the owner file still left its directory entry unflushed. Writing views on demand would change the store layout readers rely on. Comparing against an in-memory previous projection would miss a stale file that the complete refresh exists to repair. Removing flushes globally would weaken committed facts.

## Verification

`test/unit/state/lock.test.ts`: a lock acquisition makes zero flushes and renames while a committed write under it still flushes file and directory; actual `SIGKILL` controls in `test/unit/delivery/recovery-process.test.ts` still repair the exact stopped owner. `test/unit/state/projection-writes.test.ts`: one durable journal write per note, a failed view keeps journal truth until rebuild, a workflow refresh repairs a stale view and rewrites no identical one. The fault-injection cases in `test/unit/delivery/transaction-replay-performance.test.ts` and `test/unit/runner/foreground.test.ts` inject into the view writer and keep the committed prefix and safe authority.

[◀ Decisions index](./README.md)
