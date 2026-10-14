# wholeloop — documentation

> **TL;DR** — Everything about `wholeloop`, from why it exists to how each step works and how to extend it. Read [concepts](./concepts.md) first; everything else assumes its vocabulary.

> [!NOTE]
> **Status: 📐 design.** The project is being built in the open — pages say clearly what exists and what is planned. Progress: [roadmap](../roadmap/README.md).

---

## Start here

1. **[Philosophy](./philosophy.md)** — why a harness, and the principles behind every rule.
2. **[Getting started](./getting-started.md)** — install, check, first run.
3. **[Concepts](./concepts.md)** — the ten ideas everything else builds on.
4. **[The flow](./flow/README.md)** — the four blocks and all thirteen steps.

## The steps

| Block | Steps |
| --- | --- |
| **Define** · shape the problem | [research](./flow/define/research.md) · [frame-problem](./flow/define/frame-problem.md) · [write-spec](./flow/define/write-spec.md) · [cut-scopes](./flow/define/cut-scopes.md) |
| **Build** · ship it right | [slice-work](./flow/build/slice-work.md) · [build-slice](./flow/build/build-slice.md) · [verify-works](./flow/build/verify-works.md) · [review-code](./flow/build/review-code.md) · [open-pr](./flow/build/open-pr.md) |
| **Rollout** · release with care | [prepare-launch](./flow/rollout/prepare-launch.md) · [ramp-exposure](./flow/rollout/ramp-exposure.md) |
| **Learn** · measure, then decide | [measure-impact](./flow/learn/measure-impact.md) · [decide-next](./flow/learn/decide-next.md) |
| Utilities | [next · status · setup · sync](./flow/utilities.md) |

## Make it yours

| Page | For |
| --- | --- |
| [Configuration](./configuration/README.md) | Files, scopes and who wins |
| [Interaction profile](./configuration/profile.md) | Verbosity, depth, challenge, pace, language… |
| [Providers](./configuration/providers.md) | Where documents, issues, data and comms live |
| [Repo skills and slots](./configuration/repo-skills.md) | How steps follow your repository's own skills |
| [Extending](./extending/README.md) | Providers, lenses, templates, profiles, decision points |

## Under the hood

| Page | For |
| --- | --- |
| [Platforms](./platforms/README.md) | Supported CLIs, capability matrix, adapters |
| [Architecture](./architecture/README.md) | Layers, layout, how a step runs |
| [Core CLI](./architecture/core-cli.md) | The `wl` command surface and the step contract |
| [State and messaging](./architecture/state-and-messaging.md) | Journal, projections, mailbox, resume |
| [Orchestration and gates](./architecture/orchestration-and-gates.md) | Agents, engines, lenses, round budgets |
| [Determinism and testing](./architecture/determinism-and-testing.md) | What is tested how |
| [Decisions](./decisions/README.md) | Every architecture decision and its reasons |

## Contributing

[Authoring](./contributing/authoring.md) · [Documentation style](./contributing/docs-style.md) · [Glossary](./glossary.md) · [FAQ](./faq.md)

## Reading paths

- **"I just want to try it."** → [Getting started](./getting-started.md) → [research](./flow/define/research.md).
- **"I want to understand the design."** → [Philosophy](./philosophy.md) → [Concepts](./concepts.md) → [Architecture](./architecture/README.md) → [Decisions](./decisions/README.md).
- **"I need to fit it to my team's tools."** → [Providers](./configuration/providers.md) → [Writing a provider](./extending/providers.md).
- **"I want to contribute."** → [Roadmap](../roadmap/README.md) → [Authoring](./contributing/authoring.md) → [CONTRIBUTING](../CONTRIBUTING.md).

---

<!-- docnav -->
[🧭 Concepts](concepts.md)  ·  [Philosophy ▶](philosophy.md)
