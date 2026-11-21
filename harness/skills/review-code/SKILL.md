---
name: review-code
description: Review a slice, branch or host-resolved PR through fixed lenses using the agreed repository rubric and incremental round input.
metadata:
  wholeloop.step: review-code
---
# Review craft

Read worker-handoffs, headless-gates, ask-never-guess, output-contract, gate-rounds and review-input. Read speaking-to-person.

1. Use `wl review begin --for <slice-or-part> --json`. A standalone branch uses its name, a named comparison `--base` and explicit `--owner`. Missing ownership, base or host-resolved PR head becomes a question before mutation. Do not invent earlier criteria, build or verification results.
2. Read `wl review input --for <id> --json`. It returns the exact private patch, actual review.rubric content and previous kept findings. Round one compares against the pinned base; later rounds compare against the previous snapshot, including uncommitted changes. Do not replace it with a full branch diff.
3. Dispatch every returned jobs entry to its named read-only `wl-reviewer` with only that assignment. Start all independent jobs, then join their handles using the native wait primitive; never use fixed sleeps. Recheck previous blockers against the current code; retain unresolved findings with evidence. The incremental patch narrows new inspection, not existing obligations.
4. Submit results through the gate, refresh review input for its self-contained examinations, then start independent `wl-reviewer` refuters and join their native handles before submitting the votes. Missing evidence or changed files cannot establish PASS. Seal with `wl gate verdict --for <id>
   --gate review --json`. Route red findings to the builder within the recorded budget. Reviewers never repair code or silently reset a failed run.
5. After a standalone PASS, call `wl review complete --for <id> --json`. The receipt requires pinned input and a current review PASS after this step began.
6. Only if a person requests a PR comment, draft `wl review comment-plan --for
   <id> --pr <url> --json` and call the configured codehost.comment-pr operation through the host. The CLI draft does not publish. Keep the idempotency key and inspect ambiguous remote outcomes before retrying. Never approve, request changes, push, merge or post comments by default.
7. Keep human testing separate and name any actual inaccessible evidence.

For labelled regression evaluation read gate-evaluation; export blind inputs and collect actual independent observations before interpreting quality rates.

When the conductor explicitly selects headless, use `wl fanout run review --for
<id> --engine headless --progress --adapter claude|codex|opencode|copilot|cursor --json` after the same planned inputs are pinned. The process host submits results/refutations and seals the same core verdict; continue with this skill's completion/handoff instead of dispatching workers twice.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
