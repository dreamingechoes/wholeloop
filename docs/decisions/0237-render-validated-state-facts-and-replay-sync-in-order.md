# 0237 — Render validated state facts and replay sync in order

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

A state rebuild validated every domain, discarded the derived facts and derived most of them again to render projections; gate history was traversed four times and 400 simple items cost 71200 event-field reads. Fixed basic writers (create, update, note, link) went through the generic callback transaction and replayed every domain five or six times. Publication replay located approval prefixes with `indexOf`/`slice`, sync replay rebuilt the whole publication history before every merge, and scope readiness searched every item for each slice's parts and verified each closure twice.

## Decision

- **One validated replay feeds rendering.** A private fixed reader table owns domain validation order. `replayState` validates history and collects fresh domain facts; only `replayProjections` passes them to the private renderer, synchronously and with no callback. No caller can supply facts or a trusted flag. Rendering groups sharing, sync and ramp entries once while keeping per-owner and file insertion order, and computes each learning body once for both destinations.
- **Fixed basic writers.** The four basic actions use one private locked writer: authoritative before views once, the single event, complete final validation and rendering, every destination preflighted, journal-first publication. Unique item-id selection is bounded to sixteen attempts so a broken randomness source cannot hold the writer lock. Generic callback transactions keep their per-append and final validation.
- **Chronological publication and sync.** One private publication reducer tracks plans, pending requests and the latest exact approval. Inside one sync replay a selection starts at the first merge and advances only through the events before each merge, never the current or future ones. Closure verification returns the proofs it verified; private part and slice parent indexes are built at the first tree-dependent receipt and updated as items are created. The returned state carries no index.

## Alternatives rejected

Caching facts across calls or callbacks could hide corruption, changed parents or journal updates. A full-history publication index would let a merge borrow future facts. Storing tree indexes on the public state would let a later parent edit bypass current descendants. Skipping the final post-callback validation would remove later-corruption refusal.

## Verification

`test/unit/state/projection-replay.test.ts`, `test/unit/state/basic-actions-performance.test.ts` and the `test/unit/sync/*-performance.test.ts` controls reduce the repeated replays and prefix scans to one validated pass per action while producing byte-identical projections and the original refusals.

[◀ Decisions index](./README.md)
