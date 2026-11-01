# Assemble and verify the complete milestone

> **TL;DR** — Build a separate owned integration worktree from every required committed part, then test the actual combined application and contracts. Keep failed assemblies and reports; a repair creates a new vector under the original finite budget.

> [!NOTE]
> **Status: ✅ implemented.** P6-19 owned assembly, conflict/repair ownership, current-input verification and bounded private reports pass local automated verification and actual Docker/Git observations. Complete-runner and publication orchestration remain subsequent tasks. See [ADR-0110](../decisions/0110-owned-assembly-and-complete-milestone-verification.md).

## Prerequisites and outcome

Start from an accepted [delivery plan](./delivery-plan.md), an active [original authorization](./delivery-authorization.md), committed clean required part worktrees and [pinned acceptance](./delivery-acceptance.md). The grant needs workspace.create and git.commit for assembly, and test.run for actual verification, with the selected repositories and topic prefixes. The run must be queued/running and have no unresolved foreign effects. This guide does not issue a grant or publish anything.

Run the source commands from the repository with Node ≥ 22, Git supporting canonical --path-format=absolute metadata and the [reference Docker prerequisites](./delivery-docker.md). The bundled CLI retains its Node 20 runtime minimum. Inspect the closed request, stored record, status, verification request and report contracts first:

```bash
set -euo pipefail
npm run build
node dist/wl.mjs delivery integration-assembly-schema --json
```

The schema command executes nothing and opens no store. The complete route below stops at local milestone behavioral/contract evidence. Independent review, publication checks and conditional merge keep their separate requirements.

## Pin contract and combined procedure coverage

Before builder admission, add objective cases to the immutable acceptance definition. Every selected criterion needs applicable coverage. For each produced contract, an applicable machine case must have fixture.sha256 equal to the approved contract SHA. A machine case must also include the exact milestone.procedure text in its actions. One genuine combined case can cover its criterion, contract and procedure; unrelated green component cases cannot replace missing mappings.

Use actual assertions against your public entrypoint and seeded state. Human-only criteria retain their current explicit operator-note requirement. Unsupported or unavailable hosts remain unavailable; fixture evidence remains fixture-only. Gate-policy input files identify requirements, not passing verify/review receipts.

## Create the owned assembly

Create a wholeloop/integration-assembly-request@1 JSON file in your external operator directory. Supply the actual run, revision, plan, milestone, a stable key and the complete parts array used by the [candidate guide](./delivery-integration-candidates.md). Each part names work, repository, canonical registered path, topic ref and committed head. Omit repairOf for the first assembly.

Set the variables to your actual operator directory, request file and external store, then run these terminal core commands:

```bash
set -euo pipefail
node dist/wl.mjs delivery integration-assemble --file "$assembly_request_file" --root "$operator_input_dir" --store "$delivery_store" --json
node dist/wl.mjs delivery integration-assembly-status --digest "$assembly_digest" --store "$delivery_store" --json
```

Retain digest from the returned status before inspection. The controller creates separate worktrees under the external store and topic branches under the original grant prefix. It creates worktrees first and merges in global dependency order, including cross-repository predecessors. The personal checkout, real target refs and worker files are preserved. Hooks, signing and prompts are disabled; configured controller-side Git helpers are refused. Application/test commands execute through the existing Docker hosts.

Every Git mutation has its own finite effect and native process observation. An assembled status establishes the complete Git vector, with acceptance still not-established. Conflict, failed, partial, unknown and stale outcomes exit 3. Partial repositories never become whole-feature success and trigger no rollback. A nonzero command can leave files or refs behind; inspect the retained worktree and effect rather than assuming nothing changed.

## Recover or repair

A lost issued command is observed rather than reissued. Reconcile an already-issued operation, including after revocation or supersession, with:

```bash
set -euo pipefail
node dist/wl.mjs delivery integration-assembly-reconcile --digest "$assembly_digest" --store "$delivery_store" --json
```

This dispatches no Git write and restores no authority. Missing completion proof stays unknown; no stored PID is signalled. Inspection and history remain available. Resuming actual work still requires current original scope and a queued/running run.

For a conflict or combined behavior failure, repair the owning source part in a new committed revision through its authorized builder/controller. Keep the failed integration files. Submit a fresh assembly request with a new key, updated complete part heads and repairOf naming the preceding assembly digest. The original integration-repair counter and effect/time limits apply. The new accepted assembly fences its predecessor; no worker is automatically reset/rebased, no conflict edit is discarded and no failed Git write is blindly replayed.

