# Autonomous delivery — expanded V1 design

> **TL;DR** — The planned runner coordinates existing wholeloop steps from an issue/document through implementation, actual QA, adversarial review and integrated validation to a PR. A complete research or implementation flow can use one initial authorization with zero later human intervention. Conditional merge is a separate opt-in capability.

> [!NOTE]
> **Status: 📐 design.** This expanded 1.0 scope was requested on 2026-10-24 and has been reviewed/accepted by the owner, with sequential implementation authorized. These capabilities are not current commands or permissions. Existing supervised behavior and acceptance evidence remain unchanged.

## Read the proposal

The [specification index](../../roadmap/specifications/autonomous-delivery/README.md) links ten detailed chapters. The [Phase 6 roadmap](../../roadmap/phase-6-autonomous-delivery.md) contains 34 pending tasks with dependencies, deliverables, acceptance criteria, test cases and documentation obligations.

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

Endpoint and intervention are independent. A research-only grant does not permit code changes, and an unattended PR run does not permit merge. The owner can delegate the supported decisions once under an exact plan or bounded request envelope; each machine decision retains its policy and evidence basis.

Zero intervention means no later ask-user tool, human decision wait or interactive approval prompt. The runner resolves an authorized ambiguity or returns a terminal limitation when a prerequisite cannot be met. It does not bypass native permissions or repository protections.

Keep the core deterministic and the model/tool host explicit. Reuse existing hierarchy, criteria, gates, adapters and MCP-first connections. New worker containment and effect authority remain distinct from worktree separation and prompt instructions.

Conditional merge requires a separate current grant, exact tested candidate, complete successful required checks/reviews and a code host that enforces the relevant revision/protection contract. Default supervised use retains its current human testing and non-merging behavior.

The accepted [planning decision](../decisions/0092-expanded-v1-autonomous-delivery-planning.md) records why the direction is documented now without superseding existing runtime contracts. The implementation will need explicit technical decisions when those contracts change.

## Accepted implementation scope

The owner accepted this scope and authorized pragmatic implementation decisions, passing tests, docs and incremental commits without waiting for manual checks or further signals. Every proposed acceptance case remains unchecked. No cloud platform, marketplace, vendor API expansion or actual production operation is included.

<!-- docnav -->
[◀ Architecture](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Core CLI ▶](core-cli.md)
