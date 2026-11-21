# Core invariants

The deterministic CLI owns these rules; skills consume the returned contracts.

- ⛔ `read-only-change-feed` — use stable committed reads, acknowledge only delivered activity, keep liveness separate from progress and retain explicit provenance. A feed writes no store state, opens no listener and grants no authority or approval.
- ⛔ `verified-overview-prefix` — verify both journal positions and prefix digests before accepting a resume cursor; reject edited, truncated, unknown-version or malformed prefixes. A cursor grants no authority.
- ⛔ `external-runtime-state` — keep all runtime state outside repositories, including worktrees and symlinked destinations. Project configuration is an explicit settings action, not runtime state.
- ⛔ `recorded-step-skips` — skipping a step requires a durable reason, visible in subsequent preflights.
- ⛔ `required-human-decisions` — retain required decisions after completion or skip; approval applies to one revision and never becomes a reusable default.
- ⛔ `descriptive-event-attribution` — keep optional actor metadata role-specific and explicitly sourced. Agent actors cannot supply person channels or private human rationales; attribution never grants authority. Bound private reasons and omit them from default diagnostics, projections and exports.
- ⛔ `profile-preserves-coverage` — interaction dials change communication and concurrency, while retaining checks, lenses, questions and the output contract.
- ⛔ `history-without-tool-attribution` — validate commit messages before they enter history; attribution to tools is rejected without rewriting authorship.

- ⛔ `docs-settled-decisions` — published ADR references need one explicit Accepted/Superseded metadata declaration, resolvable settled successors and no supersession cycle. Metadata validation is not native-platform evidence.
