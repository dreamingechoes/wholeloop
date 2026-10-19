# Getting started — from nothing to your first step

> **TL;DR** — Install the `wl` CLI (or the plugin for your CLI), let it generate the skills for the agentic CLIs you use, run `wl doctor`, then invoke any step. Nothing needs configuring up front: what is missing becomes a question the first time it matters.

> [!WARNING]
> **Status: 🚧 partial — not installable yet.** The core, local tier-A artifact generators, common guards and observed doctor diagnostics are implemented; distribution and personal installation remain pending. Use the [local generation instructions](./platforms/README.md#available-local-generation) to inspect a self-contained output tree without installing it. The installation steps below describe the intended experience. Packaging lands in [P1-13](../roadmap/phase-1-walking-skeleton.md#p1-13--wl-install-wl-uninstall-wl-doctor) and [P5-05](../roadmap/phase-5-reach-release.md#p5-05--distribution).

---

## At a glance

| | |
| --- | --- |
| **Requires** | Node.js ≥ 20 · git ≥ 2.30 (worktrees) · at least one supported agentic CLI |
| **Installs** | the `wl` CLI · generated skills, agents and hooks for the CLIs you choose |
| **Writes** | your CLI's skill/agent folders (user or project scope) · `~/.config/wholeloop/` · `~/.local/state/wholeloop/` |
| **Never writes** | anything inside your repositories, unless you choose `--scope project` |

## 1. Install

Pick one path.

**As a Claude Code plugin** — the core is bundled inside, nothing else to install:

```text
/plugin marketplace add dreamingechoes/wholeloop
/plugin install wholeloop
```

**As a CLI, for any combination of agentic CLIs:**

```bash
npm install -g wholeloop
wl install --target claude,codex,opencode,copilot --scope user
```

| `--scope` | Installs into | Use when |
| --- | --- | --- |
| `user` | your home folders for each CLI | you want `wholeloop` everywhere, just for you |
| `project` | the current repository (`.claude/`, `.agents/`, `.opencode/`, `.github/`…) | the whole team should get it with the repo |

## 2. Check

The source-built core can diagnose the local environment now:

```text
wl doctor --json
wl doctor --target codex --artifact /path/to/generated-codex --store /external/store --json
```

The versioned wholeloop/doctor@1 report distinguishes pass/fail/unknown/skip. Default
checks skip unobserved optional clients if another tier-A CLI reports a version;
explicit targets must all report versions. Fixed reason codes distinguish missing
executables, timeouts, output limits, failed launches/exits and malformed replies.
A missing binary gets an install recipe; an existing failed command gets a diagnostic
command rather than an automatic reinstall. Exit 3 means at least one required check
needs attention. Each failure includes instructions and an argv command for repair
or further diagnosis. Nothing is installed or repaired automatically.

Doctor observes Node/Git/client versions with bounded shell-free version commands
(2500 ms, 64 KiB, hard termination so a SIGTERM handler cannot defeat the deadline),
checks layered provider/MCP declarations without authentication, and performs a real
atomic external-store write/rename probe. It removes only probe files/directories
it created, preserving existing state. A store under Git, including symlink targets,
is rejected before writing; probe/cleanup failures remain failures.

Generated-file currentness is checked only with one explicit target/artifact pair.
Every expected file, executable mode, manifest and source/core hash must match this
build; changed output is preserved and the remedy builds into a fresh directory.
Without that input, artifact status is unknown. A matching artifact is not proof
of native client installation/discovery, sandbox enforcement or a model run. All
reports retain conformance unverified and authenticated false.

The suggested npm client-install recipes are documented by
[Claude](https://code.claude.com/docs/en/setup),
[Codex](https://developers.openai.com/codex/cli/),
[OpenCode](https://opencode.ai/docs/) and
[Copilot](https://docs.github.com/en/copilot/get-started/cli-quickstart).
Use a compatible runtime/package manager and inspect these commands before running
them; the current Claude/Copilot npm recipes require Node 22 or newer, while the
bundled wholeloop core supports Node 20. Native client requirements remain separate.

## 3. Your first step

Any step works on its own. Three good first runs:

| Try | Invoke (Claude Code · Codex · others) | You get |
| --- | --- | --- |
| Research a question | `/wholeloop:research …` · `$wl-research …` · `/wl-research …` | an evidence brief with open questions |
| Frame an idea | `/wholeloop:frame-problem …` | an initiative with a framed problem and an owner |
| Fix something small | `/wholeloop:build-slice "…"` | a slice built in its own worktree, checked until green |

Or hand it the whole thing and let it walk the flow, stopping wherever you have to decide:

```text
/wholeloop:next "Users can't find last month's orders"
```

## 4. Make it yours (optional)

```text
wl profile preset sparring          # or: mentor · pair · autopilot
wl profile set language=es          # talk to me in Spanish, write artifacts in English
/wholeloop:setup                  # providers, destinations, CLIs — guided
```

Team-wide choices go into `.wholeloop/config.yml` in the repository ([configuration](./configuration/README.md)).

## Uninstall

```bash
wl uninstall --target all --scope user      # removes generated files; your store stays
rm -rf ~/.local/state/wholeloop           # only if you also want your history gone
```

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The step is not listed in your CLI | generated files are stale or the CLI was open during install | `wl install --target <cli>` again, then restart the CLI |
| "`wl` not found" inside a skill | the plugin path cannot find Node | install Node ≥ 20, or use the bundled plugin |
| A provider shows "not connected" | the MCP server is not in this CLI's config | `wl mcp add <provider> --target <cli>` |
| Questions are plain text, not a picker | your CLI has no structured question tool | expected — answer with the option number |

---

<!-- docnav -->
[◀ Philosophy](philosophy.md)  ·  [📖 Docs index](README.md)  ·  [Concepts ▶](concepts.md)
