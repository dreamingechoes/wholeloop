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

- ⛔ `headless-native-policy-files` — stage only named bounded non-secret policy
  in the unique external worker directory. Preflight every output, preserve existing
  files and reject symlink roots/parents/files. Launch no client after setup failure.
- ⛔ `headless-cursor-read-tools` — Cursor workers use Ask, sandbox and explicit
  shell/write/web/MCP denials plus a fail-closed read/search-only preToolUse hook.
  Read responses grant nothing; unknown tools, bad context or unavailable hooks deny.

Plan a gate first. Verification requires its actual once-per-round suite before
read-only fan-out. Select headless explicitly and use an available recipe; current
local recipes cover claude, codex, opencode, copilot and cursor. Run `wl fanout run review|verify --for
<id> --engine headless --adapter <client> --json`. Apply no automatic repair or
budget reset. A failed round needs the existing explicit gate planning path.

Inspect worker metadata in the external store; stdout/stderr and prompt bodies
are not retained by this transport. Unknown stale locks require inspection of
owner.json and confirmation that its process stopped, never automatic theft.
Recipe help probes and synthetic processes do not establish real client isolation,
MCP/managed policy behavior, authenticated output normalization or Linux conformance.
