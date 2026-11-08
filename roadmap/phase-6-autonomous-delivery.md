# Phase 6 — Autonomous delivery and unattended research

> **Outcome** — From one explicitly authorized issue/document/request, wholeloop can execute a complete research or implementation flow without later human intervention when selected, recover across interruptions, validate actual integrated behavior and deliver a PR or separately authorized conditional merge.

> [!NOTE]
> **Status: 🚧 partial · reviewed and accepted for 1.0; ships experimental in 1.0.0 by the maintainer's decision of 2026-11-08, with native certification afterwards.** All 34 original tasks were accepted on 2026-10-24, with authorization for sequential implementation, pragmatic decisions, tests/docs and incremental commits without another signal. P6-35–P6-38 were added on 2026-11-04; P6-39 was added on 2026-11-05. P6-01–P6-21, P6-23, P6-25, P6-26, P6-28–P6-30, P6-31, P6-34 and P6-36–P6-39 are implemented and tested, including P6-12's reference Docker trial and independent Linux-host acceptance; P6-22, P6-24 and P6-33 are implemented and await native or hosted acceptance; P6-32 moved to P7-13 on 2026-11-07. Later implementation criteria remain pending. Existing supervised behavior and original acceptance obligations remain unchanged.

## Scope and reading order

Start with the [specification index](./specifications/autonomous-delivery/README.md). Its ten detailed chapters define contracts, failure behavior, defaults, tests and evidence boundaries. This file follows the existing session-task format and decomposes that design into implementation increments.

Phase numbering preserves P0–P5 links. P6 is part of 1.0.0 and precedes the release closure in [Phase 7](./phase-7-release-readiness.md); it is not a post-1.0 phase. The original 54 tasks remain historical/current at their stated scope. P6-35–P6-38 were added on 2026-11-04, P6-39 on 2026-11-05, P6-40 on 2026-11-07 and P6-41 on 2026-11-08; P6-32 moved to Phase 7 as P7-13 on 2026-11-07. The [roadmap index](./README.md) holds the current task counts.

Dependencies are implementation dependencies. Reuse already implemented guard/adapter/provider code without declaring its still-open native acceptance complete. Original manual/account/hosted checks need not block independent local P6 implementation after authorization. They still require their own evidence before release.

P6-33 and P6-34 have later IDs to retain the initial grouping; their explicit dependencies, not numeric position, determine execution order. In particular, the runner depends on P6-34 so fully unattended operation is foundational rather than a later bypass.

## Shared acceptance

Every task lands code, meaningful tests and docs together; keeps one concern per commit; passes all local checks; adds versioned public contracts/compatibility cases where needed; and updates the journal. Implemented hard rules gain named enforcers in enforcement.yml. Future enforcers in this plan are not current enforcement.

Keep actual execution levels distinct: pure rules, synthetic native processes, real local backends/apps, actual native clients/models, hosted code-host effects and maintainer decisions. No fixture substitutes for a real acceptance requirement. Unsupported expanded capabilities remain explicit and cannot be enabled by broader permissions.

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
| Changes, learning and release closure | P6-29–P6-31 (P6-32 moved to P7-13) | Integration, learning and validation |
| Fully unattended research/decisions | P6-33–P6-34 | Unattended decisions and research |
| Worker credentials | P6-35 | Runner, validation |
| Operator overview and live feed | P6-36–P6-38 | Controls and observability |
| Performance audit | P6-39 | Controls and validation |
| Repository guidance in autonomous runs | P6-40 | Runner and unattended decisions |
| Envelope-grant continuation | P6-41 | Runner and unattended decisions |

---

## P6-01 · Revision-bound request intake

**Status:** ✅ · **Size:** M · **Depends on:** P2-08, P3-04

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Status:** ✅ · **Size:** M · **Depends on:** P6-06, P6-07, P6-09, P6-34

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Run an authorized route from the terminal or CI without a required long-lived conversation.

**Deliverables** — Proposed delivery enqueue/run/status/pause/resume/stop/reconcile commands over the shared state machine and decision policy.

**Implementation progress** — The internal runner has ordered finite stages, preparation/status/pause/resume/stop controls, a private owned foreground transport, same-run derived-plan continuation and original-budget native ownership/checkpoint recovery. Fixed worker and decision adapters preserve exact assignments, independent sessions, source/grant bindings and published-result recovery without inventing human approval. A closed internal dispatcher now selects fixed same-store domain adapters from each original issued invocation and immutable revision; registration coverage remains separate from runtime availability. Optional fixed product selection joins copied milestone inputs, current unit QA and owned assembly to original single-recipe provisioning and root QA without a caller-supplied environment. It can also produce that owned assembly, its re-rooted recipe and candidate from static inputs under the original stage controls. Historical selection recovers independently of new configuration. The dispatcher is itself a foreground runner host whose static preflight refuses incomplete coverage, unconfigured products and non-delegated policies before any dispatch.

Owned Git adapters prepare topics, incorporate exact reviewed predecessors and stage/commit current candidates. Definition, builder-plan and pre-builder acceptance producers retain immutable inputs and independent decisions. Code and contract QA join actual declared suites, verification, review/refutation and current committed bytes. Scoped correction workers/commits and original review/verification continuations preserve failure history, bounded rounds and reconstructed lineage. Joint unit/milestone readiness exposes a complete current QA vector only after post-await rechecks; assembly requires its exact positively closed original Git effects.

Root integration now executes pinned CLI/API, isolated-browser and private-evaluator cases through original owned scopes at the captured deadline. Exact case/report recovery validates assertion/capture effects, private sensitivity and complete historical environment revisions, including after retirement. Whole-feature readiness requires all current integration verdicts and one tested assembly covering every work unit, criterion and procedure. Explicit none-policy acceptance joins that product to original independent delegated judgment. Local handoff captures one bounded owned-core report and observes current code-ready without another model, human approval or publication.

The internal environment backend can also capture original parent bounds across preflight, effect/resource admission and setup calls while keeping service lifetime separate. A distinct original runner preparation phase now owns preflight reads before a resource exists and retains later registered mutation owners against the captured request/candidate identity. Its producer recovers the exact original applied ready input through consumed budgeted artifact bytes and native outcomes, including after retirement, with historical readiness and no acceptance. Complete-route selection still requires composition. Recovery preserves original input/receipt bytes, native owners, deadlines and private cancellation nonces. Lost consumed bindings, stale candidates, unsupported capabilities and partial evidence cannot buy another execution or establish completion. Metadata inspection remains separate from live dispatch authority. Synthetic/reference transport evidence does not establish authenticated-model, independent Linux application-host or hosted acceptance.

**Completed technical work:**

The provisioning backend also retains a private copy of the original request across asynchronous preflight, preventing caller-owned substitutions from changing later effect/resource identity. This correction does not close root preparation or any item below. Delivery journal reads also reuse one validated replay for identical current segment bytes, so the composed product-environment route completes inside its unchanged original window; this is a cost correction, not new capability.

- Public foreground run and reconcile commands over a fixed public host whose identity binds the trusted native bindings document (ADR-0180, ADR-0183), working with the empty default and with explicit bindings.

Decisions of 2026-11-01 settle the other items. Envelope-derived supervised plans and supervised definition approvals execute only under a fresh exact-plan grant (ADR-0182). Continuation after integration or acceptance repairs belongs to P6-29. Report-level research belongs to P6-33 (ADR-0179) and hosted endpoints to P6-20–P6-24; neither is a P6-10 closure condition.

