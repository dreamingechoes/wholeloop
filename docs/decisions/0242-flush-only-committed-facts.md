# 0242 — Flush only committed facts

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Every store replacement used the durable writer: temporary file, file flush, rename and directory flush. In the measured EVAL-09 route all 7020 controller flushes came from it, and 2596 of them were lock owner metadata, 468 were disposable delivery projections (10.7 MB of formatted JSON) and about 78 state projections rewrote identical bytes. [ADR-0020](./0020-journal-atomicity-and-lock-recovery.md) already makes projections disposable and never steals a lock; repair accepts only a well-formed owner whose PID is positively absent, and a missing or malformed owner is `unknown`. The lock directory's own creation and removal were never flushed.

## Decision

- **Lock owner.** After creating the lock directory exclusively, write `owner.json` once inside it with exclusive creation and mode 0600, through the containment-checked store path, with no temporary file, rename or flush. A process crash keeps the bytes in the page cache; an interrupted write leaves an `unknown` owner that blocks repair.
- **Journal-derived views.** `StoreFiles.project` publishes item, mailbox, cursor, link and artifact views and `delivery/state/<run>.json` through the same contained path and atomic rename, without flushes, and skips a replacement whose current bytes already equal the planned view. The journal is flushed before any view is written, so a view can lag but never lead the facts; rebuild repairs it.
- **Everything else** — journal segments, grants, receipts, process ownership records, environment history — keeps `StoreFiles.atomic` with file and directory flushes.
- **Directories the store creates.** Flushing a file and its directory leaves a directory created for it unflushed in its parent, so a fact written into a new directory such as `delivery/runner-native/<invocation>/` could vanish with it after power loss. Every directory the store creates — for a fact, for a view, for the store root, through `StoreFiles.directory` for callers that create one before writing into it, or for a retained lock — has its entry flushed in each parent it was added to, once, at creation. A view's own bytes stay unflushed. In the measured route this adds about 320 flushes, one per new invocation, operation or run directory; existing directories add none.
- **Facts written together.** `StoreFiles.atomicBatch` flushes each file as it is written and each directory once before it returns, also when the batch fails. Installation backups use it: every owned file is backed up into one directory before any removal, so a four-client uninstall flushes that directory once instead of once per file — a round trip of the complete catalogs drops from about 16 to 11 seconds in the test suite. Each native file still flushes its bytes before it is linked or renamed into place, so a visible file is never torn.

## Alternatives rejected

Flushing only the owner file still left its directory entry unflushed. Writing views on demand would change the store layout readers rely on. Comparing against an in-memory previous projection would miss a stale file that the complete refresh exists to repair. Removing flushes globally would weaken committed facts.

## Verification

`test/unit/state/lock.test.ts`: a lock acquisition makes zero flushes and renames while a committed write under it still flushes file and directory; actual `SIGKILL` controls in `test/unit/delivery/recovery-process.test.ts` still repair the exact stopped owner. `test/unit/state/projection-writes.test.ts`: one durable journal write per note, a failed view keeps journal truth until rebuild, a workflow refresh repairs a stale view and rewrites no identical one. `test/unit/state/directory-durability.test.ts` records the exact flushed directories for a fact in new nested directories, a pre-created directory, a view and a new store root, and none when the directories exist; all four cases fail against the former writer; a batch flushes three facts and their new directory once, and a failing batch still flushes what it wrote and rethrows the original error. The fault-injection cases in `test/unit/delivery/transaction-replay-performance.test.ts` and `test/unit/runner/foreground.test.ts` inject into the view writer and keep the committed prefix and safe authority.

[◀ Decisions index](./README.md)
