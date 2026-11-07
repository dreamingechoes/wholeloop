---
name: maint-start-task
description: Start the next roadmap task in this repository the way AGENTS.md prescribes. Use when someone asks to continue the roadmap, pick up the next task or begin a named task such as P7-05.
---
<!-- Generated from maintainer/ by npm run maintainer:render; edit the source instead. -->

# Start a roadmap task

The working agreement is `AGENTS.md`; this skill is its session loop, not a replacement for it.

## Orient

1. Read `AGENTS.md`, the newest entries of `roadmap/journal.md` (newest first) and `roadmap/README.md`.
2. Open the phase file of the task, or of the first open task if none was named.
3. If a memory or notes tool is connected, search it for the task ID and its decisions before deciding anything.

## Pick

- A named task is taken as asked. Otherwise take the first ⬜ task whose dependencies are all ✅.
- A task marked ⏸️ waits on something outside the repository (accounts, a hosted service, a native client); say what and pick the next one.
- If every remaining task needs the maintainer, stop and list what each one needs.

## Prepare

1. Confirm the tree is clean and on the expected branch with `git status`; never discard someone else's changes.
2. Run `npm ci` if dependencies changed, then `npm run check:fast` to know the starting state. A red start is reported before any work begins.
3. Read the task's goal, deliverables, acceptance criteria, tests and docs list. Read the ADRs it names and the code it touches before writing anything.

## Decide

- An internal design choice is decided conservatively and recorded: in an existing ADR when it changes that design, in the journal when it is minor. Do not open a new ADR for each fix.
- Stop and ask only for choices that widen authority, credentials or who can approve; for publication or real pushes to hosted services; or for work that needs signed-in clients or model accounts. Everything else proceeds under stated assumptions.

## Work

- One task end to end: code, tests and docs in the same change.
- Every hard rule needs an enforcer in `enforcement.yml`; harness files stay within their budgets.
- New or changed code must not make existing paths slower: no processes in loops, no repeated identical queries, no rewrites of identical bytes. Read `roadmap/performance-audit.md` before touching runner or store hot paths.

When the work is done, use `maint-close-task`. This skill never commits, pushes or changes repository settings.