**Closure** — P6-10 closes when its three acceptance criteria hold with automated evidence: the compiled CLI lifecycle, process-group cancellation and interactive-tool canaries, using the synthetic/reference transport. That evidence certifies neither a native client nor a hosted service; those checks stay open in manual verification and in P6-27.

**Acceptance criteria:**

- [x] No execution starts without authority; existing supervised entrypoints remain unchanged.
- [x] Pause/stop affect owned work only and prevent later unauthorized effects.
- [x] None-policy routes emit no human prompt and terminate honestly on unsatisfied prerequisites.

**Tests** — RUN-01–RUN-09 and DEC-01–DEC-05: compiled CLI lifecycle, process-group cancellation and interactive-tool canaries.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/02-durable-runner.md); getting-started, utilities, core CLI, troubleshooting.

**Evidence** — The compiled `wl delivery run` and `wl delivery reconcile` commands drive the real engine in an owned foreground controller child. With the empty bindings default a none-policy route ends blocked and a supervised one paused, before dispatch and without asking anyone; with explicit bindings the route still stops, because no trusted runtime observer exists. Interactive-tool canaries on `PATH` record that no native client was launched, nothing waited for input and the run returned promptly. A different bindings document and a revoked grant are refused before any claim. Public stop and `reconcile --cancel` cancel only the owned waiting controller group: an unrelated process survives, and a later run is refused with no stage issued. This is synthetic/reference-transport evidence. It certifies neither a native client nor a hosted service; those checks stay open in manual verification and P6-27.

---

## P6-11 · Environment recipe planning

**Status:** ✅ · **Size:** M · **Depends on:** P6-03, P3-09

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Status:** ✅ · **Size:** L · **Depends on:** P6-11, P6-09

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Independent Linux acceptance:**

- [x] ENV-07 on an independent Linux host, with controller/daemon/architecture and actual denials recorded.

On 2026-10-31 the unchanged evaluation npm run eval:environments -- --retire-success passes on a separate ephemeral Linux VM: controller Linux x64/Node 22.23.4, local Docker 29.9.2 daemon on Linux x86_64 with four CPUs and 16872808448 bytes, and the amd64 manifest of the same pinned helper root. All seventeen checks across eleven controls pass, including disjoint ports/data, denied controller/home/credential/sibling/socket/environment access, denied setup and application egress, setup exit 7 refusing readiness, foreign same-name volume retention and killed-controller retirement recovery; exact owned absence is observed afterwards. Controller and daemon share one VM, so this establishes backend behavior on Linux, not native model/tool permission enforcement, which remains P6-27.

---

## P6-13 · Owned environment stop and retirement

**Status:** ✅ · **Size:** M · **Depends on:** P6-12, P6-06

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Status:** ✅ · **Size:** M · **Depends on:** P6-03, P6-10, P6-19, P3-07

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Deliver the checked feature to a PR without forging a person's testing.

**Deliverables** — Compatible publication acceptance union, controller-owned non-force push/PR/ready operations and per-effect reconciliation.

**Acceptance criteria:**

- [x] Default supervised publication still requires its existing actual human record.
- [x] A current to-pr grant can publish from delegated acceptance without a later human turn.
- [x] Wrong remote/prior tip, duplicate PR, changed snapshot and unowned remote edits refuse or reconcile without overwrite.

**Tests** — REL-01 and REL-06, AUTH-04–AUTH-08: old receipt regressions, synthetic code-host processes and lost-write responses.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); open-pr, guards, providers, core CLI.

**Evidence** — The fixed publication adapter ([ADR-0185](../docs/decisions/0185-authorized-pr-publication.md)) publishes the current accepted product through the effect ledger: a non-force push of the exact head to the owned topic, one marked draft PR and a granted ready transition, each with its own intent and read-back. Publisher cases on a stub code host refuse a competing writer, a foreign PR, duplicate owned PRs, a changed snapshot and an unreadable remote without writing, and reconcile lost push, create and ready responses without a second write. The legacy `open-pr` cases still require a person's exact-plan testing. The Docker-backed runner evaluation in `--publication` mode joins real product QA and delegated acceptance to one owned ready PR and a current `ready-pr` endpoint. This is stub code-host evidence: no hosted code host was used, and the GitHub CLI host is checked only with a stub executor.

---

## P6-21 · Revision-bound CI and protection observations

**Status:** ✅ · **Size:** M · **Depends on:** P6-20

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Know which exact revision passed which trusted checks and repository requirements.

**Deliverables** — Complete normalized check/review/protection reads, issuer identities, finite polling and stale/unknown states through existing CLI/MCP hosts.

**Acceptance criteria:**

- [x] Pending, cancelled, skipped, wrong-head, wrong-issuer and partial sets never satisfy required success.
- [x] Missing protection/review data remains unknown, including permission-filtered observations.
- [x] None-policy external waits terminate within the granted deadline without prompting a person.

**Tests** — REL-02 and REL-04: pagination, spoofed-context, moving-revision, denial and fake-clock CI fixtures.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); code-host contracts, CI observation, troubleshooting.

**Evidence** — The `wholeloop/delivery-ci@1` observation, the pure `ciVerdict`, the finite `RunnerCiObserver` and the `GithubCliCiHost` read path ([ADR-0186](../docs/decisions/0186-revision-bound-ci-observations.md)) are covered by table-driven verdict cases, fake-clock waits that end at the run deadline or the 30-minute bound without prompting, and stub-executor cases for pagination, spoofed issuers, moving revisions and denied protection. Composing the wait into merge routes belongs to P6-23 and P6-24. No hosted code host was used.

---

## P6-22 · Bounded CI and review-feedback repair

**Status:** ⏸️ · **Size:** M · **Depends on:** P6-21, P6-19, P6-07

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Close actual failure feedback through the builder within the original scope.

**Deliverables** — Structured failure classification, adopted feedback identities, persisted CI cycle budget and fresh gate/acceptance reruns.

**Acceptance criteria:**

- [x] Default initial-plus-one-repair cycles are enforced across restart.
- [ ] Changed implementation receives new local/behavior/integration/remote evidence.
- [x] Untrusted comments cannot execute commands or widen scope; guessed flakiness cannot dismiss failed checks.

**Tests** — REL-03 and OPS-02–OPS-04: real local failed/fixed checks, hostile comments and bounded synthetic CI rounds.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); building, review, publication, budgets.

**Completed technical work** — Pure failure classification, identified unadopted review feedback, the journal-derived push admission and typed, retained repair requests ([ADR-0187](../docs/decisions/0187-bounded-ci-repair-requests.md)). Fifteen cases cover the classification and request tables, hostile comments, and a restart that keeps the push count and refuses a third push with `ci-push-limit`.

**Awaiting** — The fixed version-two CI producer, new exact-plan grant, stable current bodyless-feedback admission, published-head seeding, fresh verification/review/integration/acceptance and original-topic/PR publication are implemented by P6-29 ([ADR-0214](../docs/decisions/0214-versioned-ci-correction-production.md)). Actual local Git/Docker execution reaches new synthetic CI at the corrected pushed head; retained failed wrapper reports and corrected read-only verification remain distinct. The second criterion stays open for native/hosted acceptance under P6-27; no fixture or local bare repository certifies actual hosted CI.

---

## P6-23 · Conditional merge eligibility

**Status:** ✅ · **Size:** M · **Depends on:** P6-20, P6-21, P6-19, P6-03

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Explain whether an exact candidate can merge under an explicit operator policy.

