# Getting started — from nothing to your first step

> **TL;DR** — Install the `tl` CLI (or the plugin for your CLI), let it generate the skills for the agentic CLIs you use, run `tl doctor`, then invoke any step. Nothing needs configuring up front: what is missing becomes a question the first time it matters.

> [!WARNING]
> **Status: 📐 design — not installable yet.** This page describes the intended experience. Packaging lands in [P1-13](../roadmap/phase-1-walking-skeleton.md#p1-13--tl-install-tl-uninstall-tl-doctor) and [P5-05](../roadmap/phase-5-reach-release.md#p5-05--distribution).

---

## At a glance

| | |
|---|---|
| **Requires** | Node.js ≥ 20 · git ≥ 2.30 (worktrees) · at least one supported agentic CLI |
| **Installs** | the `tl` CLI · generated skills, agents and hooks for the CLIs you choose |
| **Writes** | your CLI's skill/agent folders (user or project scope) · `~/.config/throughline/` · `~/.local/state/throughline/` |
| **Never writes** | anything inside your repositories, unless you choose `--scope project` |

## 1. Install

Pick one path.

**As a Claude Code plugin** — the core is bundled inside, nothing else to install:

```text
/plugin marketplace add dreamingechoes/throughline
/plugin install throughline
```

**As a CLI, for any combination of agentic CLIs:**

```bash
npm install -g @throughline/cli      # final package name settled in P0-01
tl install --target claude,codex,opencode,copilot --scope user
```

| `--scope` | Installs into | Use when |
|---|---|---|
| `user` | your home folders for each CLI | you want `throughline` everywhere, just for you |
| `project` | the current repository (`.claude/`, `.agents/`, `.opencode/`, `.github/`…) | the whole team should get it with the repo |

## 2. Check

```text
$ tl doctor
✓ node 22.11.0
✓ git 2.47 — worktrees available
✓ claude code 2.1.290 · skills current
✓ codex 0.98.0 · skills current
• opencode not found — skipped
✓ store ~/.local/state/throughline writable
• providers: web, codebase, local docs, local tracker · detected MCP: notion, sentry
```

Every ✗ comes with the command that fixes it.

## 3. Your first step

Any step works on its own. Three good first runs:

| Try | Invoke (Claude Code · Codex · others) | You get |
|---|---|---|
| Research a question | `/throughline:research …` · `$tl-research …` · `/tl-research …` | an evidence brief with open questions |
| Frame an idea | `/throughline:frame-problem …` | an initiative with a framed problem and an owner |
| Fix something small | `/throughline:build-slice "…"` | a slice built in its own worktree, checked until green |

Or hand it the whole thing and let it walk the flow, stopping wherever you have to decide:

```text
/throughline:next "Users can't find last month's orders"
```

## 4. Make it yours (optional)

```text
tl profile preset sparring          # or: mentor · pair · autopilot
tl profile set language=es          # talk to me in Spanish, write artifacts in English
/throughline:setup                  # providers, destinations, CLIs — guided
```

Team-wide choices go into `.throughline/config.yml` in the repository ([configuration](./configuration/README.md)).

## Uninstall

```bash
tl uninstall --target all --scope user      # removes generated files; your store stays
rm -rf ~/.local/state/throughline           # only if you also want your history gone
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| The step is not listed in your CLI | generated files are stale or the CLI was open during install | `tl install --target <cli>` again, then restart the CLI |
| "`tl` not found" inside a skill | the plugin path cannot find Node | install Node ≥ 20, or use the bundled plugin |
| A provider shows "not connected" | the MCP server is not in this CLI's config | `tl mcp add <provider> --target <cli>` |
| Questions are plain text, not a picker | your CLI has no structured question tool | expected — answer with the option number |

---

<!-- docnav -->
[◀ Philosophy](philosophy.md)  ·  [📖 Docs index](README.md)  ·  [Concepts ▶](concepts.md)
