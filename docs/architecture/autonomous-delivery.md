# Autonomous delivery — expanded V1 design

> **TL;DR** — The runner coordinates existing wholeloop steps from an issue/document through implementation, actual QA, adversarial review and integrated validation to a PR. A complete research or implementation flow can use one initial authorization with zero later human intervention. Conditional merge is a separate opt-in capability.

> [!NOTE]
> **Status: 🚧 partial, experimental in 1.0.0.** Autonomous delivery ships experimental: its commands and schemas may change in a minor release, and its certification with signed-in native clients continues after the release ([compatibility](../extending/compatibility.md#experimental-surfaces)). The expanded scope was accepted, and sequential implementation authorized, on 2026-10-24. Source intake, plan/envelope preparation, operator/broker metadata, journaled state, durable claims and local checkpoint/effect/ownership recovery and persistent finite budgets and role-bound worker/context contracts are implemented. Dedicated native-host contracts and owned Docker API/CLI/browser execution are also implemented. Actual native-model certification and complete unattended flows remain pending; existing supervised behavior and acceptance evidence remain unchanged.

## Observed behavior hosts

Pinned acceptance cases execute objective [API/CLI](../tutorials/delivery-behaviors.md) and [browser](../tutorials/delivery-browsers.md) behavior in exact owned environments. The browser uses the official MCP SDK, fixed native tool constraints and a private registered Docker exec pipe. Fresh observed references, exact page/tab context, complete bounded PNGs and separate backend roundtrips prevent screenshots or cosmetic state from establishing persistence. Original grants, effect budgets, candidate binding and unknown-action refusal apply to every host. [Private HTTP evaluation](../tutorials/delivery-private-acceptance.md) mounts pinned inputs only into the owned verifier and requires relevant observed red/green sensitivity for applicable regression acceptance. A candidate-only pass leaves aggregate/sealed acceptance unestablished; native/model and independent host certification retain their separate scope.

[Integrated milestone preparation](../tutorials/delivery-integration-candidates.md) observes the complete required committed Git vector, contracts, recipes, acceptance/data/gate-policy inputs and repair ownership. Immutable records recheck current inputs and block moving bases. Preparation performs no assembly, execution or publication and grants no reuse authority. [Owned assembly](../tutorials/delivery-assembly.md) supplies separate original-grant/per-step Git effects, global dependency order, retained conflicts, finite repair counters and current complete application/contract verification. Existing fixed hosts execute cases; milestone reports retain exact failed/passed artifacts and grant no whole-feature completion, publication or rollback authority.

## Delegated decisions

The [decision controller](../tutorials/delivery-decisions.md) pins original private rubrics, exact artifacts/evidence and independent planner/challenger observations. It preserves machine provenance and current eligibility separately from legacy human approvals. Fixture judgments cannot enable actual envelope execution. Policy-only preflight and no-prompt fallbacks preserve missing facts, mandatory gates, original budgets and runtime limitations; public none-policy research-report/to-PR composition is implemented, while actual native delivery/research acceptance remains pending.

## Versioned CI correction production

The explicit version-two plan and matching planning record support original CI corrections ([ADR-0214](../decisions/0214-versioned-ci-correction-production.md)). The public proposal command requires a new exact-plan grant and reports the separate installed-SDK requirement. The SDK composition binds complete stable current feedback, original-topic scope and retained budgets before builders; it seeds the exact published product root, reruns current QA and uses non-force publication to the original PR. Readback also binds the original URL, so another matching marker cannot substitute. No public runtime flag, envelope continuation or credential authority is added. Local fixtures and real Git/Docker execution supply no native/model or hosted certification.

## Current CI feedback reads

The optional GitHub code-host feedback reader returns a complete bounded, bodyless observation of issue comments, inline comments and reviews for an exact open PR/head/base ([ADR-0213](../decisions/0213-complete-bodyless-ci-feedback.md)). Missing permissions, malformed or truncated pages and moved heads refuse completeness. Raw bodies and author identities stay inside the adapter; every projected item remains unadopted. This read capability supplies no correction, approval or publication authority. CI-origin execution is implemented in the separately installed SDK composition; local task verification passes; native/hosted acceptance remains separate.

## Read the proposal

The [specification index](../../roadmap/specifications/autonomous-delivery/README.md) links ten detailed chapters.

## Available now: request intake

Use [delivery source](../tutorials/delivery-intake.md) to capture bounded local files, inline requests, existing items or complete explicitly scoped remote observations. Immutable external snapshots bind content/revision, reference, provider, repository/tenant scope, attachment digests and extraction maps. Repeating identical intake preserves identity; changed inputs retain their own snapshots. Imported observations remain distinct from reads actually performed through the existing provider host path. Intake starts no worker and grants no execution or publication authority. [ADR-0093](../decisions/0093-immutable-delivery-source-intake.md) defines this implemented boundary.

| Concern | Detailed contract |
| --- | --- |
| Inputs, source revisions and operator authority | [Contract and authorization](../../roadmap/specifications/autonomous-delivery/01-contract-and-authorization.md) |
| Durable scheduling, worker claims and recovery | [Runner](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md) |
| Actual application/services/data isolation | [Environments](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) |
| Executable criteria and independent evidence | [Behavioral QA](../../roadmap/specifications/autonomous-delivery/04-behavioral-qa.md) |
| Combined work and requirement changes | [Integration](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) |
| PR publication, CI repair and conditional merge | [Publication](../../roadmap/specifications/autonomous-delivery/06-publication-ci-and-merge.md) |
| Limits, timeline and diagnosis | [Controls](../../roadmap/specifications/autonomous-delivery/07-controls-and-observability.md) |
| Scheduled observation and follow-up proposals | [Learning](../../roadmap/specifications/autonomous-delivery/08-learning-and-maintenance.md) |
| Full-flow evaluation and actual acceptance | [Validation](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) |
| Complete no-intervention research/implementation | [Delegated decisions](../../roadmap/specifications/autonomous-delivery/10-unattended-decisions-and-research.md) |

## Design boundaries

[Delivery workers](../tutorials/delivery-workers.md) bind fresh role tools, context audiences, current queue attempts and private grants. Closed worker output stays a claim; separate controller observations require actual artifact bytes and current runtime ownership and still establish no acceptance. Actual native/backend enforcement remains subsequent work under ADR-0100.

[Delivery budgets](../tutorials/delivery-budgets.md) retain original deadlines, usage provenance, lifetime reservations, CI/repair counters, artifact bytes and no-progress signatures across controllers and plan revisions. Unsupported hard metering refuses; historical unmetered work stays unknown and cannot receive retroactive hard caps. ADR-0099 separates validated progress from heartbeats and preserves old gate budgets.

[Checkpoint recovery](../tutorials/delivery-checkpoints.md) pins exact input manifests, retains finite single effect invocations and observes outcomes separately. Unknown ownership or response never starts a replacement or repeats a possible write. Actual child/crash fixtures verify local recovery while native/backend and operation-specific hosts remain pending. ADR-0098 preserves legacy exhausted gates and adds explicit non-destructive stopped-writer lock retention.

[Delivery recovery](../tutorials/delivery-recovery.md) tracks prepared plans/envelopes, replays immutable delivery events and reconstructs disposable caches without recreating private authority or changing legacy human/PR receipts. Unknown versions and mismatched identities refuse. Durable queue ordering/reservations and scoped claim/fencing are also implemented; actual workers and endpoint evidence remain later increments. The [queue guide](../tutorials/delivery-queue.md) exposes metadata without dispatch, and ADR-0097 defines its trusted host admission boundary.

[Delivery authorization](../tutorials/delivery-authorization.md) records exact operator grants and durable revocations without starting workers or executing external effects. Endpoints are permission ceilings; effect/decision/repository/read scopes remain explicit. Broker admission and messages require current private controller context and an isolated runtime observation; worker output stays a claim and cannot forge human testing. Fixture runtime evidence does not establish actual containment. [ADR-0095](../decisions/0095-operator-grants-and-scoped-worker-claims.md) records this implemented boundary and the later backend/runner obligations.

Repository guidance reaches workers only through plan pins: `wl delivery guidance` proposes them from each pinned base with supervised slot precedence, skill directories are pinned whole, and each role receives only its slots ([ADR-0207](../decisions/0207-public-implementation-route-composition.md#repository-guidance-in-workers-p6-40)).

[Delivery planning](../tutorials/delivery-plan.md) adds immutable plan revisions and initial request envelopes. It checks exact source criteria, unique ownership, complete outcome/milestone coverage, contract-first dependencies and local repository bases. Receipts expose dependency waves and a policy-selected proposed route while retaining not-granted/not-started. Existing item references and historical human records remain unchanged. [ADR-0094](../decisions/0094-revision-bound-delivery-plans-and-envelopes.md) separates structural fit from independent semantic acceptance and actual execution authority.

Endpoint and intervention are independent. A research-only grant does not permit code changes, and an unattended PR run does not permit merge. The owner can delegate the supported decisions once under an exact plan or bounded request envelope; each machine decision retains its policy and evidence basis.

The [runner controls](../tutorials/delivery-runner.md) now expose immutable preparation, current route/ownership inspection and explicit pause/resume/stop. The internal engine retains stage intents, private native cancellation and checkpoint recovery, and the public run and reconcile commands wire them to a fixed host; native stages join it only with trusted runtime proof. These controls alone execute no model and certify no endpoint.

Zero intervention means no later ask-user tool, human decision wait or interactive approval prompt. The runner resolves an authorized ambiguity or returns a terminal limitation when a prerequisite cannot be met. It does not bypass native permissions or repository protections.

Keep the core deterministic and the model/tool host explicit. Reuse existing hierarchy, criteria, gates, adapters and MCP-first connections. New worker containment and effect authority remain distinct from worktree separation and prompt instructions.

Conditional merge requires a separate current grant, exact tested candidate, complete successful required checks/reviews and a code host that enforces the relevant revision/protection contract. Default supervised use retains its current human testing and non-merging behavior.

The accepted [planning decision](../decisions/0092-expanded-v1-autonomous-delivery-planning.md) records why the direction is documented now without superseding existing runtime contracts. The implementation will need explicit technical decisions when those contracts change.

## Accepted implementation scope

This scope is accepted, with authorization for pragmatic implementation decisions, passing tests, docs and incremental commits without waiting for manual checks or further signals. Native capability acceptance remains pending. No cloud platform, marketplace, vendor API expansion or actual production operation is included.

<!-- docnav -->
[◀ Architecture](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Expanded delivery acceptance ▶](../reference/delivery-acceptance.md)
