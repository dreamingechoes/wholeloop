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

## Repeat actual model-free Codex permission controls

Run npm run eval:native-boundary with Codex 0.163.0 installed. This opt-in command uses an empty client home/credential reference, public controller-selected witnesses and an owned disposable Git worktree. It checks planner, builder and verifier with both file and inline-proposal output modes (six controls), including read/write restrictions, denied private/credential references, denied network access, recognized disabled feature flags and actual owned process cancellation. It preserves an external report and verifies unchanged project snapshots. It never invokes a model or queries an account; policy-only observations remain authenticated=false.

The internal CodexBoundaryHost can separately observe local client authentication through its explicit existing credential-store reference. Only status/hashes/ownership enter its private proof, and fixture authentication remains fixture-only. Async observation is finite under the original attempt; unknown or cancelled probes preserve their consumed reservations. Missing bindings cannot authorize replay. See [ADR-0120](../decisions/0120-observed-native-boundaries-and-asynchronous-admission.md).

The actual macOS controls cover the reference version's three selected roles and both output modes. Linux fixture/minimum-runtime checks do not establish actual Linux client containment. Accounts, model availability and complete native application execution remain separate acceptance work. Fixed native/semantic host composition and public complete-route commands remain P6-10 technical implementation work; these controls do not close that task.

## Artifact transport for controller authors

The existing files mode remains the default. A fixed controller can explicitly select output: inline-proposal when calling NativeDeliveryHost.run. That versioned worker proposal returns artifact text through the owned structured stdout channel; a read-only worker can produce a new report without a Write tool or a writable output directory. Workers may continue citing their original pinned input evidence.

The proposal echoes the supplied assignment digest. The core binds the original identity, computes actual UTF-8 hashes/sizes and validates the canonical worker claim with the same role/evidence/context rules as file mode. The complete proposal is capped at one MiB, with at most one hundred artifacts and 256 KiB of combined inline text under the original budget. Empty files, literal whitespace and Unicode stay exact. Invalid encoding, NUL, unsafe/duplicate/input references, forged metadata, stale echoes and recognizable credentials fail before capture. Native process output limits and current-grant checks remain mandatory.

The normalized result and captured references remain worker claims. A complete proposal supplies neither an observed test result nor a human/machine approval. There is no protocol fallback: an old file result sent to the inline decoder, or a proposal sent to file mode, is invalid. Public v1 schema/receipt commands retain their existing declarations; this is an explicitly selected controller API transport, with full terminal routing still in progress. See [ADR-0115](../decisions/0115-bounded-inline-worker-artifact-proposals.md).

## Controller planning and decision workers

The internal NativePurposeAttempts host now runs planner/challenger roles independently of implementation units, including revision-zero original envelopes. It shares the native assignment transport with NativeDeliveryHost; existing queue behavior and default file mode remain intact. Purpose calls explicitly use the bounded inline proposal protocol, their original private named delegation, evaluator capacity and run deadline.

Each purpose is claimed and consumed once before launch. An interrupted observer, unknown owner or missing semantic response retains the original reservation; calling again does not recover permission to launch. A known completed report remains current only while original authority, repository bases, selected input bytes, private receipt and captured output bytes agree. Existing private cancellation/process ownership still governs any actual native call.

NativeDelegatedDecisionHost obtains two independent actual process receipts and validates purpose-specific JSON claims in artifacts/decision.json. The controller supplies runtime identity; evidence/prerequisites come separately from a trusted domain observer. Neither role can impersonate human approval or promote fixture output. This internal API is tested with actual synthetic client processes, while public complete-route wiring and live client acceptance remain open. See [ADR-0116](../decisions/0116-owned-native-decision-purpose-attempts.md).

## Worker stages and original-result recovery

The internal RunnerWorkerStages controller connects implementation and unit-research work to an exact original queue entry and private native assignment. Its trusted host supplies selected context and a boundary factory that uses the same registered native process runner. It does not accept a public executable host or worker-authored runtime proof. Targeted queue admission retains global reservations while leaving unrelated pending work untouched.

