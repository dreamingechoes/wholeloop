---
name: build-slice
description: Build agreed slices in isolated workspaces with repository guidance, visible plans and bounded verify/review gates, then hand back for human testing.
metadata:
  wholeloop.step: build-slice
---
# Build a slice

Read ask-never-guess, output-contract, build-execution, gate-rounds and environment-effects.

1. Call `wl build route [<scope|slice|part|issue-url|sentence>] --json`. Ask missing
   questions together. For a scope use its ready leaf candidates and declared
   dependencies; do not close work just to bypass a dependency.
2. For a sentence or issue, collect observable criteria with falsifying tests and
   explicit agreement. The host reads an issue through the selected tracker and
   pins its complete reference/revision; partial or pending reads remain unknown.
   Call `wl build agree "<deliverable>" --owner "<person>" --by "<person>"
   --criteria <wholeloop-criteria.json> --json`; for issues also pass the observed
   `--issue <url> --revision <revision>`. The CLI itself does not authenticate/read it.
3. Show `wl build preflight <leaf-id> --json` before provisioning. Read the loaded
   repository/user guidance and resolve ambiguous slot choices. State pace,
   workspace mode and gate budgets. Every pace keeps both gates and all criteria.
4. Prepare with `wl build prepare <id> --base <named-branch> --json`, or explicitly
   stack with `--after <predecessor-id>`. Retain the returned run and basis snapshot.
5. Ask the builder for wholeloop/builder-plan@1 from `wl build schema --json`.
   Record it with `wl build plan <id> --file <plan.json> --basis <snapshot> --json`
   before code changes. Show its steps/tests/assumptions. Unknown or contradicted
   assumptions stop for `decision.approve-build-plan`, answered by the person.
6. Use the shared build workflow with a host engine, or execute its same journaled
   actions: builder implements only in the allocated path; verify then review run
   read-only through the pinned gate contracts. Repair red findings within budget.
   After a review repair changes bytes, verify must pass again before review.
7. Preserve pending units across resume. At EXHAUSTED, show the kept findings and
   offer a person-requested extension; never reset the failed run. Stop requests
   prevent new assignments; the host owns cancellation of already-running workers.
8. Call `wl build complete <id> --json`. The core rejects missing/stale gates and
   constructs its receipt. Report actual files, tests and environment writes.
   Finish at human testing through `wl worktree open`; no push or PR here.

Declare external writes with explicit non-secret undo argv/cwd via `wl env declare`
and include `wl env report --for <id> --json` in the hand-back. Recipes are not
observed cleanup: never execute them automatically on completion or stop.
