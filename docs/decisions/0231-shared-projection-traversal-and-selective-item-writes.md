# 0231 — Share projection traversal and skip unchanged basic item writes

- **Status:** Accepted
- **Date:** 2026-11-05

## Context

Full-store projections reconstruct the environment hierarchy and declarations repeatedly for each item, and scan all events again to decide whether each item has synchronization history. A controlled 100/400-item rendering makes 47800/671200 logical event-field accesses. A single environment report also reads every current monthly journal segment twice. Separately, adding one note among 32 items performs 36 atomic writes and 72 fsyncs, including 33 unchanged projections.

## Decision

Build the environment parent/child graph once per complete rendering. In original declaration order, propagate each declaration to its ancestors and descendants using an explicit visited traversal. Never descend newly selected ancestors into siblings. Reuse the resulting entries for JSON and Markdown. A targeted report instead selects only its subject's related entries from one fresh journal snapshot, retaining replay validation and the unknown-item refusal. Index all historically synchronized subjects in one event pass; a cleared current merge must not erase historical synchronization output.

For transactions containing only item creation, update, closure, notes or links, compare the complete before/after projection bytes derived from authoritative event versions in memory. Reuse the initial validated item replay already required by the transaction. Write only changed or newly required projections; first generation still writes every view. Keep the journal-first atomic commit, final replay and every planned path's containment preflight, including unchanged peers. No filesystem metadata or cross-action cache is trusted to skip work. Workflow, artifact and future unknown event families retain their complete refresh.

A basic item mutation no longer incidentally repairs an unrelated stale disposable projection after an earlier interrupted cache write. Authoritative reads still replay committed journal events; explicit state rebuild repairs every projection. Workflow/artifact transactions retain full repair. This recovery distinction is intentional and documented rather than silently claiming unchanged cache behavior.

The graph work follows required relationships and output size. Dense inherited declarations can legitimately require quadratic output; linear growth is claimed only for the declared sparse/root/leaf fixtures. Other domain reducers and broad path preflights remain separate audit work.

## Rejected alternatives

- Keeping per-item full-history selection retains quadratic work even when no environment declaration exists.
- Building every item's environment view for one targeted report wastes unrelated traversal.
- Filtering only the changed subject can omit global links or inherited/cross-item projections.
- Comparing mtimes or trusting an earlier file snapshot would add stale-cache and race assumptions.
- Applying this persistence policy to arbitrary workflow callbacks would change wider artifact-recovery behavior without the corresponding audit.
- Removing unchanged-path preflights could commit journal changes while an unrelated planned path escapes containment.

## Verification

The exact original mixed-hierarchy projection digest remains 38a862ab24160a3e4801ebf4651a45a68b0eb78c5d29d1a3826af72d2c05c7c9. The same 100/400-item control now makes 7900/31600 event-field accesses while producing all 102/402 files. Targeted environment reports open each current monthly segment once. These are algorithm accesses and physical read counts respectively, not interchangeable timing measurements.

Actual owned-store note controls at 8 and 32 items now perform three atomic writes and six fsyncs, with no unchanged projection rewrites. Injected cache failure retains journal truth and explicit rebuild recovery; a workflow event still repairs unrelated stale output. A symlink replacing an unchanged peer path is rejected before any journal append. All 48 focused macOS controls and strict types pass. Complete increment gates and the broader performance audit remain separate obligations.

[◀ Decisions index](./README.md)
