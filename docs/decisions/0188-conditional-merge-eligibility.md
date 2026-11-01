# 0188 — Conditional merge eligibility

- **Status:** Accepted
- **Date:** 2026-11-01

## Context

A `to-merge` run may merge only when the exact candidate is authorized, fully evidenced and protected by the server against a moving head or base. Unattended intervention, an autopilot setting or a green test suite must never stand in for merge authority. The decision has to be explainable: every reason a candidate cannot merge yet must be visible.

## Decision

Add `mergeEligibility`, a pure evaluator that returns a `wholeloop/merge-eligibility@1` result: `eligible`, `ineligible` or `unknown`, every reason, an evidence digest and an expiry. Any refusal makes the result ineligible, any gap makes it unknown, and only a complete set of current proofs is eligible.

1. **Authority.** An active grant with the `to-merge` endpoint, `pr.ready` and `pr.merge`, the candidate's repository and target, an allowed method and an unexpired deadline, plus a separate runtime policy that allows this merge.
2. **Evidence.** Current acceptance and passed verification, review, refutation and integration for the final candidate; unsatisfied human observations refuse.
3. **Pull request.** One open, ready PR at the candidate head and target on GitHub, the first and only merge host. Changed files are checked against the operator-owned denylist, and only an exact path the operator listed as an exception passes.
4. **Checks and reviews.** The revision-bound CI verdict for this PR at the candidate. A failure or missing required review refuses; pending checks, unknown protection or reviews and untrusted issuers stay unknown. Unresolved discussions refuse, and unknown discussions stay unknown.
5. **Conflicts and dependencies.** A conflict, an undelivered dependency or a stale base refuses; unknown values stay unknown.
6. **Server binding.** Branch protection must enforce strict current-base checks; without it the candidate is ineligible.
7. **Forbidden requests.** An admin bypass, a force operation, a protection change or armed auto-merge makes the candidate ineligible.

Observations older than 60 seconds refuse, and the result expires 60 seconds after its oldest observation or at the grant's expiry, whichever is earlier. Other code hosts report `unsupported-merge-host` until one is implemented and observed on its own. Merge queues are not supported, so queue mode is never inferred. Executing the merge is P6-24.

## Alternatives rejected

Inferring merge permission from `none` intervention or green checks would turn a delivery policy into a merge grant. Treating unknown protection or reviews as empty would let a permission gap pass. A worker-editable denylist would let the change under review approve its own exception.

## Verification

Table-driven cases cover:

- the eligible baseline and its expiry;
- 32 ineligible mutations across every rule, including green tests without a merge grant;
- 10 unknown mutations, including a spoofed issuer;
- exact sensitive-path exceptions;
- the path matcher.
