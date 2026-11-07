# Execute isolated browser acceptance

> **TL;DR** — Pin a grounded UI journey, provision its application and reviewed browser image, then execute the case through the existing acceptance command. Wholeloop observes real MCP actions, UI checks, owned backend responses and bounded captures; screenshots alone cannot prove persistence.

> [!NOTE]
> **Status: ✅ implemented.** The fixed host exercises actual isolated Chromium through private stdio MCP. The model-free evaluator observes a cosmetic UI failure, repaired persistence after restart and fresh context, private-control denial and stable-key reuse. Native coding-client/model checks and independent Linux-controller acceptance remain separate.

Commands that start with `npm run eval` are model-free controls that run from a source checkout ([development guide](../contributing/development.md#build-from-source)); every `wl` command uses the installed CLI.

## Inspect the contract

With the `wl` CLI ([getting started](../getting-started.md#install-the-cli)), this command is inert and needs no Docker access or account:

```bash
set -euo pipefail
npm run build
wl delivery browser-schema --json
```

The output includes the closed input schema, reviewed engine/tool bindings, architecture-specific immutable images and new exec/release schemas. It does not install, pull or start a browser. The reference is Playwright MCP 0.0.83 with its observed Playwright engine version; an arbitrary newer server is not silently accepted.

## Prepare the owned environment

Follow [Docker environment setup](./delivery-docker.md), [lifecycle controls](./delivery-lifecycle.md) and [acceptance planning](./delivery-acceptance.md). Pin definitions before builder execution. Select the application's actual source/design files, its UI service and declared loopback publication. Add a separate browser service:

- Use the matching immutable image from browser-schema and explicit cache-only acquisition or separately authorized pull-if-missing. An absent cached image is unavailable, not a simulated browser.
- Set after to the UI service, mounts and secrets to empty arrays, and cwd to /tmp. Use the exact start argv below with origin.kind set to recipe.
- Declare TCP readiness on 8931 and one port with container 8931 and publish none. The probe listens only on loopback inside the browser container. It is not an MCP endpoint.
- Reserve 1024 MiB and one CPU for the browser, plus application/proxy capacity in the recipe limits. Keep runtime networking internal. The backend's capacity admission can refuse concurrent environments; stop a completed one explicitly to release compute while retaining data and evidence.

```json
["node", "-e", "const net=require('node:net');net.createServer(s=>s.end('ready')).listen(8931,'127.0.0.1')"]
```

Wholeloop opens the actual MCP process through a private registered Docker exec stdio pipe. The application has no MCP control listener to call. No host browser profile, original workspace, credentials or Docker socket is mounted in the browser. See [ADR-0107](../decisions/0107-private-stdio-browser-acceptance.md) for why HTTP MCP on the shared application network was rejected.

## Define objective actions

Set runner.kind to browser and runner.capability to browser.journey. runner.input is a JSON string containing the following object. Replace the tool digest with reference.digest from browser-schema and the grounding hash with the selected recipe input's real SHA-256 before pinning:

```json
{
  "schema": "wholeloop/browser-input@1",
  "service": "web",
  "port": 3000,
  "browser": {
    "service": "browser",
    "reference": "playwright-mcp@0.0.83",
    "tools": "REPLACE_WITH_REVIEWED_TOOL_DIGEST"
  },
  "grounding": [{ "file": "design", "sha256": "REPLACE_WITH_SELECTED_INPUT_HASH" }],
  "persistence": "backend-roundtrip",
  "backend": { "path": "/tasks?title=Durable" },
  "steps": [
    { "id": "open", "kind": "navigate", "path": "/" },
    { "id": "title", "kind": "fill", "target": { "role": "textbox", "name": "Task title" }, "text": "Durable task" },
    { "id": "submit", "kind": "click", "target": { "role": "button", "name": "Add task" } },
    { "id": "visible", "kind": "check", "assertion": "created", "text": "Durable task", "mode": "present" },
    { "id": "image", "kind": "capture", "label": "created-task" },
    { "id": "restart", "kind": "restart" },
    { "id": "fresh", "kind": "fresh" },
    { "id": "retained", "kind": "check", "assertion": "retained", "text": "Durable task", "mode": "present" }
  ]
}
```

Pair each check with a state/equals assertion: path /checks/created or /checks/retained, expected true as a JSON literal. Add a json/equals backend assertion at /ids with expected ["task-1"]. Choose real IDs and expectations from the agreed application contract. Persistence requires all three observations: the UI after a real restart, a fresh browser context and an owned backend JSON result. Use persistence not-applicable for journeys without a persistence claim; they still require objective checks.

Control names must appear in a selected hashed input and match exactly one role/name in a fresh native snapshot. Wholeloop uses the observed reference rather than guessing a selector. Every action must leave exactly one current tab at the expected owned URL; use expectPath for an agreed route transition, including SPA hash routes. Foreign redirects, changed tabs, ambiguous controls, missing tools and incomplete output cannot pass. There is no evaluate, arbitrary script or hidden state-injection action.

## Execute and inspect

After preparing the acceptance plan, grant, recipe and environment, use acceptance-run with the plan digest, case ID, stable invocation key and exact environment ID as shown in [API/CLI execution](./delivery-behaviors.md). The runner selects the fixed browser host automatically. Reusing a completed key reads its retained receipt; an unresolved prior exec cannot dispatch again. Use a new accepted revision to change pinned cases.

The JSON artifact records observed actions, control references, URLs, native tool digests, checks, backend observations and screenshot labels/digests. Up to four complete PNGs share a twenty-MiB case cap and the original run artifact budget. The actual controller-side native invoker has process metadata; the application PID/signal remain unobserved. Read artifact bytes through the existing verified artifact command. Sharing, account access and publication are not implied.

## Run the actual model-free evaluation

Cache the helper image from environment-schema and the matching browser image from browser-schema using your normal reviewed Docker image workflow. Then run:

```bash
set -euo pipefail
npm run eval:browsers -- --retire-success
```

The evaluator creates only disposable owned task applications, Chromium instances, networks and data. It first demonstrates a cosmetic UI that displays and captures a task while losing it after restart, then checks a repaired durable implementation. It retains an external evidence directory printed at startup. Successful explicit retirement verifies owned resource absence; failed runs retain resources and diagnostics for inspection through environment-lifecycle-schema and environment-retire. Never remove an arbitrary same-name container.

Protocol fixtures and capability/schema inspection do not certify actual native coding clients, vendor accounts, independent controller platforms or human acceptance. Keep those checks separately labelled in [manual verification](../../roadmap/manual-verification.md).

<!-- docnav -->
[◀ Execute API and CLI acceptance](delivery-behaviors.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Private acceptance and regression sensitivity ▶](delivery-private-acceptance.md)
