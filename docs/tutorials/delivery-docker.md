# Run owned Docker application environments

> **TL;DR** — The Docker backend executes an explicitly selected recipe under a current delivery grant, verifies actual resources and retains failure evidence. A separate model-free evaluation exercises real applications and boundary denials; no native client or service account is needed.

> [!IMPORTANT]
> **Experimental.** Provisioning, readiness, isolated networking, loopback publication, stop and retirement are tested, and the reference trial passed on macOS arm64 with a Linux daemon and on a Linux x86_64 host. Autonomous delivery may change in a minor release.

Commands that start with `npm run eval` are model-free controls that run from a source checkout ([development guide](../contributing/development.md#build-from-source)); every `wl` command uses the installed CLI.

## Requirements and costs

Use a source checkout with development dependencies installed to run the evaluation. The bundled CLI supports the runtime commands separately. Docker must be available through a local Unix socket with permission to create disposable containers, local volumes and bridge networks. The reference daemon is Docker 29.9.2; required platform-manifest inspection and isolation controls must be observed on your engine. A version string alone is insufficient.

The trusted Node helper is pinned to node@sha256:925de64a85319052d6971ae81ef2417da956e8a3a2c4a0fac732327970f017f5. Prepare that exact image in the native Docker cache explicitly. The backend does not silently download it. Application images are also immutable; cache-only and explicitly authorized acquisition are separate choices. Docker uses its own credential store, and credentials never enter generated config, argv or application environment.

The two-environment evaluation requests four aggregate CPUs and one GiB across its retained environment reservations. Each environment includes fixed helper/proxy overhead: helpers use 256 MiB and a quarter CPU, and each published port adds a 128 MiB, quarter-CPU proxy. Smaller capacity returns an explicit refusal. Application images must support UID/GID 65532 and the selected commands; setup dependencies must already be available for offline operation. Scoped egress, secret delivery, legacy direct input-file mounts and unavailable image/engine controls refuse execution.

## Run the actual disposable evaluation

From the repository root:

```bash
set -euo pipefail
npm run eval:environments -- --retire-success
```

The command prints an external retained evaluation directory and a versioned report. It creates its own disposable Git source/worktree, private fixture grants, recipes and Docker resources. It never uses the person's checkout as an application mount or contacts a native model. Fixture owner/grant records are evaluation data, not human acceptance of a product change.

Expected successful observations:

- Two applications receive distinct actual loopback ports and owned data volumes; a write in one does not appear in the other.
- Application commands cannot read the benign controller/home/credential/sibling marker fixtures, Git control or Docker socket, modify read-only implementation/input files, or inherit the controller's marker environment variable.
- Setup and application execution observe denied external routes. Setup that exits 7 never becomes ready or starts its service.
- Repeating a successful key reinspects the same environment without reissuing the effect. A changed candidate makes its previous readiness stale.
- The explicit successful-evaluation teardown observes stop with retained volumes, refuses a same-name foreign volume and recovers a deliberately killed retirement controller through a fresh compiled CLI. It verifies every exact identity and observes absence. This includes expected failure cases after their assertions pass. An unexpected failure keeps resources and their external history for inspection.

Omit --retire-success to retain successful fixture environments deliberately. The retained report is the actual observation; do not mark a missing/unavailable Docker run as passed. It identifies the controller runtime and daemon separately and launches no model. Running the suite on another host creates new evidence for that host, not certification of all platforms or clients.

## Inspect contracts without Docker

Use the `wl` CLI, as in the [planning guide](./delivery-environments.md).

```bash
set -euo pipefail
wl --version
wl delivery environment-runtime-schema --json | node --input-type=module -e '
import assert from "node:assert/strict"
let text = ""
for await (const chunk of process.stdin) text += chunk
const value = JSON.parse(text)
assert.equal(value.schema, "wholeloop/environment-runtime-schema@1")
assert.equal(value.executed, false)
assert.equal(value.runtimeSchema.additionalProperties, false)
assert.equal(value.provisionSchema.additionalProperties, false)
assert.equal(value.snapshotSchema.additionalProperties, false)
assert.equal(value.runtimeSchema.properties.acceptance.const, "not-established")
assert.equal(value.runtimeSchema.properties.publication.const, "not-performed")
assert.match(value.referenceHelper, /@sha256:[a-f0-9]{64}$/)
console.log("PASS: closed owned-runtime contracts; no execution, acceptance or publication")
'
```

## Provision an existing authorized run

These are command forms, not a substitute for preparing their inputs:

| Command | Meaning |
| --- | --- |
| delivery environment-backend --digest RECIPE --store STORE --json | Read local daemon capacity and exact cached image/platform descriptors; start nothing |
| delivery environment-start --file REQUEST --root INPUT_ROOT --store STORE --json | Execute the exact closed provision request under the current private delivery grant |
| delivery environment-status --environment ID --store STORE --json | Reinspect exact owned resources, selected inputs and candidate bytes; grant nothing |

The request schema contains run, recipe digest, stable key, trusted helper image and exact repository/path/HEAD/snapshot candidate bindings. Prepare the plan, grant and queue state through the [delivery guides](./delivery-authorization.md). Native/envelope delegation still requires independently accepted planning evidence through the controller; importing raw worker JSON cannot supply it. The complete terminal runner is a later increment.

Start requires workspace.create and test.run, the current plan/grant digest and an allowed separately allocated topic worktree for every selected repository. The helper receives only bounded copied regular files and its owned volumes. It never mounts the source root or runtime store. The backend rechecks authority around mutations, retains the issued effect and cannot invoke the same key again after an ambiguous response.

An input mount is a read-only directory: /inputs/ID/basename contains the exact selected file. Recipe-v1's older direct-file planning form remains readable, but this backend reports that direct mount capability unavailable; it never rewrites the stored command silently. Recipe inspection and actual environment status remain different observations.

## Read outcomes and failures

| Result | Interpretation |
| --- | --- |
| ready | Actual owned resources and readiness were observed for this exact candidate/recipe; semantic acceptance is not established |
| unavailable | Required backend/capacity/image/network/secret capability is absent; no fallback is selected |
| failed | Observed setup/execution failed; partial resources and evidence remain retained |
| unknown | An action, identity or observation is unresolved; inspect/reconcile it before attempting another write |
| stale or expired status | The old environment cannot establish current readiness for the changed candidate or elapsed lifetime |

Runtime history records immutable resource intents, IDs/labels/creation fingerprints, actual image/index and platform-manifest bindings, process outcomes, copy hashes and observations outside Git. Raw image configuration and diagnostics do not enter receipts. Docker client cancellation alone proves no daemon-side shutdown; bounded jobs stop and reinspect their exact container. Existing env declare/report undo recipes remain unexecuted.

Application networking stays on no network or an isolated internal bridge. A separate fixed controller proxy exposes only the intended owned service through loopback; it has no application mounts and cannot select a destination from incoming bytes. Each connection is limited to four MiB, thirty seconds and eight concurrent connections, and its lifetime is finite. This is application infrastructure, not a native model permission proof.

Keep the printed external history when reporting failures. Do not remove guessed names or run ledger undo commands automatically. Use the [lifecycle guide](./delivery-lifecycle.md) for public stop, reconciliation and explicit retirement. These commands fence provisioning, preserve failure data by default and recover only through exact ownership/absence observations. See [ADR-0103](../decisions/0103-owned-docker-environments-and-isolated-publication.md), the [environment specification](../../roadmap/specifications/autonomous-delivery/03-execution-environments.md) and [V1 acceptance](../v1-acceptance.md) for remaining host/native obligations.

## Preserve the provisioning parent's original bounds

The backend captures the complete original request before validation and preflight. A caller changing its request during a backend observation cannot replace the resource key, run, recipe, helper or selected workspaces used for later admission. The parent-control evaluation also checks this with an actual Docker observation; see [ADR-0170](../decisions/0170-original-provisioning-request-capture.md).

The internal provisioning API can capture an enclosing controller's original deadline, cancellation signal and live ownership predicate. It refuses late or fenced preflight results before effect/resource admission, bounds each backend call and the setup deadline, and rechecks before returning a result. Replacing the caller's signal or predicate does not replace the original controller. Existing native registration and process callbacks remain attached to their actual calls; cancellation stops that live invoker rather than signalling a stored PID.

Run npm run eval:environments -- --parent-control --retire-success to add original-parent controls to both actual application environments. The mode retains every ordinary isolation, setup-failure, reinspection, collision and crash-recovery check, adds cancelled/fenced/late-preflight refusals without effects and verifies that both setup deadlines stay within their original parent windows. Service lifetime remains independently bounded so later authorized QA can still use a prepared environment. The ordinary command and public schemas remain unchanged.

This is a prerequisite for complete runner environment composition. It supplies neither root producer ownership nor semantic acceptance; those remain separate checks. An expired parent cannot be renewed by repeating a provision call. Use ordinary historical inspection and explicit lifecycle commands for retained resources. See [ADR-0169](../decisions/0169-original-parent-controls-for-provisioning.md).

## Inspect original runner preparation owners

The internal runner environment scope can prepare a selected environment in its own original phase. It captures request and candidate identity before actual preflight, retains every preflight read and registered mutation owner, and preserves the original parent window. Failed preflight remains inspectable even before any environment resource exists. It refuses an already existing environment, checks the fresh resource token again at actual admission after preflight and refuses a second preparation through a consumed phase. The parent-control Docker mode also requires fresh admission for its two original successful environments; ordinary standalone reinspection remains unchanged.

Run npm run eval:runner-assembly-readiness -- --provision-owner --retire-success for the disposable fixed-dispatch composition: original unit QA, owned assembly, original product preparation, product QA, independent synthetic acceptance and local handoff. It retains the existing adversarial recovery and exact retirement controls. Models remain synthetic; this is an internal integration evaluation, not the public complete-route command or independent Linux application-host acceptance. See [ADR-0171](../decisions/0171-original-runner-provisioning-owners.md).

## Recover the original prepared input

The internal environment producer records the original applied ready revision as a budgeted artifact only after reopening its successful native mutation outcomes, finished reads and preflight. Its consumed result and private artifact locator allow a fresh controller to recover the same input without another provision call. Missing locators, consumption, artifact bytes or native outcomes return unknown; exact restoration recovers the original proof without changing the journal.

Run npm run eval:runner-assembly-readiness -- --producer-result --retire-success to exercise these controls inside the existing fixed-dispatch composition. It retains every original QA, acceptance, handoff and recovery assertion. A recorded-ready result remains historical-only after subsequent QA and exact retirement; current environment readiness, execution authority and semantic acceptance need their own observations. See [ADR-0172](../decisions/0172-recorded-original-environment-inputs.md).

## Select product preparation inside dispatch

The internal dispatcher can use a fixed product-environment selector with copied candidate/assembly/helper inputs per milestone and the integration adapter's exact assembly reader. It validates current complete unit QA, the owned assembly, the pinned candidate and supported machine coverage before consuming an original selection and provisioning its single complete recipe. It then executes root QA through the existing adapter without a caller-supplied environment. Caller overrides and changed original selections refuse. Existing explicit-selection callers keep their current behavior.

Run npm run eval:runner-assembly-readiness -- --product-environment --retire-success for the composed control. It retains every producer-result assertion and also checks paused product selection recovery with no configured selector or backend, lost binding/consumption refusal and identical restoration. This configuration requires prepared candidate/assembly inputs. See [ADR-0173](../decisions/0173-fixed-product-environment-selection.md).

## Produce the milestone assembly inside dispatch

A milestone can instead configure a helper image, a prepared template recipe, its static acceptance, data and gate-policy inputs, and repair owners. Dispatch then reads current unit QA, consumes an original production binding, assembles the exact vector through owned Git effects under the stage's original deadline and registration, re-roots the template at the assembled worktree and prepares the candidate before the selection above. Malformed coverage or inputs refuse before the first Git effect, a retained binding never assembles again, and stop can cancel in-flight assembly from the original locator after revocation.

Run npm run eval:runner-assembly-readiness -- --product-production --retire-success for the composed control. It adds the dispatcher's own assembly, single registration and re-rooted recipe to every product-environment assertion. See [ADR-0175](../decisions/0175-original-milestone-product-production.md).

<!-- docnav -->
[◀ Environment planning](delivery-environments.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Environment stop and retirement ▶](delivery-lifecycle.md)