## Bind and run the combined environment

Use the assembled repositories' returned path/ref/head vector to prepare a current [environment recipe](./delivery-environments.md). One combined recipe/environment must cover every selected repository. Pin its actual files, seed/data identities and explicit service dependencies, then [prepare a candidate](./delivery-integration-candidates.md) using those exact owned assemblies and the original acceptance definition. Start the [owned Docker environment](./delivery-docker.md) from that candidate vector.

Create a wholeloop/integration-verification-request@1 file with four fields: schema, candidate, assembly and environment, using their actual digests/ID. Execute or reobserve it:

```bash
set -euo pipefail
node dist/wl.mjs delivery integration-verify --file "$integration_verification_file" --root "$operator_input_dir" --store "$delivery_store" --json
node dist/wl.mjs delivery integration-report --file "$integration_verification_file" --root "$operator_input_dir" --store "$delivery_store" --json
```

The first command executes required machine cases through the existing fixed hosts and retains a complete bounded report artifact. Repeating completed keys does not repeat effects. The second reobserves current evidence without executing cases. A changed part, recipe, base, assembly or environment invalidates the corresponding current result. Failed criteria return their pinned work/integration repair owner and case IDs. Relevant failed cases and their artifacts remain historical; a new assembly cannot borrow their green results.

Passing returns delegated-machine or operator-and-machine milestone evidence. Fixture-only, failed, stale, pending-human and unavailable outcomes exit 3. Whole-feature completion, independent review and publication remain unestablished by this receipt. A multi-repository plan provides no atomic code-host transaction or automatic rollback.

## Observe the model-free combined regression

With the reference images already cached, execute:

```bash
set -euo pipefail
npm run eval:assembly -- --retire-success
```

This opt-in evaluation creates two disposable local Git repositories and actual owned Docker services. Backend and frontend units pass separately while the combined API fails. A committed backend repair creates a new complete assembly and passes the unchanged contract/API cases. The test preserves personal targets, worker files, old failures and budgeted failed/passed artifacts, then observes exact owned resource retirement. Reports and fixtures remain in the printed external locations. No model account, external service, remote Git write, pull request or project merge is exercised. See the [integration specification](../../roadmap/specifications/autonomous-delivery/05-integration-and-change-impact.md) for later change-impact and publication boundaries.

## Current unit QA before assembly

The internal milestone-readiness reader derives the complete ordered unit vector from the selected milestone, its prerequisite milestones and transitive work dependencies. Each unit needs fixed original verification and independent review readers at its exact current owned commit, including any recorded correction chain. Missing reader coverage, pending QA or changed evidence returns no parts; the caller cannot request a convenient subset.

All earlier candidates and root records are checked again after the asynchronous reads. A ready result supplies only assembly inputs and explicitly leaves integration QA and feature acceptance unestablished. Inspection runs no worker, suite, Git mutation or assembly and changes no journal or budget. Actual assembly and combined application checks remain necessary. See [ADR-0157](../decisions/0157-complete-current-unit-vectors-before-assembly.md).

## Foreground runner ownership

The internal assembly adapter can accept the same fixed controller control used by owned Git stages. Every original wrapper receives the narrower deadline, combined cancellation signals and current-ownership watcher; its actual operation is registered before input. Cancelled, expired or fenced controllers cannot prepare a resource or admit another effect. A fresh controller can request cancellation of the exact original pending operation by its retained nonce, including after revocation; no stored PID is signalled.

Environment inspection observes retained read owners through one bounded common process-table snapshot, preserving each original registration, result and evidence. An unavailable common observation cannot become positive closure through a per-owner retry. Original reconciliation and paused inspection remain available without dispatch authority and do not replay checkout or merge. The unconfigured domain API and existing schemas remain unchanged. This control is a prerequisite for runner composition; it does not establish an executed complete route or whole-product acceptance. See [ADR-0156](../decisions/0156-original-runner-controls-for-assembly.md).

## Join current unit QA to the actual assembly

The internal assembly-readiness reader requires the complete current observed unit-QA vector and the matching owned assembly under the same run, plan, source, grant and milestone. All original Git effects must be applied and positively closed. It reopens unit QA and rechecks the assembly and basis after asynchronous inspection; changed or partial evidence returns no candidates.

