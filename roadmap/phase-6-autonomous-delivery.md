# Phase 6 — Autonomous delivery and unattended research

> **Outcome** — From one explicitly authorized issue/document/request, wholeloop can execute a complete research or implementation flow without later human intervention when selected, recover across interruptions, validate actual integrated behavior and deliver a PR or separately authorized conditional merge.

> [!NOTE]
> **Status: 🚧 partial · reviewed and accepted for 1.0.** The owner accepted all 34 tasks on 2026-10-24 and authorized sequential implementation, pragmatic decisions, tests/docs and incremental commits without another signal. P6-01–P6-09, P6-11, P6-13–P6-19, P6-26 and P6-34 are implemented and tested. P6-12 implementation and its reference Docker trial pass; independent Linux-host acceptance remains pending. Later implementation criteria remain pending. Existing supervised behavior and original acceptance obligations remain unchanged.

## Scope and reading order

Start with the [specification index](./specifications/autonomous-delivery/README.md). Its ten detailed chapters define contracts, failure behavior, defaults, tests and evidence boundaries. This file follows the existing session-task format and decomposes that design into implementation increments.

Phase numbering preserves P0–P5 links. P6 is part of 1.0 and precedes P5-07 release closure; it is not a post-1.0 phase. The original 54 tasks remain historical/current at their stated scope. Adding this phase yields 88 tasks: 59 complete, fourteen original open tasks, one implemented new task awaiting host acceptance and 14 new pending implementation tasks.

Dependencies are implementation dependencies. Reuse already implemented guard/adapter/provider code without declaring its still-open native acceptance complete. Original manual/account/hosted checks need not block independent local P6 implementation after authorization. They still require their own evidence before release.

P6-33 and P6-34 have later IDs to retain the initial grouping; their explicit dependencies, not numeric position, determine execution order. In particular, the runner depends on P6-34 so fully unattended operation is foundational rather than a later bypass.

## Shared acceptance

Every task lands code, meaningful tests and docs together; keeps one concern per commit; passes all local checks; adds versioned public contracts/compatibility cases where needed; and updates the journal. Implemented hard rules gain named enforcers in enforcement.yml. Future enforcers in this plan are not current enforcement.

Keep actual execution levels distinct: pure rules, synthetic native processes, real local backends/apps, actual native clients/models, hosted code-host effects and owner decisions. No fixture substitutes for a real acceptance requirement. Unsupported expanded capabilities remain explicit and cannot be enabled by broader permissions.

## Task groups

| Group | Tasks | Specification |
| --- | --- | --- |
| Inputs, authority and persistence | P6-01–P6-07 | Contract, runner, controls |
| Native workers and runner | P6-08–P6-10 | Runner and unattended decisions |
| Environments | P6-11–P6-13 | Execution environments |
| Behavioral acceptance | P6-14–P6-17 | Behavioral QA |
| Whole-product integration | P6-18–P6-19 | Integration and change impact |
| PR, CI repair and conditional merge | P6-20–P6-24 | Publication, CI and merge |
| Operator evidence and evaluations | P6-25–P6-28 | Controls and validation |
| Changes, learning and release closure | P6-29–P6-32 | Integration, learning and validation |
| Fully unattended research/decisions | P6-33–P6-34 | Unattended decisions and research |

---

## P6-01 · Revision-bound request intake

**Status:** ✅ · **Size:** M · **Depends on:** P2-08, P3-04

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Turn an issue, document, file or existing work item into one traceable input without inventing requirements.

**Deliverables** — Bounded source snapshots, generic explicit extraction maps, stable source revisions and complete-read checks using existing MCP/native hosts.

**Acceptance criteria:**

- [x] Local/inline changes create new immutable revisions; repeated identical intake preserves identity.
- [x] Incomplete, oversized, ambiguous or wrong-repository remote observations launch no worker.
- [x] Fetched instructions cannot change authority or execute commands.

**Tests** — AUTH-01–AUTH-02 and AUTH-03: schema tables, local-file/symlink fixtures and complete/partial remote host fixtures.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/01-contract-and-authorization.md), [executable tutorial](../docs/tutorials/delivery-intake.md), getting-started, core CLI and provider boundaries.

**Evidence** — 52 intake tests, 353 focused intake/contract checks and the complete macOS arm64/Node 24.22.0 check (2015 tests in 89 files). Execute the tutorial on Linux arm64/Node 20.0.0 and 24.22.0 and five real descriptor/boundary refusals on each. Remote observations remain normalized-host fixtures/imports, not actual service certification; no worker or external effect is launched.

---

## P6-02 · Delivery plans and dependency contracts

**Status:** ✅ · **Size:** M · **Depends on:** P6-01, P3-01

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Represent the complete intended outcome before assigning work.

**Deliverables** — Closed versioned plan/envelope schemas, exact criterion coverage, repository/DAG/milestone validation and immutable guidance/policy bindings.

**Acceptance criteria:**

- [x] Cycles, unknown dependencies, duplicate ownership and uncovered outcomes refuse planning.
- [x] Input, criteria, guidance and initial repository bases bind the exact plan revision.
- [x] A source-defined small feature enters build without fabricated Define approvals; vague work follows its intervention policy.

**Tests** — AUTH-01–AUTH-04 and INT-02: plan/parser tables, existing hierarchy compatibility and generated DAG cases.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/01-contract-and-authorization.md), [executable planning tutorial](../docs/tutorials/delivery-plan.md), concepts, core CLI and state.

**Evidence** — 42 planning tests, 404 focused source/plan/contract checks and the complete macOS arm64/Node 24.22.0 check (2066 tests in 90 files). The exact tutorial and prepare/inspect replay pass on macOS and isolated Linux arm64/Node 20.0.0/24.22.0. Tests exercise actual disposable repositories, contract-first dense DAGs, concurrent processes, unchanged legacy events, base/remote changes and credential refusal. Build/Define/research are proposed routes; no grant or worker is created. Actual execution-time guidance/capability checks and semantic acceptance remain later increments.

---

## P6-03 · Operator grants and trusted effect broker

