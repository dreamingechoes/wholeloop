# FAQ

> **TL;DR** — The questions people ask in the first ten minutes, answered in a few lines each, with a link to the page that goes deeper.

## Contents

- [Installation and first use](#installation-and-first-use)
- [Using it](#using-it)
- [Trust](#trust)
- [Fitting your team](#fitting-your-team)
- [Autonomous delivery](#autonomous-delivery)
- [The project](#the-project)

## Installation and first use

**How do I install it?** Two commands: `npm install --global wholeloop` installs the `wl` CLI, then `wl install --target <client> --scope user` installs the skills into your coding client. [Getting started](./getting-started.md) walks through both, with their output.

**Why is `wl` not found after installation?** `wl` comes from the npm package, so npm's global `bin` directory must be on your `PATH`. With a Node version manager, switching Node versions can hide it. → [The shell cannot find wholeloop](./troubleshooting.md#the-shell-cannot-find-wholeloop)

**Can I try anything without a model account?** Yes. The [local core tour](./tutorials/local-core.md) shows configuration, missing-fact questions, creating an initiative and recovering it from a new terminal. It does not pretend that a model drafted anything.

**What should my first session in a client do?** Frame one small idea, choose an honest outcome, approve the exact final draft and check that it survives a restart. → [First framing](./tutorials/first-framing.md)

**Is the skill `/wholeloop:frame-problem` or `wl-frame-problem`?**

- `wl-frame-problem` is the normal installed skill, in every client except Antigravity.
- `wl-agy-frame-problem` is the Antigravity name.
- `/wholeloop:frame-problem` is the separately installed Claude Code plugin.

→ [Client setup](./platforms/local-onboarding.md)

## Using it

**Do I have to use the whole flow?** No. Every step is a complete entry point: research a question, build a small fix or review a pull request, with nothing run before it. → [Standalone or flow](./concepts.md#standalone-or-flow--both-are-first-class)

**Which client should I use?** The one whose model access already works for you. All seven clients install and run the skills; how much of each client's permission handling was verified differs, and [platforms](./platforms/README.md) records it.

**Can I switch clients halfway through?** Yes. Your work lives in the store, not in a conversation. In the other client, ask for `wl-next` with the ID.

**Do I need Jira, Confluence or Notion?** No. The local document and tracker providers keep everything on your machine. Add a remote provider when you need it, preferably through your client's existing MCP connection. → [Providers](./configuration/providers.md)

**Why did `wl next` return JSON instead of doing the work?** You called the terminal core, which returns the next step's contract and stops. Ask your coding client for the `wl-next` skill to have the work done. → [Core versus skill](./troubleshooting.md#next-returned-json-but-did-not-run-the-whole-flow)

**Is an on-hold framing a failed run?** No. It is a completed decision, with a reason and a condition for reopening. Status shows it as `closed`, with no next step. → [Closed outcomes](./troubleshooting.md#on-hold-is-reported-as-closed)

**Will it touch my working copy?** Building happens in separate Git worktrees, so your checkout can be dirty and on any branch. Commands you run explicitly, such as a project-scope install, write the project files you asked for. Your work history always stays outside repositories. → [build-slice](./flow/build/build-slice.md)

**Will it merge, send a message or flip a flag?** Not in the supervised flow: the provider contract has no verb for any of them. Only an autonomous run you separately authorize to merge can merge. → [Capabilities](./configuration/providers.md#the-capability-taxonomy)

## Trust

**How do I know what it is about to do?** Every step shows a **preflight** before acting: what it will do, where, what it will never do and how to stop it. It reports as it goes and ends with a **receipt**. How those lines appear depends on your client. Stopping cancels the workers wholeloop started; an external write that was in flight keeps its recorded state, so you can check it.

**What if it does not know something?** It asks. Missing facts become questions, and anything nobody can answer yet stays an explicit unknown with an owner. Read the result rather than trusting a confident model. → [First framing questions](./tutorials/first-framing.md#3-answer-the-eight-questions)

**Can a quiet setting make it skip checks?** No. Profiles change how it talks and how much runs at once, never what is checked or where you decide. → [Profile](./configuration/profile.md#what-no-dial-can-change)

**What if the gates keep failing?** When the round budget runs out, the step stops and hands you the open findings. You can grant more rounds, fix it yourself or sharpen the criteria. → [Rounds](./architecture/orchestration-and-gates.md#rounds--until-green-with-a-budget-you-control)

## Fitting your team

**Our repository already has skills and conventions.** Good: they come first. Each step fills its slots from your repository's skills before falling back to its own defaults. → [Repository guidance](./configuration/repo-skills.md)

**We use a tool you do not support.** Write a provider manifest, usually a few dozen lines pointing at its MCP server. → [Writing a provider](./extending/providers.md)

**We need an extra approval step.** Add a decision point in the project configuration. → [Decision points](./extending/lenses-templates-profiles.md#decision-points)

**We call things differently (PRD, epic, bet…).** The [glossary](./glossary.md#if-your-team-says) maps common vocabularies.

## Autonomous delivery

**What is autonomous delivery?** A way to hand an approved piece of work to a run that builds, verifies, reviews and publishes it without asking you again, within limits you authorize in advance. → [Concepts](./concepts.md#autonomous-delivery)

**Is it safe to try?** It is experimental: tested end to end with fixtures and real Git and Docker, but its commands may change in a minor release. Every run needs your explicit grant, runs project code only in Docker and cannot do anything the grant does not list. → [Overview](./architecture/autonomous-delivery.md)

**Can it merge?** Only when you authorize merging separately, and only after the required checks and reviews pass on the exact tested change.

## The project

**Is it ready to use?** Yes. The supervised flow is stable, and all seven clients are supported at the versions [platforms](./platforms/README.md) lists. Remote service integrations and autonomous delivery are experimental and may change in a minor release. → [Getting started](./getting-started.md)

**Can I contribute?** Yes. Read [CONTRIBUTING.md](../CONTRIBUTING.md) and pick a task from the roadmap.

<!-- docnav -->
[◀ Troubleshooting](troubleshooting.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)  ·  [Philosophy ▶](philosophy.md)