**Deliverables** — Pure eligible/ineligible/unknown evaluator, required proof matrix, sensitive-path rules, freshness and exact head/base/protection identity.

**Acceptance criteria:**

- [x] No merge permission is inferred from none intervention, autopilot or green tests.
- [x] Missing required reviews, changed grants, stale bases and unsupported server preconditions refuse eligibility.
- [x] The first required merge host is GitHub; other hosts advertise only independently implemented/observed capabilities.

**Tests** — REL-02, REL-04–REL-05 and REL-07–REL-09: complete positive/negative eligibility tables and cross-repository policy cases.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); merge policy, providers, compatibility.

**Evidence** — The pure `mergeEligibility` evaluator ([ADR-0188](../docs/decisions/0188-conditional-merge-eligibility.md)) passes 50 table-driven cases: the eligible baseline and expiry, 32 ineligible mutations across authority, evidence, PR, checks, reviews, conflicts, dependencies, base, server binding, forbidden requests, freshness and host, 10 unknown mutations, exact sensitive-path exceptions and the path matcher. No hosted code host was used.

---

## P6-24 · Conditional merge execution and reconciliation

**Status:** ⏸️ · **Size:** L · **Depends on:** P6-23, P6-22

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Perform one authorized merge only when the server can enforce the required candidate boundary.

**Deliverables** — Trusted controller-host merge operation, expected-head/current-base or safe-queue contract, persisted intent and exact readback.

**Acceptance criteria:**

- [x] No admin bypass, protection edits, force operation or ordinary manifest can cause merge.
- [x] Races, expiry and lost responses preserve ineligible/pending states and never blindly retry.
- [x] Observed queued, externally merged, wholeloop-merged and partially delivered outcomes remain distinct.

**Tests** — REL-04–REL-10 and EVAL-05/EVAL-08: synthetic CLI races plus separately authorized disposable hosted protection/SHA trials.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/06-publication-ci-and-merge.md); open-pr, sync, guards, merge receipts.

**Completed technical work** — `RunnerMerger` over the effect ledger and `GithubCliMergeHost` ([ADR-0189](../docs/decisions/0189-conditional-merge-execution.md)). Ten stub cases verify the three criteria at the component level: expected-head merges, no effect for ineligible or expired eligibility, distinct external, queued, partial and own merges, lost-response reconciliation with one merge, no retry after a refusal, refusal without the merge effect, and exact `gh pr merge` arguments without bypass, auto-merge, force or branch deletion.

**Composed route** — `to-merge` routes run as publication, `ci`, `merge` and `handoff` ([ADR-0199](../docs/decisions/0199-composed-conditional-merge-routes.md)). The operator's merge policy (method, trusted required checks, denylist and exceptions) lives in `plan.policy.merge`, so the grant binds it. The CI stage waits finitely for revision-bound checks at the published head and keeps a typed repair request on failure. Immediately before each single expected-head merge, the merge stage recomputes eligibility from: this request's passed gates; one fresh CI read; and complete pull-request facts from `GithubCliMergeFactsHost` (files, every discussion page, mergeability, allowed methods and base currency, each unknown when unreadable). The handoff and the `merged` endpoint accept only the run's own exact-head merge. The dispatcher refuses the route at static preflight unless its merge stages carry an explicit runtime allowance; the public host composes none.

**Evidence** — Eleven dispatcher-composed cases on stub hosts: route order and the runtime refusal; passing CI, one exact-head merge, the handoff and the endpoint, with no second merge on re-inspection; a CI failure that keeps its repair request and never reaches the merge; seven refusals with no merge; and someone else's merge, never handed off. A mutation that forces eligibility fails all seven refusals. Four stub-executor cases cover complete pagination and unknown facts.

**Awaiting** — The separately authorized disposable hosted protection and exact-SHA trials (REL-10, EVAL-05, EVAL-08) need a maintainer-authorized hosted repository and a controller that installs the merge stages with the runtime allowance. No hosted code host was used.

---

## P6-25 · Operator timeline, diagnostics and recovery export

**Status:** ✅ · **Size:** M · **Depends on:** P6-10, P6-14, P6-21, P6-24

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Make every result and limit understandable without opening private raw transcripts.

**Deliverables** — Read-only terminal/JSON status, optional local event watch, redacted diagnostics and separately selected private recovery bundles.

**Acceptance criteria:**

- [x] Status distinguishes report/code/PR/queue/merge/partial/blocked outcomes and shows exact next permitted actions.
- [x] No prompt, credential, source payload or provider response is exported by default.
- [x] Recovery verifies bytes/rebinding and restores neither active claims nor execution grants on another host.

**Tests** — OPS-05–OPS-07: deterministic replay, secret canaries, tampered bundles and source-store preservation.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/07-controls-and-observability.md); getting-started, troubleshooting, state and messaging.

**Evidence** — `wl delivery report`, `wl delivery diagnostics`, `wl delivery recovery-export --include-private` and `wl delivery recovery-import` ([ADR-0190](../docs/decisions/0190-operator-report-diagnostics-and-recovery-bundles.md)) are covered by 19 cases: a read-only report with exact next actions, all thirteen outcome categories, diagnostics free of a planted secret canary, source text and owner, import refusals for missing, unknown and baseless rebindings, tampered and unlisted files and a repeat, an accepted import that leaves no live journal, authority or run, and compiled CLI cases for the private-export flag. The optional live event watch is not provided here; the report and the existing `wl delivery events` pages cover inspection, and P6-38 adds the watch.

---

## P6-26 · Original end-to-end evaluation applications

**Status:** ✅ · **Size:** M · **Depends on:** P6-02, P6-14, P6-18, P6-19

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

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

**Status:** 🔄 · **Size:** L · **Depends on:** P6-13, P6-16, P6-17, P6-22, P6-24, P6-25, P6-26, P6-33

**Design review:** accepted on 2026-10-24 · **Release:** certification after 1.0.0. By the maintainer's decision of 2026-11-08, autonomous delivery ships experimental in 1.0.0 ([ADR-0066](../docs/decisions/0066-v1-compatibility-baseline-and-deprecation.md)); these trials certify it later and no longer block the release.

**Goal** — Observe the whole flow on actual reference clients with no concealed human assistance.

**Deliverables** — Explicit live evaluation host, three-run-per-scenario reporting for Claude/Codex, actual tool-intervention counts and scoped code-host trials.

**Acceptance criteria:**

- [ ] Each reference client completes research and implementation-to-PR with no post-authorization human prompt in all three required trials.
- ~~Total controller overhead is independently measured and meets the initial five-second ceiling, excluding models and actual project test execution; operation-count and scaling controls refuse repeated full dependency traversal. Lower overhead remains the objective. The current performance defect blocks 1.0, independently of native acceptance.~~ Withdrawn by the maintainer on 2026-11-07 together with P6-39's ceiling; overhead is measured and recorded in the [audit ledger](./performance-audit.md) and is not a 1.0 gate.
- [ ] Supervised behavior still passes its original contract; unsupported expanded capabilities stay explicitly unavailable.
- [ ] Hosted publication/merge and actual backend/native isolation have their own sanitized observed receipts, not fixture promotion.

**Tests** — EVAL-01–EVAL-03, EVAL-08–EVAL-11 and RSR-01: live disposable trials with selected native accounts/budgets and exact versions.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/09-validation-and-acceptance.md); platform matrix, v1 acceptance, manual verification.

