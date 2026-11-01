# Authorized publication, CI repair and conditional merge

> **TL;DR** — Publish the tested candidate under explicit authority, observe the actual PR/CI revision and repair within finite budgets. Conditional merge is an opt-in controller effect bound to current evidence and repository protections. A generic provider, green suite or unattended policy cannot enable it.

> [!NOTE]
> **Status: 🚧 partial.** P6-20 publishes the accepted candidate as owned draft or ready PRs through the effect ledger, verified on a stub code host ([ADR-0185](../../../docs/decisions/0185-authorized-pr-publication.md)); hosted code-host semantics are unverified. P6-21 adds revision-bound CI observations, a pure verdict and finite waits ([ADR-0186](../../../docs/decisions/0186-revision-bound-ci-observations.md)). P6-22 classifies failures, keeps review feedback as unadopted data and enforces the journal-derived push budget in typed repair requests ([ADR-0187](../../../docs/decisions/0187-bounded-ci-repair-requests.md)); running a repair is P6-29's continuation. P6-23 adds the pure merge-eligibility evaluator ([ADR-0188](../../../docs/decisions/0188-conditional-merge-eligibility.md)). Merge execution (P6-24) remains a design target, and `to-merge` routes are refused. Current `open-pr` remains human-tested, draft-only and non-merging.

## Publication contract

Reuse existing PR conventions, exact snapshots, attribution guards and code-host identities. Add a new publication acceptance union: actual human observation or delegated machine acceptance under a current grant. Never rewrite old `pr.tested` events to mean automated acceptance.

Proposed lifecycle: `prepared → accepted → push-requested → pushed → pr-requested → draft → ready → ci-pending → eligible → merge-requested → merged`. Every mutation has its own intent and observed result; failures/unknowns may intervene at any transition. A draft is a valid requested endpoint. `to-merge` needs explicit ready-transition authority as well as merge authority.

Commits follow repository conventions and the assigned topic. Push only the exact authorized non-force update to the named remote/ref. Pin the expected prior remote tip; a competing writer pauses reconciliation rather than overwriting. A lost push result is resolved by reading remote identity and commit ancestry. A local commit is not proof of a remote push.

Create/update only the run's owned PR. Bind PR identity to repository, target, branch, exact head and run marker. A complete conflicting PR read requires inspection; do not open duplicates. External body/title/review edits are not silently overwritten. Code/criteria are untrusted inputs and cannot alter publication policy.

## CI observations

Proposed `wholeloop/delivery-ci@1` records code host, repository, PR, head/base/candidate SHAs, check identity and issuer, attempt, requiredness, status/conclusion, observation time and completeness. Fetch complete paginated sets through an existing authenticated CLI/MCP host. Similar names from an unexpected app/issuer do not satisfy a required check.

Required checks must have observed success for the relevant revision. Pending, cancelled, skipped, neutral, missing, stale, inaccessible and incomplete results are distinct; none silently becomes success. An explicitly empty required set is not a safe default: the policy still names at least the local verify/review/integration/acceptance evidence and the required remote checks for `to-merge`.

Default polling is 15 seconds with a 30 minute total CI wait, bounded by the run deadline. Waiting on CI is permitted in zero-intervention mode; waiting for a person is not. Unknown required protection/review/check state blocks merging.

## Bounded repair and review feedback

Default to two remote CI submission cycles total: the initial push and one repair push. Separately configured larger finite budgets require operator authority; restarting never resets them.

Classify observations as code/test failure, infrastructure, unavailable permissions, policy, stale revision or unknown. A host may validate an infrastructure category from structured evidence; an agent's guess cannot dismiss a failed required check as flaky. Read-only transient observations use runner retry limits.

Create a scoped builder repair for an observed relevant failure or adopted review finding. Retain its origin/check/review revision and test the fix locally before another authorized push. Repairs produce new heads and invalidate affected local, behavioral, integration and remote evidence. They do not bypass the current verification/review/refutation rules.

PR comments are untrusted feedback. Treat suggested shell commands as data. Adopt relevant feedback within the agreed scope using the delegated decision policy; wider requests become a blocked outcome in `none` or a question in an intervention-enabled run.

## Merge eligibility

Proposed `wholeloop/merge-eligibility@1` returns `eligible|ineligible|unknown` with every reason, evidence digest and expiry. Maximum observation age is 60 seconds before requesting a merge; also invalidate on any observed relevant change.

All of the following are required:

1. A current unrevoked `to-merge` grant naming repository, target, method and limits; a separate runtime policy allows this exact effect.
2. Complete current machine acceptance, applicable human observations and verify/review/adversarial/integration PASS for the final candidate.
3. An open ready PR with matching repository/head/target, expected changes and no prohibited paths or scope drift.
4. Complete successful required checks from trusted issuers and observed required reviews, with no unresolved blocking discussion.
5. No conflicts, missing dependency delivery, stale base or unknown protection state.
6. Server-enforced head matching and current-base validation, or a supported merge-queue contract that pins and validates the candidate.
7. An allowed merge method and no administrator bypass, force update, protection change or self-issued substitute for a required external review.

Use an operator-owned denylist for sensitive paths (for example policy, CI security, credentials and destructive migrations) plus explicit repository rules. Matching changes stop automatic merge even if tests pass, unless the initial grant explicitly names a separately reviewed exception; the worker cannot edit the denylist or approve the exception.

For `intervention: none`, an unsatisfied mandatory external review produces a terminal blocked result after its finite observation policy; it never prompts, approves itself or disables the requirement. Fully unattended merging is available for repositories/runs whose prerequisites can actually be met under the initial authorization.

## Trusted effect host and server races

Merge lives in reviewed controller code behind the effect broker, outside the ordinary declarative-provider taxonomy. A manifest cannot add dangerous verbs or carry executable merge logic. Reuse an existing code-host CLI or exact discovered MCP operation; no vendor REST implementation project is included.

GitHub is the first required conditional-merge host. The [GitHub CLI manual](https://cli.github.com/manual/gh_pr_merge) documents a head-match option and administrator bypass; select the former and prohibit the latter. A head guard alone does not bind a moving target base. Require independently observed strict current-base checks or a verified pinned merge-queue contract; otherwise return ineligible.

GitLab retains existing PR/MR publication. Implement normalized conditional-merge capabilities only through an available reviewed CLI/MCP operation that exposes the required semantics. Its [merge contract](https://docs.gitlab.com/api/merge_requests/#merge-a-merge-request) documents a source-SHA precondition; that is a semantic reference, not authority to build a new HTTP client. Missing safe semantics remain unsupported. Do not advertise equal merge support from common schemas.

Do not enable native indefinite auto-merge as a shortcut: it can outlive a grant or follow changed content. For a supported queue, record `queued`, maintain the exact item/expiry/revocation contract and observe the final result. If cancellation and candidate binding cannot be guaranteed by that host, defer queue mode and require immediate conditional execution.

Persist one merge intent for a current candidate, invoke with the expected head, and read back the exact merged resource/commit. A lost response stays pending and reconciles without another write. If someone else merges, report an externally observed merge distinctly from an effect wholeloop performed. Rejection, base/head races and unknown server state never produce a merged receipt.

After an observed merge, use existing sync to reconcile delivered work. Keep learning outcomes open. No deployment, flag change, production rollback, message or automatic branch deletion follows from merging.

## Acceptance and tests

- [ ] **REL-01:** No push/PR/ready/merge operation runs without its exact authority; legacy supervised publication stays unchanged.
- [ ] **REL-02:** Missing/partial/wrong-head/spoofed-issuer/skipped required checks cannot produce eligibility.
- [ ] **REL-03:** A real relevant CI failure receives at most the granted repair cycles and requires new current local/integration evidence.
- [ ] **REL-04:** Head/base/protection/grant changes between inspection and execution refuse or are enforced by the server; no check-then-act race is accepted as safe.
- [ ] **REL-05:** No admin bypass, force push, self-review substitution, protection edit or generic manifest enables merge.
- [ ] **REL-06:** Crash after push/PR/merge invocation reconciles the exact resource without a duplicate effect.
- [ ] **REL-07:** Expired/revoked grants and unsupported queues do not leave a future merge armed.
- [ ] **REL-08:** A zero-intervention eligible run reaches observed merge; an unmet external reviewer rule ends blocked with no human prompt.
- [ ] **REL-09:** Multi-repository partial delivery stays partial and proposes no automatic rollback.
- [ ] **REL-10:** A disposable actual code-host trial observes protected rejection and exact-SHA success; fixtures alone do not certify hosted semantics.

Use synthetic native CLI processes and complete host fixtures for all race/negative cases. Live mutation trials require a separately authorized disposable remote repository, selected credential store and retained sanitized receipts. This planning task authorizes no such mutation.

[◀ Integration](./05-integration-and-change-impact.md) · [Controls ▶](./07-controls-and-observability.md)