**Status:** ✅ · **Size:** L · **Depends on:** P6-02

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Keep execution authority outside the workers that consume it.

**Deliverables** — Grant/revocation lifecycle, endpoint/intervention axes, scoped broker requests and a controller/worker storage and credential boundary.

**Acceptance criteria:**

- [x] Workers cannot create grants, forge human testing, alter budgets or access controller credentials.
- [x] Read-only research, PR publication and merge have independent effect authority.
- [x] Non-contained native execution remains supervised; unavailable containment never silently broadens access.

**Tests** — AUTH-03–AUTH-08: hostile broker/process fixtures and no-credential-propagation probes. Actual native filesystem containment is exercised by P6-12/P6-27 before that capability can be advertised.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/01-contract-and-authorization.md), [authorization guide](../docs/tutorials/delivery-authorization.md), architecture, state and native capability boundaries.

**Evidence** — 42 new authority/broker tests and 460 focused source/plan/authority/contract checks pass on macOS and isolated Linux arm64/Node 24.22.0. The complete macOS check passes 2122 tests in 91 files. Exact planning/authorization/revocation tutorials pass on macOS and Linux Node 20.0.0/24.22.0. These prove the local control/protocol boundary, not actual native filesystem denial. No protected worker/backend or external effect starts; P6-12/P6-27 retain actual containment acceptance. Broker fixture observations and machine claims are never promoted to human testing or execution proof.

---

## P6-04 · Journaled delivery states and compatibility

**Status:** ✅ · **Size:** M · **Depends on:** P6-02

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Make every plan, control transition and attempt replayable without rewriting existing history.

**Deliverables** — Versioned delivery event families, pure reducers, external projections and explicit migration/recovery behavior.

**Acceptance criteria:**

- [x] Impossible transitions, unknown schema versions and mismatched plan/attempt identities refuse.
- [x] Existing human decisions and PR receipts replay unchanged.
- [x] Journal/projection interruption repairs from retained events without granting authority.

**Tests** — RUN-02 and AUTH-07: reducer tables, crash-before/after journal replacement and compatibility fingerprints.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/02-durable-runner.md); state and messaging, compatibility policy, generated references.

---

## P6-05 · Durable queue and fenced claims

**Status:** ✅ · **Size:** M · **Depends on:** P6-03, P6-04

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Assign eligible work once under concurrent local scheduling.

**Deliverables** — Deterministic queue ordering, per-repository/global reservations, persisted claims, generations and exact worker identity.

**Acceptance criteria:**

- [x] Two controller processes cannot dispatch two current attempts for one unit.
- [x] Dependency or capacity failure keeps work queued with a reason.
- [x] A late fenced worker cannot complete work or request a mutation.

**Tests** — RUN-01 and RUN-04, OPS-01: two-process contention, fake clocks, stale generation and capacity fixtures.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/02-durable-runner.md); orchestration, state, core CLI.

---

## P6-06 · Checkpoint recovery and effect reconciliation

**Status:** ✅ · **Size:** L · **Depends on:** P6-05

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Resume after interruption without guessing whether an external action happened.

**Deliverables** — Checkpoint/input manifests, intent/observation identities, termination inspection, finite read retries and recovery commands.

**Acceptance criteria:**

- [x] Crash injection around each checkpoint resumes the same run and preserves gate budgets.
- [x] Unknown process identity pauses instead of stealing a claim or killing an unrelated PID.
- [x] An ambiguous write stays pending until an exact read reconciles it; no blind replay occurs.

**Tests** — RUN-02–RUN-05: actual process termination, lost-response hosts and reused-PID/fence simulations.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/02-durable-runner.md); state, troubleshooting, core CLI.

---

## P6-07 · Run budgets and no-progress detection

**Status:** ✅ · **Size:** M · **Depends on:** P6-04

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Bound unattended work and explain exhaustion using observed data.

**Deliverables** — Persisted deadline/attempt/effect counters, admission reservations, usage provenance and repeated-state signatures.

**Acceptance criteria:**

- [x] Restarts do not reset elapsed deadlines, CI cycles or gate budgets.
- [x] Unsupported hard token/currency limits refuse eligibility instead of becoming an assumed zero.
- [x] Repeated identical failures terminate with retained findings and no automatic extension.

**Tests** — OPS-01–OPS-04: fake-clock boundaries, cumulative-usage replay and repeated-failure fixtures.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/07-controls-and-observability.md); [budget tutorial](../docs/tutorials/delivery-budgets.md), configuration, profiles, orchestration and ADR-0099.

**Evidence** — 24 new budget tests plus the complete macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0 checks pass: 2287 tests in 101 files, with all remaining checks green. Exact combined tutorials pass on macOS and Linux Node 20.0.0/24.22.0; shellcheck passes. Exercise actual concurrent reservations, artifact-quota races and killed blob writers, stricter derived/revised plans, usage overrun, historical unmetered work and no-progress exhaustion. Native model metering, semantic progress validation and complete runner/host acceptance remain their later tasks; old gate/acceptance evidence is unchanged.

---

## P6-08 · Role-bound worker protocol

**Status:** ✅ · **Size:** M · **Depends on:** P6-02, P6-03

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Give each fresh worker exactly its context, authority and reporting contract.

**Deliverables** — Assignment/result schemas, scoped resume references, per-role tools and controller-stamped execution metadata.

**Acceptance criteria:**

- [x] Wrong run/revision/role/fence, truncated output and forged process results refuse.
- [x] Reviewer/evaluator sessions cannot modify implementation or hidden acceptance.
- [x] Workers cannot invoke ask-user tools in none-policy assignments.

**Tests** — RUN-04, RUN-06–RUN-07 and DEC-05: codec fixtures, hostile broker calls and independent-context checks.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/02-durable-runner.md); [worker guide](../docs/tutorials/delivery-workers.md), agents, adapters, orchestration, enforcement and ADR-0100.

