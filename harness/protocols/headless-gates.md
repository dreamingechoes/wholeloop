# Headless gates

- ⛔ `headless-exact-assignment` — bind every result/vote to the exact run, round,
  assignment digest and unit or finding/verifier; validate public gate schemas
  before submitting through the existing gate workflow.
- ⛔ `headless-bounded-workers` — use one shell-free process per assignment, stdin
  prompts, explicit read-only/non-interactive client settings, bounded concurrency,
  time/output limits and process-group cancellation. Reuse no conversation.
- ⛔ `headless-failure-unknown` — failed, unavailable, invalid or cancelled workers
  cannot produce active refutations. Preserve observed repository edits and stop;
  only the deterministic gate aggregator may decide coverage, quorum or verdict.

Plan a gate first. Verification requires its actual once-per-round suite before
read-only fan-out. Select headless explicitly and use an available recipe; current
local recipes cover claude, codex, opencode and copilot. Run `wl fanout run review|verify --for
<id> --engine headless --adapter <client> --json`. Apply no automatic repair or
budget reset. A failed round needs the existing explicit gate planning path.

Inspect worker metadata in the external store; stdout/stderr and prompt bodies
are not retained by this transport. Unknown stale locks require inspection of
owner.json and confirmation that its process stopped, never automatic theft.
Recipe help probes and synthetic processes do not establish real client isolation,
MCP/managed policy behavior, authenticated output normalization or Linux conformance.
