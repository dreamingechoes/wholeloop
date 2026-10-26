# 0117 — Owned delivery topic workspaces

- **Status:** Accepted
- **Date:** 2026-10-26

## Context

A delivery plan can describe code units without legacy slice/part/review items. Reusing the supervised worktree entrypoint would require inventing those items or their approvals, and its branch naming does not express an original narrowed delivery prefix. The runner needs an actual owned topic before asking a builder to work. Existing integration assembly already provides positively observed, finite controller Git operations and a persistent effect journal.

## Decision

Add an internal DeliveryWorkspaces controller host with closed request, private record and inspection contracts. Bind one allocation to the original run, exact plan revision, code unit, grant digest and complete committed code-predecessor vector. Require original workspace-create scope, current private derived-plan acceptance when applicable, named repository bases and the original repository topic prefix. Preserve the existing supervised worktree entrypoints and their approvals.

Validate the complete transitive code-predecessor closure and actual committed clean worktrees in dependency order. Pin cross-repository parts without merging them into another repository. Research outputs remain selected worker context; preparing a Git topic cannot assert research completion or satisfy any dependency gate. Merge required same-repository committed predecessors into a fresh owned external topic before implementation. These merges additionally require original git-commit authority.

Reuse DeliveryEffects and the existing AssemblyGitProcess, Git helper refusal, disabled hooks/signing, private native registration, fixed cancellation and original finite budgets. Persist immutable allocation before effects, record each creation/merge intent before invocation and observe exact group closure and resulting ancestry before applying it. A changed base, revocation, occupied path, dirty predecessor or unknown native outcome cannot authorize a new checkout. Preserve branches, conflicts, personal files and old worker worktrees; no cleanup or target merge is performed.

Read-only reconcile observes only already-issued operations. Recovering the exact retained native outcome can apply its original effect without replaying checkout. That read cannot resume the run or dispatch the next step. Explicit execution may continue a positively closed original operation using the existing queued transition, without resetting budgets. A prepared unit cannot silently allocate a second topic through a new key.

Inspection distinguishes initial workspace readiness from QA. Bound private locator reads and reuse the existing environment candidate byte/file/symlink limits before claiming current readiness. A dirty owned candidate can have a new byte snapshot while retaining its original topic head; it has no acceptance or publication authority. Source/input/private binding changes make readiness stale. Omit unavailable optional head/snapshot fields rather than introducing unsupported nullable schema vocabulary or a new validator dependency.

## Alternatives rejected

Fabricating legacy hierarchy or human approvals would change the supervised contract. Using a personal checkout would couple unattended mutations to unrelated work. Trusting a supplied directory, branch name or worker process JSON would omit ownership proof. Repeating a checkout after a lost outcome would risk duplicate effects. Reimplementing native process ownership would duplicate the existing tested boundary.

This increment prepares topics only. Actual candidate commit, fixed domain-host dispatch, public run/reconcile and endpoint completion remain P6-10 technical work. Existing model, environment, gate, manual and hosted acceptance obligations remain separate.

## Verification

Exercise actual disposable Git topic creation, narrowed prefixes, same/cross-repository predecessors, current byte snapshots, dirty owned candidates, occupied paths, unsafe Git helpers, original authority/base changes and pause fencing. Hide the original actual native outcome from its first read, retain its bytes, then recover through a fresh controller without another checkout or resuming execution. Retain initial fixture/schema/continuation failures; complete checks pass 3018 tests in 143 files on macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0. Seven model-free controls and inert schema parity pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5. These are actual Git/process observations and fixture model claims, not live model/account or full-route acceptance.
