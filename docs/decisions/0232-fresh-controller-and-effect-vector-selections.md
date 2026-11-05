# 0232 — Select controller and effect facts from one fresh view

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

An issued domain host's current callback first validates its lease through RunnerStore.live, then reloads the runner record solely to compare its basis. Twelve actual fixture-route callbacks each read every journal segment twice. Integration and workspace reports also reconstruct their steps through repeated full effect-list reads: the executed three-effect assembly and two-effect workspace each call effects.inspect three times for one report.

## Decision

Let the live check accept an optional exact expected basis and compare it against the same freshly observed state used to validate authority, budget, controller, generation, ownership and allowed waiting states. Issued hosts pass their already pinned basis. Every poll still takes a new journal observation; no timer interval, mutable-input check or dispatch/acceptance authority is removed. Do not wrap asynchronous live polls in a cached proof scope: legitimate child appends must remain observable without cancelling a healthy operation.

Build one fresh key index for each synchronous assembly/workspace step selection. Construct expected heads and select the effect from that same vector. Complete reports use that index for both step construction and result mapping. Preserve first-match semantics: an effect key can recur on another historical plan basis, so a later entry must not overwrite the original match. Preserve original order, observed predecessor heads, unresolved outcomes and all authority/native Git checks.

Refresh after every effect execution, awaited reconciliation or cancellation write before selecting subsequent work. Reconciliation retains its original stopping rules and workspace step-vector scope. Fresh admission and post-effect completion checks remain separate; this is a local read-reuse boundary, not a retained authority cache. Remaining full-history replay and repository/step scans remain audit work rather than being hidden behind lower timings.

## Rejected alternatives

- Re-reading only the runner basis creates needless I/O and combines facts from two journal versions.
- Keeping a vector across an effect or cancellation write can miss newly recorded outcomes or authority changes.
- A timer-based cache delays pause/revocation and requires a new freshness contract.
- A normal last-entry-wins Map changes historical key selection across plan bases.
- Removing unresolved-effect, ownership or native provenance checks would exchange correctness for apparent speed.

## Verification

The original native-access fixture run has exactly three operation-count failures and 34 passing controls: twelve domain polls each read every segment twice, and both complete reports load the effect vector three times. Preserve the preceding sandbox-limited run separately; its process-ownership failures do not establish product defects.

All 47 final focused macOS controls and strict types pass. The twelve domain callbacks now open each current journal segment once; both complete reports call effects.inspect once. Required increment gates remain pending. Tests retain whole-route output, pause/revocation on the next fresh poll, rejection of an old basis after authorized adoption, original generations, unknown/paused process recovery and actual owned Git execution. These controls establish neither native-model acceptance nor complete-route performance.

[◀ Decisions index](./README.md)
