# Delegate a decision without impersonating a human

> **TL;DR** — An original private grant can delegate a named decision under a pinned purpose-specific rubric. A trusted host records the exact evidence, a machine judgment and independent challenge. None-policy limitations block without a human prompt; fixture judgments grant no actual execution authority.

> [!NOTE]
> **Status: ✅ implemented.** P6-34 policy, private rubric pins, decision records, current-plan readers and no-prompt fallbacks pass complete macOS/Linux checks. Full native delivery/research orchestration remains P6-10/P6-33. Policy preflight and synthetic host controls are not native-model certification. See [ADR-0112](../decisions/0112-private-delegation-and-independent-machine-decisions.md).

## Independent choices

Choose the endpoint, intervention policy, named decision delegations and observed runtime independently. A research-report endpoint grants no code edits; to-pr grants no merge; none grants no extra effect. Interaction profiles affect communication/concurrency and cannot select these permissions.

| Decision ID | Supported outcomes |
| --- | --- |
| delivery-plan, research-plan, research-sources | accept, reject |
| frame-outcome | go, on-hold, dropped |
| approve-spec, approve-scopes, approve-build-plan, acceptance | accept, reject |
| learning-outcome | keep, iterate, kill, unflag |
| ramp-assessment | propose, on-hold |

Learning and ramp outcomes are assessments. They do not change flags, deploy, send messages or grant a separate external effect. Acceptance records do not satisfy human-only criteria, required code-host human review or failed gates.

## Inspect the actual contracts

From this source checkout, with development Node ≥ 22:

```bash
set -euo pipefail
npm run build
node dist/wl.mjs delivery decision-schema --json
```

This opens no store and starts no model. The closed rubric defines its decision, purpose, named rules, permitted outcomes, owned unknown IDs, explicit defaults and finite timeout. The existing plan/envelope delegation binds its ref/sha256, required evidence IDs and fallback policy. The operator's original grant must explicitly include that decision ID too.

Keep rubric/request files in the external controller workspace. Source documents, profiles and worker artifacts cannot authorize themselves. Create the plan/envelope and original private grant through [planning](./delivery-plan.md) and [authorization](./delivery-authorization.md), selecting the intended delegations before authorization. No CLI command imports a machine judgment.

With actual selected identifiers, the control commands are:

```text
wl delivery decision-pin --grant <authorization-id> --store <external-store> --json
wl delivery decision-preflight --run <delivery-id> --revision <n> --grant <authorization-id> --store <external-store> --json
wl delivery decision-inspect --digest <decision-sha256> --store <external-store> --json
```

Pinning copies exact bounded rubric bytes into immutable controller inputs. Preflight opens no model: scope policy-only and runtime not-observed explicitly separate declared policy from actual host readiness. Ready means the inspected policy has no listed structural blocker; it supplies no runtime capability. For none, undelegated route decisions and mandatory human acceptance are blocked with interactive disabled. Non-ready preflight/inspection exits 3; inspect still returns the retained record.

The runner attaches judgments to their actual stages. Initial unattended research definition requires research-plan; research-sources judges the subsequent source work. An implementation definition retains frame-outcome/go, approve-spec and approve-scopes. An envelope additionally requires its current delivery-plan judgment at the plan stage. These requirements select existing delegated authority; they do not add permissions, replace independent private judgments or record a human approval.

## Run the complete model-free control

From the source checkout, with Git installed and no service account:

```bash
set -euo pipefail
npm run eval:decisions
```

The runner creates a disposable Git repository and external store, authorizes an initial envelope, pins its rubric, observes independent synthetic planner/challenger results and stores a visibly fixture-only record. It verifies stable-key reuse without another judgment, changed hostile input invalidation, unchanged authority and retained provenance after revocation. The printed retained directory contains runner.mjs and results/report.json. No model, hosted publication or application process executes.

A passed control means these deterministic protocol/record boundaries were exercised. It does not mean a native agent completed a feature unattended. The separately selected actual native hosts must observe containment, noninteractive tools, completion, independent assignments and original budgets before their results are eligible.

## Trusted host lifecycle

DelegatedDecisions.decide is a controller API, not a worker result-import endpoint. Its host observes prerequisites and evidence, runs a planner and then a distinct challenger, and verifies current completed identities. It receives only selected bounded source/plan/authorization and artifact/evidence context. The core binds both judgments to one exact basis and preserves their uncertainties. Missing native capability or mandatory human prerequisites are explicit refusals; the complete runner turns those into its terminal limitation.

Original deadlines and artifact budgets apply. Unsupported hard token/currency metering refuses admission. Interrupted locator writes can recover an already published exact immutable decision without calling either host again. An unpublished/orphan result supplies no completion. A cancelled/crashed/late host leaves an unknown stable-key intent; it cannot become a successful refutation or be invoked again implicitly. Cancellation is a request to the trusted host, not proof of stopped processes. Use a new explicit attempt/key only after the controller resolves its original process/resource boundary.

## Unknowns and current eligibility

A numeric baseline remains unknown. None-policy can investigate within its finite remaining budget, use an explicitly pinned default while retaining the unknown fact, request independent least-scope evaluation, complete with owned unknowns or choose an authorized on-hold outcome. Missing required facts or non-delegable prerequisites block. These instructions never ask a person or create a hidden approval wait.

The original source, plan/envelope, rubric, artifacts, evidence, grant and named Git bases remain current inputs. Starting a replacement judgment immediately fences the old acceptance, even if the replacement crashes. Late older judgments cannot overwrite the newer intent. Changes/revocation/expiry invalidate eligibility while history stays readable. Machine records always say actorKind machine and humanApproval not-recorded; legacy supervised decisions retain their original human semantics.

<!-- docnav -->
[◀ Delivery authorization](delivery-authorization.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Delivery runner controls ▶](delivery-runner.md)
