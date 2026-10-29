# 0157 — Complete current unit vectors before assembly

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

Whole-product assembly needs every unit required by the selected milestone, its prerequisite milestones and their transitive work dependencies. A caller-selected subset can omit a producer; independent unit flags can also refer to different or changed candidates. Passing unit QA still cannot establish combined application behavior.

## Decision

Compute the complete dependency-ordered unit closure with the existing deterministic integration scope. Use a copied map of fixed joint-QA readers from the same canonical store. Require every code unit's original passing observed verification and independent review, and select its exact current owned receipt through the fixed correction lineage. Produce only the required ordered worktree/branch/head vector; callers cannot supply a subset. Research or otherwise unavailable code scopes remain blocked or unknown.

After inspecting all units asynchronously, recheck every earlier candidate and both original root records, then recheck the plan basis. Missing readers, unavailable QA, changed bytes, changed records and unsupported scopes return no parts. Inspection dispatches no worker, suite, Git operation or assembly and changes no journal, allowance, deadline or acceptance state. Even a ready vector explicitly leaves integration QA and feature acceptance unestablished.

## Alternatives rejected

Caller-selected parts omit required dependencies. Passing stage flags do not reopen actual original QA. Returning each part immediately can retain an earlier candidate that changed during a later asynchronous read. Calling a unit-ready vector an integrated pass skips assembly, contracts and whole-product behavior.

## Verification

Exercise missing and partial reader coverage, pending QA and unknown milestone scopes without a selector, parts or journal mutation. Inspect an actual retained two-correction candidate from a fresh process: require the complete exact milestone vector, refuse changed bytes without returning a partial vector, restore them and recover the identical original proof without replay or acceptance. Retain unit/predecessor and frozen-contract regressions. Record actual results before commit; metadata inspection does not establish a new complete delivery execution or authenticated models.

All four admission controls pass on macOS Node 24.22.0. Fresh-process metadata inspection of the actual retained two-correction candidate recovers its complete exact vector, refuses changed bytes and returns identical evidence after restoration without selectors or journal changes. Complete isolated Linux checks pass 3337 tests in 173 files and all remaining checks; this does not establish new integrated application behavior or authenticated models.