The private root intent precedes claim; the original native assignment and random output directory are consumed before any probe or model input. A failed observer, missing reply or lost private binding cannot start that claim again. An observed admission refusal records that no process started. Existing retry fencing and original budgets remain mandatory.

A fresh controller reads only the journal-selected immutable receipt and validates original runtime/provenance, selected and copied inputs, captured artifacts, current candidate and actual process closure. It can recover while paused without resuming. Stop uses original private nonce channels, including after revocation. A successful worker stage establishes production of a candidate or research claim; behavioral QA, review and acceptance still follow separately.

This composition is covered with actual synthetic native processes and fixture semantics. It does not certify authenticated client/model behavior or close P6-10: fixed complete-route configuration, semantic hosts, endpoint and public run/reconcile wiring remain in progress. See [ADR-0121](../decisions/0121-owned-worker-stage-bindings-and-recovery.md).

## Delegated stage decisions

RunnerDecisionStages connects exact named route requirements to the existing private delegated-decision store. The trusted controller supplies original-plan artifact/evidence references and the native decision host; a worker or result-file option cannot provide authority. Requests are bound before invocation, checked for complete scope and refused if their metadata is oversized or credential-bearing. A separate consumed-invocation marker fences a lost descriptor, including before the first native group starts; it supplies no approval.

Production workers, planner/challenger and their boundary controls now share RunnerNativeStage for actual registration, process scopes and deadline narrowing. An uncooperative judgment cannot extend the original root deadline. Repeating a lost call retains its original unknown request instead of launching new decision workers. Stages with no named decision requirement do not invoke a model or invent an approval.

Paused inspection uses the exact original private key and published receipt. If the final key locator was lost, a published head is usable only for that same complete request. A newer unrelated judgment does not repair the old one. Decision heads keep their existing run/plan/decision scope: reuse an exact current global request where appropriate; do not silently substitute a unit judgment for a global approval.

This API returns decision evidence, with fixture/stale/rejected/incomplete records still blocked or unknown. It does not produce missing definition/build/acceptance artifacts, perform behavioral QA or establish a delivery endpoint. Those domain hosts and public complete-route execution remain in progress. See [ADR-0122](../decisions/0122-owned-stage-decisions-without-semantic-promotion.md).

## Owned code review and refutation

The internal RunnerNativeGateHost binds each inspection/refutation to its original queue claim, pinned gate unit or recorded finding, current committed bytes/index/HEAD and original stage deadline. It uses the same registered process runner and bounded inline report transport as production. A read-only model cannot execute a suite or add a process-execution claim. Fixture-only observations remain unavailable to the legacy gate instead of becoming a passing review.

The controller selects hash-pinned context after claim, binds any private audience to that actual attempt and validates the complete input pack before copying. The selected review patch/rubric must match the private round and accepted guidance. Each result is parsed only from the original journal-selected native receipt and actual captured report. Missing/corrupt descriptors and unknown owners stay held; retries do not silently buy another worker.

RunnerReviewStages joins the existing round engine to the root stage with original machine-review subjects and budgets. Fresh read-only inspection validates the submitted results/votes, unchanged candidate and closed native scopes, then applies the existing strict-majority/fail-safe rules. It can seal an original lost final journal write while paused without running another model, suite, repair or round. Stop uses original private nonce channels even after revocation. Machine review never fabricates an owner approval or closes an existing product item.

Complete-round model-free controls run separately from ordinary file-worker test budgets, with finite original allowances. Their actual synthetic processes and normalized host observations are controller tests, not live client/account or complete-route certification. Behavioral QA, local repair/integration/acceptance composition and public complete-route execution remain in progress. See [ADR-0123](../decisions/0123-owned-native-review-rounds-and-recovery.md).

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
