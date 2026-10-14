# Platforms — one harness, every agentic CLI

> **TL;DR** — The canonical harness is written once in open formats; a per-CLI adapter generates the files each tool expects. Tier A CLIs are supported from the first release; tier B follow. Where a CLI lacks a feature, the harness degrades to an equivalent — never to less coverage.

> [!NOTE]
> **Status: 📐 design.** Matrix researched in October 2026 from official documentation; items marked ❓ are verified in [P0-03](../../roadmap/phase-0-foundations.md#p0-03--cli-conformance-spike). Once conformance runs exist, this page is generated from their results.

---

## Tiers

| Tier | CLIs | Why |
| --- | --- | --- |
| **A** | Claude Code · OpenAI Codex CLI · OpenCode · GitHub Copilot CLI | Native skills, subagents, hooks and a structured question tool (or close to it); Copilot also reads Claude-format hooks and skills, so it costs little extra |
| **B** | Gemini CLI · Google Antigravity CLI · Cursor CLI | Supported formats, but gaps to bridge: parallel subagents (Gemini), a structured ask tool (Antigravity), hook loading in the CLI (Cursor) |

Antigravity CLI replaced Gemini CLI for free and personal accounts in June 2026, while enterprise and API-key users keep Gemini CLI — so they are separate targets.

## Capability matrix

| | Claude Code | Codex | OpenCode | Copilot | Gemini | Antigravity | Cursor |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agent Skills (`SKILL.md`) | ✅ `.claude/skills` | ✅ `.agents/skills` | ✅ both | ✅ both + `.github/skills` | ✅ `.agents/skills` | ✅ `.agents/skills` | ✅ most dirs |
| Reads `AGENTS.md` | only without `CLAUDE.md` | ✅ | ✅ | ✅ | via setting | ✅ | ✅ |
| Subagents | ✅ parallel | ✅ TOML | ✅ | ✅ `/fleet` | ✅ (parallel ❓) | ✅ | ✅ |
| Read-only agents enforced | ✅ | ⚠️ not enforced | ✅ permissions | ✅ tools | ✅ tools | ✅ tools | ✅ readonly |
| Hooks | ✅ | ✅ | ⚠️ JS plugin | ✅ (reads Claude's) | ✅ | ✅ own schema | ✅ (CLI ❓) |
| Structured questions | ✅ | ⚠️ limited ❓ | ✅ | ✅ | ✅ | ❓ | ⚠️ ❓ |
| MCP | ✅ | ✅ TOML | ✅ | ✅ | ✅ | ✅ `serverUrl` | ✅ |
| Headless mode | `claude -p` | `codex exec` | `opencode run` | `copilot -p` | `gemini -p` | `agy -p` | `agent -p` |
| Plugin packaging | Claude plugins | Agent Plugins | npm/JS | Agent Plugins | extensions | plugins | Agent Plugins |

## How gaps are bridged

| Gap | Bridge |
| --- | --- |
| No parallel subagents | `headless` engine — `wl fanout` runs workers through the CLI's headless mode — or `sequential` ([engines](../architecture/orchestration-and-gates.md#three-engines-one-result)) |
| Read-only not enforced | The core checks the worktree is unchanged after every gate round; a change fails the round |
| No structured question tool | Plain-text questions with numbered options; the skill stops and waits |
| No usable hooks | Git hooks installed by `wl install` carry the critical guards |
| Different MCP dialects | `wl mcp add` renders each provider's neutral recipe into the target's format |

## What gets generated

```mermaid
flowchart LR
  src["harness/<br/>skills · agents · hooks · providers"]:::core --> gen["wl build / wl install"]:::core
  gen --> c1[".claude/skills · .claude/agents<br/>hooks in settings · plugin.json"]
  gen --> c2[".agents/skills · .codex/agents/*.toml<br/>hooks.json · config.toml MCP"]
  gen --> c3[".opencode/agents · commands<br/>JS plugin → wl guard"]
  gen --> c4[".github/agents · .github/hooks<br/>Agent Plugins manifest"]
  gen -.-> c5[".gemini/ · .agents/ (Antigravity)<br/>.cursor/"]:::opt
  classDef core fill:#eceff3,stroke:#5b6573,color:#111827;
  classDef opt stroke-dasharray:5 3;
```

- **Skills** keep only the portable front-matter fields; CLI-specific extras live in a sidecar the adapter reads.
- **Agents** are written with abstract capabilities (`read`, `write`, `shell`, `web`) and a model tier; each adapter maps them to that CLI's tool names or permission map.
- **Names** are namespaced where the CLI has no plugin namespace: `wholeloop:research` in Claude Code, `wl-research` elsewhere.
- **Golden files** pin every adapter's output; a change in generated files is a reviewed diff.

## Installing

```text
# as a plugin (Claude Code; Copilot and Codex can read the same marketplace)
/plugin marketplace add dreamingechoes/wholeloop
/plugin install wholeloop

# or for any combination of CLIs
npm i -g wholeloop
wl install --target claude,codex,opencode,copilot --scope user
wl doctor
```

`--scope user` installs for you everywhere; `--scope project` writes into the current repository for the whole team.

## Adding a CLI

An adapter is a TypeScript module implementing one interface: where files go, how front matter maps, how tools and permissions are named, how hooks are registered, how MCP is configured, how headless mode is invoked, and which capabilities the CLI has. It ships with golden files and a conformance scenario. Guide: [contributing/authoring](../contributing/authoring.md#adapters).

---

<!-- docnav -->
[◀ Lenses, templates, profiles](../extending/lenses-templates-profiles.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Architecture ▶](../architecture/README.md)