**Evidence** — Thirty new worker tests and 321 focused worker/contract checks pass. Complete macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0 checks pass 2324 tests in 102 files, plus all other checks. The exact guide passes on macOS and Linux Node 20.0.0/24.22.0 with shellcheck. Exercise actual disposable worktree snapshots and guidance files, current private grants, wrong runtime/fence/role, output/context byte changes, private verifier audiences and forged observations. This completes protocol/context enforcement, not actual native or filesystem certification: those remain P6-09/P6-12/P6-27. No worker starts and no human/semantic acceptance is fabricated.

---

## P6-09 · Native builder and evaluator hosts

**Status:** ✅ · **Size:** L · **Depends on:** P6-08, P5-03

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Execute native builder roles without widening existing read-only gate recipes.

**Deliverables** — Versioned role capability negotiation, fresh native launchers, bounded output/cancellation and explicit unsupported-role results for seven targets.

**Acceptance criteria:**

- [x] All seven targets have deterministic protocol/capability/denial tests.
- [x] Claude/Codex are the initial native reference clients; other expanded capabilities stay unverified until observed.
- [x] Native permission/model/MCP failures preserve policy and produce typed outcomes, never a bypass or model substitution.

**Tests** — RUN-06–RUN-08: synthetic PATH clients, actual help/version probes and separately scoped real role trials.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/02-durable-runner.md); [native host guide](../docs/tutorials/delivery-native.md), platforms, conformance, headless transports and ADR-0101.

**Evidence** — Thirty new native-host cases exercise seven-target role/denial tables, actual synthetic Claude/Codex processes, artifact bytes, timeout/cancellation/revocation, source-only research and read-only mutation refusal. Complete checks pass 2359 tests in 103 files on macOS arm64/Node 24.22.0 and isolated Debian Linux arm64/Node 24.22.0, plus all remaining checks. Exact tutorials pass on macOS Node 24 and Linux Node 20/24. Seven actual version/help probes remain metadata only. A separate actual macOS Codex permission-profile command denies owned forbidden read/write fixtures; it establishes no model/account/tool-registry, Linux or backend certification. Actual native/backend acceptance remains P6-12/P6-27; no model, publication or merge occurs.

---

## P6-10 · Local delivery runner and controls

**Status:** 🔄 · **Size:** M · **Depends on:** P6-06, P6-07, P6-09, P6-34

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Run an authorized route from the terminal or CI without a required long-lived conversation.

**Deliverables** — Proposed delivery enqueue/run/status/pause/resume/stop/reconcile commands over the shared state machine and decision policy.

**Implementation progress** — The first increment adds immutable runner preparation, route/owner/stage inspection, pause/resume/stop controls, internal finite stage execution, original-budget continuation and private native ownership/checkpoint recovery. The second increment adds the internal owned foreground transport, private group/core/nonce-bound one-shot bootstrap and exact original-parent recovery. Later increments add route-specific research decision requirements, bounded inline artifacts and independent original-budget native planner/challenger purpose attempts without fabricated implementation units. Owned external topic preparation and committed predecessor incorporation are also implemented internally, without legacy hierarchy or approval fabrication. Internal owned candidate staging/commit and current-head recovery now preserve exact bytes and fence stale receipts before HEAD-bound QA. Fixed Git stage handlers connect actual root/native registration, deadline/cancellation, private resource bindings and reviewed committed predecessors; live original effects remain separate from future dispatch. A fixed Codex observer now implements bounded asynchronous admission and original-attempt policy controls, with separate hashed local-authentication evidence. Actual macOS policy controls use no models/accounts; Linux native and complete model acceptance remain unverified. Unit worker stage composition now binds targeted queue claims, one-shot native assignments, registered process scopes and journal-selected receipt recovery, including paused inspection and exact original cancellation. Current candidate production remains separate from semantic QA/acceptance. The internal stage-decision component now binds exact named private requests, independent planner/challenger ownership, original root deadlines and published-result recovery without promoting judgment into QA or human approval. Owned read-only review/refutation now joins original queue/native receipts, exact committed candidate bytes and existing review rounds; private round bindings support metadata recovery without model replay or human approval. Application operation scopes now bind original Docker effects and separately owned metadata clients, with paused observation and exact cancellation after revocation. Original-budget artifact production now prepares bounded definition revisions, builder plans and pre-builder acceptance definitions from exact native receipts without approving or adopting them. Original repository suites now bind exact fixed Docker observations and private process owners to the verification stage, with paused metadata recovery and no command replay. Implementation-unit criterion verification now joins original suite facts, independent native judgments and exact paused verdict recovery without human approval. Owned builder-plan composition now joins exact producer invokers to independent delegated decisions without another deadline or human approval. Owned definition composition now requires every exact proposal decision before reserving the next immutable revision, leaving root adoption under the original envelope and deadline. Owned pre-builder acceptance definitions now expose exact pinned-case readiness with original-byte paused recovery, without claiming execution or product acceptance. The current-plan adapter now distinguishes exact-plan core authorization from independently accepted envelope plans, preserving pinned bytes and original paused decisions without another revision. Contract-only QA now joins bounded committed-artifact identity, declared revisions and exact hashes to original suites and independent fail-safe verification requirements, with paused recovery of the original paths and verdict. Ordinary implementation criteria remain required and no product criteria are invented. Original failure feedback now distinguishes known nonzero suites and retained findings from unavailable evidence, preserves exhausted gates and supplies stable retry fingerprints without dispatch or budget expansion. Complete-route configuration/research-report production/remaining stage-decision composition/repair/integration/acceptance composition and public foreground entrypoint/endpoint/reconciliation commands remain open; these are technical work, not manual acceptance blockers.

**Acceptance criteria:**

- [ ] No execution starts without authority; existing supervised entrypoints remain unchanged.
- [ ] Pause/stop affect owned work only and prevent later unauthorized effects.
- [ ] None-policy routes emit no human prompt and terminate honestly on unsatisfied prerequisites.

**Tests** — RUN-01–RUN-09 and DEC-01–DEC-05: compiled CLI lifecycle, process-group cancellation and interactive-tool canaries.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/02-durable-runner.md); getting-started, utilities, core CLI, troubleshooting.

