---
name: measure-impact
description: Execute pinned checkpoint queries, retain source-linked actuals and unknowns, and prepare an unsent cross-scope digest.
metadata:
  wholeloop.step: measure-impact
---
# Measure impact

Read worker-handoffs, ask-never-guess, output-contract and impact-evidence.

1. Begin `wl measure begin --for <scope> --checkpoint <name> --json`. Standalone entry supplies the outcome, --owner, --measurement and actual --launched-at. Missing facts are questions. A completed ramp can supply its final confirmation anchor; a launch draft does not prove actual exposure.
2. Read the pinned measurement source and actual learn.report instructions. Default checkpoints are launch/d7/d30; learn.checkpoints changes the list. A custom name needs explicit --after-days. A checkpoint cannot run before due. Optional --qualitative supplies agreed support/feedback/meeting/knowledge queries.
3. Plan `wl measure requests --for <id> --json`. Give one read-only `wl-analyst` each source's exact requests, units, windows and response contract. Start all independent source assignments, then join their native handles; never use fixed sleeps. Return sanitized normalized scalar bodies or explicit unavailable results in wholeloop/impact-read-responses@1. Import with `wl measure observe --for <id> --file <responses.json> --json`.
4. Show source/query hashes, actual windows, baseline/target, actual value, core-computed verdict/delta and missing reasons. Qualitative text stays quoted; it cannot substitute for a metric. The core never invents zero or estimates.
5. Apply repository report guidance through a complete layout of plain headings and metric/qualitative IDs: `wl measure format --for <id> --file <layout.json>`. It cannot omit/duplicate a datapoint or rewrite values. Harness defaults have a built-in layout. Complete with `wl measure complete --for <id> --json`.
6. Resume using report/schedule. Status exposes checkpoint dates; next points at due measurement work. Repeated completed checkpoints retain separate histories.
7. `wl measure digest --for <comma-separated-scope-ids> --json` prepares an unsent draft and per-scope comment blocks. Explicit conductor dispatchImpactDigest may create comms.draft or append a marker-bound document note via same-read docs.update. People review and send. Retained ambiguous writes must be inspected, never retried blindly. The analyst receives no publication interface.
8. Hand back observed results, unknowns and the canonical report to decide-next. Measurements and partial progress do not establish a causal product effect.

Start only the named rendered role with its assignment, required protocol text and result schema. Never fork conversation history or copy the conductor as a worker. Validate each final-message result and submit it from the conductor; checked headless transports already own their submissions.
