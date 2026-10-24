# Integrated milestones and requirement changes

> **TL;DR** — Passing isolated parts is insufficient for a multi-part feature. Pin an assembled candidate, execute its complete behavior and invalidate only evidence whose declared inputs changed. Preserve old plans and require renewed authorization when intent or authority changes.

> [!NOTE]
> **Status: 📐 design.** Accepted design target for P6-18–P6-19 and P6-29. Existing DAG, contract-first parts, worktrees and criterion checks remain authoritative.

## Milestones and candidate identity

A milestone contains an explicit set of required parts, acceptance criteria, repositories, contract revisions and integration procedures. Validate cycles, unknown dependencies, duplicated ownership and uncovered outcomes before scheduling.

Proposed `wholeloop/integration-candidate@1` contains the plan revision, milestone ID, repository vector of source/base/topic SHAs, exact assembly commits, environment/recipe/data digests, acceptance-plan digest and required gate evidence. Hash a canonical representation to identify the complete candidate.

Only committed part revisions are assembled. Refuse dirty or uncommitted predecessor work rather than silently omitting it. Create a disposable integration branch/worktree through the controller; never switch the user's checkout or update the real target branch.

Initial assembly supports a declared ordered merge strategy. Conflicts produce a recorded repair assignment with the same criteria and a bounded revision budget. Do not automatically reset/rebase worker branches, force-push or discard conflict edits. A changed assembly commit is a new candidate.

## Integration validation

Run the combined application, required contracts and whole-milestone acceptance against the candidate vector. Independently green frontend/backend parts may still fail together. Record endpoint, protocol/schema versions, seeded state and data transitions where relevant.

Integration findings route to their owning part or an explicit cross-part repair. A repair gets a new part revision and invalidates downstream dependent candidates. Keep previous failures; no finding disappears because its original worker ended.

The first 1.0 implementation supports multiple local repositories with explicit identities and sequential cross-repository publication. It does not provide an atomic transaction across code hosts. Each repository keeps its own publication/merge receipt. Partial completion pauses for a recovery decision and never claims the whole feature merged.

## Invalidation matrix

| Change | Required response |
| --- | --- |
| Criterion text/expected behavior or source requirement | New plan revision and coverage analysis; only explicitly delegated in-envelope revisions may proceed without another owner action |
| Wider repository/tool/effect scope or weaker policy | Revoke old authority; issue a new explicit grant |
| Implementation bytes | Invalidate affected suite/behavior/gate results and integration candidates |
| Acceptance definition, fixture data or environment recipe | Invalidate cases using it and every dependent aggregate |
| Target base advances | Assemble and verify a new candidate if the grant permits base refresh; otherwise pause |
| Unrelated artifact presentation only | Preserve execution evidence only when its complete declared input set is unchanged |
| Required check/protection/rubric changes | Recompute publication/merge eligibility; never retain a stale green decision |

The plan digest always changes when its content changes. Evidence reuse is a deterministic dependency calculation, with an explanation of kept and invalidated entries. Unknown dependencies invalidate conservatively. Model judgment may propose affected areas but cannot establish reuse eligibility.

## Requirement change workflow

Proposed `wl delivery revise` accepts a fresh complete source observation and produces an impact report: changed/removed/added criteria, affected parts, evidence, active workers, PRs, pending effects and authority changes. It is preview-only until explicitly accepted.

Pause new affected assignments. Fence/stop affected workers through the runner; preserve their edits and reconcile already requested effects. A source changing while a run is active does not silently become the approved request. Remote comments are context until the operator explicitly adopts them as a requirement or feedback assignment.

An accepted revision links its predecessor and reason. Removed criteria retain their history and require explicit operator approval; a zero-intervention revision envelope cannot authorize dropping required outcomes merely to pass. Current human decisions apply only to the basis they actually approved; delegated decisions name their policy and exact basis separately.

## Cross-repository merge policy

For 1.0, `to-merge` defaults to a single repository. Multiple-repository plans finish at PR handoff unless the operator explicitly grants an ordered, backward-compatible delivery sequence with per-repository integration/protection evidence. If the host cannot establish the required sequence safely, remain at handoff.

Already observed merges cannot be undone transactionally. A later failure records partial delivery and proposes a human-reviewed fix/revert; no automatic production rollback or speculative compensating write occurs.

## Acceptance and tests

- [ ] **INT-01:** Independently passing parts with an incompatible API fail the milestone's actual combined behavior.
- [ ] **INT-02:** Dependency waves preserve contract-first ordering; cycles and uncommitted predecessors refuse assembly.
- [ ] **INT-03:** Changing a criterion, recipe, base or part invalidates the exact affected evidence and all dependent candidates.
- [ ] **INT-04:** Unaffected evidence reuse requires matching complete inputs and reports its reason.
- [ ] **INT-05:** Conflict repair preserves personal/worker files and cannot silently force-push or omit a required part.
- [ ] **INT-06:** Two-repository partial publication/merge never yields whole-feature success or an automatic rollback.
- [ ] **INT-07:** Source changes during execution produce an explicit revision proposal; stale workers/effects cannot use new authority.

Use actual disposable Git repositories for branching/conflicts/assembly, local frontend/backend contract fixtures for behavior and generated DAG cases for invalidation. Remote ordering/protection requires its own observed code-host trial.

[◀ QA](./04-behavioral-qa.md) · [Publication ▶](./06-publication-ci-and-merge.md)
