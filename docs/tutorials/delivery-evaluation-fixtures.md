# Use original delivery evaluation fixtures

> **TL;DR** — Start from a digest-bound original application, keep its expected outcomes in the controller store and compare known baseline/reference controls. Use separate actual browser and native-agent evaluations for their own evidence levels.

> [!IMPORTANT]
> **Experimental.** The catalog, immutable materialization and original controls are tested on macOS and Linux. See [ADR-0111](../decisions/0111-original-delivery-fixtures-and-controller-owned-oracles.md). Autonomous delivery may change in a minor release.

Commands that start with `npm run eval` are model-free controls that run from a source checkout ([development guide](../contributing/development.md#build-from-source)); every `wl` command uses the installed CLI.

## What the catalog covers

The source catalog is test/fixtures/delivery-applications/catalog.json. All applications and hostile payloads are original and covered by the repository's MIT license. No model or service account is required to inspect or seed them.

| Scenario | Surfaces | Relevant observation |
| --- | --- | --- |
| lookup-regression | CLI, HTTP | Mixed-case/Unicode lookups fail on the baseline; ordinary matching, empty-query rejection and no-match controls remain intact |
| durable-board | HTTP, browser | A created task survives a real process/container restart and fresh browser context only in the reference |
| protocol-disagreement | CLI, combined HTTP | Independently green frontend/backend units expose incompatible response shapes together |
| policy-injection | Broker, hostile feedback | Attempts to create merge authority or impersonate approval leave the original grant and plan unchanged |

The baseline is deliberately defective for the first three scenarios. A passed baseline control means the evaluator actually detected the expected relevant failure while preserving normal controls. It does not mean the baseline implements the requirement. The reference is a known-good control, never a model repair.

## Inspect and seed without an account

Run from the source repository with Node ≥ 22 and Git installed. The built CLI retains its Node 20 minimum. Inspect the closed contracts and public catalog:

```bash
set -euo pipefail
npm run build
node dist/wl.mjs eval delivery-schema --json
node dist/wl.mjs eval delivery-catalog test/fixtures/delivery-applications/catalog.json --json
```

The schema command opens no store. Catalog inspection loads and verifies literal file hashes but executes nothing. It returns scenario IDs, surfaces, repository IDs and requirements/oracle digests; private expected values and reference bodies are omitted.

Create a disposable external store, then seed a baseline application:

```bash
set -euo pipefail
fixture_store="$(mktemp -d "${TMPDIR:-/tmp}/wholeloop-fixture-tour.XXXXXX")"
fixture_seed_receipt="$(node dist/wl.mjs eval delivery-seed test/fixtures/delivery-applications/catalog.json --scenario lookup-regression --variant baseline --key first-lookup --store "$fixture_store" --json)"
printf '%s\n' "$fixture_seed_receipt"
fixture_seed_digest="$(printf '%s' "$fixture_seed_receipt" | node --input-type=module -e 'let body=""; for await (const chunk of process.stdin) body += chunk; console.log(JSON.parse(body).digest)')"
```

This creates a fresh committed Git repository and REQUEST.md under the returned external workspace path. The receipt explicitly says git-seed-only, authority not-granted and nativeAcceptance not-established. It starts no application, model or real delivery. The commands capture its digest for inspection in a fresh process:

```bash
set -euo pipefail
node dist/wl.mjs eval delivery-inspect "$fixture_seed_digest" --store "$fixture_store" --json
```

The returned head is the historical seed commit. seedFiles reports whether the selected original files match, changed or became unavailable; inspection does not execute builder-owned Git configuration or establish current candidate eligibility. Repeating the same seed request preserves actual edits. Reusing a key with another catalog/scenario/variant is refused. An interrupted existing workspace without a completion record stays unknown and exits 3; preserve it for inspection.

Use a fresh key and --variant reference for a known-good control. That receipt remains explicitly labelled reference. It cannot establish a model's implementation success. Requirements/oracles are copied and pinned before application materialization, and worker-created oracle files are never adopted. Changing the original source catalog later does not redefine an existing seed.

## Run the trusted controls

From the source repository, execute:

```bash
set -euo pipefail
npm run eval:delivery-fixtures
```

This evaluates all eight scenario/variant controls with actual original Node processes, local loopback HTTP, real process restart and deterministic broker fixtures. It validates the reviewed byte baseline, creates new external repositories/stores and retains a JSON report in the printed location. Reports expose statuses and evidence digests, not private expected bodies.

The control runner executes only the reviewed original source with fresh environments and finite deadlines. Changed implementation code belongs in the [owned Docker hosts](./delivery-docker.md), [behavioral acceptance](./delivery-acceptance.md) and [complete milestone verification](./delivery-assembly.md). A supplied worker result is not an execution observation. The broker fixture measures deterministic rejection; actual model behavior under hostile text remains native acceptance.

## Exercise the browser fixture separately

After caching the reviewed [browser reference images](./delivery-browsers.md), execute:

```bash
set -euo pipefail
npm run eval:delivery-browser -- --retire-success
```

This uses real Chromium/MCP over the private owned stdio channel. The baseline creates a visible task and screenshot but loses it after restart; the reference preserves it in a fresh context and actual backend JSON. Old candidate evidence becomes stale, completed keys do not replay UI writes, and exact owned environments are retired after their evidence is retained.

The default trusted-control report deliberately marks browser journeys not-executed. This separate report establishes the named backend/application observation on its actual controller/daemon scope. Neither result certifies native coding clients, independent Linux Docker hosts, external accounts, hosted PR/merge semantics or the complete unattended factory.

## Maintain the standard

The reviewed baseline.json fixes exact fixture, oracle and catalog bytes. Tests reject drift and new/missing literals. Change expected outcomes only as an explicit reviewed standard revision, retain previous failures and compare reports with the same catalog digest. Do not replace an oracle with implementation output to improve a score. Runtime stores, artifacts and temporary repositories stay outside the checkout.

The [expanded validation specification](../../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) defines the later three-run native reference, interruption and hosted trials. Those retain their own actual evidence and authorization requirements.

<!-- docnav -->
[◀ Owned assembly and combined verification](delivery-assembly.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Maintenance proposals ▶](maintenance-proposals.md)