---

## P6-11 · Environment recipe planning

**Status:** ✅ · **Size:** M · **Depends on:** P6-03, P3-09

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Describe actual application setup without treating declarations as execution.

**Deliverables** — Backend/recipe schema, explicit command selection, readiness/data/network/mount plans and finite resource defaults.

**Acceptance criteria:**

- [x] Discovery executes nothing and pins selected recipe/tool bytes.
- [x] Cycles, unsafe mounts, plaintext secrets, unbounded setup and ambiguous origins refuse planning.
- [x] Existing environment-ledger declarations remain unexecuted and backward-compatible.

**Tests** — ENV-03 and ENV-05–ENV-06: schema/path/network planning fixtures and ledger regressions.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/03-execution-environments.md); [executable planning guide](../docs/tutorials/delivery-environments.md), environment ledger, configuration, building and ADR-0102.

**Evidence** — Forty new recipe cases cover actual file/symlink/size reads, duplicate package keys, immutable blobs/manifests, changed input inspection, finite resources, explicit origins, inert malicious hooks and independent compiled processes. Old ledger cases remain unchanged and unexecuted. Complete checks pass 2407 tests in 104 files on macOS arm64/Node 24.22.0 (324.63 seconds) and isolated Debian Linux arm64/Node 24.22.0 (72.05 seconds), plus all remaining checks. The exact tutorial and ShellCheck pass on macOS Node 24 and Linux Node 20/24. This completes inert planning only; actual containers, readiness, containment and lifecycle remain P6-12/P6-13/P6-27.

---

## P6-12 · Owned isolated application environments

**Status:** ⏸️ · **Size:** L · **Depends on:** P6-11, P6-09

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Run services and fixture data without sharing controller or sibling state.

**Deliverables** — First Docker backend, explicit image provisioning, scoped mounts/network, setup/readiness execution and service/data receipts.

**Acceptance criteria:**

- [x] Two actual fixture applications have disjoint data and ports.
- [x] Workers cannot read controller/home/credential/sibling roots or use the host Docker socket.
- [x] Host/daemon platform and architecture are reported honestly; absent containment refuses delegated operation.

**Tests** — ENV-01–ENV-03 and ENV-05–ENV-07: actual disposable backend boundary/data tests on macOS and Linux hosts.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/03-execution-environments.md); [Docker guide](../docs/tutorials/delivery-docker.md), platforms, environment recipes, troubleshooting and ADR-0103.

**Local implementation** — Docker provisioning, current private authority/effect admission, exact image/root/platform-manifest bindings, volume-only candidate/input copies, actual byte/mode observation, finite setup/readiness jobs, isolated networks, fixed-target loopback proxies, ownership history and reinspection are implemented. Forty-one backend unit cases, a compiled CLI canary and 504 focused environment/contract checks pass. Complete checks pass 2461 tests in 106 files on macOS arm64/Node 24.22.0 (334.74 seconds) and isolated Debian Linux arm64/Node 24.22.0 (72.86 seconds), plus all remaining checks. Linux full checks exercise deterministic/fixture backend contracts and do not have a Docker socket.

**Actual backend evidence** — The explicit model-free evaluation passes ten observations on a macOS arm64 controller with Docker 29.9.2 and a Linux aarch64 daemon: two actual applications, disjoint ports/data, read-only copied input and implementation, denied controller/home/credential/sibling/socket/environment access, denied setup/runtime egress, no effect reissue, candidate invalidation and setup exit 7 refusing readiness. Explicit successful-test teardown verifies exact identities and observes absence. Preserve both the first missing-publication failure and the platform-image identity refusal; fix the contracts and pass the final trials without weakening policy.

**Acceptance remaining:**

- [ ] ENV-07 on an independent Linux host, with controller/daemon/architecture and actual denials recorded.

The available Linux controller container is not that proof. Actual native clients/models remain P6-27. P6-12 stays open for that acceptance; its completed implementation satisfies P6-13's technical dependency, and the owner explicitly authorized continuing without waiting for manual/host trials.

---

## P6-13 · Owned environment stop and retirement

**Status:** ✅ · **Size:** M · **Depends on:** P6-12, P6-06

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Stop disposable resources predictably without deleting evidence or unrelated work.

**Deliverables** — Observed lifecycle recovery, keep-on-failure retention, explicit retirement and partial-cleanup receipts.

**Acceptance criteria:**

- [x] Interrupted cleanup removes only exact controller-owned resources.
- [x] Failed-run evidence and volumes remain inspectable under the selected retention policy.
- [x] No ledger undo, topic deletion or unrelated container deletion is inferred from stop.

**Tests** — ENV-04 and RUN-05: actual service shutdown, interrupted teardown, foreign-resource and retained-evidence cases.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/03-execution-environments.md); [lifecycle guide](../docs/tutorials/delivery-lifecycle.md), environment ledger, recovery and ADR-0104.

**Evidence** — Fourteen lifecycle cases, four actual native-process cases, one additional backend history-budget regression and closed contract tables pass; all six focused environment files pass 110 cases. Complete checks pass 2504 tests in 108 files on macOS arm64/Node 24.22.0 (362.24 seconds) and isolated Debian Linux arm64/Node 24.22.0 (88.80 seconds), with all remaining checks green. Actual Docker evaluation passes seventeen observations, including retained volumes, a same-name foreign volume, killed retirement controllers and fresh compiled CLI recovery. The exact schema instruction passes on macOS Node 24 and Linux Node 20/24 with ShellCheck. Independent Linux-host/backend and native-model acceptance remain open.

---

## P6-14 · Behavioral acceptance contracts and evidence

**Status:** ✅ · **Size:** M · **Depends on:** P6-02, P6-04

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Bind criterion coverage to actual executions and immutable artifacts.

**Deliverables** — Acceptance plans/results, applicability rules, machine/human/delegated provenance and content-addressed external artifacts.

**Acceptance criteria:**

- [x] Missing coverage, wrong candidate and self-reported process metadata cannot pass.
- [x] Historical human testing stays distinct from delegated acceptance.
- [x] Artifact bounds, redaction, retention and current-input validation are enforced.

