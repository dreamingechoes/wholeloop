# 0098 — Recover checkpoints and reconcile observed effects conservatively

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

A killed controller can leave an orphan manifest, a committed journal with stale projections, an owned worker or an external write without its response. Replaying a possible write or releasing an unobserved process would create duplicate work. Existing human decisions, exhausted gates and legacy lock ownership must retain their meanings. Complete unattended recovery needs machine-verifiable ownership and explicit terminal limitations when that evidence is unavailable.

## Decision

1. Add independent checkpoint, effect and recovery event/facet families and closed input/artifact schemas. Keep all earlier declarations unchanged. Reuse the external delivery transaction and descriptor-bound input reads, extending the latter to hash binary inputs without copying their bytes into state.
2. A checkpoint pins its run/plan/key/stage, optional exact attempt and bounded input paths, byte counts and SHA-256 values. Write an immutable content-addressed manifest before its event; an orphan manifest grants nothing and can be reused only byte-identically. Repeated exact capture is idempotent. Inspect manifests and current inputs independently; changed/missing inputs prevent resume. A checkpoint label is metadata, never semantic approval or human testing.
3. Prepare an effect against current private grant/digest, exact plan, scoped operation/repository/ref/head, input digest and optional current attempt. Persist an opaque invocation and finite deadline before invoking the trusted host once. Retain host admission provenance/evidence and count issued invocations against the grant's effect limit across restarts. Default/native eligibility remains a separate host responsibility; this generic ledger adds no vendor API or worker-side mutation method.
4. Invoke outside the journal lock and recheck live authority/fencing immediately before handoff. The host owns one bounded, conditional operation; it must enforce actual branch/resource ownership and operation-specific preconditions. An invocation return is not proof of application. Record an exact scoped observation separately; fixtures stay fixtures, controller errors stay controller-observed and neither can become human acceptance. Generic effect application does not establish QA, PR eligibility or endpoint completion.
5. An issued action never becomes executable again, including after a timeout, crash or observed absence. Pending/unknown actions block conflicting new intents, plan replacement and successful completion. Only an unissued prepared intent can be abandoned. Reconcile reads the same immutable identity and resource; missing/mismatched evidence remains unknown. A not-applied result requires confirmation that the original invocation stopped: absence while a writer is still running or unobserved cannot justify a retry. Later repair workflows must explicitly plan any newly authorized action.
6. Use bounded host calls and cancellation signals. Only explicitly transient reads retry, with 5/15/45 second backoffs within a finite window; denied access, malformed output, unknown failures, rollback and deadlines do not retry. Read-only reconciliation of an already issued identity can use a fresh 90-second inspection window after grant expiry/revocation, without renewing execution authority or invoking a write. Actual runner polling/aggregate accounting remains the next budget/host increments.
7. Recover workers only through a trusted backend observation bound to the exact queue assignment and recorded backend/instance/worker identity. A stop return is insufficient: independently observe terminal state before settling, fencing or retrying. Unknown/reused identity retains its reservation and sends no signal. Supervised recovery pauses; none returns blocked without asking a human or entering waiting-input. Retain checkpoint failures, gate rounds/budgets, workspaces, findings and effect ambiguity.
8. Keep ordinary writer locking unchanged: no time-based stealing. Add an explicit digest-bound repair operation that accepts only an observed ESRCH for the exact retained writer record. Live/reused/inaccessible/malformed identities refuse. Serialize repairers separately, recheck directory identity and owner bytes, then move the original lock into a unique retained directory and write a versioned receipt. Never signal a PID, delete ownership evidence or recreate authority. This extends the explicit inspection/recovery option in ADR-0020; normal commands still wait/refuse and never repair implicitly. A missing owner or interrupted repair-control lock still requires inspection.
9. Expose checkpoint/schema/effect inspection, metadata recovery/resume and explicit lock inspection/repair. The CLI supplies no native/backend host automatically, so unknown actual workers remain unavailable. Actual protected dispatch, model continuation and backend/group ownership remain P6-08–P6-13 and P6-27 acceptance. Initial-envelope planning execution and full runner routing remain later increments; this effect executor currently requires a prepared plan.

## Verification and consequences

Actual child-process tests kill before/after manifest and journal commit points, retain the stopped writer lock and recover the same checkpoint. Other tests kill after effect issue and before/after a real fixture-file mutation, then reconcile by observation without invoking twice. An actual registered child terminates while an unrelated owned test child remains alive. A legacy one-round exhausted gate remains exhausted, with identical events and receipts after recovery.

These prove local process/state behavior on the tested hosts, not remote exactly-once delivery, native containment or actual service certification. A host ignoring cancellation can remain in flight; its reservation/unknown effect stays retained. A trusted host can still be implemented incorrectly, so native/backend and operation-specific acceptance cannot be replaced with these fixtures. No prior manual failure is waived.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Reinvoke an issued action after a timeout or absent resource read | The old invocation can still apply later |
| Treat an invocation's return or a worker's success claim as observation | Conceals a lost response or wrong resource |
| Reset gates/budgets when constructing a fresh worker context | Makes restart an implicit permission extension |
| Kill a PID or free a lease based on age | Cannot establish current ownership or distinguish reuse |
| Repair every stale-looking lock automatically | A slow live writer can resume; preserve explicit verified recovery |
| Delete a stopped lock and discard its record | Loses the evidence needed to diagnose interruption |
| Decode/copy every checkpoint input as text | Breaks binary evidence and needlessly duplicates artifacts |

## Links

- [Checkpoint and recovery tutorial](../tutorials/delivery-checkpoints.md).
- [Durable runner contract](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md).
- [Original lock decision](./0020-journal-atomicity-and-lock-recovery.md).
- [Queue and fencing](./0097-durable-queue-reservations-and-current-attempt-fences.md).

[◀ Decisions index](./README.md)
