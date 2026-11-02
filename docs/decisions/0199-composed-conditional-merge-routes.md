# 0199 — Composed conditional merge routes

- **Status:** Accepted
- **Date:** 2026-11-02

## Context

[ADR-0188](./0188-conditional-merge-eligibility.md) explains whether an exact candidate may merge, and [ADR-0189](./0189-conditional-merge-execution.md) performs one expected-head merge with read-back. Neither was reachable from a run, so `to-merge` routes were refused before dispatch. Composing them raised three questions:

- Where does the operator's merge policy live, so that no worker can edit it?
- Which complete reads feed eligibility?
- How do CI waiting and merging fit the fixed dispatcher without inferring anything from a green suite?

## Decision

- **Policy in the plan, bound by the grant.** `plan.policy.merge` holds the method, the required checks with their trusted issuers, the sensitive-path denylist and exact exceptions. It is required for `to-merge` and refused for every other endpoint. Because every grant binds the exact policy, the merge policy is part of what an operator authorizes and nothing a worker produces can change it. The granted method is the policy's method.
- **Route.** A `to-merge` route continues after acceptance with `publication`, then `ci`, then `merge`, then `handoff`. Publication requires `pr.ready`, so a merge route never stops at a draft.
- **CI stage.** For each published repository, the controller waits finitely and read-only for revision-bound CI at the published head ([ADR-0186](./0186-revision-bound-ci-observations.md)). Only passing checks from trusted issuers pass. A failure retains its typed repair request ([ADR-0187](./0187-bounded-ci-repair-requests.md)) and fails the stage. Checks that stay pending, unreadable or untrusted until the deadline block the stage.
- **Merge stage.** Immediately before each repository's single merge, eligibility is computed from:
  - the active grant and its effects;
  - the installed runtime allowance;
  - this request's passed verification, review, re-verification, integration and acceptance records on the current basis, with re-verification counting as refutation;
  - one fresh CI observation;
  - complete pull-request facts.

  `GithubCliMergeFactsHost` reads the facts separately: draft state, mergeability, every changed file against the reported count, every review-thread page, the repository's allowed methods and whether the head is behind its base. Each fact that is denied, malformed or beyond its bound becomes unknown and keeps the candidate from merging; nothing becomes an empty list. The merge itself goes through `RunnerMerger` and its effect ledger. The stage passes only when every repository's merge effect applied as the run's own.
- **Handoff and endpoint.** The handoff and the `merged` endpoint re-read each PR. A merge counts only when it is at the exact head and was made by the run's authenticated actor; someone else's merge is never claimed.
- **Runtime allowance.** The dispatcher refuses a `to-merge` route at static preflight unless its installed merge stages carry an explicit `allowsMerge`. A plan or a grant alone never merges. The public `wl delivery run` host composes no publication or merge stages, so a merge needs a controller that installs them deliberately.

## Alternatives rejected

- Putting the merge policy in host configuration would let it diverge from what the operator granted.
- Treating unreadable files, discussions or method settings as empty would merge past a permission gap.
- Merging straight after publication would ignore CI at the exact head.
- Inferring success from a merged PR would claim another person's merge.

## Verification

Dispatcher-composed cases on a stub code host, CI host, facts host and merge host cover:

- the route order;
- static refusal without the runtime allowance;
- passing CI, one exact-head merge, the handoff and the `merged` endpoint, with no second merge on re-inspection;
- a CI failure that retains its repair request and never reaches the merge;
- refusals with no merge for a sensitive path, unknown discussions, a stale base, unknown mergeability, a disallowed method, a draft PR and incomplete evidence;
- someone else's merge, never handed off.

A mutation that makes eligibility always pass fails the seven refusal cases. Stub-executor cases check complete file and discussion pagination, and that short file lists, hidden settings, pending mergeability and unreadable comparisons become unknown.

No hosted repository was used. The protected-repository and exact-SHA trials remain separately authorized acceptance.
