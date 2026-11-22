# Authoring — skills, agents, protocols, workflows and adapters

> **TL;DR** — Harness content is short by rule and specific by design. A skill orchestrates; the core decides; the reasoning lives in an ADR. Every file has a line budget, every hard rule has an enforcer, and every change to generated output is a reviewed golden-file diff.

Budgets, front-matter checks and the enforcement lint run in `wl harness check`, part of `npm run check`.

---

## Budgets

| File | Budget | Checked by |
| --- | --- | --- |
| `harness/skills/<step>/SKILL.md` | ≤ 120 lines · description ≤ 400 characters | budget lint |
| `harness/agents/<role>.md` | ≤ 60 lines | budget lint |
| `harness/protocols/*.md` | ≤ 80 lines | budget lint |
| `harness/policies/*.md` | ≤ 80 lines | budget lint |
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

Read speaking-to-person and the protocols this step uses.

1. Run `wl step begin build-slice --input "$ARGUMENTS" --json`. If exit code 2, ask the questions it returns, then `wl answer …`.
2. Show `display.text` verbatim. Wait only if the payload says so.
3. Load every skill listed in `bindings` before writing code.
…
N. Run `wl step complete build-slice --json` and show `display.text`.

Protocols: [ask-never-guess](../protocols/ask-never-guess.md) · [output-contract](../protocols/output-contract.md)
```

Rules of thumb:

- **Numbered steps, imperative mood, one action each.** The agent follows a sequence better than prose.
- **Never compute in prose** what `wl` can return — orders, precedences, caps, next steps.
- **Only portable front matter** (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`). CLI-specific extras go in a sidecar the adapter reads.
- **Link protocols, don't paste them.** Shared host actions live once in `harness/protocols/`. Every skill reads `speaking-to-person`; its vocabulary map matches `src/display/terms.ts`. Keep the startup read list in `src/harness/protocols.ts` specific to the step, and load provider/evaluation guidance only when needed.
- **Keep core declarations out of prompts.** `harness/policies/` retains their hard-rule IDs and enforcers without a runtime read. Preserve host actions the core cannot perform: actual tool boundaries, explicit answers and unavailable evidence.
- **Use short command notation.** Show `wl ...` to the person; execute through the adapter's checked packaged launcher. Never install an alias, guess PATH or change permissions to shorten text.

## Agents

```markdown
---
name: reviewer
description: Reviews a change through exactly one lens and returns structured findings. Read-only.
metadata:
  wholeloop.capabilities: read
  wholeloop.tier: standard
---
```

- Capabilities are abstract (`read`, `write`, `shell`, `web`); each adapter maps them to tool names or permissions.
- **What a role must not do is removed from its capabilities**, not only written in its prompt.
- The model tier is a hint (`fast` · `standard` · `deep`) mapped per CLI. A person can map each tier to a model per client ([worker models](../configuration/README.md#worker-models)); choose the tier for the role's reasoning load, not for a specific model.
- **Workers return results in their final message.** Supply the exact assignment, schema, required protocol text and observed inputs. The conductor validates and submits the result. Do not instruct a command-disabled role to invoke the CLI, write a result file or create a replacement worker. The renderer refuses incompatible tool instructions; it does not add permissions.
- **Name the role explicitly.** Canonical skills use `wl-researcher`, `wl-challenger`, `wl-builder` and the other declared roles. Generation renders each client's actual names. Follow `worker-handoffs`; never fork conversation history or substitute the conductor. The explicitly documented headless route handles an omitted native role.

## Protocols and enforcement

A protocol states a cross-cutting rule in a few lines. A **hard rule** is written with ⛔ and a kebab-case id in backticks, so tools can find it:

```markdown
- ⛔ `no-send-verb` — comms providers can only draft; nothing is ever sent.
```

Every hard rule needs an entry in `enforcement.yml` at the repository root:

```yaml
version: 1
rules:
  - id: no-send-verb
    enforcers:                          # code, tests or lints: `path` or `path#symbol`
      - src/providers/taxonomy.ts#VERBS
      - test/unit/providers/taxonomy.test.ts
    forbid: ["comms\\.send"]             # regexes no harness source may contain
documentation_only:
  - id: some-rule
    reason: Why nothing can enforce it (yet).
```

`wl harness check` fails on: a hard rule with no entry · an enforcer that is Markdown (prose restating the rule) · an enforcer file or symbol that does not exist · a harness file matching a `forbid` pattern (a skill contradicting the rule) · an entry whose rule no longer appears anywhere · a documentation-only entry without a reason.

It also enforces the size budgets above and the front matter of skills (portable keys only, `name` matching the folder) and agents (`wholeloop.capabilities` from `read · write · shell · web`, optional `wholeloop.tier` from `fast · standard · deep`).

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

Local adapters are src/adapters/claude.ts and src/adapters/portable.ts, with pure renderers and an owned output writer. npm run build embeds bounded canonical resources into the executable; `wl build --target claude --out <directory>` renders a distribution tree. Golden fixtures and a compiled self-contained execution test cover that path.

The same build command accepts every supported target. Tiny skill launchers resolve the packaged core through symlinked overlays. For the first normal JSON command, put `--with-context` before its command words: `wholeloop/adapter-invocation@1` returns `context.root`, declared `context.roles` and the unchanged command payload as `result`. Read shared protocols from that checked root, then use the same launcher normally. The opt-in requires an unchanged owned package and JSON mode; existing command outputs and the explicit root command stay compatible. Native loading and actual client conformance remain separate evidence. See [ADR-0047](../decisions/0047-self-contained-client-artifacts-and-owned-output-upgrades.md).

Each adapter ships golden files and a conformance scenario. A new CLI is a new module plus those two; nothing else in the codebase should need to know it exists.

## Maintainer tools

The repository's own skills and agents use this same format, budgets and front-matter rules, but live in `maintainer/` and are never shipped. `npm run maintainer:render` renders them into each client's project directories through the adapters with `runtime: false`, which keeps the native tool and read-only mapping and drops the packaged-core preamble and the `wl-` namespace. The rendered files are committed and checked by `npm run maintainer:check` ([ADR-0246](../decisions/0246-dogfooded-maintainer-skills-and-agents.md)).

## Commits

Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`), imperative subject ≤ 72 characters, one concern per commit, and no tool attribution of any kind ([ADR-0017](../decisions/0017-no-tool-attribution-in-history.md)).

---

<!-- docnav -->
[◀ Development](development.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Docs style ▶](docs-style.md)
