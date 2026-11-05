# 0228 — Bound observed resources and their independent projections

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The first shared-reader increment exhausts its 1024-entry cap before integration. Coalescing overlapping path checks lets the next unmodified rehearsal pass integration, but acceptance still refuses: its observation contains 483 source entries, 418 store-path entries and smaller process/Git views at only 950227 captured bytes. A protected path selection and its content are separate proofs of the same input. Counting both as separate resources makes an ordinary 700-file read exceed the cap. Normalizing source spelling alone removes only six entries from that failed observation.

## Decision

Keep at most 1024 resource identities and 64 MiB of aggregate captured evidence. Each resource may have at most eight independently captured and revalidated projections, bounding the complete map at 8192 entries. A filesystem resource uses its absolute normalized selection. Path protection and source bytes share only resource accounting: retain their distinct evidence, containment boundaries and fresh checks. Other installed readers retain their existing separate resource identities. Reserve a projection before its physical read to bound recursive capture; reject a ninth projection or a 1025th resource before launching that read. A read key cannot change its resource identity, including during fresh validation; a caught violation still invalidates the result.

Normalize relative and absolute source selections within the same root. The caller's byte allowance is a per-call restriction, not a physical identity: validate it before lookup and enforce it against the selected bytes on every call. Retain the first successful bounded physical reader for independent revalidation. Do not merge distinct roots or arbitrary physical aliases. Public buffers remain copies. Every captured projection still contributes to the aggregate byte bound and is freshly checked before the observation returns.

This refines [ADR-0227](./0227-verified-read-observation-scopes.md). It changes an internal observation quota, without extending deadlines, persisting a cache or changing execution authority. The larger permitted projection count is explicit; it is not a measured latency improvement or a complete-route pass.

## Rejected alternatives

- Raising the original undifferentiated entry cap would leave its meaning dependent on the number of internal proof layers.
- Dropping path or content validation would lose independent containment or current-byte guarantees.
- Treating every source allowance as a separate input repeats opens for identical bytes; ignoring a smaller allowance would weaken its caller's bound.
- Merging canonical aliases or roots could erase a reader's original selection or containment boundary.

## Verification

An actual 700-file differential control refuses on the preceding source and passes with resource accounting. Filesystem controls exercise 350, 700, 1024 and 1025 protected selections. Independent controls retain projection-count and aggregate-byte limits, changed-view refusal, caught identity-substitution refusal and nested Git-marker protection. Repeated equivalent source selections use two physical opens, including fresh validation, while smaller and invalid allowances still refuse.

Required complete gates, a fresh unmodified rehearsal and total controller-overhead accounting remain separate evidence. P6-39 and the 1.0 performance blocker remain open.

[◀ Decisions index](./README.md)