**Tests** — QA-01, QA-07–QA-08 and AUTH-04: schema, tampered metadata, artifact path and legacy acceptance tables.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/04-behavioral-qa.md); [acceptance tutorial](../docs/tutorials/delivery-acceptance.md), verification/state, core CLI, acceptance and ADR-0105.

**Evidence** — Thirty-nine new acceptance/artifact cases, including compiled CLI checks, and 375 focused acceptance/compatibility checks pass. Complete checks pass 2566 tests in 110 files on macOS arm64/Node 24.22.0 (299.03 seconds) and isolated Debian Linux arm64/Node 24.22.0 (75.55 seconds), plus all remaining checks. The exact planning/acceptance tutorial passes on macOS Node 24 and Linux Node 20/24 with ShellCheck. Preserve the first macOS deadline failure; the final regression proves that intent persistence cannot extend execution, a host is not dispatched after expiry, and a stopped interruption remains readable. Host observations in this increment are normalized fixtures; actual behavior execution and private evaluation remain P6-15–P6-17.

---

## P6-15 · Executable API and CLI acceptance

**Status:** ✅ · **Size:** M · **Depends on:** P6-12, P6-14, P3-05

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Observe user-visible behavior through declared commands and service endpoints.

**Deliverables** — Deterministic behavior host, failure-path assertions, restart/persistence cases and once-per-round suite reuse.

**Acceptance criteria:**

- [x] Green unit tests cannot hide a deliberately broken real behavior.
- [x] Wrong exits, missing versus zero values, wrong origins and incomplete responses remain failures/unknowns.
- [x] Candidate repair invalidates execution evidence without resetting the existing gate policy.

**Tests** — QA-01–QA-03 and QA-06: real disposable CLI/API applications, actual restart and failed suite receipts.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/04-behavioral-qa.md); [behavior host tutorial](../docs/tutorials/delivery-behaviors.md), verify-works, acceptance and ADR-0106.

**Evidence** — Complete checks pass 2602 tests in 113 files on macOS arm64/Node 24.22.0 (301.87 seconds) and isolated Debian Linux arm64/Node 24.22.0 (77.12 seconds), plus all remaining checks. Actual disposable Docker observations expose broken persistence behind a green unit suite, verify a repaired candidate after restart, reject missing/zero and wrong-exit substitutions, observe exit seven and preserve failed-suite reuse and original gate budgets. Preserve the initial authority-watch and fixture failures, the first concurrent macOS installation timeout, and the real native-output truncation probe (196608 of 220000 bytes); the corrected wrapper drains all bytes and verifies the exact finished client close. Native models, browser/private evaluation, accounts, publication and independent Linux Docker-host acceptance remain separate.

---

## P6-16 · Browser acceptance through existing tools

**Status:** ✅ · **Size:** L · **Depends on:** P6-15

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Validate actual UI journeys with observable actions and assertions.

**Deliverables** — Reviewed native/browser-MCP capability host, grounded journey plans, assertions and bounded labelled artifacts.

**Acceptance criteria:**

- [x] A UI case exercises the declared interaction rather than substituting hidden state injection.
- [x] A screenshot alone does not establish persistence/backend success.
- [x] Missing native browser capabilities or timing failures remain unavailable/failed with no fabricated pass.

**Tests** — QA-02, QA-05 and QA-08: real browser/application roundtrip, absent-tool, stale-URL and capture-boundary cases.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/04-behavioral-qa.md); platforms, verification, artifacts.

**Evidence** — Thirty-five new browser/protocol/native-process/OCI cases and 558 focused acceptance/environment/contract checks pass. Complete checks pass 2646 tests in 116 files on macOS arm64/Node 24.22.0 (335.67 seconds) and isolated Debian Linux arm64/Node 24.22.0 (77.21 seconds), plus all remaining checks. The official SDK protocol fixture and identical inert browser-schema output pass on the Node 20.0.0 Linux minimum. Actual Docker/Chromium observations expose cosmetic UI persistence failure, observe the repaired form/restart/fresh-context/backend roundtrip, deny app-to-browser control access and reuse completed keys without action replay; exact owned resources are retired. The nine actual API/CLI observations also pass after shared-host extraction. Preserve prototype/fixture/capacity/sandbox failures and the first full run's old @1-only registration assertion; fix the enforcer to match existing positive-version compatibility. No old schema changes, model, account, publication or merge occurs. Independent private evaluation and native/host acceptance remain separate.

---

## P6-17 · Independent acceptance and test sensitivity

**Status:** ✅ · **Size:** M · **Depends on:** P6-15, P6-03

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Make acceptance resistant to the implementation rewriting its own standard.

**Deliverables** — Evaluator-only case mounts, baseline/candidate execution identity and optional repository-native mutation results.

**Acceptance criteria:**

- [x] A builder cannot read/edit hidden inputs or weaken the pinned acceptance plan.
- [x] Applicable regression cases fail on the actual baseline and pass on the candidate.
- [x] Unknown semantic sensitivity is not labelled proven by constant-assertion lint or a model statement.

**Tests** — QA-03–QA-04 and QA-06: actual denied input access, red/green fixture and mutation-host unavailable cases.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/04-behavioral-qa.md); determinism and testing, verification, runtime boundaries.

**Evidence** — Twenty-two new unit regressions, the 727-case focused pre-byte-fix run and final complete checks pass. Complete checks execute 2686 tests in 119 files on macOS arm64/Node 24.22.0 (340.60 seconds) and isolated Debian Linux arm64/Node 24.22.0 (76.69 seconds), plus all remaining checks. Actual private Docker observations deny input/controller reads and input writes, preserve the same clean-base/current-candidate test/program, classify unavailable mutation/new-feature cases, retain synthetic native counters as reported data, withhold aggregate/sealed acceptance without relevant baseline proof and invalidate candidate edits. All nine pass with a large Unicode case and exact retirement; nine API/CLI and five browser regressions also pass. Preserve initial helper-budget/type/fixture failures and the actual Unicode-copy failure: its hash guard refuses corruption, bounded canonical byte framing fixes it, and the unchanged one-MiB/256-KiB/two-MiB bounds pass. Node 20.0.0 Linux HTTP/byte fixtures and inert schema parity pass. Add four commands, eleven source/output identities, guide, ADR-0108 and named enforcer while preserving old declarations. Same-user controller privacy, real mutation-engine semantics and native/model/independent Docker-host certification remain outside these observations.

