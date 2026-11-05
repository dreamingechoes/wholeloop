# 0229 — Group each original native registration without duplicating reads

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

The resource/projection correction in [ADR-0228](./0228-bounded-resource-observation-projections.md) still blocks a fresh unmodified rehearsal at acceptance. Its separately diagnosed feature read needs 1029 resources and 1585 projections before environment retirement; 444 source files belong to the three original records of 148 managed processes. A diagnostic-only expanded quota completes the read, but raising production limits would avoid explaining the resource model.

An initial grouping prototype namespaces its cache keys. After retirement, comparison against the exact same state finds twelve extra projections: ordinary readers and grouped readers capture some identical inputs separately. Reject that prototype. Comparing its 1871 projections directly to the pre-retirement 1585 was also invalid: retirement itself adds 274 projections. Preserve both original measurements and this correction.

## Decision

Fixed readers may declare the complete physical membership of one observation resource. Each managed native registration declares exactly its intent, started and outcome selections, bound to the original external store and invocation. Keep every path and source-byte projection, the original read keys, exact captured evidence and independent final validation. Ordinary readers of a member reuse that same evidence. Existing member captures can move into the declared group only after capture has completed; grouping performs no physical reads and creates no second cache.

Keep at most 1024 resources, eight projections per resource and 64 MiB of aggregate evidence. Each group declares at most eight distinct members and remains a reserved resource even when its members are absent or unreadable, so membership aliases are independently bounded by 8192. Membership cannot change, overlap another group or include a group. A group cannot overwrite an ordinary resource identity. Refuse in-progress reclassification, projection overflow, unknown groups during final validation and caught violations. Existing identical declarations may recur during nested validation. All group and alias metadata belongs only to the original observation.

This is internal quota classification, not a process-closure certificate. Nonce binding, exact original bytes, current process-table availability, public-copy separation, write barriers, cancellation and elapsed deadlines remain unchanged. Native observations still read each original file and retain all existing semantic checks. No scope can dispatch, persist grouping or authorize an effect.

## Rejected alternatives

- Increasing the quota or splitting acceptance into disconnected snapshots would avoid the complete current-input requirement.
- Separate grouped cache keys duplicate physical reads already performed by ordinary callers.
- Grouping arbitrary ancestry, changing membership or discarding individual projections would obscure independent proof and work bounds.
- Trusting a prior registration or ignoring stopped-process evidence would weaken recovery ownership.

## Verification

A 400-registration filesystem control fails at the original resource limit and passes with grouping while every incomplete record remains unknown. Three original files per registration open exactly once in each of the capture and validation phases, including an ordinary reader before grouping and repeated complete observers. Controls reject byte-only edits, newly appearing originals, changed/overlapping/nested membership, pending capture reclassification, unknown validation groups, projection overflow and a 1025th empty group. Independent actions forget every grouping.

On the exact same post-retirement state, the diagnostic original with an expanded cap needs 1217 resources, 1859 projections and 1769341 bytes. Current grouping retains exactly those projections and bytes, needs 921 resources and reads ready with production quotas intact; the original report and current journal remain unchanged. This is a separate read-only diagnosis, not a successful route or a total-overhead result. Required gates, fresh complete-route evidence and the broader P6-39 audit remain open.

[◀ Decisions index](./README.md)
