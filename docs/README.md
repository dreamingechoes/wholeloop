# wholeloop documentation

> **TL;DR** — Start with an executable tutorial, then use the configuration and step references when you need them. Try local state without a model, frame one idea in a coding client, or work through a small change. Architecture and maintainer release work have separate reading paths.

> [!NOTE]
> **Status: 🚧 partial.** The source-installable core, all thirteen steps and seven client renderers are implemented. Native acceptance, scheduled activation and publication remain open. Generated artifacts and simulations are not live certification. Remote integrations are experimental, fixture-tested and service-unverified. [What remains for 1.0](./v1-acceptance.md).

## Contents

- [Start with your goal](#start-with-your-goal)
- [Tutorials and everyday use](#tutorials-and-everyday-use)
- [All thirteen steps](#all-thirteen-steps)
- [Configuration and integrations](#configuration-and-integrations)
- [Architecture and extensions](#architecture-and-extensions)
- [Contributing, acceptance and release](#contributing-acceptance-and-release)
- [Reading paths](#reading-paths)

## Start with your goal

For the expanded 1.0 scope, review the [autonomous-delivery design](./architecture/autonomous-delivery.md), [detailed specifications](../roadmap/specifications/autonomous-delivery/README.md) and [34 Phase 6 tasks](../roadmap/phase-6-autonomous-delivery.md). Revision-bound source intake, plan/envelope preparation and operator authorization/revocation metadata are available; complete no-intervention flows after initial authorization remain under implementation.

| Goal | First page | Successful stopping point |
| --- | --- | --- |
| Install in my existing coding client | [Getting started](./getting-started.md) | Managed files installed, doctor interpreted, skill selected |
| Try it without a model account | [Local core tour](./tutorials/local-core.md) | An initiative, preflight questions and recoverable local context |
| Understand what to answer during framing | [First framing](./tutorials/first-framing.md) | An approved final draft or recorded no-go, followed by recovery |
| Build a bounded change | [Small-change walkthrough](./tutorials/small-change.md) | Verified/reviewed work and a human testing handoff before publication |
| Pin a request before delivery planning | [Delivery intake](./tutorials/delivery-intake.md) | An immutable source revision without starting workers |
| Recover from a setup/workflow problem | [Troubleshooting](./troubleshooting.md) | A specific diagnosis and next action |
| Assess readiness for 1.0 | [Acceptance](./v1-acceptance.md) | Executed checks separated from owner decisions and deferred services |

## Tutorials and everyday use

| Page | What it answers |
| --- | --- |
| [Getting started](./getting-started.md) | Requirements, source build, installation, first skill, updates and removal |
| [Local client setup](./platforms/local-onboarding.md) | Targets, names, native directories and activation boundaries for seven clients |
| [Local core tour](./tutorials/local-core.md) | What the deterministic CLI does without a model |
| [First framing](./tutorials/first-framing.md) | Context, answers, owner outcome, exact final review and session recovery |
| [Small change](./tutorials/small-change.md) | Criteria, worktrees, gates and the human testing handoff |
| [Delivery intake](./tutorials/delivery-intake.md) | Bounded local/item/remote input, explicit maps and recoverable source identity |
| [Delivery planning](./tutorials/delivery-plan.md) | Explicit criterion ownership, dependency contracts, initial envelopes and plan revisions |
| [Delivery authorization](./tutorials/delivery-authorization.md) | Exact operator grants, finite deadlines, revocation and the worker trust boundary |
| [Utilities](./flow/utilities.md) | Skills versus core calls for `next`, `status`, `setup` and `sync` |
| [Troubleshooting](./troubleshooting.md) | Executable paths, discovery, permissions, state and exit codes |
| [FAQ](./faq.md) | Short answers and links for common choices |
| [Concepts](./concepts.md) | Initiatives, scopes, slices, parts, artifacts, providers and decisions |
| [Glossary](./glossary.md) | Vocabulary and mappings to common team terminology |

## All thirteen steps

Every step can be used on its own. The [flow overview](./flow/README.md) explains order and approvals; individual references cover inputs, outputs and constraints. Model-backed examples are requests to the coding client, not claims that terminal-only core calls perform those activities.

| Block | Step | Result |
| --- | --- | --- |
| Define | [research](./flow/define/research.md) | Source-linked evidence and open questions |
| Define | [frame-problem](./flow/define/frame-problem.md) | An owned problem and an explicit go/no-go outcome |
| Define | [write-spec](./flow/define/write-spec.md) | Stories, acceptance criteria and a measurement plan |
| Define | [cut-scopes](./flow/define/cut-scopes.md) | Approved deliverables and metric ownership |
| Build | [slice-work](./flow/build/slice-work.md) | Vertical slices and contract-first repository parts |
| Build | [build-slice](./flow/build/build-slice.md) | Implementation in a dedicated worktree |
| Build | [verify-works](./flow/build/verify-works.md) | Evidence that agreed behavior works |
| Build | [review-code](./flow/build/review-code.md) | Findings against the pinned change and repository rubric |
| Build | [open-pr](./flow/build/open-pr.md) | Human-tested draft publication |
| Rollout | [prepare-launch](./flow/rollout/prepare-launch.md) | Launch drafts and measurement/dashboard handoffs |
| Rollout | [ramp-exposure](./flow/rollout/ramp-exposure.md) | Evidence-backed decisions and unapplied exposure proposals |
| Learn | [measure-impact](./flow/learn/measure-impact.md) | Declared checkpoint observations, retaining unknowns |
| Learn | [decide-next](./flow/learn/decide-next.md) | A human keep/iterate/kill/unflag decision |

## Configuration and integrations

| Page | Use it for |
| --- | --- |
| [Configuration](./configuration/README.md) | User/project/run scopes and precedence |
| [Interaction profile](./configuration/profile.md) | Explanation, challenge, concurrency and language |
| [Providers](./configuration/providers.md) | Source/destination choices and the generated capability catalog |
| [Repository guidance](./configuration/repo-skills.md) | Reusing project skills, conventions and build/review guidance |
| [Client-owned MCP transport](./extending/providers.md#client-owned-mcp-transport) | Matching exact tools without duplicating client authentication |
| [Experimental remote bridges](./extending/remote-bridges.md) | Explicit HTTP host boundaries and remaining service checks |

Start locally. Remote providers are optional until your work needs their capabilities; accounts with every vendor are not required. [ADR-0084](./decisions/0084-experimental-integrations-and-scoped-live-verification.md) defines experimental service status and [ADR-0085](./decisions/0085-client-owned-mcp-first-provider-transport.md) defines MCP priority.

## Architecture and extensions

| Page | Use it for |
| --- | --- |
| [Philosophy](./philosophy.md) | Why these questions and decisions belong in the process |
| [Platforms](./platforms/README.md) | Declared capabilities, native boundaries and conformance evidence |
| [Architecture](./architecture/README.md) | Core, canonical source, adapters and lifecycle |
| [Core CLI](./architecture/core-cli.md) | Generated command reference, schemas and exit contracts |
| [State and messaging](./architecture/state-and-messaging.md) | Journal, projections, mailbox and recovery |
| [Orchestration and gates](./architecture/orchestration-and-gates.md) | Engines, lenses, independent refutations and budgets |
| [Determinism and testing](./architecture/determinism-and-testing.md) | Unit/workflow checks, simulations, evals and live evidence |
| [Extension overview](./extending/README.md) | Choosing an extension point |
| [Writing a provider](./extending/providers.md) | Manifests and transport contracts |
| [Lenses, templates and profiles](./extending/lenses-templates-profiles.md) | Custom guidance, coverage and interaction bundles |
| [Compatibility](./extending/compatibility.md) | Versioned contracts and deprecation |
| [Architecture decisions](./decisions/README.md) | Decisions, alternatives and their rationale |

## Contributing, acceptance and release

| Page | Audience |
| --- | --- |
| [Contributing](../CONTRIBUTING.md) | Anyone changing this repository |
| [Working agreement](../AGENTS.md) | Humans and coding agents implementing wholeloop |
| [Authoring](./contributing/authoring.md) | Skills, agents, protocols and enforcers |
| [Documentation style](./contributing/docs-style.md) | Page structure, source layout and generated navigation |
| [Roadmap](../roadmap/README.md) and [journal](../roadmap/journal.md) | Implementation status and executed evidence |
| [V1 acceptance](./v1-acceptance.md) | Owner decisions and actual client/workflow closure |
| [Detailed verification](../roadmap/manual-verification.md) | Scoped regressions, environments and limitations |
| [Nightly conformance](./contributing/conformance.md) | Maintainers activating collection and issue delivery |
| [Release preparation](./contributing/releasing.md) | Maintainers reviewing bundles, visibility and publication |

## Reading paths

- **First use:** getting started → client setup → first framing → status recovery.
- **No account yet:** local core tour → concepts → command reference. Add a native client when ready for model-backed behavior.
- **Everyday development:** small change → the relevant step reference → configuration or troubleshooting as needed.
- **Team adoption:** concepts → repository guidance → profiles → providers → actual client permission checks.
- **Contributing:** contribution guide → working agreement → roadmap/journal → architecture → authoring and checks.

<!-- docnav -->
[🧭 Concepts](concepts.md)  ·  [Philosophy ▶](philosophy.md)
