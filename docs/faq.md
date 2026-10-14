# FAQ

> **TL;DR** — The questions people ask in the first ten minutes, answered in a few lines each, with a link to the page that goes deeper.

---

## Using it

**Do I have to use the whole flow?**
No. Every step is a complete entry point. Research a question, build a small fix, review a PR — nothing before it needs to have run. → [Standalone or flow](./concepts.md#standalone-or-flow--both-are-first-class)

**Which CLI should I use?**
The one you already use. Claude Code, Codex, OpenCode and Copilot CLI are tier A; Gemini CLI, Antigravity and Cursor follow. → [Platforms](./platforms/README.md)

**Can I switch CLI halfway through?**
Yes. State lives in your store, not in a session. Run `next <id>` (or `tl resume <id>`) in the other CLI.

**Do I need Jira, Confluence, Notion…?**
No. With nothing configured, everything is local Markdown. Configure providers when you want artifacts shared. → [Providers](./configuration/providers.md)

**Will it touch my working copy?**
No. Builds happen in dedicated git worktrees; your checkout can be dirty and on any branch. → [build-slice](./flow/build/build-slice.md)

**Will it merge, send a message or flip a flag?**
Never. There is no verb for any of those in the provider contract. → [Capabilities](./configuration/providers.md#the-capability-taxonomy)

## Trust

**How do I know what it is about to do?**
Every run starts with a preflight and ends with a receipt; in between it narrates one line per event. "Stop" halts it immediately.

**What if it does not know something?**
It asks. Anything a source cannot answer becomes an open question, never a plausible guess. → [Philosophy](./philosophy.md#1-ask-never-guess)

**Can a quiet setting make it skip checks?**
No. Profiles change how it talks and how much runs at once, never what is checked or where you decide. → [Profile](./configuration/profile.md#what-no-dial-can-change)

**What if the gates keep failing?**
When the round budget runs out, it stops and hands you the open findings. You can grant more rounds, fix it yourself, or sharpen the criteria. → [Rounds](./architecture/orchestration-and-gates.md#rounds--until-green-with-a-budget-you-control)

## Fitting your team

**Our repo already has skills and conventions.**
Good — they come first. Each step binds its slots to your repository's skills before falling back to its own defaults. → [Repo skills](./configuration/repo-skills.md)

**We use a tool you do not support.**
Write a provider manifest — usually a few dozen lines pointing at its MCP server. → [Writing a provider](./extending/providers.md)

**We need an extra approval step.**
Add a decision point in project config. → [Decision points](./extending/lenses-templates-profiles.md#decision-points)

**We call things differently (PRD, epic, bet…).**
The [glossary](./glossary.md#if-your-team-says) maps common vocabularies.

## The project

**Is it usable today?**
Not yet — it is in the design phase. Follow the [roadmap](../roadmap/README.md).

**Can I contribute?**
Yes. Read [CONTRIBUTING.md](../CONTRIBUTING.md) and pick a task from the roadmap.

---

<!-- docnav -->
[◀ Glossary](glossary.md)  ·  [📖 Docs index](README.md)  ·  [🧭 Concepts](concepts.md)