Run npm run eval:runner-assembly-readiness -- --retire-success for the opt-in actual Docker/synthetic-worker control. It executes one declared application suite and independent verification/review, assembles the exact unit vector through bounded owned Git operations, refuses changed assembled bytes and recovers identical evidence after restoration and paused fresh-object inspection. No account, authenticated model or publication is used. The exact original environment retires. Readiness still leaves the root integration stage running and whole-product QA and acceptance pending. See [ADR-0158](../decisions/0158-current-unit-qa-and-owned-assembly.md).

## Original assertion evidence during recovery

The internal fixed-host case observer reopens an exact acceptance-plan/case/key receipt against its original journaled Docker test effect. It checks actual artifact bytes, capture identities, assertion outcomes, provenance and original environment/candidate bindings. Stored passing flags or copied host labels cannot replace that proof. The assembly-readiness evaluation also exercises a changed-case refusal and identical restoration without replay.

This is historical assertion evidence. Its result explicitly leaves native ownership and current acceptance unestablished; the controller must still audit the original process scope, deadlines and exact current assembled candidate before approving whole-product QA. See [ADR-0159](../decisions/0159-original-docker-assertion-observations.md).

## Recover the original combined verification report

The internal integrated-report observer reopens the exact budgeted report, candidate, assembly and pinned pre-builder cases. It derives criterion, contract and procedure coverage again and requires each case's exact original integration attempt key, assertions, captures and journaled Docker effect. Changed coverage, passing claims, runtime bindings or repair ownership refuse recovery. It preserves original failures rather than substituting newer passing cases.

Runtime revisions legitimately change while test containers are registered. Recovery validates the complete original environment history and resolves each exact historical revision; it does not query Docker. Both failed and successful machine-only reports remain readable after correction, pause and exact environment retirement without journal changes. Human or incomplete reports remain unsupported by this internal reader. Historical proof still leaves native ownership and current acceptance unestablished; root integration and public-route composition remain open. See [ADR-0160](../decisions/0160-original-integrated-verification-observations.md).

The existing npm run eval:assembly -- --retire-success instruction also exercises report recovery and eight report-substitution refusals, retaining its original two-repository failing-combined scenario, correction and case expectations. This executes actual Docker CLI/API behavior with disposable local repositories; it does not use authenticated models or publish anything. Both exact trial environments retire before paused recovery is checked.

## Preserve the original parent control during product QA

The internal integrated verifier can capture the original parent deadline, cancellation signal and live-ownership predicate. Each case keeps the narrower case/run/attempt limit and that original deadline. Parent cancellation reaches HTTP requests as well as native operations; fencing and expiration also prevent late artifact capture or a new aggregate report. Post-await rechecks occur before accounting or dispatch, so a pause cannot admit another case while environment observation is returning.

Historical metadata remains readable after cancellation. This control does not replace original native-scope auditing or current unit/assembly readiness, and the public complete-route runner remains open. The existing combined Docker evaluation also refuses a fenced parent's new execution without Docker reads or journal changes while retaining its original report proof. See [ADR-0161](../decisions/0161-original-parent-controls-for-acceptance.md).

## Execute original root product QA

The internal fixed integration adapter joins current unit QA and its owned assembly to actual pinned CLI/API product observations. It consumes one original root selection, retains its original deadline and refuses prior unowned case intents. Recovery requires the exact product report, closed original native owners, invocation-specific CLI containers and current unchanged unit/assembly inputs. Missing or changed proof stays unknown; inspection does not replay a case or grant another attempt. Existing environment-scope observation digests remain unchanged.

Run npm run eval:runner-assembly-readiness -- --product-qa --retire-success for the CLI control, or substitute --product-qa-api for combined HTTP/CLI and evidence-tamper controls. Use --product-qa-failure to exercise a known nonzero product result while original unit QA remains green. These modes use actual disposable Git/Docker resources and synthetic independent workers, preserve all default assembly controls and retire both exact environments. Root integration is distinct from feature acceptance; no public complete-route execution, authenticated model acceptance or independent Linux application-host certification is implied. Private evaluator and browser support are described below; the remaining route composition is still technical work. See [ADR-0162](../decisions/0162-owned-root-product-verification.md).

## Private product cases and exact attempts

The internal root adapter also supports API/evaluator.private-http through a separately owned evaluator container. It reopens the immutable private definition before consuming work, checks the compiled evaluator is available and preserves the original private assertions and sensitivity policy. Zero evaluator exit proves process completion; it does not turn a failed objective or an unproven regression into a passing root verdict. Metadata inspection still works after pause and exact retirement without executing the evaluator.

