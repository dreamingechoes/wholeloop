# 0189 — Conditional merge execution

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

After [ADR-0188](./0188-conditional-merge-eligibility.md), the controller can explain whether an exact candidate may merge. Performing the merge is a single irreversible remote effect. A lost response must not lead to a second merge, a head or base race must leave the candidate unmerged, and a merge someone else performed must never be reported as the run's own. A merge must never use administrator bypass, auto-merge, a force operation or a protection change.

## Decision

Add `RunnerMerger` over the existing effect ledger and a fixed `RunnerMergeHost` interface.

- **Per repository.** The merger first reads the PR. A PR already merged or queued by someone else is reported as `externally-merged` or `queued`, never claimed. Otherwise eligibility is evaluated freshly. Anything other than a current `eligible` result stops the run before an effect is prepared.
- **One intent.** A `pr.merge` effect binds the candidate head, branch and eligibility evidence; the grant must include `pr.merge`. The host merges with the expected head and the operator's method.
- **Read-back.** The effect applies only when the PR is merged at the exact head by the run's own authenticated actor. A PR still open at the head means the server refused, for example on a head or base race, and the repository is `ineligible` with `server-refused-merge`. A merge by anyone else stays unknown for the effect and is reported as `externally-merged`. A lost response is reconciled by reading; the merge is never invoked again.
- **Outcomes.** `merged`, `externally-merged`, `queued`, `pending` and `ineligible` stay distinct, and a mix of merged and unmerged repositories is `partial`. Nothing proposes a rollback, and nothing after a stop is attempted.

`GithubCliMergeHost` runs `gh pr merge` with `--match-head-commit` and the method flag. It never passes `--admin`, `--auto` or `--delete-branch`. It reads the PR and the authenticated actor through `gh api`.

`to-merge` routes stay refused before dispatch. Composing them still needs complete reads of changed files, mergeability, discussion resolution, allowed methods and base currency for the eligibility input. Merge queues are not supported. Both steps remain in P6-24.

## Alternatives rejected

Retrying a merge after a lost response could merge a later head. Treating any merged state as success would claim another person's merge. Arming native auto-merge would leave a merge that outlives the grant. An administrator bypass would ignore the protections that eligibility relies on.

## Verification

Stub merge-host cases cover:

- an eligible single merge with its expected head;
- no effect for ineligible and expired eligibility;
- external merges and queue entries reported without a write;
- a lost response reconciled with one merge;
- a concurrent foreign merge kept distinct;
- a server refusal that stops and is never retried;
- a partial multi-repository delivery with no rollback;
- refusal without the merge effect.

A stub-executor case checks the exact `gh pr merge` arguments and the absence of bypass, auto-merge, force and branch deletion. No hosted code host was used.
