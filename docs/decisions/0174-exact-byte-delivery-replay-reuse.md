# 0174 — Exact-byte delivery replay reuse

- **Status:** Accepted
- **Date:** 2026-10-31

## Context

[ADR-0096](./0096-replayable-delivery-journal-without-authority-recovery.md) makes retained events, not projections, the source of every status read. Runner readers reconstruct authority from that journal hundreds of times per stage. Each read re-decoded, credential-scanned and schema-validated every segment, then replayed and re-validated every event and projection. With 166 events this costs about 46 milliseconds, and one composed readiness read spends about 37 seconds there. Two such reads plus Docker provisioning exhaust the original 120-second root product window on an otherwise idle Linux host, so the composed acceptance fails for a cost the design never required.

## Decision

Keep one fresh read per observation: list the journal directory, refuse unknown or aliased leaves and read every segment through the existing guarded byte reader, including its change-during-read and containment checks. Retain only the most recent full replay in the process: the canonical directory, each segment's name, exact bytes and validated events, and the resulting states. When a leading segment has the same name and identical bytes, reuse its validated events; any differing segment, and every segment after it, takes the complete decode/scan/parse/validate path again. Reuse the retained states only when every segment is identical; otherwise replay all events and replace the retained entry.

Every result is a deep copy, so callers cannot change a later observation. File times and sizes never decide reuse. Transactions, writes, projections, private authority and error precedence are unchanged.

## Alternatives rejected

Caching by size or modification time trusts metadata an attacker or a coarse clock can preserve. A per-instance cache misses because most domain classes construct fresh lifecycle objects. Incremental reducer state would need a second public replay contract. Widening the evaluation window or moving checks out of it would hide the defect rather than fix it.

## Verification

Regression tests count full replays through a pass-through reducer spy: repeated identical reads from fresh lifecycle objects replay nothing, and a committed change replays. Deep mutation of returned events and states cannot reach later readers. A same-length byte change with restored file times still refuses, and interleaved stores stay independent. Measured snapshot cost falls from 46.5 to 9.6 milliseconds on the retained 166-event store; the composed product-environment evaluation then passes inside its unchanged window. Evidence is in the journal.
