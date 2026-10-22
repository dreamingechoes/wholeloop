# Evidence-bound exposure

- ⛔ `ramp-exact-evidence` — Preserve each query, provider, operation, UTC window, timezone and unit. Missing/incomplete/nonnumeric reads remain unknown; zero is observed only when supplied by the source. Recompute thresholds in the core.
- ⛔ `ramp-human-stages` — Every stage needs a named person's reason and exact observation basis. Required unknown/failing evidence blocks go; optional open checks need explicit acknowledgment. Advance only after a separate matching flag read or an explicit manual-control attestation.
- ⛔ `ramp-propose-only` — Read flags or propose a change with apply=false. Never apply/toggle flags. Journal proposal intent before dispatch; retain ambiguity instead of repeating an uncertain write. Reject recognized mutation routes.
- ⛔ `ramp-window-control` — Evidence cannot predate confirmed exposure. Changed or unreadable control blocks go. Restoration starts a fresh full lookback window.

Read-only snapshots do not prove continuous cohort stability between observations. Real authentication, server proposal semantics and actual changes need owner checks. Use client MCP for remote reads after inspecting its actual tool/schema and wl provider plan. Follow source-evidence for unavailable reads: no automatic HTTP fallback. Proposals stay native and unapplied; inspect an ambiguous outcome rather than selecting another transport or repeating a write.
