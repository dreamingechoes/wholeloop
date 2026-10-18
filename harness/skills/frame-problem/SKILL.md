---
name: frame-problem
description: Capture a rough idea as an owned wholeloop initiative and a local framing artifact. Use before writing a spec when the problem needs a clear statement.
metadata:
  wholeloop.step: frame-problem
---
# Frame a problem

Read the shared ask-never-guess and output-contract protocols.

1. Call `wl step begin frame-problem --input "<idea>" --owner "<person>" --json`.
   Omit unknown values so the core can return its batched questions. For an
   existing initiative, pass `--for <id>` instead of creating another one.
2. Handle exit 2 by collecting explicit answers at their returned scopes and
   rerunning begin. Exit 3 means a precondition is unmet; exit 4 means invalid
   input. Preserve the distinction and show what must change.
3. Show the returned preflight and profile style. Inspect `bindings.frame.template`;
   load its selected repository guidance when it is not the harness default.
4. Draft a concise Markdown artifact outside the repository. Include non-empty
   `## Problem` and `## Owner` sections. Separate observed evidence from hypotheses;
   record missing evidence and who can answer as TBD. Do not manufacture data.
5. Call `wl step complete frame-problem --for <id> --artifact <path> --json`.
   Fix returned shape findings before reporting success. The core journals the
   artifact and rebuilds readable projections in the external store.
6. Show the receipt, remaining unknowns and `wl next <id> --json`. Stop if the
   next step is unavailable or requires a human decision.

This is the minimal local framing path. Research escalation, duplicate adoption
from URLs, no-go outcomes, eight-question framing and external publication are
later workflow features; do not claim to have performed them.