Run npm run eval:runner-assembly-readiness -- --product-qa-private --retire-success for the private root control. Substitute --product-qa-private-failure for a failed objective with zero evaluator exit, or --product-qa-private-unproven for a passing evaluator without required baseline proof. All modes retain original limits and retire both exact environments. These are local fixture trials with synthetic workers, not authenticated-model or independent Linux application-host acceptance.

Integrated machine reports now use only their exact integration case keys. A missing later case is unavailable with no evidence; it cannot inherit the earlier unit suite's result. A known failed prefix remains recoverable, while an unresolved later intent still blocks recovery. The ordinary standalone acceptance report keeps its existing latest-case behavior. Feature acceptance and full public-route composition remain separate technical work. See [ADR-0163](../decisions/0163-owned-private-product-verification.md).

## Browser product cases and original private stdio

The root adapter supports browser/browser.journey through the pinned isolated Chromium/MCP service. Its interactive stdio process registers with the original runner scope before spawning and reports its actual PID before receiving bootstrap input. Scoped commands include the exact acceptance invocation in their output-directory namespace, so another case's exec cannot substitute for their original process. Standalone browser command shapes remain unchanged.

Run npm run eval:runner-assembly-readiness -- --product-qa-browser --retire-success for the actual root browser control. Substitute --product-qa-browser-failure to observe a missing objective despite a retained screenshot and zero MCP-client exit. These modes retire the exact completed unit environment before reserving the assembled browser environment, preserving daemon capacity checks and the original root deadline. They also retain the report/deadline substitution, paused recovery and exact retirement checks. Fixtures use synthetic independent workers; authenticated-model, independent Linux application-host and full-feature acceptance remain separate.

The optional interactive capability is controller-internal. It does not expose a network control endpoint or grant fixture transports a native fallback. Cancellation addresses the original exec nonce after revocation; lost ownership stays unknown rather than starting another client. See [ADR-0164](../decisions/0164-owned-browser-product-verification.md).

## Require one whole product before feature acceptance

The internal feature reader now requires every current original integration stage and one declared milestone whose dependency closure covers all work, criteria and milestones. That milestone's passing product report must also contain passing cases for every declared procedure. Separate green terminal products without an integration join stay blocked. The reader exposes exact candidate, assembly, pre-builder acceptance plan and report identities only after rechecking the complete product vector; ready still grants no feature acceptance or publication.

After a successful disposable runner product-QA trial, run npm run eval:runner-feature-readiness -- /path/to/retained/fixture/state using its printed store path. This developer control reopens actual earlier evidence without models, Docker calls or new attempts. It substitutes the report locator and separately removes the original consumption binding during asynchronous inspection, requires refusal, restores the original bytes and checks identical readiness and journal. Use a disposable fixture: the fault injection retains report.json.feature-readiness-original beside its original report locator for recovery. It does not certify authenticated models or hosted effects. See [ADR-0165](../decisions/0165-current-whole-feature-product-input.md).

## Observe delegated feature acceptance

The internal acceptance adapter now combines complete current product readiness with the original grant's explicit acceptance delegation under intervention none. It captures one exact budgeted input and the original deadline before independent planner/challenger sessions, checks actual closed native outcomes, then reopens current product/input/decision proof. A rejection stays blocked even with passing QA. Missing original inputs stay unknown; recovery never reconstructs a different input or repeats judgment. The bounded artifact contains current criteria and the complete product report; evidence over its 256-KiB limit is refused intact. This adapter records no human approval and performs no publication.

Run npm run eval:runner-assembly-readiness -- --acceptance --retire-success for the actual disposable Git/Docker and synthetic native decision composition. Substitute --acceptance-reject to observe independent rejection after passing product QA. Both modes use an explicitly delegated fixture grant, retain the original acceptance window, test lost-input refusal/restoration without new native calls and retire both exact environments. Synthetic normalized host flags establish neither real-model nor account/containment certification.

Use npm run eval:runner-feature-readiness -- /path/to/retained/fixture/state --acceptance for a separate controller's metadata recovery of that fixture after pause/retirement. Its execution selectors deny all work. It also substitutes a candidate while retaining the current evidence field and separately moves the acceptance input locator aside, requires unknown, restores the exact original and checks the same decision/native evidence and journal. These developer fault controls require a disposable fixture and retain original files for recovery. Current eligibility is withdrawn on revocation, while the original private cancellation channels remain usable. Supervised/manual acceptance and full public-route/endpoint composition remain separate technical work. See [ADR-0166](../decisions/0166-owned-delegated-feature-acceptance.md).

