# 0002 — Open standards as the canonical source, adapters generated per CLI

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The harness must run on Claude Code, Codex CLI, OpenCode, Copilot CLI, Gemini CLI, Antigravity CLI and Cursor CLI. They overlap more every month, but not completely:

- **Everywhere:** the [Agent Skills](https://agentskills.io) format (`SKILL.md`, core front matter), `AGENTS.md`, MCP, and a headless mode.
- **Almost everywhere, in different dialects:** subagents (Markdown in most, TOML in Codex), hooks (JSON in most, JS plugins in OpenCode), MCP configuration (JSON, TOML, `url` vs `serverUrl`).
- **Directories differ:** Claude Code reads `.claude/skills`; most others read `.agents/skills`.

Hand-maintaining seven copies would drift within weeks.

## Decision

1. **One canonical source** in `harness/`, written in the most portable form available:
   - skills as Agent Skills, using only the portable front-matter fields; CLI-specific extras go in a sidecar file;
   - agents with **abstract capabilities** (`read`, `write`, `shell`, `web`) and a model tier instead of tool names;
   - MCP recipes in a neutral shape;
   - hook *policies* as calls to one entry point, `wl guard <event>`.
2. **One adapter module per CLI** in `src/adapters/` turns the canonical source into exactly what that CLI expects: paths, front matter, tool names, permission maps, hook registration, MCP dialect, namespacing.
3. **Our own small generator**, not a third-party one. We evaluated `rulesync` (broad coverage of rules, MCP, commands, subagents and hooks). The mapping of *agent semantics* — read-only enforcement, tool permissions, hook payload normalisation — is part of the product and needs golden-file tests we control. We borrow ideas freely; we do not depend on it.
4. **Golden files** pin every adapter's output. A change in generated files is a reviewed diff.

## Consequences

### Positive

- Write once; every supported CLI gets the same behaviour on the same day.
- Adopting a new standard (for example a future agents format) is a change in one adapter.
- Generated output is testable without any CLI installed.

### Negative

- We own the generator and must track every CLI's format changes — mitigated by pinned versions and nightly conformance runs ([ADR-0005](./0005-supported-clis-and-tiers.md)).
- Canonical skills cannot use a CLI-only feature directly; they must express it as an optional enhancement in the sidecar.

## Alternatives considered

| Option | Why not |
|---|---|
| Author per CLI by hand | Seven copies, guaranteed drift |
| Target only `.agents/skills` and let each CLI cope | Claude Code does not read it; agents and hooks still diverge |
| Depend on `rulesync` | Good coverage, but our hardest mapping (agent permissions, hook semantics) would live outside our tests |
| Symlink one folder into each CLI's path | Solves skills only; nothing for agents, hooks or MCP |

## Links

- [Platforms](../platforms/README.md) · [Architecture](../architecture/README.md)
- [P1-10, P1-11 — adapters](../../roadmap/phase-1-walking-skeleton.md#p1-10--adapter--claude-code)

[◀ Decisions index](./README.md)
