# 0002 — Open standards as the canonical source, adapters generated per CLI

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

**Amended 2026-11-21 (P9-03).** Rendered observers could be denied a command tool while still being instructed to submit results through the CLI. Canonical workers now return structured final messages; the conductor validates and records them. Named role references are rendered into each client's actual namespace. Fresh, assignment-only context replaces copied conductor history. Read-only roles receive no command tool, including Claude: its [plugin subagents ignore permissionMode](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope), so the tool allowlist must carry that boundary itself. No permission is added.

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
5. **Instructions fit the rendered tools.** Generation rejects core command or explicit native-tool requirements that the role's configuration disables. Observer instructions request supplied plans, schemas and observed command evidence instead. Workers return results in their final message; only the conductor or an already checked process transport submits them. Unavailable inputs or tools never authorize a replacement conductor or broader permissions.
6. **Delegation names the actual role.** Canonical skills use explicit `wl-<role>` references; generation maps them to the adapter's callable names, including Claude's `wholeloop:<role>` plugin scope, its installed `wl-<role>` loose agents and Antigravity's separate namespace. Existing component IDs and paths remain unchanged. Delegation carries only the assignment, needed protocol text, schema and pinned inputs. It never forks conversation history. An omitted role uses its explicit checked headless fallback or returns unavailable.

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
| --- | --- |
| Author per CLI by hand | Seven copies, guaranteed drift |
| Target only `.agents/skills` and let each CLI cope | Claude Code does not read it; agents and hooks still diverge |
| Depend on `rulesync` | Good coverage, but our hardest mapping (agent permissions, hook semantics) would live outside our tests |
| Symlink one folder into each CLI's path | Solves skills only; nothing for agents, hooks or MCP |
| Enable a command tool for every worker | Widens the boundary to accommodate bookkeeping; final-message return keeps existing restrictions |
| Substitute a full-context conductor when a role is unavailable | Loses role/tool isolation and spends unrelated context; an explicit unavailable result preserves the evidence boundary |

## Verification

`test/unit/adapters/worker-roles.test.ts` renders every shipped role for all seven clients and checks its actual configuration against its instructions. Deliberately adding a command requirement to a shell-disabled role fails generation in every adapter. It also checks explicit native role names, assignment-only boundaries and the declared headless exception. Golden snapshots retain the reviewed native configuration. These fixture checks do not establish native loading or actual context isolation; those remain in the per-client manual checks.

## Links

- [Platforms](../platforms/README.md) · [Architecture](../architecture/README.md)
- [P1-10, P1-11 — adapters](../../roadmap/phase-1-walking-skeleton.md#p1-10--adapter--claude-code)

[◀ Decisions index](./README.md)
