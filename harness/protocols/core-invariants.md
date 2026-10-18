# Core invariants

The deterministic CLI owns these rules; skills consume the returned contracts.

- ⛔ `external-runtime-state` — keep all runtime state outside repositories,
  including worktrees and symlinked destinations. Project configuration is an
  explicit settings action, not runtime state.
- ⛔ `recorded-step-skips` — skipping a step requires a durable reason, visible
  in subsequent preflights.
- ⛔ `required-human-decisions` — retain required decisions after completion or
  skip; approval applies to one revision and never becomes a reusable default.
- ⛔ `profile-preserves-coverage` — interaction dials change communication and
  concurrency, while retaining checks, lenses, questions and the output contract.
- ⛔ `history-without-tool-attribution` — validate commit messages before they
  enter history; attribution to tools is rejected without rewriting authorship.