---

## P6-18 · Integrated milestone candidates

**Status:** ✅ · **Size:** M · **Depends on:** P6-02, P3-01

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Define the exact assembled result of all required parts.

**Deliverables** — Milestone contracts, repository/SHA vectors, assembly identity, complete dependency/input manifests and integration repair ownership.

**Acceptance criteria:**

- [x] Only committed required parts enter a candidate; missing/dirty predecessors refuse.
- [x] Unknown repository/contract versions, cycles and uncovered milestone criteria refuse.
- [x] A moving base produces a new authorized candidate or an explicit blocked/pause result.

**Tests** — INT-02–INT-04: generated DAGs, committed/uncommitted Git fixtures and candidate invalidation tables.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/05-integration-and-change-impact.md); [candidate guide](../docs/tutorials/delivery-integration-candidates.md); ADR-0109.

**Verification** — Twenty-three actual Git/graph/CLI regressions pass. Complete checks pass 2721 tests in 120 files on macOS arm64/Node 24.22.0 (348.37 seconds) and isolated Debian Linux arm64/Node 24.22.0 (76.91 seconds), plus all remaining checks. The opt-in two-repository evaluation passes eight observations on macOS Node 24 and Linux Node 20.0.0, with identical inert schema output. Preserve initial fixture/type failures, missing-rule failure and restricted-sandbox failures; final checks use actual local socket/process observation. Preparation is read-only; P6-19 owns controller assembly and combined application execution. No account, hosted write or project merge occurs.

---

## P6-19 · Assembly and whole-product verification

**Status:** ✅ · **Size:** L · **Depends on:** P6-18, P6-15, P6-16, P6-17

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Catch failures that independently passing parts do not expose.

**Deliverables** — Disposable integration worktrees, ordered conflict handling, combined app/contract execution and repair/invalidation loop.

**Acceptance criteria:**

- [x] Incompatible frontend/backend fixtures fail together despite independent green suites.
- [x] A repair preserves worker/personal files and invalidates downstream current evidence.
- [x] Multi-repository partial outcomes cannot become whole-feature success or trigger automatic rollback.

**Tests** — INT-01–INT-06: actual multi-repository Git assembly/conflicts and combined local application behavior.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/05-integration-and-change-impact.md); [owned assembly guide](../docs/tutorials/delivery-assembly.md); ADR-0110.

**Verification** — Fifteen new actual Git/process/CLI/coverage regressions pass, including global cross-repository order, retained conflicts, fresh-worktree repair, zero repair budget, revocation and current public contracts. Complete checks pass 2755 tests in 123 files on macOS arm64/Node 24.22.0 (367.32 seconds) and isolated Debian Linux arm64/Node 24.22.0 (96.83 seconds), plus all remaining checks. Eight actual Docker/Git observations expose independently green incompatible components, verify the committed repair, preserve old reports and observe exact owned retirement. Node 20.0.0 Linux passes actual two-repository assembly/reconciliation and inert schema parity. Partial local Git outcomes never establish whole-feature success; hosted ordering/protection retains its separate later acceptance.

---

## P6-20 · Delegated acceptance and authorized PR lifecycle

**Status:** ⬜ · **Size:** M · **Depends on:** P6-03, P6-10, P6-19, P3-07

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Deliver the checked feature to a PR without forging a person's testing.

**Deliverables** — Compatible publication acceptance union, controller-owned non-force push/PR/ready operations and per-effect reconciliation.

**Acceptance criteria:**

- [ ] Default supervised publication still requires its existing actual human record.
- [ ] A current to-pr grant can publish from delegated acceptance without a later human turn.
- [ ] Wrong remote/prior tip, duplicate PR, changed snapshot and unowned remote edits refuse or reconcile without overwrite.

**Tests** — REL-01 and REL-06, AUTH-04–AUTH-08: old receipt regressions, synthetic code-host processes and lost-write responses.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); open-pr, guards, providers, core CLI.

---

## P6-21 · Revision-bound CI and protection observations

**Status:** ⬜ · **Size:** M · **Depends on:** P6-20

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Know which exact revision passed which trusted checks and repository requirements.

**Deliverables** — Complete normalized check/review/protection reads, issuer identities, finite polling and stale/unknown states through existing CLI/MCP hosts.

**Acceptance criteria:**

- [ ] Pending, cancelled, skipped, wrong-head, wrong-issuer and partial sets never satisfy required success.
- [ ] Missing protection/review data remains unknown, including permission-filtered observations.
- [ ] None-policy external waits terminate within the granted deadline without prompting a person.

**Tests** — REL-02 and REL-04: pagination, spoofed-context, moving-revision, denial and fake-clock CI fixtures.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); code-host contracts, CI observation, troubleshooting.

---

## P6-22 · Bounded CI and review-feedback repair

**Status:** ⬜ · **Size:** M · **Depends on:** P6-21, P6-19, P6-07

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Close actual failure feedback through the builder within the original scope.

**Deliverables** — Structured failure classification, adopted feedback identities, persisted CI cycle budget and fresh gate/acceptance reruns.

**Acceptance criteria:**

- [ ] Default initial-plus-one-repair cycles are enforced across restart.
- [ ] Changed implementation receives new local/behavior/integration/remote evidence.
- [ ] Untrusted comments cannot execute commands or widen scope; guessed flakiness cannot dismiss failed checks.

**Tests** — REL-03 and OPS-02–OPS-04: real local failed/fixed checks, hostile comments and bounded synthetic CI rounds.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); building, review, publication, budgets.

---

## P6-23 · Conditional merge eligibility

