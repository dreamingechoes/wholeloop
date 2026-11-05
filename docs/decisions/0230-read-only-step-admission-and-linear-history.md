# 0230 — Read step admission before acquiring a writer lock

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

All thirteen compiled step-begin missing-input paths return exit 2 but perform six fsyncs, three writes and seven mkdir calls, creating a disposable discovery cache. Repeating an already active step also acquires locks without changing history. Separately, 400 completed runs cause 2186016 event-field accesses during a missing-impact preflight; 100 cause 171666. Both active-run selection and replayed completion validation search the complete history inside another history traversal.

## Decision

Keep the fixed begin preparation as one implementation. First run it against current read events with a private append sentinel that stops before the first mutation. Questions, refusals and existing no-op results return without a writer lock. If the sentinel is reached, run the original preparation again inside the real StateStore transaction, against freshly read and validated events. Never apply a precomputed mutation or payload to the later state. The preparation remains read-only until append; this is not a generic optimistic transaction facility for callbacks with arbitrary effects.

Begin uses discovery without cache persistence, including when work is admitted. Existing valid caches can still supply the parsed inventory after its current input fingerprint is computed. A normal discovery cache hit needs no writer lock; a miss may scan outside the lock, then recheck and populate the disposable cache under the lock. Avoid a cache write after committing work: its failure must not create a new post-commit failure mode. Preserve complete slot questions, template selection, owner/input remembrance, source/parent handling, required decisions and the versioned output shape.

Index ended run identities once before finding the last active start; preserve the existing rule that any matching completed/skipped run remains ended, including a later duplicate start. Do not build that index without a selected subject. During replay, record each subject/step/run start only as its validated chronological prefix advances. Completion uses that index and cannot borrow another identity or a future start. Retain duplicate-event, item, parent and domain validation; no journal format changes. Empty history needs no domain reducers, and remembered item answers need no event traversal without an item identity.

## Rejected alternatives

- Keeping no-op transactions preserves unnecessary lock files, fsyncs and contention.
- Applying the first pass's result under a later lock could admit an item closed or otherwise changed by another writer.
- Probing every generic transaction could repeat external side effects outside this fixed read-only preparation.
- Removing discovery from question generation would lose the existing batched slot questions.
- A single reverse-only start lookup could resurrect a run already ended before a duplicate start.
- Skipping current history validation or accepting a future start would weaken correctness to reduce work.

## Verification

All thirteen actual compiled missing-input commands preserve exit 2 while reducing fsync, write and mkdir calls to zero and leaving state absent. An actual idempotent begin opens no transaction. A controlled intervening writer closes an item between the probe and real transaction; the fresh preparation refuses it without appending a start. Cache controls retain cold/warm/change behavior while avoiding locks for reads.

Valid-history operation counts fall from 171666/2186016 event-field accesses for 100/400 completed runs to 25619/102119, approximately linear growth. Separate replay controls reject wrong subject, step, run, future start and skip-only completion, while preserving prior matching-start semantics. These counts are algorithm accesses, not filesystem reads or elapsed-time measurements. Full gates and the broader [performance audit](../../roadmap/performance-audit.md) remain separate requirements; the quadratic projection renderer and complete controller amplification are still open.

[◀ Decisions index](./README.md)
