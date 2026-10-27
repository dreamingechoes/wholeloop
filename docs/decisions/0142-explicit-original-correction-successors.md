# 0142 — Explicit original correction successors

- **Status:** Accepted
- **Date:** 2026-10-27

## Context

The root candidate reader pins the initial owned commit and correctly refuses a later HEAD. After an original correction checkpoint, independent QA needs to select its exact successor without adopting arbitrary commits or treating prior findings as resolved. Historical parent auditing now supplies the missing original receipt proof.

## Decision

Allow an explicit fixed RunnerRepairCommits reference when selecting a root candidate. Keep the ordinary initial-candidate path unchanged. Require the same private store and exact runtime checkpoint class; a caller-selected callback cannot attest lineage. Construction remains deferred: the Git and correction adapters reference each other but perform no cross-module construction at import time.

Let the actual workspace effect journal choose the current receipt. Match that immutable record to a correction binding belonging to the exact request/plan/unit and original QA invocation. Reopen original production and native closure, audit the original parent receipt and require it to belong to the initial root commit. Require the current receipt's direct parent to match that original head. File ordering and timestamps select nothing.

Recheck owned workspace registration, branch, lock/state, exact files/index and stable snapshot through the existing current commit inspector. Reopen the authoritative current receipt after inspection. A locked, changed, unrelated, ambiguous or unbound head refuses. Selection changes no journal, pointer, budget or gate state.

This supports selection of the first original correction for upcoming QA. It does not enable arbitrary multi-commit chains, rerun gates, approve findings, mark progress or wire the public complete route. Existing strict production and gate bindings remain intact until their explicit continuation work.

## Alternatives rejected

Adopting the latest file or HEAD loses original production authority. A matching commit checksum without original parent/native proof is insufficient. Changing default candidate selection would silently broaden existing callers. Checking files without reopening owned workspace state accepts a locked worktree. Reusing the old gate's verdict approves code it did not inspect.

## Verification

Extend the real correction/commit control through explicit successor selection. Keep ordinary selection refused, reject an unrelated original record, locked workspace and changed bytes, then restore exact ownership/bytes and select the same receipt. Retain lost-locator paused recovery, original cancellation and pending QA. Run ordinary root Git/commit/repair/frozen regressions and the same complete synthetic control on macOS and Linux/Node 20. Record actual outcomes in the journal; no whole-route or native-account acceptance is inferred.

Four-file regressions pass 441 cases. All three complete synthetic controls pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5 with identical compiled code, including parent, lock and byte refusals and paused recovery. The final CLI schema matches exactly across those runtimes; static/docs/package checks pass. Fresh gate continuation remains implementation work.
