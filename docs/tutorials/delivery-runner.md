# Prepare and control an owned delivery route

> **TL;DR** — Prepare one durable controller request, inspect the full ordered route and exercise pause/resume/stop without launching a model. The internal engine now has an owned foreground transport; a complete terminal-driven implementation route is still being connected in P6-10.

> [!NOTE]
> **Status: 🚧 partial.** Schema, prepare, status and operator controls are available. Internal ownership, finite stage execution, checkpoint recovery and private native cancellation have automated coverage. The private foreground bootstrap is group/core/nonce-bound and consumed once. No public complete-route run/reconcile command or live native acceptance is claimed by this increment.

## Before you start

Complete the [planning](./delivery-plan.md), [authorization](./delivery-authorization.md) and [queue](./delivery-queue.md) tutorials in the same Bash terminal. Keep WHOLELOOP_CLI and workspace_dir set. The queue tutorial creates a new active fictional grant after the authorization tutorial revokes its first one. All application Git changes and runtime state belong to that disposable example; no account, model or remote effect is needed.

## Prepare and inspect without execution

```bash
set -euo pipefail
: "${workspace_dir:?Run the planning, authorization and queue tutorials first}"
node "$WHOLELOOP_CLI" delivery runner-schema --json > "$workspace_dir/runner-schema.json"
node --input-type=module - "$workspace_dir" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const json = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
const prepared = json('plan-receipt.json')
const grant = json('queue-grant.json')
const request = {
  schema: 'wholeloop/delivery-runner-request@1',
  key: 'tutorial-controller',
  run: prepared.plan.run,
  revision: prepared.plan.revision,
  plan: prepared.digest,
  grant: grant.grant.id,
  host: { id: 'fixture', version: '1', configuration: 'a'.repeat(64) },
  pollMs: 250
}
writeFileSync(join(directory, 'runner-request.json'), JSON.stringify(request, null, 2))
if (json('runner-schema.json').completeRouteAvailable !== false)
  throw new Error('This increment must disclose its complete-route limitation')
JS
node "$WHOLELOOP_CLI" delivery runner-prepare \
  --file "$workspace_dir/runner-request.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/runner-prepared.json"
runner_digest="$(node -e 'console.log(require(process.argv[1]).digest)' "$workspace_dir/runner-prepared.json")"
node "$WHOLELOOP_CLI" delivery runner-prepare \
  --file "$workspace_dir/runner-request.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/runner-repeated.json"
node "$WHOLELOOP_CLI" delivery runner-status \
  --digest "$runner_digest" --store "$workspace_dir/state" --json
node --input-type=module - "$workspace_dir" <<'JS'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const directory = process.argv[2]
const json = name => JSON.parse(readFileSync(join(directory, name), 'utf8'))
const first = json('runner-prepared.json')
if (JSON.stringify(first) !== JSON.stringify(json('runner-repeated.json')))
  throw new Error('Preparation must retain the same exact request')
if (first.ownership !== 'unclaimed' || first.stages.length || first.outcome !== null)
  throw new Error('Preparation cannot establish execution or an endpoint')
if (!first.route.some(stage => stage.kind === 'integration'))
  throw new Error('The implementation route must include whole-milestone validation')
console.log('PASS: idempotent private preparation, complete route and no execution')
JS
```

The host descriptor binds later controller selection; it neither loads a plugin nor launches a command. There is no result-file import that can turn worker JSON into trusted observations. Changing a request under the same key refuses. A revoked/expired grant or changed named Git base prevents admission. Source instructions and profile settings create no authority.

## Exercise explicit controls

