# 0003 — A deterministic TypeScript core (`tl`); skills stay thin

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Prompts are the least testable part of any harness, and the part where rules get lost: a rule written in a long skill can be reasoned around, contradicted by another skill, or forgotten after compaction. Much of what a harness decides, though, has exactly one right answer — which step comes next, which question is missing, which provider applies, whether a spec has a metric without a source, how many review rounds are left. Those answers do not need a model.

Every agentic CLI can run a shell command and read its output. That makes a CLI the most portable place to put shared logic.

## Decision

1. **A core CLI, `tl`, owns every decision with one right answer:** flow and preconditions, question generation, configuration and profile precedence, repo discovery and slot binding, provider resolution, artifact shape checks, gate arithmetic, persistence.
2. **Skills are thin.** They call `tl step begin`, do the creative work, and call `tl step complete`. They never compute a verdict, a precedence or a next step themselves.
3. **JSON contract.** Every command supports `--json` with a versioned schema (`throughline/step-begin@1`). Exit codes carry meaning: `0` ok · `1` unexpected · `2` needs input · `3` precondition failed · `4` shape check failed.
4. **TypeScript on Node.js ≥ 20.**

### Why TypeScript rather than Go

| | TypeScript | Go |
|---|---|---|
| Ships as | One npm package, run by Node | One static binary per OS/arch |
| Needs on the machine | Node.js ≥ 20 | Nothing |
| Start-up | ~60–100 ms | ~5 ms |
| Ecosystem fit | Official MCP SDK, JSON Schema tooling, OpenCode plugins are TS, workflow definitions read naturally | More glue to write |
| Contributors | Familiar to most of the target audience | Smaller pool |

The two costs of TypeScript are real: a Node dependency, and start-up latency that matters in hooks running on every tool call. Mitigations:

- plugins bundle the core as **one self-contained JS file**, no install step;
- hook entry points stay minimal and exit early when a policy does not apply;
- **compiled binaries** (`bun build --compile`) can be published later without changing language ([ADR-0015](./0015-distribution.md)).

## Consequences

### Positive

- The process is unit-testable without a model, in seconds ([determinism and testing](../architecture/determinism-and-testing.md)).
- The same decisions in every CLI, because they are made in one place.
- Skills fit their size budget ([ADR-0011](./0011-size-budgets-and-enforcement.md)).

### Negative

- One more tool to install where no plugin bundles it; `tl doctor` must say clearly when Node is missing.
- Each skill depends on the JSON contract; schema changes need versioning discipline.

## Alternatives considered

| Option | Why not |
|---|---|
| All logic in prompts | Untestable, drifts, costs context every run |
| Shell scripts (bash + jq) | Fast to start, hard to test and to keep portable (macOS vs Linux vs Windows) |
| Go | Better start-up and no runtime, weaker fit for MCP, schemas and contributors — revisit if binaries alone do not close the gap |
| An MCP server as the core | Every CLI speaks MCP, but per-CLI MCP setup becomes a prerequisite, and hooks and git hooks need a CLI anyway; may be added later as a façade over the same core |

## Links

- [Core CLI](../architecture/core-cli.md)
- [P1-01 — CLI skeleton](../../roadmap/phase-1-walking-skeleton.md#p1-01--tl-command-framework)

[◀ Decisions index](./README.md)