**Started** — By explicit instruction, before P6-22, P6-24 and P6-33 are ✅: their remaining work is native or hosted acceptance that this task supplies, or P6-29's producer, which is built here. The campaign inputs were fixed on 2026-11-03 ([manual verification](./manual-verification.md#native-evaluation-campaign-inputs-2026-11-03)). Increments, in order: reference version pin, Claude Code boundary observer, public host composition, P6-29's seeded correction producer, live evaluation host and three-run report, then the paid pilot.

**Completed technical work** — The reference pin is Claude Code 2.1.316 and Codex 0.166.0, and the Codex recipe disables three more default features, including interactive MCP elicitation ([ADR-0202](../docs/decisions/0202-campaign-reference-client-versions.md)). The six real model-free Codex boundary controls pass on 0.166.0. Claude Code now has its own boundary: on macOS it launches inside a `sandbox-exec` profile that denies every file the assignment does not need, authenticates through a dedicated client home, and is admitted only after an observer runs the controller's probe under that profile ([ADR-0203](../docs/decisions/0203-contained-claude-code-boundary.md)). Six real model-free Claude Code 2.1.316 controls pass, authenticated, with no model invoked. Research workers now get the client's own read-only web search and fetch, but only for a `native-web` angle or to re-read a web citation, which the chosen public-web research needs ([ADR-0204](../docs/decisions/0204-research-web-reads.md)). `wl delivery run` now launches a digest-verified controller bundle that composes the research route from a `--runtime` document naming each client's binary and home; the core stays a single file under 4 MiB ([ADR-0205](../docs/decisions/0205-public-controller-bundle.md)). `wl delivery reconcile` runs in the same bundle, and `wl delivery runner-host` prints the identity a request must name. An owner-approved model turn under the Claude profile passed. The EVAL-10 pilot ran end to end with no human wait but ended blocked on a correct machine rejection, after finding five defects ([ADR-0206](../docs/decisions/0206-live-research-pilot-findings.md)). Native receipts now carry client-reported usage. The three-run report is `npm run eval:campaign`: it groups retained live trials by scenario, client, version and model, and passes a trial only when the run completed with an outcome its route allows, with zero controller waits and every launch succeeded and host-observed. Claude Code has four EVAL-10 passes out of ten campaign attempts. Under the 2026-11-04 rule, infrastructure failures are set aside and the first three remaining attempts must pass, which gives `three-passes`. The 1.0 scope for autonomous delivery was also confirmed: it covers Claude Code and Codex, with Gemini, OpenCode, Copilot and Cursor in a 1.x release ([validation spec](./specifications/autonomous-delivery/09-validation-and-acceptance.md)). A diagnostic repeat completed with no human wait, both delegated decisions accepted, in 968 s and 26 launches. The implementation-to-PR route is composed in seven increments ([ADR-0207](../docs/decisions/0207-public-implementation-route-composition.md)); the local composition is implemented: pinned repository inputs and the `gh` path in the runtime document, each verification round provisioning its own unit QA environment, observed with real Docker, the composition from plan to commit, run end to end through the real Codex observer with a synthetic client, and the verification, review and re-verification gates, with the declared suite as controller-owned acceptance cases, run through real Docker from plan to re-verification, integration and acceptance, with real Docker product QA from plan to acceptance, publication through the runtime's `gh`, and a complete synthetic run: the real engine drives the whole route to `completed` with outcome `ready-pr`, through real Docker QA and a real Git push to a local bare repository. That run also found that a to-pr run could never complete, now fixed. The live implementation evaluation (`eval:live-implementation`) now prepares the pinned small HTTP fixture and runs EVAL-09 through the public CLI, with a separate synthetic rehearsal mode that cannot count as live campaign evidence. The private hosted fixture is published at `3aeeef7`, with required PRs and the strict GitHub Actions `test` check observed through a separate protection read; its initial CI fails at the intended status assertion. Remaining: the three required EVAL-09 trials per reference client, Codex's EVAL-10 trials after its quota reset, and the separately tracked native continuation/hosted acceptance.

---

The third 2026-11-05 Codex implementation pilot retains correct response identity/HTTP input but returns blocked on missing committed scope observation. ADR-0218 installs a fixed original-owner repository.diff reader within existing source/test/report authority; focused controls pass while complete platform gates and fresh native acceptance remain open. All five failed research/implementation pilots retain their original outcomes, and Windows/WSL2 are explicitly deferred.

## P6-28 · Crash, race and autonomy failure evaluations

**Status:** ✅ · **Size:** M · **Depends on:** P6-26, P6-10, P6-06, P6-24

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Verify that unattended execution fails safely and remains recoverable at its actual boundaries.

**Deliverables** — Systematic interruption points, delayed/duplicate messages, denied tools, lost effects and none-policy terminal failure scenarios.

**Acceptance criteria:**

- [x] Every checkpoint/effect boundary has a retained fail/recover result with no duplicate effect.
- [x] Stale workers cannot complete or publish, and unrelated processes/resources remain unchanged.
- [x] None-policy missing facts/permissions/human requirements terminate honestly instead of waiting interactively.

**Tests** — EVAL-04–EVAL-07 and EVAL-11, RUN-03–RUN-05: deterministic fault hosts plus actual controller/worker/backend interruption.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/09-validation-and-acceptance.md); recovery, eval limitations, troubleshooting.

**Evidence** — A fault table over the real effect ledger ([ADR-0191](../docs/decisions/0191-effect-boundary-fault-evaluation.md)) runs all ten ledger operations under seven faults: a crash after prepare or issue, a lost response, an unavailable read, a repeated observation, a denying host and revocation before issue. All 70 cells end in their expected state with at most one write, refuse a second issue and re-observe without changing the journal. `npm run eval:runner-faults` passed and retained its report. Unit cases refuse a fenced worker's late completion and stale-attempt effect while another run's events stay identical, and capture a checkpoint once across a restart. None-policy terminal behavior rests on the existing public-runner, research and engine cases, and actual controller interruption on the foreground and process-recovery cases. The synthetic remote certifies ledger semantics only.

---

## P6-29 · Requirement revision and evidence impact

**Status:** ✅ · **Size:** M · **Depends on:** P6-02, P6-18, P6-20, P6-24

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Keep execution aligned when source intent or relevant repository state changes.

**Deliverables** — Preview-only revision/impact command, explicit adoption, affected-worker fencing and deterministic evidence reuse/invalidation. Also, moved from P6-10 on 2026-11-01: continuation after an integration, acceptance or CI repair (the last moved from P6-22 by ADR-0187), with its own ADR for the cross-invocation correction protocol that ADR-0154 records as missing. Until then a failed integration or acceptance stage ends the run honestly.

**Acceptance criteria:**

- [x] New source content cannot silently replace approved intent or remove required outcomes.
- [x] Only pre-authorized in-envelope revisions proceed without another operator action; none-policy outside-envelope work ends blocked.
- [x] Affected candidates/decisions/effects lose current eligibility while prior receipts remain historical.

**Tests** — INT-03–INT-04 and INT-07, DEC-03–DEC-06: source/base/rubric changes during active workers and pending publication.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/05-integration-and-change-impact.md); specification, scopes, state, core CLI.

**Completed technical work** — The pure `revisionImpact` calculation and preview-first `wl delivery revise` with explicit, reasoned adoption and separate approval for removals ([ADR-0192](../docs/decisions/0192-revision-impact-and-explicit-adoption.md)), covered by nine cases. The cross-invocation correction protocol is accepted as its own record ([ADR-0193](../docs/decisions/0193-cross-invocation-correction-protocol.md)). Its continuation is implemented as a correction revision ([ADR-0197](../docs/decisions/0197-correction-revisions-and-stage-reuse.md)):

