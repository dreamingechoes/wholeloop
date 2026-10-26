# Delivery recovery

- ⛔ `delivery-checkpoint-inputs` — pin exact run/plan/attempt and bounded input paths/hashes/sizes in immutable manifests before journaling checkpoints. Verify current bytes on recovery; orphan manifests create no state, authority or semantic acceptance.
- ⛔ `delivery-effect-reconciliation` — retain a scoped finite invocation before one trusted-host action, observe its exact result separately and preserve fixture/controller provenance. Never reissue an issued action; absence needs confirmed invoker termination before not-applied. Unknown outcomes block conflicting writes and successful closure; retry only explicitly transient bounded reads.
- ⛔ `delivery-recovery-ownership` — recover or cancel only exact observed assignment/backend/instance/worker identity. A stop return or reused PID cannot prove termination. Retain reservations and previous gates/budgets; unknown ownership pauses or ends none as blocked without asking a human or starting a replacement.
- ⛔ `delivery-stopped-writer-repair` — ordinary commands never steal locks. Explicit digest-bound repair requires observed absence for the unchanged writer record, serializes repairers and retains the original ownership directory/receipt. Signal no PID, delete no evidence and reconstruct no authority; unknown/live/reused ownership refuses.

- ⛔ `delivery-finite-budgets` — preserve original run/attempt deadlines, finite CI/restart/repair counters, unique artifact reservations and repeated-failure limits across recovery and revisions. Unsupported hard usage caps refuse; missing spend stays unknown and fixture observations stay fixtures. Only a new validated typed result resets no-progress; heartbeats and narration cannot. Never refund or extend a hard allowance implicitly.

- ⛔ `delivery-runner-ownership` — retain original private authority, deadlines and exact stage intent before input. Resume only after positive owned closure; never replay unknown work or signal stored PIDs. Recover published result/checkpoint locators without re-execution. Fixture routes cannot establish native QA, endpoint completion or publication.

The CLI supplies no actual native/backend host automatically. Inspect checkpoints, effects and writer ownership separately; local fixtures do not certify containment, actual QA or operation-specific publication/merge eligibility.