```bash
node "$WHOLELOOP_CLI" delivery pause --digest "$runner_digest" \
  --operator 'Fixture Operator' --store "$workspace_dir/state" --json
node "$WHOLELOOP_CLI" delivery resume --digest "$runner_digest" \
  --operator 'Fixture Operator' --store "$workspace_dir/state" --json
node "$WHOLELOOP_CLI" delivery stop --digest "$runner_digest" \
  --operator 'Fixture Operator' --store "$workspace_dir/state" --json \
  > "$workspace_dir/runner-stop.json"
node --input-type=module - "$workspace_dir/runner-stop.json" <<'JS'
import { readFileSync } from 'node:fs'
const stopped = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (stopped.state !== 'stopping' || stopped.stages.length || stopped.outcome !== null)
  throw new Error('A stop request cannot assert actual process termination')
console.log('PASS: same-run controls preserve evidence and report cancellation honestly')
JS
```

Pause fences future dispatch. Resume retains the same run, original grant, deadline and historical stage attempts; it refuses unresolved owner/process/effect reservations or stale current checkpoints. Stop requests cancellation and reports stopping until exact owned closure is observed. These controls never delete worktrees, signal a stored PID, renew a budget or claim that a remote effect was undone. The current public controls do not themselves start an execution/reconciliation host.

## Internal controller and recovery boundary

The internal controller journals each invocation before native input and advances one exact stage at a time. It pins acceptance definitions before builders, commits owned topic candidates before HEAD-bound QA, preserves dependency order and requires all mandatory verification/review/integration/acceptance/publication stages. Current independent private judgments remain necessary for delegated decisions. A human-only prerequisite ends a none-policy run without a question; supervised entrypoints retain their existing behavior.

An initial none-policy research definition uses its research-plan delegation, with research-sources retained for the later research stage. Implementation definition keeps its separate framing/spec/scope decisions, and envelope-derived plan acceptance remains independently required. An accepted research policy cannot acquire code or product-approval permissions through stage selection.

The native wrapper retains private nonce-bound registration and outcome metadata after parent loss, drains broken pipes and permits only its own live wrapper to signal its group. A fresh observer checks registration, the exact outcome and actual group absence. Known closure with missing semantic output is not success. Unknown invocations stay reserved. A passed immutable result can recover a missing checkpoint or authorized derived-plan locator without repeating its host call; an unpublished result cannot be invented.

