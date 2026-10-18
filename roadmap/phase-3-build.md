# Phase 3 — Build

> **Outcome** — A scope becomes vertical slices; each slice is built in its own worktree following the repository's own skills, verified and reviewed until green within a budget you control, tested by a person, and opened as a draft pull request.

---

## P3-01 · `slice-work`

**Status:** ✅ · **Size:** L · **Depends on:** P2-04

**Goal** — Vertical, sequential slices with criteria before code.

**Deliverables** — slice and part model, `blocked-by` dependencies, contract-first parts for multi-repo slices, slicing checks (challenger in slicing mode plus structural lint), tracker mirroring with links.

**Acceptance criteria:**

- [x] A slice with two user-visible outcomes or no end-to-end demonstration is flagged (fixtures).
- [x] A slice spanning N repositories produces at most N parts, the contract part first.

**Docs** — flow/build/slice-work.

## P3-02 · Worktree manager

**Status:** ✅ · **Size:** M · **Depends on:** P1-03

**Goal** — Parallel builds that never touch the person's checkout.

**Deliverables** — `wl worktree create|open|stop|list|prune`, branch naming, named base recorded, stacked branches for chained slices, port range allocation per worktree, `build.workspace: checkout` opt-out.

**Acceptance criteria:**

- [x] Two slices of the same repository build in parallel worktrees without interfering (integration test on a fixture repo).
- [x] The person's checkout is unchanged — branch, index and working tree — after any build (test).
- [x] `prune` removes only worktrees whose branches are merged or explicitly abandoned.

**Docs** — flow/build/build-slice, ADR-0013.

## P3-03 · Gate engine

**Status:** ✅ · **Size:** L · **Depends on:** P1-05

**Goal** — Gate decisions are arithmetic in the core, not opinions in a prompt.

**Deliverables** — lens registry (built-in + manifests, `applies-when`), round budgets (defaults verify 4 · review 3; project, run and mid-run extension; range 1–10), refutation quorum, fail-safe lenses, deterministic aggregation, `wl gate plan|submit|verdict`, worktree-unchanged check after each round.

**Acceptance criteria:**

- [x] Workflow tests with stubbed agents cover: pass, fail, quorum drop, fail-safe keep, silent verifier, budget exhausted, budget extended.
- [x] Reaching the budget never yields PASS.
- [x] Disabling a built-in lens without a reason fails config validation.

**Docs** — architecture/orchestration-and-gates, ADR-0014.

## P3-04 · `build-slice` and the `builder`

**Status:** ✅ · **Size:** L · **Depends on:** P3-02, P3-03, P1-07

**Goal** — The self-routing build entry, following the repo's skills.

**Deliverables** — routing (scope, slice, issue URL, sentence, nothing), ad-hoc slice creation with agreed criteria, preflight with bindings, `builder` agent with plan-before-code, pace handling, gate loop until green, stop before any PR.

**Acceptance criteria:**

- [x] Bound repo skills for `build.<area>` appear in the preflight and are loaded by the builder (conformance scenario).
- [x] A free-text fix runs the same gates as a planned slice.

**Docs** — flow/build/build-slice.

## P3-05 · `verify-works`

**Status:** ⬜ · **Size:** M · **Depends on:** P3-03

**Goal** — Does it work, and does it solve the problem?

**Deliverables** — suite detection via `verify.suite`, run-once per round, one verifier per criterion or test group, "could this test fail?" check, standalone on a branch or PR.

**Acceptance criteria:**

- [ ] A changed test that cannot fail is reported (fixture).
- [ ] Standalone on a PR without criteria asks for them instead of inventing them.

**Docs** — flow/build/verify-works.

## P3-06 · `review-code`

**Status:** ⬜ · **Size:** M · **Depends on:** P3-03

**Goal** — Is it well written, by this repository's standards?

**Deliverables** — six built-in lenses, rubric via `review.rubric`, incremental diff from round 2, optional PR comments through `codehost`.

**Acceptance criteria:**

- [ ] Round 2 receives only the diff since round 1 (test).
- [ ] A repo review skill bound to the slot is used as the rubric.

**Docs** — flow/build/review-code.

## P3-07 · `open-pr` and code-host providers

**Status:** ⬜ · **Size:** M · **Depends on:** P3-04

**Goal** — A draft PR per repository, only after a person tested it.

**Deliverables** — **test it** decision via `wl worktree open`, GitHub (`gh`) and GitLab (`glab`) providers, PR convention via `open-pr.convention`, links to slice and tracker, hand-back of environment writes.

**Acceptance criteria:**

- [ ] No push and no PR before the **test it** decision is recorded (test).
- [ ] The PR body follows the repo template when one exists and carries no tool attribution.

**Docs** — flow/build/open-pr.

## P3-08 · Guards — `wl guard` and git hooks

**Status:** ⬜ · **Size:** M · **Depends on:** P1-11

**Goal** — The few things that must never happen are blocked everywhere.

**Deliverables** — normalised hook payload parser, policies (no commit to the default branch from a build, no push outside `open-pr`, no harness write inside a repo), per-CLI hook registration, git hooks for CLIs without usable hooks.

**Acceptance criteria:**

- [ ] Payload fixtures from every tier-A CLI parse to the same normalised event.
- [ ] Each policy is tested through both the CLI-hook path and the git-hook path.

**Docs** — architecture/core-cli (hooks and guards), ADR-0006.

## P3-09 · Environment ledger

**Status:** ⬜ · **Size:** S · **Depends on:** P1-03

**Goal** — Anything touched outside a repository can be undone.

**Deliverables** — `wl env declare|report`, undo commands recorded per slice, receipt integration.

**Acceptance criteria:**

- [ ] Every declared write appears in the receipt with its undo command.

**Docs** — flow/build/build-slice, flow/build/open-pr.

## P3-10 · Gate eval corpus

**Status:** ⬜ · **Size:** M · **Depends on:** P3-05, P3-06

**Goal** — Know each lens's false-positive and false-negative rates.

**Deliverables** — labelled snippets (real defects + look-alikes) per lens, eval runner reporting before and after verification.

**Acceptance criteria:**

- [ ] Per-lens confusion matrix produced on demand; baseline recorded.

**Docs** — architecture/determinism-and-testing.

---

[◀ P2](./phase-2-define.md)  ·  [Roadmap](./README.md)  ·  [P4 ▶](./phase-4-rollout-learn.md)
