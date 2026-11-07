---
name: maint-check
description: Run the repository's gates and report the final CHECK PASS or CHECK FAIL line. Use before any commit or when a contributor asks whether the tree is green.
---
<!-- Generated from maintainer/ by npm run maintainer:render; edit the source instead. -->

# Check the repository

1. Before each commit run `npm run check:fast`; before a push or when a task closes run `npm run check`. On a busy machine use `VITEST_MAX_WORKERS=2 npm run check`.
2. Read only the final line. `CHECK PASS` or `CHECK PASS (fast)` means every step passed; `CHECK FAIL (<step>)` names the first failing step.
3. On a failure, report the step and the lines of output that explain it. Fix the cause, never the test that found it, and run the gate again.
4. Never report the tree green from a partial run, a single test file or an earlier result.

The steps and their order live in `scripts/check.mjs`; this skill does not restate them.

This skill never commits, pushes or changes repository settings.