## Observe a current local handoff endpoint

The internal local-handoff adapter now requires the latest actual acceptance verdict and its exact accepted product, then captures one budgeted report through registered core metadata work. Its source and repository topics remain tied to original input, runtime and completion time. Inspection and endpoint observation reopen current acceptance and the exact report; a missing locator, changed candidate or passed flag alone cannot establish code-ready. Core PID fields are descriptive and never cancellation targets. The adapter adds no model session, human approval or publication and cannot substitute local delivery for a to-pr or to-merge request.

Run npm run eval:runner-assembly-readiness -- --handoff --retire-success to compose the disposable application QA, synthetic independent acceptance and owned-core local report. The control checks the current code-ready endpoint, refuses report loss and changed candidate bytes, restores identical proof/journal and retires the exact original environments. Use npm run eval:runner-feature-readiness -- /path/to/retained/fixture/state --handoff for a fresh controller's metadata recovery with denying selectors after pause/retirement. These developer fault controls use disposable fixtures and retain originals for restoration. Actual model certification, hosted endpoints and the complete public route remain separate. See [ADR-0167](../decisions/0167-owned-local-handoff-endpoints.md).

## Dispatch original stages through fixed domains

The internal stage dispatcher connects installed domain adapters from the same store through a closed copied registry. It resolves each stage kind from its original issued invocation and immutable plan revision, then checks the exact context, signal, deadline and ownership before execution. Caller-supplied kinds, structural hosts, foreign stores and unsupported research/publication cannot select another domain. Only integration accepts an explicit controller-selected product request. Inspection selects no new work, and cancellation retains each original adapter's private channel after authority is revoked.

Run npm run eval:runner-assembly-readiness -- --dispatcher --retire-success to exercise original product QA, independent synthetic acceptance and local handoff through fixed dispatch. The mode retires the exact completed unit environment before initially dispatching integration, preserving daemon capacity and the original 120-second window from before assembly. Its assembly-mutation/readback controls run after product execution, matching the API/browser modes, so fault injection does not consume the original live window. It preserves every handoff control and original deadline; expired preparation is refused rather than renewed. Registration coverage alone establishes neither runtime capability nor public complete-route availability. Native configuration, public foreground composition, supervised acceptance, repair continuation, research and hosted endpoints remain technical work. See [ADR-0168](../decisions/0168-fixed-original-domain-stage-dispatch.md).

The dispatcher is also a complete foreground runner host. Its preflight is static and effect-free: it binds the request's identity, current plan and exact derived route, requires a fixed product input for every integration milestone and an adapter for every stage, and reports a person required for supervised or on-exception plans. Only a fully covered none-policy route is available with interactive tools disabled. Native runtime proof and Docker availability remain observed per stage. See [ADR-0176](../decisions/0176-static-fixed-dispatch-route-preflight.md).

## Record a person's decision on a supervised route

Supervised and on-exception routes keep people at their decision points. When the plan, build-plan and acceptance adapters are configured with recorded human decisions, the build-plan and acceptance stages publish the exact subject a person must judge: the produced builder plan or the current whole product. The plan stage passes only an exact-plan grant, which already names the plan; envelope-derived plans stay refused until derived-plan authority accepts recorded human decisions ([ADR-0181](../decisions/0181-supervised-plans-require-exact-grants.md)). The stage reports pending and the run waits for input; nothing prompts. Record the decision with the operator command, naming the subject digest from the stage's request:

```bash
wl delivery human-decide --digest <request> --stage acceptance --decision acceptance --subject <sha256> --outcome accept --operator "Your Name" --note "Ran the exact product locally"
```

A different subject, a none-policy run or a conflicting second decision refuses. Reconcile then observes the stage, resume returns the same run to the queue, and the local handoff accepts the recorded human acceptance of that exact product. Run npm run eval:runner-assembly-readiness -- --human-acceptance --retire-success for the Docker composition through code-ready. See [ADR-0178](../decisions/0178-recorded-human-decisions-for-supervised-routes.md).

<!-- docnav -->
[◀ Integrated milestone candidates](delivery-integration-candidates.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Original delivery evaluation fixtures ▶](delivery-evaluation-fixtures.md)
