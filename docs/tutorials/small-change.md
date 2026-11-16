# A small change — criteria, worktree, gates and your testing

> **TL;DR** — Pick a bounded behavior in an application you can run. Agree on observable criteria, let the builder work in its allocated Git worktree, inspect verification/review evidence and test it yourself before deciding whether to publish. Larger initiatives can join the same path after framing, specification and scope approval.

> [!NOTE]
> **Status: ✅ implemented.** The build, worktree, gate and publication contracts used here are tested. Model behaviour and remote publication depend on your client and providers.

## Choose a change you can verify

Use a disposable or intended application repository with a normal test command and a known base branch. Avoid trying to build a task application inside the wholeloop implementation checkout unless that is actually your project.

For example, an existing task app might need to reject an empty title. The following criteria are illustrative; agree on the exact behavior your application needs before adopting them:

| Criterion | Observable test |
| --- | --- |
| Submitting an empty title creates no task | Repository test asserting no create/save call |
| The user sees an actionable validation message | UI/component test plus your actual UI check |
| A normal title still creates a task | Existing happy-path test remains green |
| Whitespace behavior is defined explicitly | Agree whether whitespace-only titles count as empty before writing that test |

The builder should load the repository's own test/build guidance. Do not invent a test command, expected UI or application structure that is absent from the repository.

## Start directly with the build skill

In the coding client's conversation:

```text
Use wl-build-slice for a small fix: reject an empty task title in this app.
Show the existing behavior and agree on acceptance criteria first.
Load this repository's build/test guidance and show the plan before edits.
Use the allocated worktree, run verification and review, and stop for my
local testing. Do not push, open a PR, merge or deploy in this exercise.
```

Use the matching installed prefix on your client; Antigravity uses `wl-agy-build-slice`. This is a standalone entrypoint: a small agreed fix does not need a fabricated research brief, specification or large initiative. [Standalone routing](../flow/build/build-slice.md).

## Inspect the preflight and implementation plan

Expect the criteria, base/repository context, selected build/test guidance, assigned worktree and the checks needed before completion. Resolve ambiguous guidance explicitly. The harness should not replace your conventions with whichever generated skill happens to be found first.

Save the returned slice ID, workspace path and relevant run/gate IDs. Confirm that the worktree contains the intended branch and change. Independent slices/parts have separate allocations; your application checkout does not need to be switched by the builder.

## Read the evidence, not just the verdict

| Stage | Inspect | A useful stopping condition |
| --- | --- | --- |
| Build | Changed files and implementation plan against the agreed criteria | Scope drift or an unagreed behavior |
| Verification | The actual declared command, execution receipt, results and missing coverage | A failed/unavailable check or unsupported claim of success |
| Review | Findings against the current patch and repository rubric | A material finding that remains open |
| Gate collection | Complete assigned coverage and valid worker outcomes | Crashed/timed-out/invalid workers or missing evidence |
| Human handoff | Workspace path, what to run and remaining limitations | You cannot reproduce the behavior locally |

A worker crash is not a refutation. Gates report findings; the builder repairs them within the round budget. When the budget is exhausted, a stop with unresolved findings is an honest outcome, not permission to drop a lens or invent a pass. [Verification](../flow/build/verify-works.md) · [Review](../flow/build/review-code.md) · [Gate rules](../architecture/orchestration-and-gates.md).

## Test it yourself before publication

Open the reported worktree and run the repository's actual local setup/test instructions. Exercise the empty-title case, the normal-title case and any explicitly agreed whitespace behavior. Report what happened and which revision you tested.

If it needs another edit, return that observation to the builder and repeat relevant checks on the new revision. Approval of an earlier patch does not approve later changes.

The local exercise can finish here. When you deliberately want a draft PR, request the `wl-open-pr` skill with the exact tested work. Publication pins its plan and needs human testing/approval; a pending or lost remote result is reconciled rather than blindly repeated. The harness does not merge. [Draft publication](../flow/build/open-pr.md).

## Use the full flow for a larger feature

Start with `wl-next` or `wl-frame-problem` when the problem or solution is not agreed yet:

| Stage | Request | Person's decision/evidence |
| --- | --- | --- |
| Frame | `wl-frame-problem` | Evidence/hypothesis distinction, owner outcome and exact final revision |
| Specify | `wl-write-spec` | Approve actual stories, criteria, measurement plan and assumptions |
| Cut deliverables | `wl-cut-scopes` | Approve independently shippable boundaries and metric ownership |
| Slice | `wl-slice-work` | Review vertical slices, tests, dependencies and contract-first parts |
| Build | `wl-build-slice` | Follow the worktree/gate/testing sequence above |
| Prepare rollout | `wl-prepare-launch` | Review launch drafts and measurement readiness; nothing is sent |
| Ramp | `wl-ramp-exposure` | Decide each stage; external flag changes remain explicit and separate |
| Measure | `wl-measure-impact` | Real source-linked observations, or owned unknowns when unavailable |
| Decide | `wl-decide-next` | Keep, iterate, kill or unflag based on the evidence shown |

Merging, deployment, sending messages and changing flags remain external actions. Source and destination providers are selected when needed; you do not need accounts with every vendor. A measurement exception or skipped step must be explicit and recorded, not silently assumed because the example is small. [Complete flow](../flow/README.md).

## Other useful standalone requests

| Need | Request in the coding client | Stop at |
| --- | --- | --- |
| Examine evidence before choosing a feature | Use `wl-research` on the question, with unknowns retained | The brief and its limitations |
| Inspect an existing branch | Use `wl-review-code` against its actual base; do not edit or publish comments | Evidence-backed findings |
| Understand unfinished work after a restart | Use `wl-status` for the actual ID | Read-only state and pending decisions |
| Continue that work deliberately | Use `wl-next` with the same ID | The next required decision |

For direct shell inspection use [core commands](../architecture/core-cli.md), not the native skill names. For setup or missing state, use [troubleshooting](../troubleshooting.md).

<!-- docnav -->
[◀ Local core tour](local-core.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Troubleshooting ▶](../troubleshooting.md)
