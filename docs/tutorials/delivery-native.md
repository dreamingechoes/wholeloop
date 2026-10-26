# Native delivery hosts — inspect support without granting execution

> **TL;DR** — Dedicated delivery hosts keep builders separate from the existing read-only gate engine. A pinned recipe and an installed client still need actual runtime proof; metadata alone starts no worker.

> [!NOTE]
> **Status: 🚧 partial.** Reference recipes, capability negotiation, bounded controller execution and retained receipts are implemented and synthetic-process-tested. Actual native/backend conformance and complete unattended routing remain separate Phase 6 tasks. The command below inspects contracts only.

## Inspect the available contracts

Keep WHOLELOOP_CLI from the [worker guide](./delivery-workers.md), or set it to the absolute built CLI path. This command starts no client/model and reads no authentication store.

```bash
set -euo pipefail
: "${WHOLELOOP_CLI:?Set WHOLELOOP_CLI to the absolute built CLI path}"
node "$WHOLELOOP_CLI" delivery native-schema --json | node --input-type=module -e '
import assert from "node:assert/strict"
let input = ""
for await (const chunk of process.stdin) input += chunk
const value = JSON.parse(input)
assert.equal(value.schema, "wholeloop/delivery-native-schema@1")
assert.equal(value.targets.length, 7)
assert.equal(value.dispatch, "not-performed")
assert.equal(value.observationSchema.additionalProperties, false)
assert.equal(value.observationSchema.properties.metering.properties.hardTokens.const, false)
assert.equal(value.observationSchema.properties.metering.properties.hardCurrency.const, false)
assert.equal(value.runSchema.properties.acceptance.const, "not-established")
assert.equal(value.runSchema.properties.publication.const, "not-performed")
assert.equal(typeof value.referenceVersions.claude, "string")
assert.equal(typeof value.referenceVersions.codex, "string")
console.log("PASS: seven explicit targets, unsupported hard metering and no dispatch or acceptance")
'
```

## Reference and unsupported targets

| Target | Expanded delivery state |
| --- | --- |
| Claude | Pinned dedicated reference recipe; actual matching runtime proof is required |
| Codex | Pinned dedicated reference recipe; actual matching runtime proof is required |
| OpenCode, Copilot, Cursor, Gemini, Antigravity | Explicit expanded-target-unverified result; existing standalone/gate behavior retains its own evidence |

The current reference versions come from the schema command. Unknown versions refuse rather than inherit an older pin's certification. A schema role is a protocol capability, not proof that an authenticated native session supports it. Current queue workers cover work-unit roles, including source-only research without an application workspace; complete delegated decision/research coordination is subsequent work.

## What a launch requires

The controller prepares a fresh context from the current queue claim, immutable source/plan, pinned guidance/contracts and finite reservation. It then requires a trusted host observation bound to the exact assignment, recipe policy, target/version/role and selected model. That observation must establish authentication, containment, private-store/credential denial, restricted tools, disabled interaction, bounded cancellation, complete output and an owned-output reader. Default observation is unavailable.

No command accepts arbitrary JSON as such runtime proof. Named-version help and fixture records cannot activate an actual capability. Actual backend/tool controls are supplied and checked by their own host, with provenance retained. Managed native policy can refuse the recipe; the harness does not override it or choose a permissive alternative.

Reference recipes disable external/personal MCP in the worker client. Existing controller/provider source hosts remain MCP-first and retain their scopes; disabling worker-side integrations does not introduce vendor HTTP implementations. Builders receive only their allocated implementation boundary, while evaluators retain read-only implementation access. Returned broker methods remain permission ceilings, not a promise that an unavailable native tool exists.

## Artifact transport for controller authors

The existing files mode remains the default. A fixed controller can explicitly select output: inline-proposal when calling NativeDeliveryHost.run. That versioned worker proposal returns artifact text through the owned structured stdout channel; a read-only worker can produce a new report without a Write tool or a writable output directory. Workers may continue citing their original pinned input evidence.

