# The core CLI — `tl`

> **TL;DR** — `tl` is the single place where `throughline` makes decisions that have one right answer. Skills call it through the shell, pass `--json`, and get structured answers back. Humans can use it too: every command has a readable default output.

> [!NOTE]
> **Status: 📐 design.** Command names are the target surface; the generated reference replaces this table once [P1-01](../../roadmap/phase-1-walking-skeleton.md#p1-01--tl-command-framework) lands.

---

## Design rules

1. **Every command has `--json`**, with a versioned schema. Skills only ever consume JSON.
2. **Deterministic.** Same inputs, same store, same config → same output. No model calls, no network unless the command is explicitly about a provider.
3. **Single writer.** Only `tl` writes the store. Writes are validated, atomic (write-then-rename) and serialised with a lock.
4. **Exit codes mean something.** `0` ok · `2` needs input (questions in the payload) · `3` precondition failed · `4` shape check failed · `1` unexpected error.
5. **Small surface.** A new command needs a reason a skill cannot express with the existing ones.

## Command surface

| Group | Commands | Used by |
|---|---|---|
| **Steps** | `tl step begin <step>` · `tl step plan` · `tl step complete <step>` · `tl step skip <step> --reason` | every skill |
| **Questions** | `tl answer <qid>=<value> --remember run\|initiative\|project\|user` | every skill |
| **State** | `tl state show\|list\|get <id>` · `tl open <id>` · `tl note <id> "…"` · `tl link <id> <url>` · `tl state rebuild` | skills, people |
| **Messaging** | `tl msg send --thread <id> --to <role> --kind <kind>` · `tl msg read --for <role>` · `tl handoff <id> --to <role>` | agents |
| **Sessions** | `tl resume [<id>]` · `tl status` | `next`, `status`, people |
| **Repo** | `tl discover` · `tl resolve <slot>` | step begin, `setup` |
| **Providers** | `tl provider list\|show\|test\|scaffold` · `tl mcp add <provider> --target <cli>` | `setup`, authors |
| **Profile** | `tl profile show\|set <dial>=<value>\|preset <name>` | `setup`, people |
| **Gates** | `tl gate plan <gate> --for <id>` · `tl gate submit` · `tl gate verdict` | gate workflows |
| **Fan-out** | `tl fanout run <workflow> --engine native\|headless\|sequential` | gates, `research` |
| **Guards** | `tl guard <event>` (reads a hook payload on stdin) | generated hooks, git hooks |
| **Worktrees** | `tl worktree create\|open\|stop\|list\|prune <slice>` — isolated workspace and branch per slice, with port allocation | builder, `open-pr`, `sync` |
| **Environment** | `tl env declare <what> --undo "<command>"` · `tl env report` | builder, `open-pr` |
| **Install** | `tl install --target <cli,…> --scope user\|project` · `tl uninstall` · `tl doctor` | people |
| **Docs (dev)** | `tl docs nav` · `tl docs check` | CI, contributors |

## The step contract

`tl step begin` is the heart of the design. It turns *"which step, with what input"* into everything the skill needs to act, and nothing it should decide on its own.

```json
{
  "schema": "throughline/step-begin@1",
  "step": "write-spec",
  "mode": "flow",
  "subject": { "kind": "initiative", "id": "init-41c2" },
  "have": { "frame": "init-41c2/frame.md", "brief": "brief-7f3a" },
  "missing": ["docs.destination"],
  "questions": [
    {
      "id": "docs.destination",
      "prompt": "Where should the spec live?",
      "multi": false,
      "options": [
        { "value": "local", "label": "Local Markdown", "note": "default" },
        { "value": "notion", "label": "Notion", "note": "MCP detected" },
        { "value": "confluence", "label": "Confluence", "note": "not connected — tl mcp add confluence" }
      ],
      "remember": ["run", "initiative", "project", "user"]
    }
  ],
  "bindings": {
    "spec.template": { "source": "repo", "ref": ".agents/skills/product-spec" }
  },
  "profile": "Be brief. Product-level vocabulary. Challenge assumptions firmly but kindly. …",
  "template": "harness/templates/spec.md",
  "decision": { "id": "approve-spec", "after": "complete" },
  "preflight": ["Plan — …", "Where — …", "Never — …", "Stop — …"]
}
```

- **`have` / `missing`** — the step uses whatever already exists and asks only for the gap. This is what makes standalone use work.
- **`questions`** are generated from configuration gaps and step inputs, never improvised by the model. The skill renders them with the CLI's structured question tool when there is one, otherwise as plain text and waits.
- **`bindings`** say whose rules to follow ([repo-first slots](../configuration/repo-skills.md)).
- **`profile`** is a pre-rendered style block, ≤ 10 lines ([profile](../configuration/profile.md)).
- **`preflight`** lines are generated, so a stated cap or destination is always the one actually enforced.

`tl step complete` validates the produced artifact against the step's **shape rules** (for example: every metric in a spec names a source and a window), records it in the journal, publishes through providers if configured, and returns the receipt plus the suggested next steps.

## Questions and remembering

```mermaid
flowchart LR
  G["gap detected<br/>(config or input)"]:::core --> Q["question with options"]
  Q --> A["answer"]
  A --> R{"remember where?"}
  R -- run --> X1["this run only"]
  R -- initiative --> X2["initiative settings"]
  R -- project --> X3[".throughline/config.yml<br/>(committed, team)"]
  R -- user --> X4["~/.config/throughline<br/>(personal)"]
  classDef core fill:#eceff3,stroke:#5b6573,color:#111827;
```

A remembered answer is never asked again at that scope. A step that re-asks a settled question is a bug.

## Hooks and guards

All generated hooks, for every CLI, call one entry point: `tl guard <event>`. It normalises the payload (`tool_name` vs `toolName`, PascalCase vs camelCase events) and applies the same policies everywhere. Where a CLI has no usable hooks, **git hooks** installed by `tl install` carry the critical ones (no commit to the default branch, no push from a gated step). Details: [ADR-0006](../decisions/0006-orchestration-tiers.md).

---

<!-- docnav -->
[◀ Architecture](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [State and messaging ▶](state-and-messaging.md)
