# Writing a provider

> **TL;DR** — A provider is a folder with a `provider.yml` and, optionally, a few short guidance files. The manifest says which capabilities it serves, how to detect it, how to connect it in each CLI, which tool fulfils each verb, and what to hand over when it is not available. Most providers are under fifty lines.

Authenticated checks against each real service are not part of the gate.

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
      tools: ["acme_search_tickets"]      # declaration hints; not proof of authentication
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
| `access` | yes | At least one of `mcp`, `cli`, `native`. Prefer an observed client MCP tool/schema; native handoffs remain available. |
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

## Client-owned MCP transport

Use the native client's existing MCP connection; wholeloop does not run another MCP client or copy credentials. Read [ADR-0085](../decisions/0085-client-owned-mcp-first-provider-transport.md) for the decision and the rejected automatic HTTP fallback.

1. Configure/authenticate the selected provider in the native client, using its credential store. `wl mcp add` renders configuration; it does not prove login.
2. Inspect that client's actual tools and input schemas. Supply only non-secret metadata using `wholeloop/client-mcp@1`. Declaration detection alone is insufficient.
3. Run `wl provider plan <id> <operation> --mcp <external-inventory.json> --json`. This command reads metadata only: it performs no authentication, service call or state write. Exit 0 means a route is planned; exit 3 means unavailable; malformed metadata exits 4. `authentication: client-owned-unverified` is explicit.
4. For a planned MCP route, the conductor's host invokes the tool through the existing client connection, translates contract arguments against the live schema and normalizes the result. A plan alone is never a publication receipt.
5. Retain the declared open question or pending handoff if access/schema is missing. If an invocation fails, inspect remote state and retained intent; do not try HTTP automatically or repeat an uncertain write.

The following **synthetic metadata example** demonstrates planning against a built-in mapping. Its schema is illustrative, not a current PostHog server contract or evidence of real access. Run from the repository root after building:

```bash
MCP_INVENTORY_FILE="$(mktemp)"
cat > "$MCP_INVENTORY_FILE" <<'JSON'
{
  "schema": "wholeloop/client-mcp@1",
  "server": "posthog",
  "tools": [{
    "name": "execute-sql",
    "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } } }
  }]
}
JSON
wl provider plan posthog source.product-analytics.query \
  --mcp "$MCP_INVENTORY_FILE" --json
wl provider plan amplitude dashboards.create --json
```

The first plan selects MCP with `effects: not-performed`. The second selects the native pending dashboard handoff. Only `mcp` and `native` transports exist: wholeloop has no service client of its own. The inventory must be a regular file under 64 KiB, with at most 256 unique tools.

It contains no token, headers or credential fields; never write runtime metadata inside a repository. Wholeloop checks bounded metadata and operation identity; the client validates the actual arguments against the observed tool schema.

For virtual operations such as `wholeloop.dashboard.handoff`, discovery of an arbitrary create-like tool is insufficient. Supply an explicit `bindings` object mapping `dashboards.create` to the exact reviewed tool name, and include that tool's actual input schema in `tools`. Do not guess a vendor write contract. `comms.draft` and `flags.propose-change` cannot receive remote MCP bindings: they retain their native unsent/unapplied boundary.

In an embedded TypeScript conductor, load a provider and build `clientProviderHost(provider, { mcp: { inventory, invoke } })` from src/providers/transport.ts. The `invoke` callback receives an OperationCall with the selected tool and original operation identity; its client-owned adapter must translate arguments and return the existing normalized OperationResult.

Wrap it with `rolloutHost(files, root, host)` for native handoffs. Its eligibility hook lets reviewed MCP dashboard bindings run before the handoff. Keep dispatch inside `dispatchLaunchArtifact` so once-only receipts and ambiguous intents are preserved. There is no standalone CLI MCP invocation command.

The same inventory drives two planning commands: `wl provider read-flags <id> --flag <key> --environment <key> --mcp <file>` and `wl launch dispatch --for <id> --key <key> --mcp <file>` print the exact call for the client to make, and without a matching binding they return the open question or the local handoff.

A provider whose manifest declares no `access.mcp` server, such as LaunchDarkly today, cannot bind a remote tool; add the server in a repository or user manifest override after checking its install recipe. No module in `src/` may open a network connection to a service; `test/unit/providers/network-boundary.test.ts` fails on a new one.

All remote integrations remain **experimental · fixture-tested · service-unverified** until the maintainer records actual service/operation/version evidence.

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
[◀ Extending](README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Compatibility ▶](compatibility.md)
