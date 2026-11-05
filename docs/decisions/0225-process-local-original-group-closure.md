# 0225 — Retain witnessed original group closure within its controller

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The unmodified model-free implementation rehearsal passes code, unit QA, integration and acceptance, then blocks publication. A read-only diagnosis retains the failed report and journal. One original repository-read wrapper finished successfully at 18:17:40 UTC; macOS reuses its PID and group number for trustd at 18:19:58, during publication. The candidate and assembly are still current, but the numeric-group check now makes that completed original read unknown. No stored PID is signalled. The earlier separate handoff failure remains undiagnosed, not retrospectively attributed to this observation.

## Decision

Retain a bounded, module-private memory of positively witnessed original group absence together with a validated, nonce-bound outcome. Key it by the canonical store and exact invocation, and bind it to hashes of the complete current intent, started and outcome bytes. Every observation still reads those three guarded files, validates their original bindings/outcome and obtains one fresh common process table. If that table now contains the same numeric group, only the same process's already-witnessed, byte-identical original closure may retain its original stopped observation and evidence. This describes the original nonce, never the unrelated current group.

Store only input and evidence digests in memory. Keep at most 1024 recently observed originals; eviction restores the ordinary conservative behavior. Never restore this memory from a file, public stage flag, outcome alone or a different controller process. A cold present group, missing or altered original bytes, unavailable process table, invalid outcome or absence without a semantic result establishes no such reusable proof. Keep cancellation, live-process checks, execution authority, schemas and original observation digests unchanged. Never use any remembered PID as permission to signal or replay an invocation.

This does not make a timed-out read available or certify a hosted/native trial. A cold controller encountering an occupied legacy number remains unknown until it can independently observe the original closure; broader durable identity recovery is not introduced.

## Alternatives rejected

- Treating a numeric PID as a permanent identity causes the observed false refusal.
- Dropping process-group checks would accept live or unresolved invokers.
- Trusting a persisted closure certificate could reconstruct proof in a controller that never observed it.
- Comparing wall-clock birth times would add clock, precision and platform assumptions to a terminal fact already observed by this controller.
- Rewriting the historical failed report would invent acceptance evidence.

## Verification

An actual managed process exits seven and is positively observed closed. A controlled process table then reports its number present; the original implementation returns unknown, while this change retains exactly its original observation. A fresh independent process and a different store refuse the same copied records and a claimed closure file. Changing even whitespace in any of the three original files, changing the exit result or making the table unavailable refuses reuse. Absence without an outcome cannot later supply reusable semantic closure. Caller mutation cannot poison subsequent reads. Existing batch-query, native-scope, environment and recovery controls retain their separate actual/synthetic scope; another complete unmodified rehearsal remains required.

[◀ Decisions index](./README.md)
