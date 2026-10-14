# Writing a provider

> **TL;DR** — A provider is a folder with a `provider.yml` and, optionally, a few short guidance files. The manifest says which capabilities it serves, how to detect it, how to connect it in each CLI, which tool fulfils each verb, and what to hand over when it is not available. Most providers are under fifty lines.

> [!NOTE]
> **Status: 📐 design.** The schema below is the target for [P1-08](../../roadmap/phase-1-walking-skeleton.md#p1-08--provider-registry-v1); it is versioned (`schema: 1`) from day one.

---

## Anatomy

```text
.throughline/providers/acme-support/
├─ provider.yml          the manifest (required)
└─ guidance/
   └─ query.md           how to query this source well — ≤ 30 lines
```

## The manifest

```yaml
schema: 1
id: acme-support
name: Acme Support Desk
description: Customer tickets and conversations from Acme Support Desk.

capabilities:
  - source.support

access:
  mcp:
    server: acme-support                  # name used in the CLI's MCP config
    detect:
      tools: ["acme_search_tickets"]      # tool names that prove it is connected
    install:
      transport: http
      url: https://mcp.acme.example/mcp
      auth: oauth                         # oauth | header | none
  # alternatives, in order of preference:
  # cli:    { binary: acme, detect: "acme --version" }
  # native: true                          # served by the host CLI itself

operations:
  source.support.query:
    tool: acme_search_tickets
    args:                                 # how contract inputs map to tool arguments
      text: "{{query}}"
      since: "{{window.start}}"
      limit: 200
    guidance: guidance/query.md

degrade:
  source.support.query: open-question     # never invent: record what is missing and who has it
```

## Field by field

| Field | Required | Notes |
|---|---|---|
| `schema` | yes | Manifest schema version. `tl` refuses unknown major versions. |
| `id` | yes | Kebab-case, unique. Same `id` as a built-in **replaces** it; use `extends: <id>` to override only some fields. |
| `capabilities` | yes | From the [taxonomy](../configuration/providers.md#the-capability-taxonomy). One provider may list several. |
| `access` | yes | At least one of `mcp`, `cli`, `native`. The first one that detects wins. |
| `access.mcp.install` | for MCP | Neutral description; `tl mcp add` turns it into each CLI's dialect. |
| `operations` | yes | One entry per `capability.verb` you support. Unlisted verbs are reported as unsupported, not guessed. |
| `operations.*.args` | no | Mustache-style mapping from contract inputs (`query`, `window`, `title`, `body`, `item`…) to tool arguments. |
| `operations.*.guidance` | no | A short file the skill reads before calling the tool: query patterns, pitfalls, rate limits. |
| `degrade` | yes | What happens when unavailable: `open-question` (sources) · `handoff-artifact` (destinations) · `skip-with-reason`. |

## What the contract guarantees

- **Only contract verbs.** A manifest that maps a verb outside the taxonomy fails validation. There is no way to declare `comms.send` or `flags.toggle`.
- **Read-modify-write for documents.** `docs.update` always fetches the current body, applies the change and writes it back in the same format, so a colleague's edits are never overwritten by a body rebuilt from memory.
- **No secrets in manifests.** Authentication is delegated to the MCP server or the CLI (OAuth, the CLI's own login, environment variables referenced by name).

## Testing it

```text
$ tl provider test acme-support
✓ schema 1 valid
✓ capabilities: source.support
✓ detection: MCP server 'acme-support' found in Claude Code, Codex configs · not in OpenCode
✓ install recipe renders for: claude · codex · opencode · copilot · gemini · antigravity · cursor
✓ operations: source.support.query → acme_search_tickets (args map cleanly)
• probe: run inside a CLI session to verify authentication (tl provider test --probe)
```

Built-in providers also ship a **fixture test**: a recorded tool response and the expected normalised result, so the mapping is verified without a network.

## Checklist before sharing

- [ ] Uses only taxonomy verbs, and every supported verb is listed.
- [ ] Every capability has a `degrade` behaviour.
- [ ] Guidance files are short and specific to *this* tool.
- [ ] `tl provider test` passes; a fixture test exists for built-in candidates.
- [ ] A row in the catalogue table, if proposed upstream.

---

<!-- docnav -->
[◀ Extending](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Lenses, templates, profiles ▶](lenses-templates-profiles.md)
