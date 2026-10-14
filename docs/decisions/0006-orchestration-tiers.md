# 0006 — Three orchestration engines, one decision layer

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

Several steps fan out: `research` investigates angles in parallel, the gates run one agent per lens and three verifiers per finding, `build-slice` builds independent slices at once. CLIs differ in how they support this — parallel subagents in most, unclear parallelism in Gemini CLI, read-only agents not enforced by Codex. Hooks differ too: declarative JSON in most, JavaScript plugins in OpenCode, a different schema in Antigravity.

If the logic that decides outcomes lived inside one CLI's orchestration feature, the result would depend on which CLI you used.

## Decision

1. **Three engines** for any fan-out:

   | Engine | How | When |
   | --- | --- | --- |
   | `native` | The skill spawns the CLI's own subagents; each reports with `wl gate submit` | The CLI has parallel subagents |
   | `headless` | `wl fanout` runs workers through the CLI's headless mode (`claude -p`, `codex exec`, …) | No suitable subagents, or maximum isolation wanted |
   | `sequential` | The same lenses, one after another | Last resort |

   The adapter declares which engines a CLI supports; the run can override it.
2. **All deciding logic lives in the core:** lens sets, round budgets, the verification quorum and refutation threshold, aggregation into one verdict. The engine only moves prompts and results.
3. **Guards are portable.** Every generated hook calls `wl guard <event>`, which normalises payloads (`tool_name`/`toolName`, event casing) and applies the same policies. Where hooks are missing or unreliable, **git hooks** installed by `wl install` carry the critical guards.
4. **Read-only is verified, not assumed.** Where a CLI cannot enforce a read-only agent, the core checks the worktree is unchanged after every gate round; any change fails the round. Gates observe; builders repair.

## Consequences

### Positive

- Identical verdicts in every CLI and every engine — testable with stubbed agents.
- Headless mode gives real process isolation when wanted.
- Guards keep working in a CLI with weak hooks.

### Negative

- The headless engine costs more start-up and needs non-interactive permissions configured per CLI.
- Three engines to test; mitigated by sharing the same workflow definition and stubbed-agent tests.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Rely on each CLI's native orchestration only | Results would vary by CLI; no answer for CLIs without parallel subagents |
| An external orchestrator driving CLIs headlessly for every step | Takes over the interactive session the person is using |
| A workflow feature specific to one CLI | Not portable |

## Links

- [Orchestration and gates](../architecture/orchestration-and-gates.md)
- [P3-03 — gate engine](../../roadmap/phase-3-build.md#p3-03--gate-engine) · [P5-03 — headless engine](../../roadmap/phase-5-reach-release.md#p5-03--headless-fan-out-engine)

[◀ Decisions index](./README.md)