- `wl delivery continue` previews and, when accepted, records the next revision with a `corrections` entry naming the retained failure and the owning unit.
- The journal reopens a `failed` or `blocked` run only for that exact retained failure, within the journal-derived repair budget, and only under a new exact-plan grant; the failed run's grant and any envelope grant are refused.
- The route adds `correction-N:<unit>` before the unit's verification.
- The controller reuses only stages that the impact keeps, that need no delegated decision, whose predecessors were reused and whose original still inspects with the same evidence.
- The operator report lists the continue action and the continuation chain.

**Evidence** — Engine cases on a synthetic controller host: a failed integration is previewed without writing; the failed run's grant and a fresh envelope grant are refused; reopening under a new grant records the chain; the later seeded-producer rule reuses no grant- or revision-bound stage, so every unit and downstream stage runs again and the predecessor's failure stays historical; a stale original forces its dependents to run again; pending effects and a spent repair budget refuse the continuation; compiled CLI preview and acceptance pass. A decision case shows that a delegated decision becomes stale once a later revision is adopted, keeping its record. Mutation checks confirm that the new-grant rule and evidence re-inspection are each load-bearing.

**Feedback privacy** — Eight dedicated projection cases and the actual extended `eval:assembly` control verify private case ID/status only on both failed and passed original Git/Docker product proofs, through the fixed historical feedback reader. Private objectives, descriptors, assertion details, manifest identities and result artifacts remain absent; public pinned guidance remains available. The root-stage locator/runtime in this reader fixture is explicitly synthetic, so it supplies no native controller acceptance.

**Completed producer** — [ADR-0208](../docs/decisions/0208-seeded-correction-producer.md) implements the registered seeded producer: every unit starts a new workspace at its predecessor's committed head, reruns its chain under the new exact-plan grant, and the corrected unit reruns its builder with the retained failure before independent QA. The model-free public composition (`eval:public-continuation`) observes failed product QA, an explicitly recorded correction revision, a seeded rebuild and a completed `ready-pr`. Only independent units can be seeded; old decisions, grants and commit receipts remain historical. Acceptance-origin corrections now retain historical independent explanations or a rejected human subject/note; they carry no approval or renewed authority. Bounded verification/review repairs on top of the exact correction root are now implemented ([ADR-0211](../docs/decisions/0211-seeded-correction-roots-for-qa-repairs.md)), with predeclared-budget refusal/acceptance controls and actual fresh Docker verification. The task-closure gate now passes on the final integrated tree. The conservative CI prerequisite now reads exact historical publication/CI/repair evidence and refuses ambiguous or non-code conclusions, wrong repository/base and replenished push limits ([ADR-0212](../docs/decisions/0212-retained-ci-correction-evidence.md)); the final-tree fast gate, Linux arm64 Node 20/24 component controls and the repeated complete gate pass (4214 tests in 242 files, including offline packaging). The optional fixed GitHub feedback reader now projects complete bounded issue/review comments without bodies or authors, refuses partial or moved-head reads, and supports original-process cancellation ([ADR-0213](../docs/decisions/0213-complete-bodyless-ci-feedback.md)). The CI-origin producer is now implemented with an explicit version-two plan, a fresh exact-plan grant, complete stable bodyless-feedback admission, exact published-head seeding and original-topic/PR non-force publication in the separately installed SDK composition ([ADR-0214](../docs/decisions/0214-versioned-ci-correction-production.md)). Its actual Git/Docker execution reaches fresh CI and blocks ungranted merge; preserve both failed development command reports and the passing corrected readback separately. Final-tree focused controls pass 499 tests in ten files; the fast gate passes 4275 tests in 251 files. The complete macOS arm64/Node 24.22.0 gate passes 4275 tests in 251 files, offline packaging and every remaining check (CHECK PASS in 717s). The maintainer's wider envelope-grant option remains Proposed in `docs/decisions/0198-envelope-grant-continuation.md`; the implemented default requires a new exact-plan grant. Native client and hosted acceptance remain P6-27 work. P6-22's producer is implemented; its native/hosted acceptance remains explicit.

---

## P6-30 · Scheduled impact and learning execution

**Status:** ✅ · **Size:** M · **Depends on:** P6-10, P4-03, P4-04, P4-06

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Execute due authorized observations through the same recoverable runner.

**Deliverables** — Local tick/enqueue integration, deduped checkpoint identities, MCP-first reads and explicitly delegated learning decisions.

**Acceptance criteria:**

- [x] Two due ticks schedule one observation for the same launch/checkpoint revision.
- [x] Missing access remains unknown; none-policy completion/blocking follows its initial evidence contract.
- [x] No learning decision changes production flags, deploys, sends messages or silently closes unmeasured work.

**Tests** — LEARN-01–LEARN-04 and EVAL-12: fake clocks, grounding fixtures and actual local scheduler replay.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/08-learning-and-maintenance.md); measure-impact, decide-next, utilities.

**Completed technical work** — Deterministic due-observation identities, at-most-once `wl measure tick` scheduling in the external store, single policy settlement of unknowns and effect-free machine learning recommendations ([ADR-0194](../docs/decisions/0194-scheduled-observations-and-learning-recommendations.md)). Fourteen cases verify the three criteria at the component level.

**Composition** — Each scheduled observation becomes its own read-only delivery run ([ADR-0200](../docs/decisions/0200-learning-observation-runs.md)). A `learning-observation` endpoint routes `plan → observation → handoff`; its plan names exactly one scheduled, unsettled key, and planning refuses any other. Its grant may only read and report, and unattended runs require a delegated `learning-outcome` decision that any of its four outcomes satisfies. The fixed `RunnerObservationStages` host executes it ([ADR-0201](../docs/decisions/0201-learning-observation-host.md)):

- reads go through the client's MCP connection, never an HTTP bridge, and only within grant read rules scoped to the observed subject; an unserved or refused read stays unknown;
- the readings are stored before the observation is settled once in the run's name, and an interrupted read settles nothing;
- the native judge and challenger decide `learning-outcome` over the exact observation brief, which names every unknown reading;
- the handoff stores the effect-free recommendation as a run artifact;
- supervised observation routes are refused at static preflight.

**Evidence** — Eight route cases from ADR-0200 and eight engine-driven host cases with a synthetic client MCP host and synthetic native judge processes. The host cases cover: a complete none-policy run with no prompt and two MCP reads; completion with unknowns only when allowed; blocking without a decision for a missing tool or an ungranted read; a `kill` recommendation that carries a separately authorized proposal; an interrupted read that leaves the observation open; the supervised refusal; and a scheduler replay. In the replay, the built CLI runs `wl measure tick` twice as separate processes, as a crontab entry would; it schedules once and deduplicates once, and the run completes. No cron or launchd daemon was installed, no real MCP server or provider was read, and the judges certify no model.

## P6-31 · Maintenance proposals and bounded recurring envelopes

**Status:** ✅ · **Size:** M · **Depends on:** P6-30, P6-29

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Turn recurring evidence into reviewable follow-up work without self-authorizing an endless backlog.

**Deliverables** — Pinned local inspections, immutable proposal records, deduplication/dismissal and optional separately authorized recurring delivery admission.

**Acceptance criteria:**

- [x] A finding creates a proposal with source/base/criteria/tests, not an implicit code or tracker mutation.
- [x] Agents cannot silently edit policies, guidance, budgets or their own evaluation standards.
- [x] Recurring authorization enforces per-run and aggregate limits and creates independent auditable run identities.

