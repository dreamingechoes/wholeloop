# Glossary

> **TL;DR** — Every term `wholeloop` uses, in one line each, plus how it maps to vocabulary your team may already have.

Client and provider limits are in [platforms](./platforms/README.md) and [providers](./configuration/providers.md).

---

## Terms

| Term | Meaning |
| --- | --- |
| **Adapter** | Generator module that turns the canonical harness into one CLI's files ([platforms](./platforms/README.md)). |
| **Agent (role)** | One of eight short role definitions — conductor, researcher, challenger, builder, verifier, reviewer, launcher, analyst. |
| **Artifact** | Anything a step produces: a brief, a spec, a slice, a verdict, a launch plan, a decision. |
| **Block** | One of the four phases of the flow: Define, Build, Rollout, Learn. |
| **Brief** | The output of `research`: claims with evidence and confidence, plus open questions. |
| **Capability** | A provider-neutral need, such as `docs.create` or `source.support.query` ([providers](./configuration/providers.md)). |
| **Challenger** | The role that attacks definitions — problems, specs, criteria, scopes, slice sets. |
| **Decision point** | A fixed moment where a person decides: approve spec, approve scopes, test it, merge, ramp, decide. |
| **Degrade** | What a provider does when unavailable: an open question or a hand-off artifact, never a silent skip. |
| **Engine** | How agents are run: native subagents, headless workers or sequentially. |
| **Enforcer** | The code, test or lint that makes a hard rule true, mapped in `enforcement.yml`. |
| **Gate** | `verify` or `review`: a fan-out of lenses run until green within a round budget. |
| **Initiative** | The umbrella for one idea: problem, owner, spec, measurement plan, scopes. |
| **Install scope** | Where `wl install` writes a client's files: `user` for every project, or `project` for one application repository. Not the same as a **scope** of work. |
| **Journal** | The append-only event log that is the source of truth of the store. |
| **Lens** | One fixed question a gate asks of a change (correctness, security…). |
| **Mailbox** | Threads of messages between agents and steps, stored outside any session. |
| **Measurement plan** | Per metric: source, baseline, target, window and stored query — executed at each checkpoint. |
| **Owned file** | A file `wl install` wrote and recorded. Only unchanged owned files are updated or removed; anything you edited is kept and reported. |
| **Owner** | The named person accountable for an initiative. |
| **Part** | The per-repository piece of a slice that spans repositories. |
| **Preflight** | What a run states before doing anything: plan, where, bindings, gates, what it will never do, how to stop. |
| **Profile** | Personal interaction dials and presets. |
| **Provider** | A manifest that fulfils capabilities through MCP, a CLI or native tools. |
| **Receipt** | What a run ends with: what was produced, actionable rows first, each with the command that opens or undoes it. |
| **Round budget** | How many times a gate may loop before handing over to a person. Configurable. |
| **Scope** | A deliverable cut from an initiative; ships, ramps and is measured on its own. Not the same as an **install scope**. |
| **Slice** | A vertical user story delivered end to end. |
| **Slot** | A named place in a step that your repository's own skills can fill (`build.frontend`…). |
| **Step contract** | The exchange every step has with the core: `wl step begin` returns what exists and the open questions, the skill does the work, and `wl step complete` checks and records the result ([concepts](./concepts.md#the-step-contract)). |
| **Store** | Your personal state directory, outside every repository. |
| **Target** | The coding client an installation is for: `claude`, `codex`, `opencode`, `copilot`, `gemini`, `antigravity` or `cursor`. |
| **Worktree** | The isolated git working copy where one slice or part is built. |

## If your team says…

| Your vocabulary | In wholeloop |
| --- | --- |
| Discovery, framing, problem statement | `frame-problem` |
| PRD, RFC, one-pager, product brief | the spec from `write-spec` |
| Epic, bet, deliverable, milestone | a **scope** from `cut-scopes` |
| Story, ticket, task | a **slice** from `slice-work` |
| Sub-task per repo | a **part** |
| QA, acceptance testing | `verify-works` |
| Code review, PR review | `review-code` |
| Launch checklist, GTM | `prepare-launch` |
| Progressive rollout, canary, feature-flag ramp | `ramp-exposure` |
| Impact review, post-launch review, retro on metrics | `measure-impact` + `decide-next` |

---

<!-- docnav -->
[◀ Docs style](contributing/docs-style.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)  ·  [FAQ ▶](faq.md)
