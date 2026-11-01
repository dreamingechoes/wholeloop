# 0186 — Revision-bound CI observations

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

Conditional merge must know which exact revision passed which trusted checks and which repository requirements apply. Code hosts return check runs by name, across retries and apps, with paginated and permission-filtered results. A green-looking summary can hide a check from another head, an app that merely reuses a name, a skipped or cancelled run, a truncated page set or protection rules the token cannot read.

## Decision

Add the `wholeloop/delivery-ci@1` observation, a pure verdict, a finite poller and a GitHub read host. Nothing here merges or edits anything.

- **Observation.** One record holds the code host, repository, PR, candidate, PR head and base, the time, whether the check set is complete, every check run with its issuer, attempt, head, status and conclusion, the protection rules (`observed` or `unknown`) and review requirements (`observed` or `unknown`). Absent values are omitted rather than defaulted.
- **Verdict.** `ciVerdict` is pure.
  - It returns `unknown` for an incomplete set, unknown protection, a PR head other than the candidate or an empty required set; an empty set is never a safe default.
  - The required set is the protection rules plus the operator policy's checks, each with a trusted issuer. A rule without an issuer counts only through the policy's named issuer.
  - For each required check, only runs at the candidate from that issuer count, and the latest attempt decides. The states `pending`, `failure`, `cancelled`, `skipped`, `neutral`, `missing`, `stale`, `wrong-issuer` and `unknown-issuer` stay distinct.
  - The result is `passed` only when every required check succeeded, `failed` on any failure, `pending` while the rest are pending and `unknown` otherwise. Reviews are `satisfied`, `unsatisfied` or `unknown`.
- **Waiting.** `RunnerCiObserver` polls every 15 seconds for at most 30 minutes, inside the run deadline, with an injectable clock. Pending checks, checks not yet created, unreadable reads and partial sets are observed again; every other verdict settles, including unknown protection. The wait ends as `settled`, `deadline` or `cancelled` and never asks a person. Each observation is retained, content-addressed, in the run's store.
- **GitHub reads.** `GithubCliCiHost` reads through the installed `gh` client:
  - the PR head and base;
  - every check-run page at the candidate, up to ten pages, marking the set partial when the count falls short;
  - branch protection, where a denied or failed read is unknown;
  - the latest review per reviewer, where only approvals at the candidate count.

Composing the wait into merge routes belongs to P6-23 and P6-24.

## Alternatives rejected

Matching checks by name alone would let any app satisfy a required check. Treating an unreadable protection response as "no rules" would turn a permission gap into eligibility. Polling without a total bound would leave unattended runs waiting forever.

## Verification

- Table-driven verdict cases cover success, queued, in-progress, failure, timeout, cancelled, skipped, neutral, other-head, spoofed-issuer, missing and retried checks, a spoof beside a trusted result, partial sets, unknown protection, a moved PR head, an empty required set, issuer-less rules and review states.
- Fake-clock cases poll pending checks at 15-second intervals until they settle, end at the run deadline or the 30-minute bound, retry unreadable reads, settle filtered protection as unknown, refuse another candidate and stop on cancellation.
- Stub-executor cases paginate complete sets, map issuers, attempts and approvals at the candidate, and mark a short page set partial and denied protection unknown.

No hosted code host was used.
