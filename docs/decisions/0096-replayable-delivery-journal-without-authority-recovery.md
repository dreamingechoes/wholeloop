# 0096 — Replay delivery state without reconstructing authority

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Delivery needs persistent control and attempt identity while existing item events already encode human decisions and published PR receipts. Reinterpreting those records as machine authorization would silently change supervised behavior. A crash can leave projections behind an authoritative transaction, and later queue/effect families must extend delivery without changing frozen declarations.

## Decision

1. Keep a separate delivery journal under the external store. Leave legacy item journals, schemas, approvals and PR reducers unchanged. Tracking a prepared plan/envelope registers metadata; it creates no execution authority and starts no worker. A future runner can perform tracking automatically without another human approval.
2. Use the existing StoreFiles writer lock and atomic replacement primitive. Each transaction writes one immutable numbered NDJSON segment containing at most 1000 events and 8 MiB. That replacement is the commit point; projections follow it. A crash before it commits nothing, while a crash afterwards retains a complete transaction that can rebuild its projections. Never truncate a partial/corrupt segment or steal a lock implicitly.
3. Validate global contiguous sequence numbers, unique event IDs, canonical event digests and predecessor hashes. Sequence controls replay order; wall timestamps remain observations. Preserve a sticky rollback flag and maximum observed timestamp rather than silently advancing the clock. Admission/deadline recovery is a subsequent budget/runner obligation.
4. Freeze the versioned event/projection envelopes while registering independently versioned, closed payload and facet families. The envelope alone is insufficient validation: core validation must select a known exact family schema and reducer. Unknown versions refuse replay and writes. Later families can be additive without changing existing declarations or pretending that an older reader understands new events.
5. Pure reducers validate state edges, exact plan revisions, assignment role/unit/cell/generation, observed runtime identity and endpoint-specific outcomes. A single authorization remains bound to its first run across revisions and cannot revive after expiry/revocation. A journaled active observation is historical: live admission still inspects private authority and its exact digest. Worker claims cannot append controller events through the broker.
6. Always replay retained events for status; projections are disposable caches. Rebuild touches only delivery caches, never private grants/revocations, legacy journals or external effects. Refuse recognizable future cache/facet versions and namespace aliases before writing, including symlinks into another private store area. A missing grant is not recoverable from its journal observation.
7. Expose schema discovery, idempotent tracking, status, bounded per-run event pages and cache rebuild. Provide no command for arbitrary event append, successful completion, authority reconstruction or rewriting a human record. Later behavioral/PR/merge hosts remain responsible for validating actual endpoint evidence before requesting controller transitions.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Extend legacy human events with machine outcomes | Changes established acceptance meaning and old receipt replay |
| Rewrite a single journal and every projection together | Introduces an unavailable multi-file atomic commit or repeated history replacement |
| Recover grants from active journal observations | Turns historical metadata into new live authority |
| Accept unknown families and skip their effects | Produces an apparently complete but incorrect partial replay |
| Treat file containment as namespace ownership | Permits a cache symlink to overwrite a private grant inside the same store |
| Expose a raw append/completion CLI | Allows callers to bypass the actual evidence-specific coordinator |

## Verification and limits

Reducer and process tests cover impossible transitions, schema/digest/order faults, role/generation mismatches, grant binding and rollback. Actual SIGKILL fixtures terminate an owned child before and after the atomic segment write, then reconstruct state without creating authority. Compatibility tests retain declaration fingerprints and synthetic pre-existing human/PR bytes and receipts. These are local state/fixture checks, not native worker containment or actual behavioral/publication evidence. General stale-lock/process recovery follows in P6-06.

## Links

- [Recovery tutorial](../tutorials/delivery-recovery.md).
- [State and messaging](../architecture/state-and-messaging.md).
- [Durable runner contract](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md).

[◀ Decisions index](./README.md)
