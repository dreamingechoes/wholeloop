# Prepare and control an owned delivery route

> **TL;DR** — Prepare one durable controller request, inspect the full ordered route, run and reconcile it from the terminal and exercise pause/resume/stop without launching a model. Native stages need explicitly bound clients and trusted runtime proof.

> [!NOTE]
> **Status: 🚧 partial.** Schema, prepare, status, operator controls and the public run/reconcile commands are available, with automated synthetic/reference-transport coverage. Native adapters join the public host only with trusted runtime proof; no live native or hosted acceptance is claimed.

Commands that start with `npm run eval` are model-free controls that run from a source checkout ([development guide](../contributing/development.md#build-from-source)); every `wl` command uses the installed CLI.

The [source-installable boundary table](../reference/delivery-acceptance.md#source-installable-execution-boundaries) distinguishes endpoint support from intervention policy. The public composition currently supplies none-policy `research-report` and `to-pr` hosts. Supervised/on-exception implementation requires registered recorded-human SDK hosts; CI/merge require separately installed SDK composition. A valid plan or runtime document cannot add a missing host or grant an effect.

## Before you start

Complete the [planning](./delivery-plan.md), [authorization](./delivery-authorization.md) and [queue](./delivery-queue.md) tutorials in the same Bash terminal. Keep workspace_dir set. The queue tutorial creates a new active fictional grant after the authorization tutorial revokes its first one. All application Git changes and runtime state belong to that disposable example; no account, model or remote effect is needed.

## Prepare and inspect without execution

```bash
set -euo pipefail
: "${workspace_dir:?Run the planning, authorization and queue tutorials first}"
wl delivery runner-schema --json > "$workspace_dir/runner-schema.json"
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
wl delivery runner-prepare \
  --file "$workspace_dir/runner-request.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/runner-prepared.json"
runner_digest="$(node -e 'console.log(require(process.argv[1]).digest)' "$workspace_dir/runner-prepared.json")"
wl delivery runner-prepare \
  --file "$workspace_dir/runner-request.json" --root "$workspace_dir" \
  --store "$workspace_dir/state" --json > "$workspace_dir/runner-repeated.json"
wl delivery runner-status \
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
wl delivery pause --digest "$runner_digest" \
  --operator 'Fixture Operator' --store "$workspace_dir/state" --json
wl delivery resume --digest "$runner_digest" \
  --operator 'Fixture Operator' --store "$workspace_dir/state" --json
wl delivery stop --digest "$runner_digest" \
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

Pause fences future dispatch. Resume retains the same run, original grant, deadline and historical stage attempts; it refuses unresolved owner/process/effect reservations or stale current checkpoints. Stop requests cancellation and reports stopping until exact owned closure is observed. These controls never delete worktrees, signal a stored PID, renew a budget or claim that a remote effect was undone.

## Run and reconcile from the terminal

Write a bindings document naming the exact clients, models and roles you trust, and a runtime document naming where each client lives and the client home it signs in from. Then print the host identity those two documents define:

```bash
wl delivery runner-host --bindings bindings.json --runtime runtime.json --json
```

```json
{
  "schema": "wholeloop/native-runtime@1",
  "clients": [
    { "target": "codex", "client": "/opt/homebrew/bin/codex", "store": "/Users/you/.local/state/wholeloop-native/codex" },
    { "target": "claude", "client": "/Users/you/.local/share/claude/versions/2.1.316", "store": "/Users/you/.local/state/wholeloop-native/claude" }
  ]
}
```

An implementation route also needs two optional fields ([ADR-0207](../decisions/0207-public-implementation-route-composition.md)). `codeHost` names the absolute path of the `gh` binary that publication runs; it is never resolved through `PATH`. `repositories` has one entry per plan repository: the digest of an environment recipe already prepared in the store, a digest-pinned helper image, and the suite, meaning the declared command refs, the recipe command each one runs, and a timeout. They grant nothing; the plan's exact grant still decides what may be touched. With both fields, the controller bundle composes the whole `to-pr` route; without them it stops before dispatch. No hosted trial has run yet.

A client entry may instead name a worker credential in place of `store`: `{ "target": "claude", "client": "…", "credential": { "store": "macos-keychain", "item": "claude-worker", "kind": "oauth-token" } }` ([ADR-0209](../decisions/0209-controller-owned-native-credentials.md)). It names an item in the operating system's secret store, never a value: the Keychain on macOS, Secret Service on a Linux desktop. Claude Code takes `api-key` or `oauth-token` (from `claude setup-token`), and Codex takes `api-key`; a Codex ChatGPT sign-in has no reference because the client keeps it itself. Store the value from stdin and check that it resolves:

```bash
claude setup-token   # prints a token; copy it
pbpaste | wl delivery credential-store --target claude --kind oauth-token --item claude-worker --json
wl delivery credential-check --target claude --kind oauth-token --item claude-worker --json
```

The value never appears in arguments or output, and there is no file fallback: a Linux host without a desktop secret store reports `credential-store-unavailable`. The reference is part of the host identity. Each launch reads the item, passes it to that one process through the variable the client consumes, and gives the client a home inside the launch directory, so no sign-in or refreshed token outlives the launch. Claude's sandbox profile then grants no Keychain access at all. A launch whose item does not resolve ends as `authentication-required` before the client starts. Neither client validates an injected credential without a model call: Claude reports any token as signed in, and `codex login status` does not read `CODEX_API_KEY`. A wrong value therefore shows at the first launch. The credential preflight before a run is claimed is still being built ([P6-35](../../roadmap/phase-6-autonomous-delivery.md#p6-35--controller-owned-worker-credentials)).

Prepare the request with `host` set to that identity, then run and reconcile it with the same documents:

```bash
wl delivery run --digest <request> --bindings bindings.json --runtime runtime.json --store <store> --json
wl delivery reconcile --digest <request> --bindings bindings.json --runtime runtime.json --store <store> --json
```

Without `--bindings`, no native client is trusted. A route that needs native clients ends before dispatch: blocked under none policy and paused otherwise, with the reason in the receipt's `preflight`. Both documents are part of the host identity, so a request prepared for other documents is refused. Without `--runtime` a bound route still stops with `public-host-native-runtime-unavailable`. With `--runtime` and the installed controller bundle, `preflight` is `null`: only the bundle composes that host, so it evaluates the route before dispatch and the status records the result.

With both documents, the installed core launches its controller bundle, after checking the digest the build embedded, and that bundle composes the supported routes. Today only `research-report` is composed; every other route ends with `public-host-unsupported-stage` before any client starts. Each native launch still needs its own observed boundary. `reconcile` runs in the same bundle, so it can inspect and stop composed stages, and `reconcile --cancel` cancels owned controller and stage work after `stop` and confirms closure separately. See [ADR-0183](../decisions/0183-public-foreground-runner-host.md) and [ADR-0205](../decisions/0205-public-controller-bundle.md).

## Run unattended research to a stored brief

A `research-report` route runs `plan → research → handoff` through the fixed research host. Under none policy, delegate `research-plan` and `research-sources` and grant only `source.read` and `report.write`. The host pins one research plan of at most eight angles, queries each available source with at most two repairs and examines every load-bearing claim with separate verifiers. It stores a brief whose receipt names the outcome: `research-report-complete`, `completed-with-unknowns` when the uncertainty policy is `complete-with-unknowns`, or `blocked`. Crashed or unavailable sources and missing examinations stay open questions; refuted claims stay in the brief with their counterevidence. The brief stays local; nothing is published. Supervised report research is refused. The public host composes this route when given a runtime document: sources are the built-in `native-web` angle, read with the bound client's own search and fetch ([ADR-0204](../decisions/0204-research-web-reads.md)). See [ADR-0184](../decisions/0184-unattended-research-host.md).

Before the public plan judgment, the controller pins the concrete research plan and supplies it alongside the delivery plan. Source work consumes those same private bytes; absent, changed or foreign plans refuse. A generic research work item alone supplies no evidence about the selected angles. See [ADR-0215](../decisions/0215-reviewed-public-research-plan.md).

A refutation below the dropping quorum remains visible as a disputed low-confidence claim and an open question containing its counterargument. Confirming votes do not erase the conflict; the final independent source decision still decides whether the brief meets its rubric ([ADR-0216](../decisions/0216-minority-research-counterevidence.md)).

## Report, diagnose and move a run

`wl delivery report --run <id>` explains a run read-only: its outcome category, waits, effects, unresolved work and the exact next commands you may run. `wl delivery diagnostics --run <id>` is safe to share: it lists event categories, digests and enumerated states only, never reasons, prompts, source text, provider responses or credentials. To move records to another machine, `wl delivery recovery-export --run <id> --out <dir> --include-private` writes a private bundle with checksums, and `wl delivery recovery-import --bundle <dir> --rebind app=/path/to/repo` verifies every byte and each repository's base before archiving the records under `delivery/imports`. Imported runs hold no active claim or grant; authorize again on the new machine. See [ADR-0190](../decisions/0190-operator-report-diagnostics-and-recovery-bundles.md).

## Internal controller and recovery boundary

The internal controller journals each invocation before native input and advances one exact stage at a time. It pins acceptance definitions before builders, commits owned topic candidates before HEAD-bound QA, preserves dependency order and requires all mandatory verification/review/integration/acceptance/publication stages. Current independent private judgments remain necessary for delegated decisions. A human-only prerequisite ends a none-policy run without a question; supervised entrypoints retain their existing behavior.

An initial none-policy research definition uses its research-plan delegation, with research-sources retained for the later research stage. Implementation definition keeps its separate framing/spec/scope decisions, and envelope-derived plan acceptance remains independently required. An accepted research policy cannot acquire code or product-approval permissions through stage selection.

The native wrapper retains private nonce-bound registration and outcome metadata after parent loss, drains broken pipes and permits only its own live wrapper to signal its group. A fresh observer checks registration, the exact outcome and actual group absence. Known closure with missing semantic output is not success. Unknown invocations stay reserved. A passed immutable result can recover a missing checkpoint or authorized derived-plan locator without repeating its host call; an unpublished result cannot be invented.

Fixture routes and synthetic native processes test those mechanics. They establish neither real model containment nor actual application QA, PR creation or merge eligibility. The public run and reconcile commands now wire the owned foreground entrypoint to a fixed public host; native stages join it only with trusted runtime proof. [ADR-0113](../decisions/0113-owned-foreground-routes-and-native-recovery.md) records the boundary.

## Repeat the model-free foreground control

Run npm run eval:runner from the source checkout. It builds a temporary standalone control, starts actual owned Node controller groups against disposable Git/store fixtures and retains an external report. Supervised execution returns paused when native admission is unavailable; none returns blocked without a question. A second supervised generation preserves the same run deadline. A separate control executes independent synthetic planner/challenger processes and preserves fixture-only decision authority and original budget reservations. This is an opt-in process/control evaluation with no model, application execution, account or hosted effect.

The original parent/core record publishes before its journaled claim becomes visible. The private foreground bootstrap additionally binds the installed core's exact bytes and verifies actual membership in the registered wrapper group before one-shot consumption. A fresh recovery can fence/cancel the original group and distinguish a positively absent parent before native intent from an uncertain partial launch. See [ADR-0114](../decisions/0114-private-group-bound-foreground-bootstrap.md). The current public composition is listed above; this component evaluation alone cannot certify its complete route or native clients.

## Owned topics before implementation

The internal DeliveryWorkspaces host can prepare an external Git topic for a code unit without a legacy slice/part/review item. It pins the complete committed code-predecessor vector, merges only same-repository predecessors and respects the original narrowed branch prefix. A separate repository stays separate; research outputs belong in selected worker context rather than a Git merge. This preparation asserts no gate, research completion or human approval.

Every actual create/merge uses the existing original-grant effect journal and finite registered Git owner. Unknown outcomes retain the original operation, while occupied paths, unsafe helpers, changed predecessors and revoked authority refuse later mutation. Read-only reconcile can recover an exact retained native result without repeating checkout or resuming the run. Personal checkouts and existing worker worktrees remain intact. A dirty owned candidate may change its byte snapshot while retaining the original topic head; readiness is not QA.

The source evaluation now includes an actual disposable subjectless workspace/control. This is an internal controller API, not a new public workspace/run command. Candidate commit is implemented in the next section; current public endpoint support is listed above, with separate native acceptance. See [ADR-0117](../decisions/0117-owned-delivery-topic-workspaces.md).

## Pin a candidate before HEAD-bound QA

The internal DeliveryCommits host stages and commits an owned topic through two original-grant Git effects. The controller pins the actual candidate files independently of the gate snapshot, validates the supplied commit message and verifies the exact staged bytes, original parent, closed native invocation and resulting HEAD. The personal checkout stays untouched. Empty, deleted, binary and Unicode files remain exact; raw Git path bytes are checked before decoding.

A transformed index or unknown outcome is retained without issuing another staging/commit command. This reference path refuses raw byte transformations from line-ending/encoding rules and external Git helpers. It does not rewrite project configuration. Project contents are hashed rather than copied to controller state or scanned as prose: source/type references are not credentials. Existing metadata/artifact/message guards remain active.

Current private committed-head receipts allow later repairs while fencing old receipts through the original effect journal. A lost head locator can be reconstructed from its exact actual effect evidence without another Git invocation, including through a fresh paused controller. Read-only reconcile does not resume the run. A known commit remains separate from the current working-byte snapshot and establishes no actual QA, acceptance, human approval or PR readiness.

Run npm run eval:runner for the additional disposable actual Git commit/control. These internal controller APIs are used by the composed route above; their isolated evaluation supplies no native or hosted acceptance. See [ADR-0118](../decisions/0118-owned-candidate-commits-and-current-heads.md).

## Join Git operations to their runner stages

The internal RunnerGitStages handler now binds an exact root request/plan/unit/stage/invocation to its private workspace or candidate record before native input. It derives topics, reviewed committed predecessors and the candidate message in the controller. The actual Git wrapper registers before input, inherits the narrower stage deadline and observes both cancellation signals. A waiting-external original effect remains live; it cannot admit another stage. Pause, stop and revoked authority still fence execution.

A fresh handler observes the same resource without another Git invocation, including a known closed workspace while paused. Missing/corrupt bindings stay unknown. Fresh stop requests address only the original private operation marker, even after revocation. Actual applied/closed Git effects establish no application QA, delegated acceptance or endpoint authority. [ADR-0119](../decisions/0119-runner-owned-git-stage-bindings.md) records the distinction.

The model-free runner evaluation additionally drives two actual Git topics and their committed predecessor through the engine. All other semantic stages remain explicitly simulated; the resulting route stays paused without a certified endpoint. Fixed native model admission and full semantic host composition need trusted runtime proof; the public run/reconcile commands stop such routes before dispatch.

## Approve a definition before reserving its revision

The internal RunnerDefinitionStages component joins original definition production to every delegated framing/specification/scopes decision. It requires an explicitly unattended policy and envelope authority before starting production. An exact-plan grant cannot derive another revision. An incomplete proposal cannot start judgment, and fixture-only output cannot approve or reserve a revision.

Every decision cites the same captured proposal and retains its original producer invokers, deadline and next revision. Only supported, current independent decisions allow the component to prepare that exact immutable revision. The root engine then adopts its locator through the existing envelope checks and retains the original grant and global deadline. The next plan stage still needs its own delivery-plan decision. No human approval is written. See [ADR-0129](../decisions/0129-approved-definition-revision-reservation.md).

Run npm run eval:runner-definitions from the source checkout for the separate finite model-free evaluation. It launches synthetic native processes in disposable Git/store fixtures, exercises all three decisions and their challenges, interrupts revision reservation and recovers while paused without replay. It also checks that rejection leaves the next immutable revision available for correction. No account, model or remote service is required; normalized fixture observations do not establish real containment or complete-route acceptance. The final directed regression passes 482 cases; both complete definition scenarios pass on macOS Node 24 and Linux Node 20.0.0. The current public composition is listed above; actual reference-client acceptance remains separate.

## Authorize the current plan without producing another revision

The internal RunnerPlanStages adapter uses the current immutable delivery plan. Under envelope authority it requires the existing independent delivery-plan decision, citing the exact persisted plan-record bytes; request selection receives a frozen artifact identity. It preserves original native ownership and published decisions during paused recovery. A lost consumed descriptor cannot buy another judgment.

An implementation plan authorized by an exact-plan grant needs no additional judgment or model. The fixed adapter records its actual in-process core metadata operation through the existing started-stage boundary. Inspection alone cannot create that record. The recorded controller PID describes the operation and is never a cancellation target. Neither route produces another revision, executes product tests or records human approval. See [ADR-0131](../decisions/0131-current-plan-authorization-stage.md).

The additional npm run eval:runner-definitions controls exercise actual journal admission and paused recovery for both authority types. Normalized synthetic judgments are fixture evidence; actual native-account acceptance remains pending; current public route composition is listed above.

## Pin acceptance definitions before builders

The internal RunnerAcceptanceDefinitionStages adapter finishes only the acceptance-definition route stage. It requires observed original production, closed owned invokers and the exact pinned case definitions for the current run, revision, source and delivery plan. Existing validation retains complete coverage, applicability and machine/human ownership. Fixture-only or unavailable production cannot establish readiness.

The producer's response contract fixes those four current identity fields before generation; acceptance definitions do not create a successor delivery revision. Public composition also declares the installed CLI/API input schema, assertion subjects and actual recipe/service/test-command identifiers. Those declarations execute nothing and grant no capability. Unsupported observations and wrong produced bindings still block; the controller never rewrites rejected bytes or waives a required criterion. See [ADR-0217](../decisions/0217-acceptance-producer-contracts.md).

A passed definition stage records that the tests are defined. It supplies no test execution, product acceptance or human testing receipt. Later objective behavior and independent acceptance still need their actual current candidate. Paused inspection restores lost index metadata from original captured bytes without selecting context, launching a worker or changing the definitions. See [ADR-0130](../decisions/0130-owned-pre-builder-acceptance-definitions.md).

The additional npm run eval:runner-definitions control checks this one-process recovery and verifies empty actual result and human-approval stores. Synthetic normalized native observations establish the controller boundary, not a real model, containment certification or full implementation route.

## Approve the owned builder plan before implementation

The internal RunnerBuilderPlanningStages component joins read-only proposal production with its independent delegated approve-build-plan decision. It requires an explicit none policy and the original grant's delegation. Missing delegation or supervised use returns a limitation before starting a producer; it never writes a human approval. Fixture-only production cannot buy a judgment or a builder launch.

Private version-two bindings preserve the producer's exact managed invokers, captured proposal and original deadline. Another closed call in the same root stage cannot stand in for production, and the decision must cite the exact artifact. Historical version-one artifacts remain readable without acquiring new composition authority. Fresh paused inspection reads the original published decision and closes no semantic gap through another model call. Implementation, QA and acceptance remain later stages. See [ADR-0128](../decisions/0128-owned-builder-plan-decision-composition.md).

Run npm run eval:runner from the source checkout for the additional finite composition control. It uses synthetic native producer/planner/challenger processes and disposable Git/store fixtures, without a model account, remote publication or actual containment certification. It does not expose the complete public implementation runner yet. The final builder-plan persistence regression passes 441 cases, including ten admission controls that check the saved original producer proof. All sixteen complete model-free controls pass on macOS Node 24 and Linux Node 20.0.0, with exact inert schema parity; real models/accounts remain unverified.

## Execute and recover an original repository suite

The internal RunnerSuiteStages component binds an explicitly selected repository suite to the current committed unit, latest verify round, pinned acceptance cases and original owned environment. The fixed Docker host observes the actual command; model output cannot provide an executor or replace its process receipt. A suite pass supplies only the suite unit. Criterion verification, adversarial review, integration and whole-feature acceptance remain separate requirements.

The private binding and consumed marker precede execution. Recovery reads the original round-derived case key, captured bytes and actual process closures. It can restore a lost suite result and matching gate submission while paused without repeating the command or resuming the route. Missing bindings, a changed candidate, unknown invokers, conflicting submissions and fixture-only observations stay unavailable. Exact private cancellation remains possible after revocation. See [ADR-0126](../decisions/0126-owned-suite-observations-and-recovery.md).

From the source checkout, run npm run eval:runner-suites -- --retire-success to execute the separate finite Docker evaluation. It requires the existing cache-only reference images and a reachable supported Docker daemon. It creates disposable application Git topics and external stores, observes both zero and nonzero suite exits and tests fresh paused recovery after an interrupted result write. The final option explicitly retires only those disposable environments after retaining observations. The terminal prints the external report location; a failure preserves evidence and resources for inspection. No account or model is required. These observations cannot certify a complete feature or native client. This internal component is composed into the supported public routes above; its isolated evaluation supplies no native acceptance.

## Observe contract-only deliverable identity

The internal observeContractArtifacts reader checks explicitly selected files against a contract-only unit's declared IDs, revisions and SHA-256 values. It requires regular committed files, a clean unchanged candidate, the declared source Git database and ancestry from its pinned base. Ignored copies, symbolic links, unrelated repositories and matching filenames cannot substitute for those bytes. Distinct interfaces can share the same exact file within the bounded observation.

The result establishes mechanical identity only. It records no product criteria, test pass, semantic QA or human approval. The explicit contract-only gate described below joins these identities to the original suite and independent scrutiny before a verification stage can pass. See [ADR-0132](../decisions/0132-committed-contract-artifact-observation.md).

The additional npm run eval:runner-definitions control creates an actual external topic worktree, observes the declared file and rejects a changed clean commit. It uses no model or account and grants no publication authority.

## Join the suite to independent criterion verification

The internal RunnerVerificationStages component selects the unit's exact approved criteria, creates a machine verification subject and pins its original round, suite selection and current committed candidate. An observed nonzero suite exit seals a blocked round before any native verifier host is created. Unknown suite output remains unknown. Only an observed passing suite can proceed to independent read-only criterion inspection and refutation under the existing gate policy.

Fresh paused inspection audits both application and native owners, the exact original suite submission, captured verifier reports and submitted votes. It can restore a lost final verdict without selecting another suite, invoking another model or writing human agreement. A changed parent suite selection refuses. Suite success with fixture-only or unavailable native judgments cannot pass the root verification stage. Contract-only units instead use explicit observed contract requirements under [ADR-0133](../decisions/0133-independent-contract-only-verification.md); repair and full acceptance have their own controls below, while current public composition is listed above. See [ADR-0127](../decisions/0127-owned-criterion-verification-rounds.md).

Run npm run eval:runner-verification -- --retire-success from the source checkout for the separate finite Docker/process evaluation. It uses the same cache-only reference images and external disposable stores as the suite evaluation. Application commands actually run in Docker; native verifier processes are synthetic and their normalized host observations do not certify a live model or containment boundary. The report distinguishes successful recovery, nonzero suite refusal and fixture-only verifier refusal. Preserve interruption reports and inspect their exact original owners rather than replaying application work. This evaluation creates no PR or human testing receipt.

## Verify contract-only units without inventing product criteria

The internal verification gate accepts an explicit stored run/revision, contract-only unit and exact artifact paths. It reopens the immutable plan and observes the committed bytes, then fixes distinct fail-safe contract requirements alongside the mandatory suite. Ordinary implementation verification still requires its agreed product criteria. This mode creates no criteria agreement or human approval and is restricted to standalone machine review subjects.

RunnerVerificationStages obtains those paths once from its fixed controller selector before consuming a round. Recovery reads original locators from the gate and audits the complete declared identity vector without calling selectors or hosts. Changed revisions, matching replacement files, stale snapshots and unavailable fixture suites cannot pass. Existing independent verifier/refuter, ownership, budget and suite policies remain required. Downstream implementation, code review, integration and whole-feature acceptance remain separate.

Run npm run eval:runner-verification -- --retire-success for the six actual Docker/synthetic-native scenarios, including contract-only lost-verdict recovery. Each scenario has its own bounded controller and disposable external store. Successful retirement targets only the exact observed fixture environment. Normalized synthetic judgments do not establish real model containment, independent Linux application-host or complete-route acceptance. See [ADR-0133](../decisions/0133-independent-contract-only-verification.md).

## Read original failure feedback before correction

The internal runnerRepairFeedback boundary reads the fixed verification/review components and their original private gate binding. Known nonzero suites and retained independent findings carry their exact candidate, commit, gate, round and deadline. Stale or incomplete observations, signals and missing exits stay unavailable; an exhausted gate remains exhausted. Inspection can run while paused without selecting inputs or launching another model.

Fingerprints follow observed diagnostic hashes and retained finding substance. Different model IDs, ordering or whitespace cannot manufacture progress; command/diagnostic and meaningful finding changes remain distinguishable. Raw process logs are not returned. Feedback supplies no dispatch authorization, budget renewal, repaired candidate or human approval. Actual correction, candidate succession and repeated QA have their own controls below; this feedback read alone cannot claim them. See [ADR-0134](../decisions/0134-original-failure-feedback-before-repair.md).

The finite model-free definition controls include a retained review finding and original gate exhaustion. The actual Docker/synthetic-native evaluation now has seven scenarios, including retained verification findings; its known nonzero-suite case checks feedback invalidation after a candidate edit and exact restoration without new model calls. These fixtures establish controller boundaries rather than real native-account or whole-product acceptance.

## Admit repair within the original allowance

The internal admitRunnerRepair boundary checks explicit unattended authority for the original active stage and requires actionable feedback, a live original deadline and closed invokers. It records the exact original failure once through the existing budget journal. A lost response does not add another failure, reserve a worker or renew the deadline. Expired, revoked, paused, supervised, unavailable or exhausted scopes refuse.

Admission rechecks candidate identity and budget after accounting. It supplies no exclusive dispatch claim, repaired commit or progress event. The separate correction component now persists one-shot worker ownership; binding fresh commits and repeated QA have their own controls below. See [ADR-0135](../decisions/0135-original-repair-budget-admission.md).

The exhaustion fixture explicitly configures one review round before execution; defaults remain four verify rounds and three review rounds. The actual Docker/synthetic-native evaluation now has seven scenarios, including original failure admission with lost-response deduplication, unchanged worker reservations and refusal after pause or deadline extension. These remain source-checkout fixture controls, not real model or complete-route acceptance.

Targeted owned-worker claims also cap their durable reservation and worker assignment at the original parent stage deadline. A later child claim cannot renew that window; invalid or expired parent bounds reserve nothing. Existing unparented queue callers retain their behavior. See [ADR-0136](../decisions/0136-parent-bounded-worker-reservations.md).

## Produce one original correction

The internal RunnerRepairWorkers component requires admitted original feedback and audited original builder production. It fences and requeues the same builder slot, reserves only the next generation within the original parent window and supplies the exact failure in a builder-only repair briefing. Existing restart/global limits and failure accounting remain authoritative. A new cell cannot bypass the original history.

Private intent precedes claim and native work. A lost response retains that intent and reservation rather than authorizing another claim. Paused recovery observes the original successor lease, captured receipt, owned call prefix and unchanged produced bytes without selectors or another host. Missing evidence remains unavailable. Cancellation uses only original private native channels.

Its result reports produced correction with commit and QA pending; it cannot mark a root verification/review stage passed. The separate correction-commit adapter pins exact original correction bytes and parent through owned Git effects. Candidate succession and repeated independent QA have their own controls below; complete-route acceptance requires the supported composition and separate native evidence. Run npm run eval:runner-repairs from the source checkout for the finite synthetic-native controls, separate from authenticated native acceptance. See [ADR-0137](../decisions/0137-one-shot-original-correction-workers.md).

## Pin the original correction commit

The internal RunnerRepairCommits adapter requires current observed correction production and the exact unattended original stage. It pins the produced snapshot and parent with the existing owned staging/commit effects, retaining private intent and original deadline. Historical production remains auditable after the controller legitimately changes HEAD.

Paused inspection can reconstruct a lost head locator from original applied effects without another model, selector or Git dispatch. Changed files or index refuse current completion. Original private cancellation remains available after revocation. The result is a committed checkpoint with QA and candidate-chain integration pending; it cannot pass a root gate or establish progress. The finite npm run eval:runner-repairs control now includes this commit/recovery path. See [ADR-0139](../decisions/0139-owned-original-correction-commits.md).

## Correct an original suite-only failure

A known nonzero suite stops verification before a reviewer is constructed. The correction adapter accepts that empty original native prefix only when the fixed reader admits an actual observed suite-failure. Other failure categories retain their native ownership requirement. One captured correction is appended without inventing a reviewer or passing QA.

The actual Docker control now covers a pre-builder pinned case plan, original builder production, exit-seven suite, zero QA model calls, one correction and paused recovery without replay. Its environment is retired explicitly by exact identity. Fresh independent QA and candidate succession have their own controls below. See [ADR-0140](../decisions/0140-suite-only-correction-ownership.md).

## Audit the previous committed parent

The internal historical receipt validator checks original owned files, record, grant and closed staging/commit effects after HEAD advances. It changes no journal or head pointer. Current-head validation still rejects the superseded receipt; a matching checksum alone cannot replace native evidence. This supplies a parent-audit primitive for upcoming candidate succession, leaving current-candidate selection and fresh QA unchanged. See [ADR-0141](../decisions/0141-historical-owned-commit-receipts.md).

## Select the first original correction for QA

The internal candidate reader can explicitly use the fixed correction checkpoint to select its current direct successor. It reopens original production, the historical initial parent and current owned Git effects, then checks branch/lock state and exact stable files/index. Default candidate selection remains unchanged; file order, a new HEAD or a previous gate verdict cannot substitute for that proof.

This is read-only candidate selection with QA still pending. Locked, changed, unrelated or ambiguous heads refuse. Fresh gate continuation and longer correction chains have their own controls below; current public composition is listed above. See [ADR-0142](../decisions/0142-explicit-original-correction-successors.md).

## Retain correction history during later QA

Historical correction production keeps its exact original closed native-call prefix after later owned calls append. Those later calls are not attributed to the producer or treated as approved QA. Strict production inspection still checks the complete scope, while the original commit checkpoint and exact successor can remain inspectable. Future gate continuation must audit its own new calls before passing. See [ADR-0143](../decisions/0143-original-correction-calls-across-later-qa.md).

## Verification of this increment

Complete checks for the criterion-verification candidate pass 3196 tests in 158 files on isolated Debian Linux arm64/Node 24.22.0 with the original two-worker configuration. macOS arm64/Node 24.22.0 passes 3195 tests before the final admission-only test split using VITEST_MAX_WORKERS=1; its corrected native/verification/store regression passes all 26 cases. The split preserves actual worker coverage and tests invalid-input admission in a separate current context, without changing runtime code or deadlines. Fifteen model-free runner controls and exact inert schema parity pass with Linux Node 20.0.0/Git 2.39.5. The build reproduces the same copied CLI throughout these checks.

The separate actual Docker/synthetic-native evaluation observes exact paused verdict recovery, exit-seven refusal before native host construction and fixture-only verifier refusal, retiring all three trial environments. These checks establish the implemented control, ownership and component boundaries. They do not establish authenticated native model containment, independent Linux application-host acceptance or the complete implementation route; complete native acceptance remains open.

## Review the first original correction

The internal review adapter can advance from its retained failed round through the fixed original correction checkpoint. It requires a current direct successor and positive original native closure, then plans the next round in the same run and unchanged allowance. Exhausted, extended or unrelated runs and expanded deadlines refuse. The new workers independently inspect the corrected HEAD; a correction receipt alone supplies no QA verdict.

A lost planning response reopens the exact next round without planning again. A separate dispatch marker prevents native replay. Paused recovery can restore the active locator and recover a lost final verdict from already submitted original outputs without a host factory. Missing original work remains unknown. This does not observe the root stage as complete or create human approval. Run npm run eval:runner-review for the finite synthetic process control. See [ADR-0144](../decisions/0144-original-review-continuation-after-correction.md). Later original review rounds and fresh behavioral verification after review repairs are described below; current public route boundaries are listed above.

## Keep environment ownership separate across phases

The internal environment scope accepts an explicit digest namespace for later phases of the same root invocation. Each phase retains its own exact private environment/operation/read owners. The original version-one locator stays intact; later phases use version-two metadata and distinct native read identities. Reopening a consumed phase never authorizes another command.

Inspection remains specific to one original scope. Root suite/verification cancellation addresses all known original phases through private channels, including after revocation. A missing or malformed locator reports unresolved cancellation after attempting other known scopes; it cannot authorize replay or imply that application work stopped. This ownership layer does not select another environment or run fresh behavioral QA. Run npm run eval:runner-environment-phases for the synthetic process control. See [ADR-0145](../decisions/0145-distinct-owned-environment-phases.md).

## Execute a suite on the first correction

The internal suite executor can bind a separate phase to the exact digest of the next already planned verify round. It reopens the original nonpassing round and suite ownership, selects the fixed direct correction and requires a distinct environment captured from that HEAD. Acceptance cases, command references, timeout, mapping and allowance remain pinned. Retain the narrower original suite/correction deadline; a later phase cannot regain the broader controller window. The executor does not plan a gate or approve the correction.

Earlier suite and environment locators remain intact. Paused inspection recovers only this phase's actual Docker observations without another command. A repeated nonzero exit remains a known failure; independent requirement judgments and full verification continuation have their own controls below; this component alone cannot claim whole-route acceptance. Run npm run eval:runner-suite-continuation -- --retire-success for the actual Docker control and explicit retirement of its exact environments. This control requires the cached reference helper and is distinct from authenticated native or independent Linux application-host acceptance. See [ADR-0146](../decisions/0146-original-correction-suite-phases.md).

## Continue original verification after correction

The internal verification adapter can advance one direct correction through a fresh suite and independent requirement judgments. It validates an already prepared captured environment and unchanged case/command selection before planning, then retains the same run, immediate next round, unchanged allowance and narrower original deadline. A nonzero suite stops before any model; a passing suite permits independent read-only inspection/refutation.

Original intent and dispatch ownership prevent replay. Paused recovery can restore a lost active locator and final verdict using exact captured suite/native outputs without another selector or host. Earlier ownership stays intact; the runner still owns root-stage completion. Run npm run eval:runner-verification-continuation -- --retire-success for the finite actual Docker/synthetic-verifier composition and exact cleanup. Its unchanged pre-builder script observes actual corrected bytes; native/model, independent Linux application-host and complete product acceptance remain unestablished. See [ADR-0147](../decisions/0147-original-verification-continuation.md). Later original verification rounds are described below; current public composition is listed above, with separate native acceptance.

## Stop repeated failure across corrected candidates

Feedback and repair admission can reopen the current fixed correction checkpoint. Their failure records retain the exact candidate and observation. A separate runner guard counts the same observed failure across different commit digests using the original no-progress limit; the generic budget report retains its existing candidate-specific signature.

Only a new host-observed behavior, resolved finding or accepted candidate resets repair repetition. Another artifact, bookkeeping event, repeated progress fact or interleaved finding cannot hide it. The guard records exhaustion atomically, with no new worker/reservation or human prompt. Lost negative verdict metadata can be reconstructed from exact failed-suite observations without another command or positive model claim. Run npm run eval:runner-verification-continuation -- --repeated-failure --retire-success for the actual two-failure control. See [ADR-0148](../decisions/0148-observed-repair-progress-across-candidates.md). Later correction generations are described below; current public composition is listed above, with separate native acceptance.

## Audit a producer after its slot advances

The internal native host can audit the exact original successful settlement even after its queue slot is fenced or reused. It replays that authoritative journal prefix and verifies the original assignment/runtime, receipt and input/output hashes. Current completion still requires the current lease; historical transport facts never grant a new dispatch or positive QA.

Correction history keeps its original closed native-call prefix and the same five-field production object, preserving earlier version-one commit digests. Missing or changed source/captured bytes refuse. Paused inspection selects no inputs or hosts. Run npm run eval:runner-native-history for a finite synthetic-process control that reserves and stops a later generation without launching it. See [ADR-0149](../decisions/0149-historical-native-completion-after-fencing.md). Later-correction dispatch and candidate lineage are described below; current public composition is listed above, with separate native acceptance.

## Produce and pin a later correction

The internal correction factory can bind a later worker to a known fixed predecessor receipt. It reopens that predecessor and current failure, keeps the narrower deadline and original restart/no-progress limits, and retries the same builder slot. Separate worker/commit namespaces preserve earlier receipts and production digests. A different fixed instance of the same recorded checkpoint can recover it after a process restart.

Current candidate selection audits every explicit predecessor back to the initial root commit, then checks current effects, owned branch and exact files/index. An older checkpoint cannot select the newer head. Paused recovery uses original captures without another selector, host or worker. Run npm run eval:runner-verification-continuation -- --second-correction --retire-success for the actual generation-three/commit/lineage control and exact environment cleanup. See [ADR-0150](../decisions/0150-owned-correction-successors.md). A new commit still needs fresh independent QA; the next section covers original repeated rounds. Current public composition is listed above, with separate native acceptance.

## Repeat original QA across further corrections

Each later correction selects its own continuation namespace through the fixed predecessor checkpoint. Review and verification keep the same original run, immediate next round, allowance and narrower deadline. The original version-one continuation remains readable and unchanged; later intents never overwrite it. No directory timestamp or newest receipt selects ownership.

Verification reopens the exact failed predecessor suite named by correction feedback, including its own closed environment phase. It requires unchanged acceptance cases, command references, timeout and mapping, then a distinct captured environment for the corrected HEAD. An actual failed suite still stops before independent model judgments. A passing later round supplies only its original QA verdict; root-stage completion and cross-stage readiness remain separate.

Run npm run eval:runner-verification-continuation -- --repeat-verification --retire-success for two corrections and three actual Docker suite rounds, with independent synthetic judgments after the third suite passes. Its unchanged script is pinned before the original builder and passes only on the second correction. All three exact environments are retired. Run npm run eval:runner-review -- --repeat-review for two corrections and three independent synthetic review rounds. Both controls exercise lost active-locator recovery while paused without another host, command, model, gate plan or renewed budget. See [ADR-0151](../decisions/0151-original-repeated-qa-continuations.md).

These internal controls do not certify authenticated models, independent Linux application hosts or the public complete implementation route. Review-triggered repair still needs fresh behavioral verification before cross-stage delivery readiness can pass.

## Review a verified corrected candidate

A following review can inspect the exact corrected candidate that passed verification, including later correction generations. Keep its fixed checkpoint for current commit lineage, but derive any correction continuation only when that checkpoint owns the current invocation. A verification checkpoint cannot supply a review continuation, verdict or native scope. The same distinction applies to verification readers; existing current-candidate and original-failure checks remain required.

Run npm run eval:runner-verification-continuation -- --review-after-verification --retire-success for the finite actual Docker/synthetic-worker composition. It runs the original failed suite, two corrections and the passing third verification, records that exact verification stage and independently reviews the same committed head in the following stage. The new review declares its own original finite window before execution while preserving the global delivery deadline. Paused recovery launches neither reviewers nor old verification work; all three exact environments retire through their original ownership.

This connects candidate consumption across stages. Review-triggered repairs are verified again by the route's re-entry stage, described below; feature readiness has its own controls below, and current public composition is listed above. The fixture control supplies no authenticated model, independent Linux application-host, human approval or feature endpoint acceptance. See [ADR-0152](../decisions/0152-candidate-lineage-and-stage-continuations.md).

## Verify the reviewed head again

Every implementation unit now ends with `reverification:<unit>` after review. When the original verification still attests the exact reviewed head, the stage records that attestation and passes without a suite, model, gate round or environment. When review committed a correction, it runs a fresh verification on its own subject, with its suite in an environment holding the corrected head; the original verification run stays unchanged. A failed re-entry does not start another correction loop. Unit readiness prefers a passed re-entry and otherwise keeps the original verification.

Run npm run eval:runner-reverification -- --retire-success for the corrected path: original verification passes, review keeps a finding, one owned correction is committed, review passes, readiness refuses until the re-entry verifies the corrected head, and paused recovery repeats nothing. Add --unchanged for the attestation path. See [ADR-0177](../decisions/0177-review-reentry-verification.md).

## Inspect joint unit QA readiness

The internal RunnerUnitReadiness reader joins fixed verification and review readers in the same store and host identity. It requires their original stages to be completed, reopens actual captured QA at the current owned candidate and rechecks the commit, bytes, root records and plan after inspection. Passing root flags without captured reports cannot qualify. A changed workspace remains unavailable even if both stage flags still say passed.

Run npm run eval:runner-verification-continuation -- --unit-readiness --retire-success for the actual Docker/synthetic-worker control. It extends the three-round verification and following review with current readiness, a changed-byte refusal, exact restoration and paused observation without another execution factory. The original failure/global-deadline history and both native scopes remain unchanged; all three exact environments retire.

Fresh controllers can reconstruct the current correction chain from its authoritative owned receipt with fixed store/queue/worker adapters. Catalog files are hints: each exact historical producer and Git receipt is reopened, with no worker or native selector, new lease or dispatch. Missing, aliased or duplicate locators refuse rather than choosing the newest file. This checkpoint reader creates no cross-invocation chain. The separate seeded continuation protocol now supplies those revisions, with CI production under an explicit version-two plan and installed SDK composition ([ADR-0214](../decisions/0214-versioned-ci-correction-production.md)). See [ADR-0154](../decisions/0154-recorded-correction-checkpoint-reconstruction.md).

Run npm run eval:runner-verification-continuation -- --reopen-checkpoint --retire-success to extend that control with fresh controller objects, identical paused readiness, locator alias/ambiguity refusal and exact restoration without journal changes. This is an opt-in actual Docker/synthetic-process evaluation, separate from native-model and whole-route acceptance.

A fixed Git stage adapter can now take an explicit per-unit map of joint-QA readers. In that configured path, every transitive code predecessor needs its own current observed verification/review proof. The downstream topic incorporates the exact corrected commit; changed bytes, unavailable QA or a missing reader refuse before workspace preparation. Controller bounds and all selected predecessor proofs are rechecked after asynchronous inspection. The older unconfigured adapter retains its initial-commit behavior; complete-route composition must explicitly configure the readers. See [ADR-0155](../decisions/0155-qa-ready-predecessor-incorporation.md).

Run npm run eval:runner-verification-continuation -- --predecessor-readiness --retire-success for the opt-in actual Docker/synthetic-process control. It adds a successor contract unit to the original plan, refuses changed predecessor bytes, incorporates the restored QA-ready corrected head and recovers the resulting workspace while paused. The successor contract is not produced and the full delivery is not completed by this control.

A ready result names the exact unit commit and original QA evidence. It neither completes the delivery nor supplies feature acceptance. Later integration and re-entry controls combine readiness with fresh behavioral verification after review repairs; current public composition is listed above, with separate native acceptance. See [ADR-0153](../decisions/0153-current-joint-unit-qa-readiness.md).

<!-- docnav -->
[◀ Delegated machine decisions](delivery-decisions.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Delivery recovery ▶](delivery-recovery.md)
