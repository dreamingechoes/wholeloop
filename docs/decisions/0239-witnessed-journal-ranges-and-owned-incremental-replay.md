# 0239 — Witnessed journal ranges and owned incremental replay

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

Every controller poll opened every tiny delivery transaction file, each transaction replayed its whole growing history after every append (5350/81400 event validations at 100/400 transitions), owned appends validated their result twice, events were hashed twice at construction, rejected candidates restored a history they never changed, projections were rendered twice per publication, the overview preflight rejected new journal names, and operator reports read the same segments and authority twice.

## Decision

- **Digest-witnessed ranges.** New files are named first-last-digest.ndjson; legacy first-sequence files stay authoritative and are never migrated or hidden. Within the writer lock a size-tiered tail may be packed with the new transaction into one new immutable file after rereading every retiring input's complete bytes; retained names witness the exact earlier sequence and digest. Old files are never deleted or rewritten. Older cores refuse the new names.
- **Current bytes on every read.** Every reader lists the directory and compares the complete current active bytes; only identical vectors and bytes reuse private validated facts. A cold process replays fully.
- **Owned incremental replay.** A private reducer context starts at the first accepted candidate and then applies only new events; every append still validates every resulting projection. Contexts move, never shared, from the exact-byte cache to one writer. Admission (validation, id, sequence, predecessor) precedes mutation, so only a failure after mutation restores the successful history. The constructor hashes an event once; the public validator always recomputes the digest.
- **Single rendering and shared reads.** One private projection-cache reader validates and the writer renders once. The overview preflight uses the same layout parser and charges quotas only for active inputs. `runSnapshot` gives reports one run and its event source from one fresh read.

## Alternatives rejected

Unbound range names can hide an earlier multi-event tail (an executed prototype failed that control). Inferring retirement from names, sizes or mtimes, trusted-state flags, caller-supplied indexes and shared mutable contexts were rejected. Repacking the whole prefix per commit is quadratic.

## Costs

Packing trades descriptors for written bytes: at 32/128 transactions journal bytes rise from 26889/107846 to 93907/484981 while flushes stay 192/768.

## Verification

`test/unit/delivery/journal-packing.test.ts`, `transaction-replay-performance.test.ts`, `append-validation-performance.test.ts`, `event-construction-performance.test.ts`, `replay-selection-performance.test.ts`, `projection-render-performance.test.ts`, `test/unit/overview/packed-journal.test.ts` and `test/unit/runner/operator-read-performance.test.ts`: active segment reads 32/128 → one range, replay validations 5350/81400 → linear, report segment reads 6 → 2, with complete committed state and refusals preserved.

[◀ Decisions index](./README.md)
