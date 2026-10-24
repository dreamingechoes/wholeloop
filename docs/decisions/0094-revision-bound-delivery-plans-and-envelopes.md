# 0094 — Validate delivery plans independently of execution authority

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Source intake preserves what was requested but cannot establish who builds each behavior, whether separate parts agree on a contract, or which policy a later worker must obey. A fully unattended flow also needs an initial request envelope before a detailed plan exists. Reusing old human approval events for these proposals would misrepresent their provenance.

## Decision

1. Add closed delivery-plan, delivery-envelope and planning-record contracts. Plans retain existing optional item IDs and coordinate work without creating another hierarchy. Store immutable numbered plan revisions and content-addressed envelopes externally through the existing lock/atomic-write boundary. A new revision pins its predecessor digest; conflicting replacements and damaged records are refused. Delivery lifecycle journal events remain P6-04 work.
2. Require at least one observable criterion and required outcome. Preserve every source-mapped criterion's exact ID/text. Each criterion has exactly one work owner; every outcome, unit and criterion has milestone coverage. Distinguish machine acceptance from retained human acceptance. Reuse the existing criterion lint and dependency-cycle checker rather than building a parallel parser.
3. Bound plans to 100 units, 16 repositories and 1000 criteria. Validate known dependencies, unique contract producers, consumed contract IDs and producer ancestry. Milestone dependencies must also cover their work's predecessors. Compute deterministic dependency waves with memoized ancestry so dense valid DAGs remain bounded.
4. Bind exact canonical repository roots, named target refs, initial SHAs, guidance/rubric descriptors, policy, capability descriptors and finite budgets. Preparation observes local Git roots, bases and explicitly named remotes without fetching or writing. Distinct worktrees of one common repository cannot masquerade as independent repositories. Historical reads validate stored structure/digests without requiring the current branch or remote to match an old observation.
5. Keep endpoint and intervention independent. A defined feature proposes build directly without fabricated Define approvals. Missing intent proposes permitted delegated Define/research, needs-input when intervention is allowed, or blocked in none. Human-only acceptance blocks none. Routing describes a proposal, never actual worker execution or acceptance.
6. An envelope conservatively fixes source, owner, outcomes/exclusions, repositories, guidance, policy and supplied capabilities; derived plans may reduce finite budgets and remain within work/criterion/revision limits. Structural fit does not establish semantic fit. Later independent challenge, grants and the P6-29 revision policy retain their own obligations.
7. Planning binds supplied guidance/capability descriptors without claiming their content was loaded or the runtime capability was observed by this controller. Assignment-time hosts must load and verify the pinned material and effective capabilities. A proposal cannot promote caller JSON into execution evidence or an operator grant.

## Consequences

Plans can be reviewed and recovered without a model, authority or a client account. A blocked proposed route is still inspectable. All receipts state not-granted/not-started. Existing item events, human decisions, thirteen steps and public contracts retain their meaning. Native execution, policy decisions, authorization, full behavioral acceptance and hosted effects remain subsequent increments.

The current envelope fit is deliberately conservative: even semantically equivalent rewritten intent changes its basis. A later explicit revision policy may evaluate a new bounded revision with independent evidence; this increment never silently adopts changed source requirements.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Create slices and fake Define approvals while importing | Conflates planning with accepted product decisions and execution |
| Infer graph edges or assign uncovered criteria automatically | Hides missing ownership and contract dependencies |
| Trust current branches or remote URLs without pinning SHAs | Cannot identify the plan's original basis |
| Revalidate current bases while reading history | Makes old proposals unreadable precisely when their basis changes |
| Execute models or vendor fetchers during planning | Adds effects and permission dependencies to deterministic contract validation |
| Treat structural envelope fit as semantic approval | A well-shaped plan may still misunderstand the original intent |

## Links

- [Planning tutorial](../tutorials/delivery-plan.md).
- [Expanded contract](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md).
- [Source intake](./0093-immutable-delivery-source-intake.md).

[◀ Decisions index](./README.md)
