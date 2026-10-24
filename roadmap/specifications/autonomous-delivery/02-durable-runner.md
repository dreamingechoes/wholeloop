# Durable delivery runner and worker lifecycle

> **TL;DR** — Persist scheduling decisions, attempt ownership and external-effect intents. Resume through fresh bounded contexts after interruption. A crash, timeout or unknown remote outcome cannot become a successful step or an invisible duplicate attempt.

> [!NOTE]
> **Status: 🚧 partial.** P6-04 implements versioned delivery state/event families, exact reducers, immutable atomic journal segments and disposable cache recovery, preserving legacy human/PR history. Queue, process/checkpoint recovery, budgets and actual worker orchestration remain P6-05–P6-10 work. The existing headless gate host is a foundation, not a persistent builder service.

## Implemented local state boundary

See the [recovery tutorial](../../../docs/tutorials/delivery-recovery.md) and [ADR-0096](../../../docs/decisions/0096-replayable-delivery-journal-without-authority-recovery.md). The core validates the versioned event envelope plus its registered closed payload schema, then replays exact revisions, state edges, grant observations and attempt identities. Immutable numbered transaction segments commit before disposable projections. Cache reconstruction neither recreates private authority nor reinterprets existing human/PR records; no worker or endpoint completion is implied. Later event/facet families remain additive and unknown versions refuse.

## State model

| State | Meaning | Eligible continuation |
| --- | --- | --- |
| `planned` | Valid immutable plan without execution authority | Operator authorization |
| `queued` | Authorized work awaiting a slot | Claim after policy/dependency checks |
| `running` | One current attempt owns the work | Heartbeat, checkpoint or result |
| `waiting-input` | A human/product decision is missing and intervention is permitted | Exact answer, then revalidation; unreachable in `none` |
| `waiting-external` | CI/provider result or an ambiguous effect is unresolved | Observe/reconcile; no blind write retry |
| `paused` | Operator pause, unsupported capability or recovery inspection | Explicit resume after diagnosis |
| `stopping` | Cancellation requested; owned workers/resources draining | Final observed worker/effect states |
| `stopped` | No new work; previous outputs retained | Explicit resume if grant permits |
| `exhausted` | A finite budget reached its boundary | Explicit newly granted extension |
| `completed` | Requested delivery endpoint observed | Read-only receipt; new work needs a new plan |
| `failed` | A non-retryable contract/integrity failure | Inspection and an explicit new attempt/plan |
| `blocked` | Required capability/input/authority cannot be obtained without forbidden intervention | Terminal limitation in `none`; an operator may later start an explicit continuation |

Item, step and gate states remain authoritative for their domains. A runner completion cannot override a failed gate or close learning work after merge. `completed` records the requested endpoint: research report, local handoff, observed PR or observed merge. Zero-intervention runs never wait for human input, open an interactive question tool or wait indefinitely for native approval; they use a permitted policy decision or return a terminal blocked/failed/exhausted receipt.

State and outcome are separate fields. For example, a research contract permitting open questions may end in state `completed` with outcome `completed-with-unknowns`; the same missing required fact may end another contract in state `blocked`. Exit success describes the requested control/inspection operation, not an assumed successful feature.

## Journal and claims

Add versioned event families for delivery plans/grants, queue changes, claims, attempts, checkpoints, control requests, effect intents and observations. Append through the existing atomic transaction boundary. Unknown versions refuse with a recovery message; migrations are explicit, non-destructive and preserve the original journal.

Do not silently add new meanings/required fields to existing closed v1 public records. New delivery/decision/acceptance envelopes carry their own identities; a necessary incompatible stored-format change requires an explicit version/migration decision and tests. New readers preserve old supervised records; old readers are not promised to interpret future delivery events and must refuse unsupported formats clearly.

Claims use an opaque attempt ID and monotonically increasing fencing generation. A heartbeat is operational liveness, never proof of progress. Proposed defaults: heartbeat every 10 seconds, missed-heartbeat inspection after 60 seconds. A timeout alone never authorizes stealing ownership or killing an unrelated PID.

Persist UTC deadlines and process-local monotonic measurements with their clock provenance. A detected backward wall-clock jump or inconsistent recovered time pauses admission rather than granting extra runtime. Tests inject both monotonic and wall clocks.

