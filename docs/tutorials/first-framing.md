# Your first framing — from a hypothesis to a recoverable decision

> **TL;DR** — Run one framing in your coding client, answer the fixed questions honestly, review the exact final draft and choose an outcome. A completed on-hold result is a successful exercise. Restart the client and verify that the same decision is still there.

> [!NOTE]
> **Status: 🚧 partial.** The core's exact owner-decision rendering, reviewed finalization and state recovery are implemented. This is a native practice procedure, not a transcript or a passing report for every client. Existing observations are scoped in [V1 acceptance](../v1-acceptance.md).

## Before you start

Complete [getting started](../getting-started.md) for your chosen client. Use a real application repository with a small idea, or create a disposable project for the explicitly fictional scenario below. Do not run the fictional task-app example from the wholeloop source checkout and expect it to find a product task list there.

For a fresh exercise project, run in a terminal with `WHOLELOOP_CLI` already exported:

```bash
demo_project="$(mktemp -d "${TMPDIR:-/tmp}/wholeloop-framing.XXXXXX")"
git -c init.templateDir= init --quiet --initial-branch main "$demo_project"
printf '# Fictional task application\n\nThis repository is a framing exercise, not an implemented or validated product.\n' > "$demo_project/README.md"
cd "$demo_project"
```

Start your chosen coding client here. Its account, model and project trust use its normal native setup. This exercise does not need a remote analytics/document/tracker account.

## 1. State the context and stopping point

Select/request the managed `wl-frame-problem` skill. Use `wl-agy-frame-problem` on Antigravity. If you installed the separate Claude plugin rather than loose skills, its entrypoint is `/wholeloop:frame-problem`.

```text
Use wl-frame-problem for a fictional task application used only to test
the harness. The idea is title search in a long task list.
I am the owner; ask for my name if needed. This is an unvalidated
hypothesis with no user evidence. Mark the scenario as fictional.
Complete framing only. Keep missing facts as owned TBDs, obtain my
outcome and approval of the exact final reviewed draft, and stop before
specification, code or remote publication.
```

These lines are a request in the native conversation, not a shell command. For a real application, replace the fictional premise with its actual surface, users and evidence.

## 2. Check the preflight

Before drafting, expect the client to show the initiative/run, your owner identity, selected `frame.template`, local/remote destinations and the stopping point. The default template is valid when your repository has no specific framing guide. It should not treat another installed copy of wholeloop as product guidance.

If it cannot identify the application, give context rather than letting it invent one. If it asks to research first, decide whether that is useful for this exercise; unknowns can remain unknown, and the scope is still framing only.

## 3. Answer the eight questions

Use your actual answers for real work. For the fictional exercise, this answer set deliberately contains no invented validation:

| Question | Exercise answer |
| --- | --- |
| Problem | We hypothesize that people struggle to locate tasks in long lists; nobody has observed it yet |
| Who it is for | People with many tasks; the threshold and segment size are TBD |
| Evidence and hypothesis | No evidence. Separately test whether retrieval is difficult and whether remembering the title is useful |
| Expected impact | Reduce time to locate a task without increasing failed searches; baseline, target and method are TBD |
| Who validated it | Nobody. I will organize validation; do not invent a participant or responsible role |
| Cost and priority | Low priority and not scheduled; effort is TBD |
| Stop conditions | Propose conditions for me to approve; do not silently adopt the challenger's suggestions |
| Scope hint | Consider title search only; matching behavior and implementation remain undecided |

Provide your owner name separately. For missing evidence, the artifact should use `TBD: <missing evidence>; who: <person or role>`. Ask to review any new role assignment before treating it as an agreed owner. No numeric baseline, interview, ticket or validation should appear merely to complete a field.

## 4. Review the draft and the challenger's findings

Read the problem, evidence/hypothesis separation, impact and decision rules. Check that every factual claim is supported or explicitly unknown. In particular, stop/reopen/drop conditions must reflect your decisions, not additional restrictions the client introduced while revising the document.

The challenger should inspect the final content, including problem, evidence, impact and decision fidelity. If a later edit resolves findings, that new revision needs review again. `problems: []` from a structural checker is not proof of semantic review, and a reviewer must not be fabricated.

## 5. Choose the outcome and approve exact wording

| Outcome | Supply | Expected continuation |
| --- | --- | --- |
| Go | Your reason and the exact approved stop conditions | Framing completes; a spec handoff is available, but this exercise still stops here |
| On-hold | A reason and the exact condition for reopening | The initiative closes, retaining the condition; no next step runs |
| Dropped | A reason | The initiative closes; no next step runs |

For the exercise, an honest on-hold decision can be:

```text
Choose on-hold. Reason: there is no evidence that the retrieval problem
exists or that title search would solve it.
Reopen when: user evidence confirms difficulty locating tasks and allows
title search to be evaluated.
Do not add segment-size thresholds, extra prerequisites or automatic drop
rules. Show the exact final text after review before completing it.
```

Approve the exact final revision when it matches your intent. The canonical skill uses `frame draft` to render only approved decision data and `frame finalize` to bind completion to that draft's digest and review. The core checks matching metadata; it cannot authenticate a person or prove that the model's semantic judgment is true. [Framing reference](../flow/define/frame-problem.md#final-decision-and-review).

## 6. Inspect the receipt

Save the actual initiative ID and inspect:

- The stored artifact is outside the repository and matches the final approved draft.
- `frame-problem` is completed, with the correct owner and exact outcome/reason/reopening condition.
- For on-hold/dropped, status is `closed`, with no active next step. The subtype may be visible in the completion receipt/record rather than the generic status field.
- For go, the receipt may offer a spec handoff; the client still stops before starting it because you limited this exercise.
- Local docs/tracker receipts reference local records. There is no fabricated remote URL or publication.

If the decision wording changed, ask for correction and another final review before completion. If it was already stored, preserve that evidence rather than rewriting history to make the original run look successful.

## Recover in a new session

Close the client, open it again in the same project and request `wl-status` for the actual initiative ID. Ask for read-only status first, not `wl-next`.

For an independent terminal check, export the core path again from the wholeloop checkout, then paste your actual receipt ID:

```bash
export INITIATIVE_ID="paste-the-returned-init-ID"
node "$WHOLELOOP_CLI" status "$INITIATIVE_ID" --json
node "$WHOLELOOP_CLI" state get "$INITIATIVE_ID" --json
node "$WHOLELOOP_CLI" resume "$INITIATIVE_ID" --json
```

Use the same store environment as the original session. The recovered owner, completed framing and decision should agree. Reading status does not mark messages as read. A closed/on-hold result is not an implementation failure, and a fresh session must not reopen it automatically.

## What counts as finishing this tutorial

You have exercised framing questions, an explicit decision, final review and recovery. That is narrower than validating every skill, independent role isolation, native hook denial, remote services or a complete go/spec/build flow. Record client/version, the observed result and limitations if you contribute acceptance evidence; use [V1 acceptance](../v1-acceptance.md#what-evidence-to-return).

Next: [a small change](./small-change.md), [the framing reference](../flow/define/frame-problem.md) or [troubleshooting](../troubleshooting.md).

<!-- docnav -->
[◀ Getting started](../getting-started.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Local core tour ▶](local-core.md)
