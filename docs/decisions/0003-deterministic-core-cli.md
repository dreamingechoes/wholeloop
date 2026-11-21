# 0003 — A deterministic TypeScript core (`wl`); skills stay thin

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

**Amended 2026-11-21 (P9-22).** Small step decisions, worker results and normalized observations now accept explicit bounded standard input through --stdin, using the same domain schemas and authority checks as files. File readers and literal filenames remain compatible. Research can begin with its first plan in one call, framing begins with its input schemas, and review consumes the context already returned by begin. The core returns one stable artifact directory per store/run under the operating system's temporary root, outside both repositories and the private store; it does not create it. This removes bookkeeping calls and ad hoc JSON files without caching or skipping a fresh guard.

Prompts are the least testable part of any harness, and the part where rules get lost: a rule written in a long skill can be reasoned around, contradicted by another skill, or forgotten after compaction. Much of what a harness decides, though, has exactly one right answer — which step comes next, which question is missing, which provider applies, whether a spec has a metric without a source, how many review rounds are left. Those answers do not need a model.

Every agentic CLI can run a shell command and read its output. That makes a CLI the most portable place to put shared logic.

## Decision

1. **A core CLI, `wl`, owns every decision with one right answer:** flow and preconditions, question generation, configuration and profile precedence, repo discovery and slot binding, provider resolution, artifact shape checks, gate arithmetic, persistence.
2. **Skills are thin.** They call `wl step begin`, do the creative work, and call `wl step complete`. They never compute a verdict, a precedence or a next step themselves.
3. **JSON contract.** Every command supports `--json` with a versioned schema (`wholeloop/step-begin@1`). Exit codes carry meaning: `0` ok · `1` unexpected · `2` needs input · `3` precondition failed · `4` shape check failed.
4. **TypeScript on Node.js ≥ 20.**
5. **Explicit streamed payloads.** Small JSON inputs use --stdin; existing --file and named artifact paths retain their previous readers and schema validation. Standard input is bounded at 1 MiB by default, 64 KiB for framing decisions/reviews and shared target lists, and 2 MiB for shared observations. Reject empty/malformed/oversize input and ambiguous file/stdin selection without echoing content. A payload and an attribution rationale cannot both consume stdin; existing file/answer modes remain available. A normalized observation never proves authentication or grants an external operation.
6. **Preparation is returned once.** Optional step begin research --with-plan performs the same begin and plan actions, preserving missing-input questions, source selection and each fresh check. Framing returns its decision/review schemas. Review begin already returns the initial review and assignments; only a changed round or resumption without them needs review input again. Canonical skills stream small payloads quietly and keep remaining large artifacts in the returned scratch directory. That directory is deterministic per store/run, physically outside repositories and the core-owned private store, and created only when an artifact is needed.

### Why TypeScript rather than Go

| | TypeScript | Go |
| --- | --- | --- |
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

- One more tool to install where no plugin bundles it; `wl doctor` must say clearly when Node is missing.
- Each skill depends on the JSON contract; schema changes need versioning discipline.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Interpret a dash filename implicitly as stdin | Could reinterpret a valid legacy filename; an explicit additive flag preserves it |
| Store editable scratch inside the private store | Breaks core-only ownership and containment assumptions; use a checked temporary directory outside it |
| Consume payload and rationale from one stream | Two independent reads would lose or misattribute data; reject ambiguity before either read |
| Remove fresh checks while combining commands | A reduced call count cannot supply missing authority or stale workspace proof; retain the same actions and questions |
| A separate JSON scratch file for each worker | Adds file writes and calls for data already returned in memory; stream small validated results instead |
| All logic in prompts | Untestable, drifts, costs context every run |
| Shell scripts (bash + jq) | Fast to start, hard to test and to keep portable (macOS vs Linux vs Windows) |
| Go | Better start-up and no runtime, weaker fit for MCP, schemas and contributors — revisit if binaries alone do not close the gap |
| An MCP server as the core | Every CLI speaks MCP, but per-CLI MCP setup becomes a prerequisite, and hooks and git hooks need a CLI anyway; may be added later as a façade over the same core |

## Verification

`test/unit/cli/json-input.test.ts` runs actual local pipes and legacy files through framing decisions/final reviews, current gate results/votes and normalized synchronization observations. It covers size limits, invalid/empty input, literal dash filenames, attribution conflicts, unchanged state on refusal, compound source questions, exact resumption, scratch containment, all seven rendered skills and synthetic experience transcripts with four bookkeeping calls reduced to two. Existing domain, compatibility and full fixture suites retain schemas, ownership, source selection and fresh workspace checks. Native timing and quota calibration remain manual evidence.

## Links

- [Core CLI](../architecture/core-cli.md)
- [P1-01 — CLI skeleton](../../roadmap/phase-1-walking-skeleton.md#p1-01--wl-command-framework)

[◀ Decisions index](./README.md)
