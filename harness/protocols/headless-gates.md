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
- ⛔ `headless-gemini-core-tools` — restrict Gemini's actual core registry and
  disable alternate tool/agent/MCP/hook surfaces through private worker policy.
  Refuse existing managed settings, preserve system defaults and native trust/auth,
  and never substitute confirmation grants for a positive registry restriction.
- ⛔ `headless-antigravity-ready` — hold AGY assignments until bounded reported
  initialization names only the selected read tools/workspace and strict native
  permissions. Use a private observer/hook and one fresh matching successful turn;
  missing/refused readiness never receives a bootstrap prompt or counts as evidence.

Plan a gate first. Verification requires its actual once-per-round suite before
read-only fan-out. Select headless explicitly and use an available recipe; current
local recipes cover all seven clients; AGY requires read-only init before input.
Run `wl fanout run review|verify --for
<id> --engine headless --adapter <client> --json`. Apply no automatic repair or
budget reset. A failed round needs the existing explicit gate planning path.

Inspect worker metadata in the external store; stdout/stderr and prompt bodies
are not retained by this transport. Unknown stale locks require inspection of
owner.json and confirmation that its process stopped, never automatic theft.
Recipe help probes and synthetic processes do not establish real client isolation,
MCP/managed policy behavior, authenticated output normalization or Linux conformance.