Recovery checks the exact worker identity, backend instance and recorded process start identity. Once an old execution is confirmed stopped, fence it before scheduling another attempt. If identity cannot be established, pause for inspection. Every broker result/effect validates the current fencing generation so a late old worker cannot publish.

Queue selection is deterministic: eligible dependencies first, operator priority, enqueue sequence and stable ID. Limit global and per-repository concurrency; an assignment also needs environment and budget capacity. No task runs twice because two controllers poll simultaneously. The initial implementation supports one local controller per store, not a distributed leader-election service.

## Workers and contexts

Each assignment binds plan revision, subject, role, repository snapshot, environment identity, criteria subset, guidance digests, limits and allowed broker methods. Start a fresh native session, with an external assignment directory and a bounded resume pack plus explicit artifact references. Workers do not recover authority from previous conversation text.

Builder output is a plan/patch/result for the allocated workspace. Reviewers and acceptance evaluators have separate sessions and narrower capabilities. The core validates assignment identity, schema, current bytes and actual host execution receipts before recording completion.

Reuse existing native adapters through a dedicated builder-host contract; do not widen read-only gate recipes. Capability negotiation records version, containment, tool control, cancellation and output support for each role. Missing capability stops that role; sequential scheduling cannot substitute for missing containment.

## Checkpoints and effects

Checkpoint after source adoption, approved plan, environment readiness, recorded builder plan, committed implementation, each sealed gate, integrated candidate, publication intent/result, CI observation and merge intent/result. Reference exact immutable artifacts rather than raw conversations.

Every external mutation follows: persist intent → validate current grant/fence → invoke once → persist observation. Intent includes operation, stable request key, repository/ref, expected head, input digest and attempt identity. A crash between invocation and receipt yields `waiting-external`. Reconcile by reading the same resource, preserving contradictory/partial results. This is not a distributed exactly-once guarantee.

Read-only transient failures may retry with 5, 15 and 45 second backoff, capped by the run deadline. Authentication, permission, policy, invalid output and missing-input failures do not automatically retry. Builder retries require confirmed termination, a preserved workspace and a new attempt identity; failed gate budgets survive restart.

## Control and interface

Proposed commands: `wl delivery enqueue`, `run`, `status`, `pause`, `resume`, `stop` and `reconcile`. A foreground runner and a CI invocation share the same protocol; no launch daemon or hosted control plane is installed implicitly.

Pause stops new assignments and records what is still running. Stop additionally cancels owned workers, records TERM/KILL/backend results and leaves ambiguous external effects pending. Do not delete code, remove branches or execute ledger undo recipes on stop. Resume returns the same run and checks changed source, policy, grants, bases and artifacts before proceeding.

Use existing CLI exit meanings: 0 for the requested operation's successful result, 2 for missing input, 3 for unmet capability/state, 4 for invalid/refused/stale results and 1 for unexpected faults. A queued or paused receipt is not a completed feature.

## Acceptance and tests

- [ ] **RUN-01:** Two concurrent controllers enqueue/claim the same work; only one current fenced attempt starts.
- [ ] **RUN-02:** Restart before and after every checkpoint resumes the same subject and preserves all gate rounds and receipts.
- [ ] **RUN-03:** Kill between remote invocation and observation; recovery reads/reconciles instead of writing again.
- [ ] **RUN-04:** A late old worker, reused PID and unknown backend identity cannot complete work or trigger effects.
- [ ] **RUN-05:** Cancellation terminates only owned groups, prevents subsequent assignments and preserves files/partial outcomes.
- [ ] **RUN-06:** Unsupported tools, denied native permissions, missing models and malformed results remain explicit failures or pauses.
- [ ] **RUN-07:** A fresh worker retrieves agreed criteria and prior kept findings without reading another worker's hidden acceptance inputs.
- [ ] **RUN-08:** Deadline/retry behavior is deterministic with injected clocks; process/backend tests also exercise actual shutdown and restart.
- [ ] **RUN-09:** A `none` run completes its research or implementation route with zero human prompts; unresolved non-delegable input produces a terminal receipt rather than `waiting-input`.

Use table-driven reducers, two-process contention tests, synthetic native executables and compiled-CLI interruption tests. Actual native continuation and backend boundaries are separate named-version acceptance.

[◀ Contract](./01-contract-and-authorization.md) · [Environments ▶](./03-execution-environments.md)
