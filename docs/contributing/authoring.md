# Authoring — skills, agents, protocols, workflows and adapters

> **TL;DR** — Harness content is short by rule and specific by design. A skill orchestrates; the core decides; the reasoning lives in an ADR. Every file has a line budget, every hard rule has an enforcer, and every change to generated output is a reviewed golden-file diff.

> [!NOTE]
> **Status: 📐 design.** Budgets and lints land in [P0-05](../../roadmap/phase-0-foundations.md#p0-05--size-budgets-and-enforcement-lint); adapters in [P1-10](../../roadmap/phase-1-walking-skeleton.md#p1-10--adapter--claude-code).

---

## Budgets

| File | Budget | Checked by |
| --- | --- | --- |
| `harness/skills/<step>/SKILL.md` | ≤ 120 lines · description ≤ 400 characters | budget lint |
| `harness/agents/<role>.md` | ≤ 60 lines | budget lint |
| `harness/protocols/*.md` | ≤ 80 lines | budget lint |
| `harness/workflows/*.ts` | ≤ 150 lines | budget lint |
| provider `guidance/*.md` | ≤ 30 lines | budget lint |
| lens `prompt.md` | ≤ 40 lines | budget lint |

A file over budget is a design smell, not a formatting problem. The usual fixes, in order: move a decision into the core, move the reasoning into an ADR, split shared rules into a protocol, delete what no enforcer backs.

## Skills

A skill is a script for the conversation, not a manual.

```markdown
---
name: build-slice
description: Builds one slice (or a free-text fix) in its own git worktree, following the repository's own skills, and runs verify and review until green. Use for any implementation work; it never opens a PR.
metadata:
  wholeloop.step: build-slice
  wholeloop.block: build
---

# build-slice

1. Run `wl step begin build-slice --input "$ARGUMENTS" --json`. If exit code 2, ask the questions it returns, then `wl answer …`.
2. Show the `preflight` lines verbatim. Wait only if the payload says so.
3. Load every skill listed in `bindings` before writing code.
…
N. Run `wl step complete build-slice --json` and show the receipt.

Protocols: [ask-never-guess](../protocols/ask-never-guess.md) · [output-contract](../protocols/output-contract.md)
```

Rules of thumb:

- **Numbered steps, imperative mood, one action each.** The agent follows a sequence better than prose.
- **Never compute in prose** what `wl` can return — orders, precedences, caps, next steps.
- **Only portable front matter** (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`). CLI-specific extras go in a sidecar the adapter reads.
- **Link protocols, don't paste them.** Shared rules live once in `harness/protocols/`.

## Agents

```markdown
---
name: reviewer
description: Reviews a change through exactly one lens and returns structured findings. Read-only.
metadata:
  wholeloop.capabilities: read shell
  wholeloop.tier: standard
---
```

- Capabilities are abstract (`read`, `write`, `shell`, `web`); each adapter maps them to tool names or permissions.
- **What a role must not do is removed from its capabilities**, not only written in its prompt.
- The model tier is a hint (`fast` · `standard` · `deep`) mapped per CLI.

## Protocols and enforcement

A protocol states a cross-cutting rule in a few lines. A **hard rule** (marked ⛔) must have an entry in `enforcement.yml` naming the code, test or lint that makes it true. The enforcement lint fails on a hard rule with no enforcer, an enforcer that only restates the rule in prose, a skill that contradicts it, or an entry pointing at a rule that no longer exists.

## Workflows

Workflows describe fan-outs (gates, research) declaratively: inputs, lenses or angles, the agent role, the result schema. The engine — native, headless or sequential — is chosen at run time; the aggregation is always `wl gate verdict`. Every workflow has a test that runs the real definition with stubbed agents.

## Adapters

An adapter implements one interface:

| Method | Answers |
| --- | --- |
| `capabilities()` | subagents? parallel? read-only enforcement? hooks? ask tool? headless? |
| `paths(scope)` | where skills, agents, hooks, MCP config live |
| `renderSkill` · `renderAgent` | front-matter and tool-name mapping |
| `renderHooks` | event names and payload registration, all calling `wl guard` |
| `renderMcp(provider)` | the CLI's MCP dialect |
| `headless(prompt, opts)` | the command line for headless workers |

Each adapter ships golden files and a conformance scenario. A new CLI is a new module plus those two; nothing else in the codebase should need to know it exists.

## Commits

Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), imperative subject ≤ 72 characters, one concern per commit, and no tool attribution of any kind ([ADR-0017](../decisions/0017-no-tool-attribution-in-history.md)).

---

<!-- docnav -->
[◀ Decisions](../decisions/README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Docs style ▶](docs-style.md)