The proposal echoes the supplied assignment digest. The core binds the original identity, computes actual UTF-8 hashes/sizes and validates the canonical worker claim with the same role/evidence/context rules as file mode. The complete proposal is capped at one MiB, with at most one hundred artifacts and 256 KiB of combined inline text under the original budget. Empty files, literal whitespace and Unicode stay exact. Invalid encoding, NUL, unsafe/duplicate/input references, forged metadata, stale echoes and recognizable credentials fail before capture. Native process output limits and current-grant checks remain mandatory.

The normalized result and captured references remain worker claims. A complete proposal supplies neither an observed test result nor a human/machine approval. There is no protocol fallback: an old file result sent to the inline decoder, or a proposal sent to file mode, is invalid. Public v1 schema/receipt commands retain their existing declarations; this is an explicitly selected controller API transport, with full terminal routing still in progress. See [ADR-0115](../decisions/0115-bounded-inline-worker-artifact-proposals.md).

## Controller planning and decision workers

The internal NativePurposeAttempts host now runs planner/challenger roles independently of implementation units, including revision-zero original envelopes. It shares the native assignment transport with NativeDeliveryHost; existing queue behavior and default file mode remain intact. Purpose calls explicitly use the bounded inline proposal protocol, their original private named delegation, evaluator capacity and run deadline.

Each purpose is claimed and consumed once before launch. An interrupted observer, unknown owner or missing semantic response retains the original reservation; calling again does not recover permission to launch. A known completed report remains current only while original authority, repository bases, selected input bytes, private receipt and captured output bytes agree. Existing private cancellation/process ownership still governs any actual native call.

NativeDelegatedDecisionHost obtains two independent actual process receipts and validates purpose-specific JSON claims in artifacts/decision.json. The controller supplies runtime identity; evidence/prerequisites come separately from a trusted domain observer. Neither role can impersonate human approval or promote fixture output. This internal API is tested with actual synthetic client processes, while public complete-route wiring and live client acceptance remain open. See [ADR-0116](../decisions/0116-owned-native-decision-purpose-attempts.md).

## Authentication and private data

Native clients use a fresh home/configuration environment without inherited controller tokens or runtime injection options. A real observed host may explicitly reference the client's own credential store outside repositories, the worker's roots and controller state. It never copies credentials into generated files, argv or model context, and the untrusted application environment receives none. Fixture runtime observations cannot enable this reference.

Actual credential denial remains a native/backend acceptance obligation. A prompt, worktree, mode flag, successful login or schema assertion does not prove that denial. Native account/model trials are kept separate from deterministic source checks and service integration certification.

## Read the outcome correctly

Before private input is sent over stdin, the host registers the actual process tuple in the queue. It bounds output and duration and rechecks current authority/fencing while running. It validates unchanged context and Git control bytes before later controller Git reads. A read-only workspace mutation, changed metadata, wrong response identity or unobserved output artifact fails the attempt.

Claimed artifacts must match actual owned output bytes and fit the existing [persistent artifact budget](./delivery-budgets.md). Captured canonical references and their charges survive retries; quota refusal never turns into missing evidence accepted as success. Raw owned runtime files are separate retained diagnostic resources, subject to subsequent backend lifecycle/retention controls.

A native-run receipt retains process exit/signal when observed, typed failure, output digests, candidate snapshot, worker claim and canonical artifact references. Complete transport plus a complete worker claim can settle scheduler work; it establishes no actual QA, human testing, delegated acceptance, PR readiness or merge eligibility. Blocked/failed claims cannot complete their unit. Permission/model/MCP/authentication failures, cancellation and output limits never switch models or broaden permissions.

Hard native token/currency caps remain unsupported. Usage without a trustworthy observation stays unknown rather than zero. See [ADR-0101](../decisions/0101-dedicated-native-delivery-hosts-and-runtime-proof.md), [runtime acceptance](../v1-acceptance.md) and the [durable runner specification](../../roadmap/specifications/autonomous-delivery/02-durable-runner.md).

<!-- docnav -->
[◀ Delivery workers](delivery-workers.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Environment planning ▶](delivery-environments.md)