**Tests** — LEARN-05–LEARN-06 and EVAL-12: repeated findings, stale evidence, actual local tool inspection and self-authorization attacks.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/08-learning-and-maintenance.md); learning, configuration, maintenance examples.

**Completed technical work** — Pinned local inspections, immutable deduplicated proposals with retained dismissals and evidence expiry, protected-path refusal and bounded recurring admission with independent run identities ([ADR-0195](../docs/decisions/0195-maintenance-proposals-and-recurring-admission.md)). Nine cases, including an actual `git grep` inspection, verify the three criteria at the component level. `wl maintenance inspect`, `propose`, `proposals`, `dismiss` and `admit` expose them ([ADR-0196](../docs/decisions/0196-maintenance-commands-and-recurring-delivery-intake.md)). A finding always comes from a fresh run of the pinned inspection. Admission re-checks currency and captures each admitted proposal once as its own delivery source with mapped criteria. It creates no plan, queue entry or grant, so the run still needs its own plan and exact-plan grant.

**Evidence** — Eight compiled-CLI and component cases (EVAL-12 for maintenance): an actual `git grep` finding becomes one proposal, then a duplicate and a retained dismissal; a fresh run with no finding records nothing; invalid inspections are refused without echoing input; one admission per key maps its criteria and writes no plan or journal; stale evidence, an unpinned inspection and a merge envelope are refused; and a competing admission recorded during inspection makes the command write nothing.

---

## P6-32 · Expanded V1 documentation and release closure

**Moved** — Now [P7-13 · Expanded 1.0.0 documentation and release closure](./phase-7-release-readiness.md#p7-13--expanded-100-documentation-and-release-closure) (2026-11-07), with its history and checked criteria unchanged.

---

## P6-33 · Complete unattended research host

**Status:** ⏸️ · **Size:** L · **Depends on:** P6-10, P6-12, P6-34, P2-01

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Complete a research flow from one authorized request through challenged evidence and a stored brief.

**Deliverables** — Runner integration for ResearchWorkflow/source operations, independent angles/refuters, synthesis, finite source/repair budgets and terminal report outcomes. Also, moved from P6-10 by ADR-0179: the report-level research stage host and how unit research claims count toward milestone integration and acceptance; fixed dispatch already runs unit research claims and refuses both routes until then.

**Acceptance criteria:**

- [x] None-policy research needs no later human questions for angle selection, ambiguity resolution, challenge or final report acceptance.
- [x] Contradictory/missing sources remain cited conflicts/unknowns; load-bearing findings cannot be discarded to finish.
- [x] Research has no implementation/merge authority and remote sharing remains separately granted.

**Tests** — RSR-01–RSR-06 and EVAL-10–EVAL-11: hostile/conflicting source fixtures, checkpoint recovery and real reference-client research trials.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/10-unattended-decisions-and-research.md); research skill/protocol, providers, runner, core CLI.

**Completed technical work** — The fixed research host `RunnerResearchStages` runs the report-level `research` stage and the research route's local `handoff` ([ADR-0184](../docs/decisions/0184-unattended-research-host.md)). It pins one research plan of at most eight angles, queries available angles with at most two repairs, examines every load-bearing claim with separate verifiers and counts only host-observed valid results. Source, claim and byte budgets, and a 30-minute wall deadline, apply. The brief is derived from stored entries alone and captured locally; the delegated `research-sources` decision judges its exact bytes. `NativeResearchWorkers` runs each source and examination as a read-only native purpose inside the stage's owned process scope. Two narrower choices are recorded in the ADR: supervised report research is refused, and research claims inside implementation milestones stay refused because integration assembles only code-bearing work.

**Evidence** — Engine-driven cases on the synthetic transport complete a none-policy research route with zero prompts, including one where every source, refuter and decision is an owned synthetic native process. Further cases keep contradictions, identical excerpts and open questions under three uncertainty policies. Crashed, fixture and evidence-free sources and crashed refuters never become observations. Over-budget results are refused rather than trimmed. Cancellation and reconcile keep the stored sources and question. Hostile source text has no file, merge or publication effect. A rejected decision, a host without the adapter and a supervised route stop before completion.

**Awaiting** — Real reference-client research trials (RSR-01 with a native client, EVAL-10 and EVAL-11 on the reference clients) need installed, signed-in native clients and real source providers, and the trusted runtime observers that P6-27 provides. Synthetic evidence does not certify a native client, a source provider or a model.

---

## P6-34 · Zero-intervention delegated decision policy

**Status:** ✅ · **Size:** L · **Depends on:** P6-02, P6-03, P6-04

**Design review:** accepted on 2026-10-24 · **Release:** 1.0

**Goal** — Permit a complete flow with one initial human authorization while preserving truthful decision provenance.

**Deliverables** — Exact-plan/request-envelope grants, decision-specific rubrics, independent challenge, typed machine decisions and no-prompt terminal fallbacks.

**Acceptance criteria:**

- [x] Spec/scope/framing/build-plan/acceptance/learning decisions can be explicitly delegated within their supported scope.
- [x] Profiles, worker messages and fetched text cannot create delegation or impersonate human approval.
- [x] None-policy emits no ask-user/native approval wait; missing non-delegable prerequisites terminate blocked, and gates remain mandatory.

**Tests** — DEC-01–DEC-06, AUTH-03–AUTH-08 and RUN-09: complete decision tables, legacy replay, prompt canaries and envelope scope attacks.

**Docs** — [Detailed contract](./specifications/autonomous-delivery/10-unattended-decisions-and-research.md); concepts, decision points, framing/spec/scopes, profiles, guards.

---

## P6-35 · Controller-owned worker credentials

**Status:** ⏸️ · **Size:** L · **Depends on:** P6-10, P6-34

**Design review:** added on 2026-11-04; design accepted on 2026-11-08 ([ADR-0209](../docs/decisions/0209-controller-owned-native-credentials.md)) · **Release:** 1.1.0 ([Phase 8](./phase-8-software-factory.md))

The implementation no longer waits for P6-27: the secret-store, injection, disposable-home and preflight work can be built and tested with fixtures. The real call per client and account kind that ADR-0209 requires stays in manual verification.

**Goal** — Let an authorized delivery run reach its endpoint unattended across token expiry and usage windows, without a worker ever holding or refreshing a stored credential.

**Deliverables** — The verifications listed in the proposed design (`docs/decisions/0209-controller-owned-native-credentials.md`), the maintainer's acceptance decision, and then, for Claude Code and Codex:

- a credential reference per binding, resolved from the operating system's secret store;
- injection per launch;
- disposable worker homes, with every credential store denied;
- a credential preflight before any claim;
- pausing on an exhausted usage window.

The documentation also records Antigravity as an unavailable worker, while its in-session harness use is unaffected.

**Acceptance criteria:**

- [ ] The maintainer accepts or rejects the design after one real call per reference client and account kind, a measured `claude setup-token` lifetime, and a usage-window signal or its absence.
- [ ] A Claude Code run spanning a token expiry, and a Codex run, complete unattended with no credential in any worker-writable path. A missing or invalid credential ends the run at preflight with a named reason.
- [ ] An exhausted usage window pauses the run and it resumes after the reset, keeping its work. Without a client signal, the attempt is reported as an infrastructure failure.

**Local implementation (2026-11-08):** everything the design names is built and fixture-tested:

- runtime clients name a signed-in home or a secret-store credential reference, never both;
- `wl delivery credential-store|credential-check` store and check a credential without exposing its value;
- each launch injects the credential into that process alone, with a disposable client home, and Claude's profile then grants no Keychain access;
- the run preflight names `public-host-credential-missing` and `public-host-credential-store-unavailable`;
- the controller waits on an exhausted Codex usage window in `waiting-external` and continues the same run after the reset.

Claude Code reports no window, and no client validates an injected credential or its expiry without a model call. All three acceptance criteria need the maintainer's accounts; see [manual verification](./manual-verification.md#worker-credentials-p6-35).

**Tests** — Credential reference and resolution contracts; synthetic clients that honour or reject an injected credential; boundary probes showing every credential store denied; preflight refusals; window pause and resume on a fake clock; live acceptance on the maintainer's accounts.

**Docs** — The proposed design and its acceptance, the platform guide (macOS and Linux first; a headless Linux secret store; Windows through WSL2), the runner tutorial, the README note on Antigravity, and manual verification.

---

## P6-36 · Agent attribution on journal events

**Status:** ✅ · **Size:** M · **Depends on:** P6-10, P6-34

**Design review:** added on 2026-11-04 · **Release:** 1.0

**Goal** — Record which client and model acted, through which channel a person decided, and why, before the v1 event contract freezes ([ADR-0210](../docs/decisions/0210-operator-overview-and-change-feed.md)).

**Deliverables** — The following optional fields on journal events:

- the client identity of an agent actor (client, version, model), with its source;
- the channel of a person actor;
- a bounded rationale on decision events.

To fill them:

- Generated adapters declare their client.
- Person decision commands accept a channel option and a rationale through stdin or a file.
- Delegated decisions surface a reason they already record, and nothing is generated for them.

**Acceptance criteria:**

- [x] Events without the new fields stay valid and replay identically. The v1 compatibility fixture changes once, with ADR-0210 as its reason.
- [x] A declared identity is labelled declared. Nothing is inferred from client text, worker output or messages. A worker cannot record a person's channel or rationale.
- [x] A rationale is bounded, never read from argv, and absent from default diagnostics and exports.

**Progress** — Optional client provenance, person channels and private rationale are implemented through journal validation, store append APIs, owned adapter declarations and person CLI producers. Supervised delivery descriptions refer to unchanged immutable human decisions; delegated plan/build-plan/acceptance observations copy original retained judgment reasons. Metadata creates no approval, transition or authority. Legacy fixture replay and the one intentional two-event baseline update remain covered; the human-description payload has a new additive identity. The full macOS arm64/Node 24.22.0 gate passes 3992 tests in 218 files and offline package installation: `CHECK PASS in 680s`. The producer commit's fast gate passes 3056 tests in 165 files: `CHECK PASS (fast) in 643s`. Actual Linux arm64 compiled-CLI stdin/decision/redaction exercises pass on Node 24.22.0 and 20.0.0. No native model or hosted mutation is needed for this task.

**Tests** — Schema and replay tables over legacy fixture journals, adapter generation snapshots, actor spoofing attempts, and argv and secret canaries.

**Docs** — ADR-0210, state and messaging, decision points, the core CLI reference.

---

## P6-37 · Operator overview read model

**Status:** ✅ · **Size:** L · **Depends on:** P6-25, P6-30, P6-36

**Design review:** added on 2026-11-04 · **Release:** 1.0

**Goal** — One deterministic read of everything happening in the harness, ordered by what needs a person first, that a terminal, a skill or a separate interface can render without deciding anything.

**Deliverables** — `wl overview [--json]` emitting `wholeloop/overview@1` (ADR-0210), with:

- store health and a headline chosen by a fixed precedence;
- the ordered attention list, each entry with its reason category and exact next permitted command;
- the item tree with each item's flow position;
- delivery run summaries;
- agents: delivery workers as observed, and session agents as last seen from attributed events;
- worktrees, scheduled checkpoints and bounded recent outcomes;
- the cursor and a digest.

Also `wl overview schema`, and fixture stores with expected output for every headline state and attention kind under `test/fixtures/overview/`.

**Acceptance criteria:**

- [x] On the same store, the overview agrees with `wl status`, `wl delivery report` and `wl delivery runner-status`, and reuses their rules. Every new rule lives in `src/` with a table-driven test.
- [x] Rebuilding every projection gives a byte-identical digest, and the cursor names the exact journal positions read.
- [x] Fixture, claimed, observed, human and policy provenance stay distinct, and no prompt, credential or source payload appears. Output stays bounded on a large store.

**Evidence** — Shared flow/report/runner differential reads, both projection rebuilds, exact cursor prefixes, stale displayed-decision refusal, same-cursor auxiliary changes, private canaries, 600-item bounds and the 23 consumer archives pass. The final full macOS arm64/Node 24.22.0 gate passes 4121 tests in 227 files, offline package installation and all remaining checks: `CHECK PASS in 674s`. The compiled CLI also passes actual Linux arm64 privacy and rebuild-cursor/digest smoke checks on Node 24.22.0 and the published Node 20.0.0 floor; no full Linux suite or native client acceptance is claimed. The feed runtime remains P6-38.

**Tests** — Tables per headline state and attention kind, differential checks against the existing reads, digest after a rebuild, secret canaries, and a large-store fixture.

**Docs** — ADR-0210, core CLI, state and messaging, an architecture page for the overview and its contract kit.

---

## P6-38 · Local change feed

**Status:** ✅ · **Size:** M · **Depends on:** P6-37

**Design review:** added on 2026-11-04 · **Release:** 1.0

**Goal** — Follow the harness live from another process without polling commands or reading journal files. This delivers the optional watch P6-25 left out.

**Deliverables** — `wl watch` writing `wholeloop/watch-frame@1` documents to stdout (ADR-0210):

- a full overview with its cursor and digest, at start and after each committed change;
- redacted, bounded events;
- liveness, kept apart from progress;
- problem frames.

File events are hints, a poll is the fallback, and `--since <cursor>` resumes. There is also a recorded feed fixture for consumers. The feed makes no store writes and opens no listener.

**Acceptance criteria:**

- [x] When a fixture journal is replayed event by event, every overview frame equals `wl overview` at its cursor. A sequence gap or digest mismatch emits a problem frame and stops the feed advancing.
- [x] A feed killed and restarted with `--since` misses and repeats no change, and a heartbeat never reads as progress.
- [x] It works on macOS and Linux, both with file events and with the poll forced, and a guard shows that it writes nothing in the store and opens no port.

**Evidence** — The public CLI, SDK differential reads, actual-journal clock race, recorded consumer feed, both rollovers, held locks, sequence/hash/prefix refusal, observation-only changes and output-pressure cancellation pass. The corrected implementation at `5713435` passes 4170 tests in 234 files, offline npm archive/install and every other full macOS arm64/Node 24.22.0 gate: `CHECK PASS in 706s`. Actual compiled-CLI feature checks pass on Linux arm64 with Node 20.0.0 and 24.22.0, including forced poll, observed filesystem hints, SIGKILL/resumption, interrupted output, closed consumers and guards observing zero store mutations and zero listeners. These Linux feature checks are not a full Linux suite or native/model acceptance. Earlier failed checks and the final clock correction remain recorded in the journal.

**Tests** — Replay equality, kill and resume, forced poll, journal rollover, a held writer lock, and a Linux container run.

**Docs** — ADR-0210, core CLI, the controls specification's inspection surfaces, the overview architecture page.

---

## P6-39 · Complete harness performance audit and bounded runtime overhead

**Status:** ✅ · **Size:** L · **Depends on:** P0-02, P6-38