Fixture routes and synthetic native processes test those mechanics. They establish neither real model containment nor actual application QA, PR creation or merge eligibility. Fixed domain-host wiring, owned foreground entrypoint and endpoint/reconciliation commands remain implementation work under [P6-10](../../roadmap/phase-6-autonomous-delivery.md#p6-10--local-delivery-runner-and-controls); manual acceptance is not blocking that work. [ADR-0113](../decisions/0113-owned-foreground-routes-and-native-recovery.md) records the boundary.

## Repeat the model-free foreground control

Run npm run eval:runner from the source checkout. It builds a temporary standalone control, starts actual owned Node controller groups against disposable Git/store fixtures and retains an external report. Supervised execution returns paused when native admission is unavailable; none returns blocked without a question. A second supervised generation preserves the same run deadline. A separate control executes independent synthetic planner/challenger processes and preserves fixture-only decision authority and original budget reservations. This is an opt-in process/control evaluation with no model, application execution, account or hosted effect.

The original parent/core record publishes before its journaled claim becomes visible. The private foreground bootstrap additionally binds the installed core's exact bytes and verifies actual membership in the registered wrapper group before one-shot consumption. A fresh recovery can fence/cancel the original group and distinguish a positively absent parent before native intent from an uncertain partial launch. See [ADR-0114](../decisions/0114-private-group-bound-foreground-bootstrap.md). Public complete-route domain-host wiring and run/reconcile commands remain open; the evaluation cannot substitute for that implementation.

## Owned topics before implementation

The internal DeliveryWorkspaces host can prepare an external Git topic for a code unit without a legacy slice/part/review item. It pins the complete committed code-predecessor vector, merges only same-repository predecessors and respects the original narrowed branch prefix. A separate repository stays separate; research outputs belong in selected worker context rather than a Git merge. This preparation asserts no gate, research completion or human approval.

Every actual create/merge uses the existing original-grant effect journal and finite registered Git owner. Unknown outcomes retain the original operation, while occupied paths, unsafe helpers, changed predecessors and revoked authority refuse later mutation. Read-only reconcile can recover an exact retained native result without repeating checkout or resuming the run. Personal checkouts and existing worker worktrees remain intact. A dirty owned candidate may change its byte snapshot while retaining the original topic head; readiness is not QA.

The source evaluation now includes an actual disposable subjectless workspace/control. This is an internal controller API, not a new public workspace/run command. Candidate commit is implemented in the next section; full domain-host/public endpoint wiring remains technical P6-10 work. See [ADR-0117](../decisions/0117-owned-delivery-topic-workspaces.md).

## Pin a candidate before HEAD-bound QA

The internal DeliveryCommits host stages and commits an owned topic through two original-grant Git effects. The controller pins the actual candidate files independently of the gate snapshot, validates the supplied commit message and verifies the exact staged bytes, original parent, closed native invocation and resulting HEAD. The personal checkout stays untouched. Empty, deleted, binary and Unicode files remain exact; raw Git path bytes are checked before decoding.

A transformed index or unknown outcome is retained without issuing another staging/commit command. This reference path refuses raw byte transformations from line-ending/encoding rules and external Git helpers. It does not rewrite project configuration. Project contents are hashed rather than copied to controller state or scanned as prose: source/type references are not credentials. Existing metadata/artifact/message guards remain active.

Current private committed-head receipts allow later repairs while fencing old receipts through the original effect journal. A lost head locator can be reconstructed from its exact actual effect evidence without another Git invocation, including through a fresh paused controller. Read-only reconcile does not resume the run. A known commit remains separate from the current working-byte snapshot and establishes no actual QA, acceptance, human approval or PR readiness.

Run npm run eval:runner for the additional disposable actual Git commit/control. These remain internal controller APIs; fixed full-route and public run/reconcile/endpoint wiring are still P6-10 technical work. See [ADR-0118](../decisions/0118-owned-candidate-commits-and-current-heads.md).

## Join Git operations to their runner stages

The internal RunnerGitStages handler now binds an exact root request/plan/unit/stage/invocation to its private workspace or candidate record before native input. It derives topics, reviewed committed predecessors and the candidate message in the controller. The actual Git wrapper registers before input, inherits the narrower stage deadline and observes both cancellation signals. A waiting-external original effect remains live; it cannot admit another stage. Pause, stop and revoked authority still fence execution.

A fresh handler observes the same resource without another Git invocation, including a known closed workspace while paused. Missing/corrupt bindings stay unknown. Fresh stop requests address only the original private operation marker, even after revocation. Actual applied/closed Git effects establish no application QA, delegated acceptance or endpoint authority. [ADR-0119](../decisions/0119-runner-owned-git-stage-bindings.md) records the distinction.

The model-free runner evaluation additionally drives two actual Git topics and their committed predecessor through the engine. All other semantic stages remain explicitly simulated; the resulting route stays paused without a certified endpoint. Fixed native model admission, full semantic host composition and public run/reconcile commands remain implementation work.

## Verification of this increment

Complete checks pass 3018 tests in 143 files on macOS arm64 and isolated Debian Linux arm64 with Node 24.22.0. The exact tutorial and inert schema comparison also pass with Linux Node 20.0.0/Git 2.39.5; ShellCheck passes. Actual synthetic process tests exercise parent loss, broken-pipe draining, exact exit codes, private cancellation and preservation of an unrelated process. Twelve dedicated foreground/bootstrap cases also cover atomic claim publication, group/core/nonce binding, one-shot consumption and pre-start parent loss. The standalone evaluation includes three actual foreground controls, separate research-decision and inline-artifact assertions an independent synthetic native decision pair and a separate actual owned-topic Git control on macOS Node 24 and Linux Node 20.0.0, preserving the original run deadline. These observations cover the implemented control/recovery and foreground transport increments, while the complete-route implementation and live client acceptance remain open.

<!-- docnav -->
[◀ Delegated machine decisions](delivery-decisions.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Delivery recovery ▶](delivery-recovery.md)
