# 0097 — Persist queue reservations and current attempt fences

- **Status:** Accepted
- **Date:** 2026-10-24

## Context

Multiple local controllers can poll the same store after retries or restarts. An in-memory queue, run-local repository label or elapsed lease would allow duplicate current attempts or free capacity while an old worker still runs. The delivery journal already supplies an atomic transaction and exact attempt identity; actual native/backend dispatch is a subsequent layer.

## Decision

1. Register independently versioned queue payload/facet schemas without changing existing event envelopes or legacy records. Enqueue a deterministic slot for exact run/plan/unit/role/cell. Identical requests retain the entry; changed priority under that identity refuses. Builder slots have no evaluator cell. Keep independent evaluator cells distinct.
2. Serialize selection, attempt creation and reservation through the existing store writer lock and one atomic journal segment. Select eligible dependencies first, then descending operator priority, global enqueue sequence and stable ID. Persist a fresh opaque attempt ID, next slot generation and opaque controller identity. Claiming reserves metadata; it never launches a worker or performs an external effect.
3. Enforce store-wide defaults of two execution workers, one per repository and four evaluators, plus the plan's possibly tighter per-run limits. Research workers share the execution pool; reviewers/verifiers/refuters share the evaluator pool. Capacity counts all active attempts, including claimed, started and stopping. Unknown active reservations block their pool conservatively.
4. Bind repository reservations to canonical Git common-directory identity and, when explicitly named, canonical code-host repository identity. Shared worktrees and differently labelled runs share the former; distinct clones of one named remote share the latter. Observe the local target/remote before claim. A missing artifact/repository holds existing reservations rather than freeing them.
5. Require current private authorization/digest, declared role effects, valid definition route and completed dependency attempts. Those dependency receipts establish scheduler order only; actual contract/gate acceptance belongs to the later host. A trusted read-only host admission callback must separately report environment, capability, budget and semantic-plan/dependency readiness. Default admission is unavailable. Retain fixture/host-observed provenance and an evidence reference; no callback assertion certifies actual containment by itself.
6. Confirm exact runtime backend/instance/worker identity on start; one active runtime identity cannot own two assignments. Queue lease operations bind every assignment field, including controller, plan, role/cell and generation. Successful completion also requires a live grant. The controller supplies observed stop/completion evidence; workers cannot call these methods through the broker.
7. Never release or steal a reservation because a timeout elapsed or a new controller appeared. Settle only against a terminal matching attempt. Requeue requires retained terminal evidence and an explicit fence first; it creates a new generation on admission. The broker's read-only current check requires the exact started attempt, live run/basis and runtime instance. Late old results/effect requests fail even when retried from cache.
8. Expose enqueue and queue inspection as metadata-only CLI commands. Keep dispatch, successful completion, fencing and retry behind the trusted controller API rather than a worker-accessible raw command. General process termination, checkpoints/effect reconciliation and persisted runtime budgets remain P6-06/P6-07; actual worker/environment hosts remain P6-08–P6-13.

## Consequences

Concurrent local claimers obtain at most one current attempt for a slot and retain reservations through fresh processes. Deferred entries keep reasons for dependencies, capacity, clock regression, authority, definition and host admission. One transaction retains at most 998 changed deferrals plus a winning attempt/claim; each claim response includes at most 1000 deferred diagnostics. Selection still examines later eligible entries, so a diagnostics bound cannot hide an eligible winner. Subsequent polls record remaining changed reasons.

An arbitrary in-process controller remains trusted, as in the operator/broker decision. Queue evidence pointers and fixture callbacks do not prove tests ran or an OS sandbox exists. The actual runner must observe protected host capabilities, current budgets, artifacts and stop identities at dispatch; the local queue cannot manufacture those prerequisites. No native support or manual acceptance follows from these fixtures.

## Alternatives considered

| Option | Why rejected |
| --- | --- |
| Keep claims in memory or allocate before taking the writer lock | Allows competing processes to create current attempts |
| Use repository labels scoped to each plan | Misses shared Git repositories and permits capacity bypass |
| Identify only by local checkout directory | Misses shared worktrees and distinct clones of the same named remote |
| Expire a reservation and immediately retry | A timeout cannot prove the old process stopped |
| Let worker JSON declare completion or a fresh generation | Allows stale workers to promote their own authority |
| Treat dependency completion as QA acceptance | Conflates implementation order with actual behavioral/gate evidence |

## Links

- [Queue tutorial](../tutorials/delivery-queue.md).
- [Durable runner contract](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md).
- [Operator/worker boundary](./0095-operator-grants-and-scoped-worker-claims.md).

[◀ Decisions index](./README.md)
