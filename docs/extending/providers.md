# Writing a provider

> **TL;DR** — A provider is a folder with a `provider.yml` and, optionally, a few short guidance files. The manifest says which capabilities it serves, how to detect it, how to connect it in each CLI, which tool fulfils each verb, and what to hand over when it is not available. Most providers are under fifty lines.

> [!NOTE]
> **Status: 🚧 partial.** Schema, inheritance, package loading, inspection/scaffolding and tier-A MCP rendering are implemented. Live operation mapping/probes and additional built-ins remain planned. Registry: [P1-08](../../roadmap/phase-1-walking-skeleton.md#p1-08--provider-registry-v1); it is versioned (`schema: 1`) from day one.

---

## Anatomy

```text
.wholeloop/providers/acme-support/
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

JSON manifests (`provider.json`) use the same schema and are also accepted; built-ins use JSON so they embed in the single-file CLI bundle. The public schema is `src/providers/schema.json`. A provider folder contains exactly one manifest; its ID must match the folder name. Invalid overrides are reported and ignored as complete units.

`extends: builtin:<id>` names the built-in explicitly. `extends: <same-id>` merges the next lower layer; another ID extends that provider. Cycles and missing bases fail. Inherited guidance retains its source directory; guidance cannot escape through traversal/symlinks and is capped at 30 lines. Arrays replace during inheritance; objects merge.

An HTTP recipe may use `auth: header` with `token_env: ACME_AUTH`; only the variable name is stored. Inline headers, credential-bearing URLs, query strings and fragments are rejected. Stdio recipes use `command` and optional `args`; authenticate through the server/client's own credential store.

## Field by field

| Field | Required | Notes |
| --- | --- | --- |
| `schema` | yes | Manifest schema version. `wl` refuses unknown major versions. |
| `id` | yes | Kebab-case, unique. Same `id` as a built-in **replaces** it; use `extends: <id>` to override only some fields. |
| `capabilities` | yes | From the [taxonomy](../configuration/providers.md#the-capability-taxonomy). One provider may list several. |
| `access` | yes | At least one of `mcp`, `cli`, `native`. The first one that detects wins. |
| `access.mcp.install` | for MCP | Neutral description; `wl mcp add` turns it into each CLI's dialect. |
| `operations` | yes | One entry per `capability.verb` you support. Unlisted verbs are reported as unsupported, not guessed. |
| `operations.*.args` | no | Mustache-style mapping from contract inputs (`query`, `window`, `title`, `body`, `item`…) to tool arguments. |
| `operations.*.guidance` | no | A short file the skill reads before calling the tool: query patterns, pitfalls, rate limits. |
| `degrade` | yes | What happens when unavailable: `open-question` (sources) · `handoff-artifact` (destinations) · `skip-with-reason`. |

## What the contract guarantees

- **Only contract verbs.** A manifest that maps a verb outside the taxonomy fails validation. There is no way to declare `comms.send` or `flags.toggle`.
- **Read-modify-write for documents.** `docs.update` always fetches the current body, applies the change and writes it back in the same format, so a colleague's edits are never overwritten by a body rebuilt from memory.
- **No secrets in manifests.** Authentication is delegated to the MCP server or the CLI (OAuth, the CLI's own login, environment variables referenced by name).

## Current inspection behavior

`wl provider scaffold acme-support` prints a valid starter manifest. Add `--output .wholeloop/providers/acme-support/provider.yml` to create it explicitly; existing files are never overwritten. `provider list|show|test` report validation and declaration/PATH detection only. Authentication and tool availability remain manual; `--probe` is not implemented.

## Target live inspection

```text
$ wl provider test acme-support
✓ schema 1 valid
✓ capabilities: source.support
✓ detection: MCP server 'acme-support' found in Claude Code, Codex configs · not in OpenCode
✓ install recipe renders for: claude · codex · opencode · copilot · gemini · antigravity · cursor
✓ operations: source.support.query → acme_search_tickets (args map cleanly)
• probe: run inside a CLI session to verify authentication (wl provider test --probe)
```

Built-in providers also ship a **fixture test**: a recorded tool response and the expected normalised result, so the mapping is verified without a network.

## Checklist before sharing

- [ ] Uses only taxonomy verbs, and every supported verb is listed.
- [ ] Every capability has a `degrade` behaviour.
- [ ] Guidance files are short and specific to *this* tool.
- [ ] `wl provider test` passes; a fixture test exists for built-in candidates.
- [ ] A row in the catalogue table, if proposed upstream.

---

<!-- docnav -->
[◀ Extending](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Lenses, templates, profiles ▶](lenses-templates-profiles.md)