**Status:** ⬜ · **Size:** M · **Depends on:** P6-20, P6-21, P6-19, P6-03

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Explain whether an exact candidate can merge under an explicit operator policy.

**Deliverables** — Pure eligible/ineligible/unknown evaluator, required proof matrix, sensitive-path rules, freshness and exact head/base/protection identity.

**Acceptance criteria:**

- [ ] No merge permission is inferred from none intervention, autopilot or green tests.
- [ ] Missing required reviews, changed grants, stale bases and unsupported server preconditions refuse eligibility.
- [ ] The first required merge host is GitHub; other hosts advertise only independently implemented/observed capabilities.

**Tests** — REL-02, REL-04–REL-05 and REL-07–REL-09: complete positive/negative eligibility tables and cross-repository policy cases.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); merge policy, providers, compatibility.

---

## P6-24 · Conditional merge execution and reconciliation

**Status:** ⬜ · **Size:** L · **Depends on:** P6-23, P6-22

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Perform one authorized merge only when the server can enforce the required candidate boundary.

**Deliverables** — Trusted controller-host merge operation, expected-head/current-base or safe-queue contract, persisted intent and exact readback.

**Acceptance criteria:**

- [ ] No admin bypass, protection edits, force operation or ordinary manifest can cause merge.
- [ ] Races, expiry and lost responses preserve ineligible/pending states and never blindly retry.
- [ ] Observed queued, externally merged, wholeloop-merged and partially delivered outcomes remain distinct.

**Tests** — REL-04–REL-10 and EVAL-05/EVAL-08: synthetic CLI races plus separately authorized disposable hosted protection/SHA trials.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); open-pr, sync, guards, merge receipts.

---

## P6-25 · Operator timeline, diagnostics and recovery export

**Status:** ⬜ · **Size:** M · **Depends on:** P6-10, P6-14, P6-21, P6-24

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Make every result and limit understandable without opening private raw transcripts.

**Deliverables** — Read-only terminal/JSON status, optional local event watch, redacted diagnostics and separately selected private recovery bundles.

**Acceptance criteria:**

- [ ] Status distinguishes report/code/PR/queue/merge/partial/blocked outcomes and shows exact next permitted actions.
- [ ] No prompt, credential, source payload or provider response is exported by default.
- [ ] Recovery verifies bytes/rebinding and restores neither active claims nor execution grants on another host.

**Tests** — OPS-05–OPS-07: deterministic replay, secret canaries, tampered bundles and source-store preservation.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/07-controls-and-observability.md); getting-started, troubleshooting, state and messaging.

---

## P6-26 · Original end-to-end evaluation applications

**Status:** ✅ · **Size:** M · **Depends on:** P6-02, P6-14, P6-18, P6-19

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Measure completed behavior against a stable standard outside the builder's control.

**Deliverables** — Small original CLI/API/browser and two-component fixtures, hidden expected outcomes, negative cases and versioned evaluation manifests.

**Acceptance criteria:**

- [x] Fixtures exercise a bug, persistence feature, integration disagreement and malicious input.
- [x] Runtime state and evaluation artifacts remain external; literal fixtures retain exact byte baselines.
- [x] Expected results are pinned and cannot be changed by the implementation under evaluation.

**Tests** — EVAL-01–EVAL-03 and EVAL-06: fixture self-checks, oracle sensitivity and controller-owned expected-result validation.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/09-validation-and-acceptance.md); eval corpus, determinism and testing.

---

## P6-27 · Native zero-intervention vertical evaluations

**Status:** ⬜ · **Size:** L · **Depends on:** P6-13, P6-16, P6-17, P6-22, P6-24, P6-25, P6-26, P6-33

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Observe the whole flow on actual reference clients with no concealed human assistance.

**Deliverables** — Explicit live evaluation host, three-run-per-scenario reporting for Claude/Codex, actual tool-intervention counts and scoped code-host trials.

**Acceptance criteria:**

- [ ] Each reference client completes research and implementation-to-PR with no post-authorization human prompt in all three required trials.
- [ ] Supervised behavior still passes its original contract; unsupported expanded capabilities stay explicitly unavailable.
- [ ] Hosted publication/merge and actual backend/native isolation have their own sanitized observed receipts, not fixture promotion.

**Tests** — EVAL-01–EVAL-03, EVAL-08–EVAL-11 and RSR-01: live disposable trials with selected native accounts/budgets and exact versions.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/09-validation-and-acceptance.md); platform matrix, v1 acceptance, manual verification.

---

## P6-28 · Crash, race and autonomy failure evaluations

**Status:** ⬜ · **Size:** M · **Depends on:** P6-26, P6-10, P6-06, P6-24

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Verify that unattended execution fails safely and remains recoverable at its actual boundaries.

**Deliverables** — Systematic interruption points, delayed/duplicate messages, denied tools, lost effects and none-policy terminal failure scenarios.

**Acceptance criteria:**

- [ ] Every checkpoint/effect boundary has a retained fail/recover result with no duplicate effect.
- [ ] Stale workers cannot complete or publish, and unrelated processes/resources remain unchanged.
- [ ] None-policy missing facts/permissions/human requirements terminate honestly instead of waiting interactively.

**Tests** — EVAL-04–EVAL-07 and EVAL-11, RUN-03–RUN-05: deterministic fault hosts plus actual controller/worker/backend interruption.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/09-validation-and-acceptance.md); recovery, eval limitations, troubleshooting.

---

## P6-29 · Requirement revision and evidence impact

**Status:** ⬜ · **Size:** M · **Depends on:** P6-02, P6-18, P6-20, P6-24

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Keep execution aligned when source intent or relevant repository state changes.

**Deliverables** — Preview-only revision/impact command, explicit adoption, affected-worker fencing and deterministic evidence reuse/invalidation.

**Acceptance criteria:**

- [ ] New source content cannot silently replace approved intent or remove required outcomes.
- [ ] Only pre-authorized in-envelope revisions proceed without another operator action; none-policy outside-envelope work ends blocked.
- [ ] Affected candidates/decisions/effects lose current eligibility while prior receipts remain historical.

