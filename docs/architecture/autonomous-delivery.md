# Autonomous delivery — expanded V1 design

> **TL;DR** — The planned runner coordinates existing wholeloop steps from an issue/document through implementation, actual QA, adversarial review and integrated validation to a PR. A complete research or implementation flow can use one initial authorization with zero later human intervention. Conditional merge is a separate opt-in capability.

> [!NOTE]
> **Status: 🚧 partial.** The owner accepted the expanded scope and authorized sequential implementation on 2026-10-24. Source intake, plan/envelope preparation, operator grant/revocation metadata and scoped broker admission are implemented. Actual native/backend workers and complete unattended flows remain pending; existing supervised behavior and acceptance evidence remain unchanged.

## Read the proposal

The [specification index](../../roadmap/specifications/autonomous-delivery/README.md) links ten detailed chapters. The [Phase 6 roadmap](../../roadmap/phase-6-autonomous-delivery.md) tracks 34 accepted tasks with dependencies, deliverables, acceptance criteria, test cases and documentation obligations.

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

[Delivery authorization](../tutorials/delivery-authorization.md) records exact operator grants and durable revocations without starting workers or executing external effects. Endpoints are permission ceilings; effect/decision/repository/read scopes remain explicit. Broker admission and messages require current private controller context and an isolated runtime observation; worker output stays a claim and cannot forge human testing. Fixture runtime evidence does not establish actual containment. [ADR-0095](../decisions/0095-operator-grants-and-scoped-worker-claims.md) records this implemented boundary and the later backend/runner obligations.

[Delivery planning](../tutorials/delivery-plan.md) adds immutable plan revisions and initial request envelopes. It checks exact source criteria, unique ownership, complete outcome/milestone coverage, contract-first dependencies and local repository bases. Receipts expose dependency waves and a policy-selected proposed route while retaining not-granted/not-started. Existing item references and historical human records remain unchanged. [ADR-0094](../decisions/0094-revision-bound-delivery-plans-and-envelopes.md) separates structural fit from independent semantic acceptance and actual execution authority.

Endpoint and intervention are independent. A research-only grant does not permit code changes, and an unattended PR run does not permit merge. The owner can delegate the supported decisions once under an exact plan or bounded request envelope; each machine decision retains its policy and evidence basis.

Zero intervention means no later ask-user tool, human decision wait or interactive approval prompt. The runner resolves an authorized ambiguity or returns a terminal limitation when a prerequisite cannot be met. It does not bypass native permissions or repository protections.

Keep the core deterministic and the model/tool host explicit. Reuse existing hierarchy, criteria, gates, adapters and MCP-first connections. New worker containment and effect authority remain distinct from worktree separation and prompt instructions.

Conditional merge requires a separate current grant, exact tested candidate, complete successful required checks/reviews and a code host that enforces the relevant revision/protection contract. Default supervised use retains its current human testing and non-merging behavior.

The accepted [planning decision](../decisions/0092-expanded-v1-autonomous-delivery-planning.md) records why the direction is documented now without superseding existing runtime contracts. The implementation will need explicit technical decisions when those contracts change.

## Accepted implementation scope

The owner accepted this scope and authorized pragmatic implementation decisions, passing tests, docs and incremental commits without waiting for manual checks or further signals. Implemented intake evidence is recorded in Phase 6; later capability acceptance remains pending. No cloud platform, marketplace, vendor API expansion or actual production operation is included.

<!-- docnav -->
[◀ Architecture](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Core CLI ▶](core-cli.md)
