# Evidence-backed synchronization

- ⛔ `sync-exact-merges` — Certify only complete matching published PR identity, repository, source/base and commit, with merged=true/state=merged/draft=false. Missing/unmerged/mismatched reads never close work. Every repository part needs evidence; manual closure does not establish scope delivery.
- ⛔ `sync-delivery-outcome` — Scope delivery readiness requires every certified slice. Route to rollout without closing the human learning outcome. Reopening invalidates old closure/publication eligibility until a new tested PR plan.
- ⛔ `sync-tracker-recovery` — Require explicit provider/reference/state and a certified basis. Read a complete revision-bound current state, journal intent before transition, then observe the desired state. Reconcile ambiguity through reads and preserve later external edits; never repeat an uncertain write.
- ⛔ `sync-conservative-cleanup` — Reuse owned stopped/clean/locally merged worktree pruning outside the state lock. Retain active/dirty/unmerged work and branches; do not stop worker processes or force removal.

Keep imported observations labelled and preserve source references and pending handoffs.
