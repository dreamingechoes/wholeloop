# 0226 — Read journal leaves through one pinned physical directory

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The implementation rehearsal on 210bb03 passes all thirteen stages and applies publication to its local synthetic transport, but still blocks at the final current-endpoint observation after 663 seconds. Its journal records roughly 63 seconds between passed handoff and the final refusal; that interval is not an isolated endpoint measurement, and the generic reason does not establish its precise failure boundary. The preceding sampler shows substantial repeated filesystem and Git work. A fresh journal query costs about 23ms on the retained 240-segment store, and composed readers repeat it hundreds of times.

The general source reader resolves root and selected path components repeatedly for each tiny segment. That work is necessary for arbitrary source selections, but a journal already has one canonical external directory and strict plain leaf names. Its public get/list methods also clone every event even when callers only need a projection.

## Decision

Keep the canonical external-directory check before and after every complete observation. Pin the opened directory with a no-follow directory descriptor until that observation ends, preventing inode reuse while it is inspected. Read every selected segment's complete current bytes through a journal-only guarded leaf reader. Require its exact numbered basename, check the same physical parent before and after every leaf, refuse symbolic leaves before opening and after reading, and retain no-follow/nonblocking regular-file descriptors, the existing 8 MiB bound, complete-length checks and final file identity/size/time checks. Use big integers for device, inode and nanosecond timestamp identity rather than rounded numbers. A changed parent, file or alias refuses; never substitute a cached directory name or string-prefix containment claim.

Retain the original text decoding, credential scan, line/event/sequence limits, schema validation, exact-byte replay reuse and final directory reobservation. New append-only leaves may leave the originally observed prefix valid; directory modification time is not an authority check. Arbitrary source reads continue through the original general reader.

Keep the complete replay private and clone only the data each public method returns. Full snapshots still copy events and states separately; get, list and events expose no mutable cache object. Transactions still obtain a complete independent snapshot and commit immutable segments before projections. Schemas, artifact identities, authority and deadlines stay unchanged.

## Alternatives rejected

- Caching by file size, time or a projection could conceal changed authoritative bytes.
- Sharing mutable events or states could let a caller poison a later observation.
- Skipping parent or descriptor checks would make containment depend on a path string.
- Globally changing the process working directory could redirect concurrent filesystem work.
- Using Linux descriptor paths assumes an interface the actual macOS probe does not support.
- Coalescing or rewriting immutable committed segments would change the persistence contract.
- Increasing read deadlines would conceal remaining runtime cost.

## Verification

Actual macOS controls cover binary/empty leaves, invalid selections, alias/parent substitution and oversize refusal before reading, plus growth, truncation, same-length edits with restored mtime, leaf replacement/aliasing and parent replacement/aliasing during a read. Existing replay, corruption, caller-mutation, queue and control checks retain their scope. The first focused run passes sixty controls and fails a test that counts the previous public snapshot method; count the actual current segment reads instead, retaining one complete read per poll and immediate pause/revocation. All 61 final focused controls pass.

Twenty repeated queries of the same retained store fall from a 23.125ms median to 5.764ms with the identical state digest. This is one local read benchmark, not a complete workflow, model, platform-wide speedup or prompt baseline. Current full gates and a fresh unmodified end-to-end rehearsal remain required; preserve every earlier failed report.

[◀ Decisions index](./README.md)
