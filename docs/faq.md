# FAQ

> **TL;DR** — The questions people ask in the first ten minutes, answered in a few lines each, with a link to the page that goes deeper.

> [!NOTE]
> **Status: 🚧 partial.** The source-installable core, all thirteen steps, seven client renderers, managed installation and conformance tooling are implemented. Actual native/workflow acceptance and public release remain open; remote integrations are experimental, fixture-tested and service-unverified. [Acceptance](./v1-acceptance.md) separates these scopes.

---

## Installation and first use

**Can I install it from public npm today?** No. The development package is private at 0.0.0; use the [source installation](./getting-started.md#build-the-source-checkout). Publication and the 1.0 release remain explicit owner decisions.

**Why is `wl` not found after installation?** Managed installation writes native components, not a global shell command. Invoke the source bundle with `node "$WHOLELOOP_CLI" ...` and export that absolute path again in each new terminal. → [Executable paths](./troubleshooting.md#the-shell-cannot-find-wholeloop)

**Can I try anything without a model account?** Yes. The [local core tour](./tutorials/local-core.md) runs configuration, missing-input questions, initiative creation and state/context recovery. It does not pretend that a model drafted or reviewed anything.

**What should my first actual client session do?** Frame one small idea, choose an honest outcome, approve the exact reviewed final draft and recover its state after restarting. → [First framing](./tutorials/first-framing.md)

**Is the skill name `/wholeloop:frame-problem` or `wl-frame-problem`?** The former belongs to a separately installed Claude plugin; managed loose installation uses `wl-frame-problem`. Antigravity uses `wl-agy-frame-problem`. Other native selectors differ. → [Client setup](./platforms/local-onboarding.md)

## Using it

**Do I have to use the whole flow?** No. Every step is a complete entry point. Research a question, build a small fix, review a PR — nothing before it needs to have run. → [Standalone or flow](./concepts.md#standalone-or-flow--both-are-first-class)

**Which CLI should I use?** Start with the one whose model access already works for you. Claude, Codex, OpenCode, Copilot, Gemini, Antigravity and Cursor have implemented render/install paths. Their actual permission/model acceptance differs; implementation is not certification. → [Platforms](./platforms/README.md) · [Observed results](./v1-acceptance.md)

**Can I switch CLI halfway through?** Yes. State lives in your store, not in a session. Run `next <id>` (or `wl resume <id>`) in the other CLI.

**Do I need Jira, Confluence, Notion…?** No. The local docs/tracker providers reference artifacts and work in the external store. Select remote providers when you need their capabilities, preferably through the client's existing MCP connection. Accounts with every vendor are not required. → [Providers](./configuration/providers.md)

**Why did `next` return JSON instead of doing the work?** You called the terminal core. It returns a contract; the `wl-next` skill in the coding client performs model-backed work and orchestration. → [Core versus skill](./troubleshooting.md#next-returned-json-but-did-not-run-the-whole-flow)

**Is an on-hold framing a failed run?** No. It is a completed no-go outcome with an exact reason and reopening condition. Generic status shows it as closed, with no next step. → [Closed outcomes](./troubleshooting.md#on-hold-is-reported-as-closed)

**Will it touch my working copy?** Build execution uses dedicated git worktrees; your checkout can be dirty and on any branch. Explicit project installation, configuration and artifact-generation commands write the project files you request. Runtime journals and ownership stay outside repositories. → [build-slice](./flow/build/build-slice.md)

**Will it merge, send a message or flip a flag?** Never. There is no verb for any of those in the provider contract. → [Capabilities](./configuration/providers.md#the-capability-taxonomy)

## Trust

**How do I know what it is about to do?** Core step commands return preflights and receipts. Canonical skills require one-line narration and a stop handoff; actual native behavior still needs verification. Headless cancellation terminates owned worker groups, while interrupted external effects retain their recorded recovery state.

**What if it does not know something?** Core preconditions return missing-input questions; skills must preserve unsupported facts as owned unknowns. Review the artifact rather than accepting invented evidence from a model. → [First-framing questions](./tutorials/first-framing.md#3-answer-the-eight-questions)

**Can a quiet setting make it skip checks?** No. Profiles change how it talks and how much runs at once, never what is checked or where you decide. → [Profile](./configuration/profile.md#what-no-dial-can-change)

**What if the gates keep failing?** When the round budget runs out, it stops and hands you the open findings. You can grant more rounds, fix it yourself, or sharpen the criteria. → [Rounds](./architecture/orchestration-and-gates.md#rounds--until-green-with-a-budget-you-control)

## Fitting your team

**Our repo already has skills and conventions.** Good — they come first. Each step binds its slots to your repository's skills before falling back to its own defaults. → [Repo skills](./configuration/repo-skills.md)

**We use a tool you do not support.** Write a provider manifest — usually a few dozen lines pointing at its MCP server. → [Writing a provider](./extending/providers.md)

**We need an extra approval step.** Add a decision point in project config. → [Decision points](./extending/lenses-templates-profiles.md#decision-points)

**We call things differently (PRD, epic, bet…).** The [glossary](./glossary.md#if-your-team-says) maps common vocabularies.

## The project

**Is it usable today?** You can build from source, exercise the local core and use generated skills in a configured client. All planned client renderers are implemented, but actual native/workflow/CI/release criteria remain open. Experimental service certification is deferred. This is not a verified or published 1.0. → [Getting started](./getting-started.md) · [Acceptance](./v1-acceptance.md)

**Can I contribute?** Yes. Read [CONTRIBUTING.md](../CONTRIBUTING.md) and pick a task from the roadmap.

---

<!-- docnav -->
[◀ Glossary](glossary.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)