**Design review:** requested and authorized on 2026-11-05 · **Release:** 1.0

**Goal** — Make runtime efficiency a release requirement across the entire harness, including standalone steps, chained flows, autonomous routes and shared utilities, regardless of CLI or native skill entry point.

**Deliverables** — A complete execution/caller map; reproducible cold/warm fixture measurements; independently observed process, filesystem, lock, persistence and retry counts; explicit controller/external-work timing; findings with causes, fixes and regression controls. Cover all thirteen canonical steps and each autonomous stage, plus next/status/setup/sync, discovery/config/providers, overview/watch, fan-out, cancellation and recovery. Preserve real account/service/platform evidence separately.

**Acceptance criteria:**

- ~~Every canonical step, supported composition and entry-point family has an executed trace and explicit result; no unaudited path is labelled fast or complete.~~ Narrowed by the maintainer on 2026-11-07: the complete autonomous EVAL-09 route has an attributed per-stage trace, every canonical step has its missing-input trace, and the components in the ledger have count controls. Other paths are unaudited, not claimed fast; a future performance problem is handled as a defect.
- ~~The total controller overhead meets the initial five-second ceiling on declared reference cases, excluding measured model and actual project-test work; aim lower, report both wall and overhead, and account for overlapping intervals without subtracting orchestration or hiding waits.~~ Withdrawn by the maintainer on 2026-11-07: the ceiling was set before its consequences were known. Wall time and overhead are reported in the ledger: 68–72 seconds for the complete route, about 40 seconds of wholeloop overhead.
- [x] Operation-count and growth regressions detect redundant graph traversal, repeated scans, no-op writes/locks, unnecessary processes, quadratic work and unbounded loops/retries in the changed components, and every remaining route cost has a documented reason in the ledger. A complete-route counter budget is not part of 1.0.
- [x] macOS and Linux measurements retain exact source/runtime/fixture identities and original correctness/authority guarantees. Windows/WSL2 and unavailable native clients retain their stated limits.

**Tests** — Differential current-proof controls, operation-count limits, cold/warm/scaling fixtures, bounded wait/retry/cancellation cases and end-to-end overhead checks. Development test-suite duration is a separate metric from runtime overhead.

**Docs** — Determinism and testing, ADR-0227, v1 acceptance, the [executed audit ledger](./performance-audit.md) and the journal.

**Closed** — 2026-11-07 by maintainer decision at the measured state: the controller of the complete model-free route went from 160.1 to 60.3 seconds and the whole rehearsal from about 175 to 68–72 seconds, with equivalent outcomes and passing macOS and Linux gates.

---

## P6-40 · Repository guidance in autonomous runs

**Status:** ✅ · **Size:** L · **Depends on:** P6-02, P6-08, P1-07

**Design review:** requested and authorized on 2026-11-07 · **Release:** 1.0.0

**Goal** — Let an autonomous run use the target repository's own skills, agents, rules and instructions as supervised steps already do, while keeping every worker's input pinned and deterministic.

**Context** — Supervised steps resolve slots through `wl discover` and load the bound repository guidance. Autonomous workers run with native skill, rule and project-instruction loading disabled, and receive repository knowledge only through `plan.guidance`: single files pinned by slot, path and SHA-256 at the base commit. Nothing fills those pins from discovery today, a multi-file skill cannot be pinned, the repository's instruction files reach no worker unless pinned by hand, and every pin goes to every worker regardless of role.

**Deliverables** — Plan preparation runs discovery and slot resolution on each repository's pinned base and proposes guidance pins: the repository's instruction files and the skills, agents and rules that resolve each slot, with the same precedence as supervised steps. Ambiguities are questions answered before authorization, because a run without intervention cannot ask later; the grant covers the exact pinned set through the plan digest. Directory pins carry a manifest of per-file digests for skills made of several files. Each worker receives only the slots of its role (builder, verifier, reviewer, planner, researcher), and the selection is recorded with the assignment.

**Acceptance criteria:**

- [x] For the same repository and base, an autonomous plan proposes exactly the guidance a supervised step resolves for the same slots, and the proposal is deterministic.
- [x] A changed, moved or added guidance file after authorization refuses the affected stage instead of silently using different bytes.
- [x] Multi-file skills are pinned and delivered whole, within explicit size bounds.
- [x] Workers receive only their role's slots; a reviewer never receives build-only guidance unless a slot says so.
- [x] Native skill and project-instruction loading stays disabled in workers; pinned context remains the only channel.

**Evidence** — `test/unit/delivery/guidance.test.ts` proposes pins from real Git fixtures and compares every slot with the supervised `discover` and `resolveSlot` result for the same tree; repeats the proposal deterministically; asks for tied candidates and honours answers and bindings; blocks oversized skills; refuses changed bytes, a file added to a pinned skill directory and a changed instruction set; counts two Git processes per repository for verification; and shows builders, reviewers and verifiers receiving only their slots through the composition's `guidanceContext`. Narrowed: user-level skills are not candidates (they live outside the repository), research-report workers receive no repository guidance, and the model-backed EVAL-09 variant waits on the hosted trial repository and model accounts in manual verification.

**Tests** — Equivalence between supervised resolution and the plan proposal on fixture repositories with skills for several clients; directory-pin manifests; stale-pin refusals; per-role delivery; an EVAL-09 variant whose builder must follow a repository skill to pass.

**Docs** — Repo skills and slots, delivery planning tutorial, autonomous delivery architecture, ADR-0009, ADR-0054, ADR-0207 and v1 acceptance.

## P6-41 · Envelope-grant continuation

**Status:** ⬜ · **Size:** M · **Depends on:** P6-29, P6-34

**Design review:** accepted on 2026-11-08 ([ADR-0198](../docs/decisions/0198-envelope-grant-continuation.md)) · **Release:** 1.1.0 ([Phase 8](./phase-8-software-factory.md))

**Goal** — Let a run with no intervention repair an integration or acceptance failure and continue without a person, inside its original envelope grant and repair budget.

**Deliverables** — The reducer accepts the run's still-active envelope grant as the first grant on a correction revision only when the run's intervention is `none`, the envelope grant lists `code.write`, `git.commit` and `test.run`, the revision stays inside the envelope and the journal-derived repair budget remains. The controller records that continuation itself and runs it in the same foreground invocation that observed the failure. Every other case keeps ADR-0197's new-grant rule.

**Acceptance criteria:**

- [ ] A `none` run with a repairable integration or acceptance failure continues to its endpoint with no human step, within its repair budget.
- [ ] Any missing condition keeps the `continuation-requires-new-grant` refusal, and an exhausted budget ends the run.
- [ ] A revoked or expired envelope grant never authorizes a continuation.

**Tests** — Reducer and runner tests for each condition, and a model-free rehearsal with a seeded repairable failure.

**Docs** — ADR-0198, an amendment to ADR-0197, the runner tutorial and the journal.

---

## Acceptance and execution boundary

Every task is accepted for 1.0, with authorization for implementing all technically executable work one task at a time, committing tested changes and updating documentation without waiting for manual checks or another signal. Manual checks are deferred, not passed. Take pragmatic implementation decisions within this scope. Account/model choices, hosted mutations, actual project merges, publication and changing the bootstrap commit workflow remain separate execution authority.

[◀ P5](./phase-5-reach-release.md) · [Roadmap](./README.md) · [P7 ▶](./phase-7-release-readiness.md) · [Specification index](./specifications/autonomous-delivery/README.md) · [Journal](./journal.md)
