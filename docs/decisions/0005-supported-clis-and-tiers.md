# 0005 — Supported CLIs and their tiers

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The value of a portable harness depends on how many people can use it where they already work. Supporting every CLI at once, though, would spread the first release thin. The research done in October 2026 ([platforms](../platforms/README.md)) shows clear differences in how ready each CLI is for skills, subagents, hooks and structured questions.

Notable facts that shaped the tiers:

- Copilot CLI reads Claude-format hooks and skills, so supporting it costs little once Claude Code works.
- Antigravity CLI replaced Gemini CLI for free and personal accounts in June 2026; enterprise and API-key users keep Gemini CLI. They are two targets.
- Some capabilities are still unverified (marked ❓), so they need a spike before we rely on them.

## Decision

| Tier | CLIs | Commitment |
|---|---|---|
| **A** | Claude Code · OpenAI Codex CLI · OpenCode · GitHub Copilot CLI | Generated adapters, green conformance scenarios and docs from the walking skeleton onwards |
| **B** | Gemini CLI · Google Antigravity CLI · Cursor CLI | Adapters in Phase 5; gaps bridged as described in [ADR-0006](./0006-orchestration-tiers.md) |

**What a CLI needs for tier A:** native Agent Skills, subagents, hooks (or an equivalent), MCP, a headless mode, and a structured question tool or an acceptable plain-text fallback.

**How support is kept honest:**

- CLI versions are **pinned** in the conformance suite.
- A scripted scenario runs **headless** against each tier-A CLI nightly and before every release, with structural assertions on the journal.
- The compatibility matrix in the docs is **generated** from those results.
- Unverified capabilities are spiked in [P0-03](../../roadmap/phase-0-foundations.md#p0-03--cli-conformance-spike) before any design relies on them.

## Consequences

### Positive

- A first release that works well on the four CLIs most people use, rather than poorly on seven.
- Clear, testable criteria for promoting a CLI.

### Negative

- Tier-B users wait for Phase 5, or use the headless/sequential engines early at their own risk.
- Nightly conformance costs CI time and model usage; kept small by design.

## Alternatives considered

| Option | Why not |
|---|---|
| Claude Code only | Defeats the purpose of a portable harness |
| All seven at once | Spreads the first release across the CLIs with the most gaps |
| Gemini CLI and Antigravity as one target | Different config locations, hook schemas and question tools |

## Links

- [Platforms](../platforms/README.md)
- [P5-01, P5-02 — tier-B adapters](../../roadmap/phase-5-reach-release.md#p5-01--adapters--gemini-cli-and-antigravity-cli)

[◀ Decisions index](./README.md)