**Tests** — INT-03–INT-04 and INT-07, DEC-03–DEC-06: source/base/rubric changes during active workers and pending publication.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/05-integration-and-change-impact.md); specification, scopes, state, core CLI.

---

## P6-30 · Scheduled impact and learning execution

**Status:** ⬜ · **Size:** M · **Depends on:** P6-10, P4-03, P4-04, P4-06

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Execute due authorized observations through the same recoverable runner.

**Deliverables** — Local tick/enqueue integration, deduped checkpoint identities, MCP-first reads and explicitly delegated learning decisions.

**Acceptance criteria:**

- [ ] Two due ticks schedule one observation for the same launch/checkpoint revision.
- [ ] Missing access remains unknown; none-policy completion/blocking follows its initial evidence contract.
- [ ] No learning decision changes production flags, deploys, sends messages or silently closes unmeasured work.

**Tests** — LEARN-01–LEARN-04 and EVAL-12: fake clocks, grounding fixtures and actual local scheduler replay.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/08-learning-and-maintenance.md); measure-impact, decide-next, utilities.

---

## P6-31 · Maintenance proposals and bounded recurring envelopes

**Status:** ⬜ · **Size:** M · **Depends on:** P6-30, P6-29

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Turn recurring evidence into reviewable follow-up work without self-authorizing an endless backlog.

**Deliverables** — Pinned local inspections, immutable proposal records, deduplication/dismissal and optional separately authorized recurring delivery admission.

**Acceptance criteria:**

- [ ] A finding creates a proposal with source/base/criteria/tests, not an implicit code or tracker mutation.
- [ ] Agents cannot silently edit policies, guidance, budgets or their own evaluation standards.
- [ ] Recurring authorization enforces per-run and aggregate limits and creates independent auditable run identities.

**Tests** — LEARN-05–LEARN-06 and EVAL-12: repeated findings, stale evidence, actual local tool inspection and self-authorization attacks.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/08-learning-and-maintenance.md); learning, configuration, maintenance examples.

---

## P6-32 · Expanded V1 documentation and release closure

**Status:** ⬜ · **Size:** M · **Depends on:** P6-27, P6-28, P6-29, P6-30, P6-31, P6-33, P6-34, P5-06

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Ship only the expanded capabilities and evidence actually implemented and accepted.

**Deliverables** — Updated ADRs, schemas/migrations, generated references, skills/guards/enforcement, operator tutorials and reconciled release/native/manual matrix.

**Acceptance criteria:**

- [ ] All applicable specification case IDs map to concrete tests/enforcers and stated evidence-level results.
- [ ] Source-installable docs explain supervised/on-exception/none and report-to-PR-to-merge boundaries without claiming unsupported clients.
- [ ] Original native/runtime/release obligations remain explicit; P5-07 cannot close before this task and its original prerequisites.

**Tests** — AUTH-01–AUTH-08, DEC-01–DEC-06, RUN-01–RUN-09, ENV-01–ENV-07, QA-01–QA-08, INT-01–INT-07, REL-01–REL-10, OPS-01–OPS-07, LEARN-01–LEARN-06, RSR-01–RSR-06 and EVAL-01–EVAL-12 at their required evidence levels; complete local checks and explicit commit-range validation.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/09-validation-and-acceptance.md); README, all affected docs, acceptance, roadmap and journal.

---

## P6-33 · Complete unattended research host

**Status:** ⬜ · **Size:** L · **Depends on:** P6-10, P6-12, P6-34, P2-01

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Complete a research flow from one authorized request through challenged evidence and a stored brief.

**Deliverables** — Runner integration for ResearchWorkflow/source operations, independent angles/refuters, synthesis, finite source/repair budgets and terminal report outcomes.

**Acceptance criteria:**

- [ ] None-policy research needs no later human questions for angle selection, ambiguity resolution, challenge or final report acceptance.
- [ ] Contradictory/missing sources remain cited conflicts/unknowns; load-bearing findings cannot be discarded to finish.
- [ ] Research has no implementation/merge authority and remote sharing remains separately granted.

**Tests** — RSR-01–RSR-06 and EVAL-10–EVAL-11: hostile/conflicting source fixtures, checkpoint recovery and real reference-client research trials.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/10-unattended-decisions-and-research.md); research skill/protocol, providers, runner, core CLI.

---

## P6-34 · Zero-intervention delegated decision policy

**Status:** ✅ · **Size:** L · **Depends on:** P6-02, P6-03, P6-04

**Design review:** accepted by the owner on 2026-10-24 · **Release:** 1.0

**Goal** — Permit a complete flow with one initial human authorization while preserving truthful decision provenance.

**Deliverables** — Exact-plan/request-envelope grants, decision-specific rubrics, independent challenge, typed machine decisions and no-prompt terminal fallbacks.

**Acceptance criteria:**

- [x] Spec/scope/framing/build-plan/acceptance/learning decisions can be explicitly delegated within their supported scope.
- [x] Profiles, worker messages and fetched text cannot create delegation or impersonate human approval.
- [x] None-policy emits no ask-user/native approval wait; missing non-delegable prerequisites terminate blocked, and gates remain mandatory.

**Tests** — DEC-01–DEC-06, AUTH-03–AUTH-08 and RUN-09: complete decision tables, legacy replay, prompt canaries and envelope scope attacks.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/10-unattended-decisions-and-research.md); concepts, decision points, framing/spec/scopes, profiles, guards.

---

## Acceptance and execution boundary

The owner accepted every task for 1.0 and authorized implementing all technically executable work one task at a time, committing tested changes and updating documentation without waiting for manual checks or another signal. Manual checks are deferred, not passed. Take pragmatic implementation decisions within this scope. Account/model choices, hosted mutations, actual project merges, publication and changing the bootstrap commit workflow remain separate execution authority.

[◀ P5](./phase-5-reach-release.md) · [Roadmap](./README.md) · [Specification index](./specifications/autonomous-delivery/README.md) · [Journal](./journal.md)
