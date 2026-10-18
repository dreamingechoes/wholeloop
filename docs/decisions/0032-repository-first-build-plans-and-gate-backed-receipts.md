# 0032 — Repository-first build plans and gate-backed receipts

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

A build must follow repository guidance and agreed criteria whether it starts from
planned work or a sentence. Prompt-only instructions cannot preserve the plan,
paused decisions, partial gate rounds or the evidence behind a green receipt.

## Decision

- Route scopes to ready leaf slices/parts and retain dependency order. Ad-hoc work
  creates a slice directly after explicit criteria agreement, without inventing an
  initiative, spec or scope. A host issue read must return the same reference,
  complete body and revision; criteria still need agreement. CLI agreement records
  the supplied reference/revision and does not pretend to authenticate or fetch it.
- Resolve repository/user/config build slots, suite, rubric and commit convention
  before provisioning. Load selected instruction content, bounded to local files
  under 1 MiB, into the host context. Persist references/digests, not copies of
  repository instructions, as build runtime state outside the repository.
- Start the build step and allocate its worktree before asking the builder for a
  versioned plan. Compare the prepared code snapshot before recording that plan.
  Unknown/contradicted assumptions require approve-build-plan on that exact plan
  event. A revised plan invalidates the old assumption approval.
- Implement through a typed host; inspect through the independent gate contract.
  Repair verify failures, then review failures, rerunning verify when review repair
  changes code. Respect journaled budgets and existing partial results on resume.
  Exhaustion never extends the budget or spends another builder attempt on resume.
- Guided pace schedules one builder/worker at a time; staged schedules builders in
  parallel with an exclusive whole-round gate lease; parallel fans out both.
  Dependency waves are selected again after green results. The host owns worker
  isolation and cancellation of work already running.
- Complete only when both gates passed after the latest plan on the same current
  repository snapshot. Construct the canonical receipt in the core, including human
  testing still pending. Direct step completion cannot substitute authored claims.
  A green build unblocks dependent work without closing an item still awaiting PRs;
  a later active rebuild blocks it again. Stacking refuses uncommitted predecessor
  files rather than silently omitting them from the branch.
- Observe the personal checkout around host actions in worktree mode. A violation
  preserves files and fails explicitly. The checkout opt-out intentionally writes
  there. No core path in this workflow pushes or creates a PR.

## Alternatives considered

Creating fake Define ancestors for a one-line fix adds unperformed work to the
record. A direct agreed slice retains ownership and the same gates without that
fiction. Treating successful tests as completed human testing would erase the
owner's final decision, so the receipt keeps that step pending.

Rebuilding when resuming a partial gate changes the very code under examination.
Resume retains its plan and submitted units instead. Changing concurrency by
removing checks would violate ADR-0010; scheduling changes only their overlap.

## Consequences

Typed host fixtures exercise actual temporary Git workspaces and synthetic workers.
They do not prove live CLI isolation, semantic code quality or authenticated tracker
normalization. Hosts must present the preflight before provisioning and enforce
workspace-scoped write tools. Snapshot boundaries retain ADR-0031's limitations.
Suite execution and incremental review are delivered by their own workflows.

[◀ Decisions index](./README.md)
