# 0177 — Review re-entry verification

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

The runner route verifies a unit, then reviews it. Review may keep a finding and commit an owned correction, so the reviewed head can differ from the head that verification passed. Unit readiness then correctly refuses, because the original verification no longer attests the current head, but the route had no stage that could verify the corrected head. Passed stages are immutable and keyed by stage id, so the engine cannot re-run `verification:<unit>` itself.

## Decision

Add a fixed route stage `reverification:<unit>` of kind verification after `review:<unit>`, with the unit's criteria. Later work units and milestones now wait for both `review:<unit>` and `reverification:<unit>`. The fixed verification adapter handles it in two ways.

- **Unchanged head.** When the original verification still reopens as passed at the exact current head, the re-entry consumes a binding, records an attestation of that original observation and head, registers core metadata work and passes. It adds no suite, model, gate round or environment, and later reads require the same original evidence and head.
- **Corrected head.** Otherwise, including when the original cannot reopen at the new head, the re-entry runs the existing verification path on its own subject: a fresh verify gate run whose suite must execute in an environment holding the corrected head. The original verification run, its rounds and budget stay untouched.

Correction continuations stay bound to the original verification and review stage ids, so a failed re-entry does not start another correction loop; it remains a failed or blocked stage. Unit readiness prefers a passed re-entry that follows review and otherwise keeps the original verification, so existing direct compositions still work when review made no correction. Milestone readiness rechecks the re-entry record too. Stop also accepts re-entry records.

Every route gains this stage. The project has no deployed runs, and existing route assertions stay true because dependents still wait on review.

## Alternatives rejected

A new runner event that reopens a passed stage would add meaning to the closed v1 runner event family and erase the immutability that recovery relies on. Re-running verification inside the review adapter would couple two fixed domains and hide the stage from the route. Reusing the original verification subject would consume or overwrite its round budget and make its historical verdict unreadable. Borrowing the original verdict for a changed head would bless untested bytes.

## Verification

Unit cases refuse re-entry before verification and review pass, with no binding, gate run, native call or journal change; refuse damaged attestation locators; and limit stop to verification stages. The route test asserts the stage, its dependencies and its criteria. The model-free Docker evaluation passes both modes: a review correction followed by fresh verification on a new subject and environment, and an unchanged head attested without work. Evidence is in the journal.
