---
name: maint-close-task
description: Close a finished roadmap task in this repository - criteria, evidence, journal, status notes, counts, generated references and the final gate. Use when a task's code, tests and docs are done and need to be recorded.
---
<!-- Generated from maintainer/ by npm run maintainer:render; edit the source instead. -->

# Close a roadmap task

## Check the criteria honestly

1. Re-read every acceptance criterion. Tick one only when something you ran shows it; name the test or command.
2. A criterion that needs the maintainer's accounts, a hosted service or a native client is not ticked by fixtures: leave its evidence in `roadmap/manual-verification.md` and say so.
3. A criterion you narrowed is written as narrowed, with the reason, never quietly dropped.

## Record

- In the phase file: set the status to ✅ and add an **Evidence** paragraph under the criteria: what ran, what passed, what was narrowed.
- In `roadmap/journal.md`: a new entry at the top, `## <date> · <task> ✅ · <title>`, a few bullets on what changed, what was decided and rejected, and the verification result.
- In `roadmap/README.md`: run `node scripts/roadmap-status.mjs` and copy its completed and open counts; `npm run check` fails when they disagree.
- Status notes of every page the task changed move in the same change: add, update or remove the Experimental, Partial or Design note (see `docs/contributing/docs-style.md`).

## Regenerate

- `npm run docs:references` after a command, configuration or provider change.
- `npm run docs:nav` after editing `docs/nav.yml`.
- `npm run maintainer:render` after editing `maintainer/`.
- `npm run providers:catalog` after editing `harness/providers/`.

## Gate

Run `VITEST_MAX_WORKERS=2 npm run check` and read only its last line. Record `CHECK PASS in <n>s` and the test count in the journal; on `CHECK FAIL (<step>)`, fix the cause and run it again. Say which platforms were not run.

## Hand over

Prepare a Conventional Commit message with a body explaining why, what was rejected and what was verified, lines of at most 72 characters, no backticks or shell substitutions and no tool attribution. Show it; committing and pushing are the person's decision, and this skill does neither.
