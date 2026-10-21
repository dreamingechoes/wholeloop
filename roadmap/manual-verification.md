# Manual verification — current implementation

> Automated results and pending work are separate. A checked roadmap task means
> its local acceptance checks passed, not that every target CLI or platform has
> been exercised. Updated 2026-10-21.

## Remote rollout bridge (P4-05 component)

- [ ] In a disposable PostHog project, verify the dashboard bridge's exact organization/project/timezone precondition, original HogQL filters placeholder, pinned day window and actual table rendering. Confirm current-version support for the documented but deprecated dashboards write field during insight creation and non-deprecated attachment readback. Verify null overrides, server normalization, one active tile, permission failures and partial dashboard/insight outcomes. Inspect retained pending references before any further action; no cleanup/retry is automatic. Current HTTP tests are synthetic; no actual create, query, rendering, traffic or Linux acceptance is established.

- [ ] In a disposable Grafana 12+ deployment, review the exact completed metric/source query and bridge folder/namespace/Prometheus datasource/new dashboard UID. Preview launch dispatch, authorize only a deliberate create/read, and compare actual stored/rendered chart, unit/target description and window/timezone. Confirm existing UID conflicts, strict readback (including server-added defaults), permission/PromQL failures and lost-response behavior. Inspect retained intent/partial creation before any further action; there is no overwrite/delete/retry path. Current API responses are synthetic; no actual creation, query validity, rendering, traffic or Linux acceptance is established.

- [ ] In a disposable PostHog project, review the explicit project/environment mapping, preview both read stages and authorize read-only credentials. Compare simple decimal/zero/full/inactive person rollout with the real console/SDK; confirm exact-case unique lookup and unchanged detail identity. Verify pagination, targeting, experiments, runtime restrictions, evaluation contexts, variants, continuity, holdouts and unsupported controls remain unknown. Check the configured mapping is labelled explicitly and never accepted as API-observed deployment scope. Current HTTP evidence is synthetic; actual service/native/Linux acceptance remains open.

- [ ] In a disposable GrowthBook project, verify the explicit reader uses the published revision and live environment controls despite contradictory drafts. Compare default/force/forward/reverse/zero/full state, JSON boolean handling, project scope, compiled definitions and decimal percentages against the actual management API/SDK. Confirm hashed cohorts are labelled contexts with id and cannot satisfy all-context ramp claims; check missing-ID fallback behavior separately. Current responses are synthetic; actual credentials/API/native/Linux acceptance remains open.

- [ ] Run development checks on supported development Node versions and repeat built-CLI/provider runtime scenarios across supported Node/platform versions. Actual Node 20.0.0 macOS arm64 passes only the compiled flag preview and synthetic signal-bearing host subset; Node 24 unit tests cover success/cancellation listener cleanup. Linux, complete Node 20 behavior and actual native/server acceptance remain unverified.

- [ ] In a disposable Unleash project, configure the explicit Admin reader and authorize a read with the exact deployment/subpath/project/environment. Compare default and default-stickiness percentage/disabled state with the native console, verify environment variants are fetched, and inspect dependency/targeted/union/release-plan/safeguard refusal. Current tests use synthetic responses and source API contracts; actual authentication/version/native/Linux behavior remains unverified.

- [ ] Configure the explicit LaunchDarkly reader with a restricted REST token from the credential store and exact project/environment. Review the default plan, then authorize a live read only in a disposable test project. Confirm complete simple boolean/direct/weighted/reversed/off configurations match actual native state, no credential/raw targeting prose appears in output and no flag changes. Current HTTP tests are synthetic, not authenticated captures.
- [ ] Verify rules, prerequisites, targets, experiments, custom buckets, incomplete responses, missing permissions and deadline failures stay unknown. Feed only the exact normalized result into its matching ramp request fingerprint and retain actual completion time. Repeat actual API/native/Linux behavior; remote dashboard bridges remain code work.

## Explicit conformance collection (P5-04 component)

- [ ] Review the disabled nightly workflow and its [activation guide](../docs/contributing/conformance.md). Configure intended conformance/conformance-issues environment protection and native secrets, then explicitly enable collection only after checking access/model costs. Confirm source/core/artifact IDs/digests, separate selected key steps and no native upload of homes/journals/raw logs. Current tests parse YAML and simulate transports; they do not execute Actions.
- [ ] Dispatch the reviewed default-branch workflow against actual clients on Linux. Confirm missing credentials/model selection stay unconfigured/UNRUN; verify native authentication-mode settings, fresh per-channel homes, actual version/permission behavior, external owned-page artifacts and unchanged source. Review drafts before separately enabling issue delivery and test actual closed-marker/partial-outcome behavior in a disposable repository.

- [ ] On actual macOS and glibc Linux hosts, review test/conformance/pins.json and the printed native acquisition plan; install into a new absolute external prefix. Confirm exact package/native versions, private npm/config/cache paths, archive checksums/modes and no personal configuration changes. Cursor's digest is observed only. No actual native installation/model support follows from fake npm transports or logical platform mappings.
- [ ] Interrupt native acquisition after one completed client/channel and inspect the retained failed receipt/prefix without automatic retries. Confirm the collector probes exact versions again before scenarios; vendor self-updates and transitive/postinstall downloads are not frozen by the top-level acquisition pin.

- [ ] Review structural issue drafts from actual fresh comparable observations. Confirm exact versions/assertions, original timestamps and stable markers, with no raw native output, draft contents or journal paths. Simulation/stale/authentication/launch failures must produce no regression issue.
- [ ] In an owner-controlled disposable GitHub repository, preview the complete open/closed marker inventory, then explicitly authorize CI delivery. Verify intact closed markers suppress repeats, incomplete pagination/current-core/input checks prevent writes, stdin preserves body newlines, and partial failures retain actual outcomes. Serialize writers and inspect remote effects before retrying; all current service tests use local fake executables.
- [ ] Provision isolated pinned/latest native binaries and exact resolved versions for the intended host. Run only after native trust/auth/permissions setup; confirm selected paths and version probes cannot silently reuse a global channel. Current local tests use synthetic clients/simulation only.
- [ ] Repeat a live batch on macOS/Linux/supported Node versions; inspect journal verdicts, crashes, timeout/cancellation, native updater behavior and external effects. Feed actual timestamped results to the matrix without relabelling simulations or refreshing observation dates.
- [ ] Verify result artifacts expose structural IDs/versions/assertions but no journal paths, draft contents, raw stdout or credentials. Inspect interrupted external state before preparing a fresh run. Host resolution/acquisition is implemented locally; owner activation and actual native/service issue checks remain separate.

## Coinstalled entrypoints and slot guidance (P1-07/P1-13 regression)

- [ ] Upgrade unchanged owned older native output, then restart the intended clients. Confirm wholeloop skills/roles remain discoverable but do not compete as heuristic frame.template or review.rubric guidance. Routing markers are not native-loader or permission evidence.
- [ ] Add a genuine repository guide and verify it wins. Add two equally explicit guides and verify the real choice is still asked. Existing configured bindings remain owner choices, including deliberate bindings to marked entrypoints.
- [ ] Repeat multi-client user/project framing and cache invalidation on Linux and supported Node/client versions. Current real core regression coverage runs on macOS arm64/Node 24; actual native model execution remains separate.

## Gemini adapter, overlays and conformance (P5-01 component)

- [ ] Exercise the new Gemini headless observer in a disposable native setup. Confirm the generated private core read-tool registry, disabled alternate surfaces and both built-in delegators, successful final JSON and exact assignment envelope. Actual 0.27.0 metadata/config/registry probes are model-free; no real headless model pass is claimed.
- [ ] Confirm an existing default or explicit managed system policy blocks launch; preserve its bytes and native authentication/trust/model. Verify original/custom absolute system-defaults paths remain selected and the worker never auto-trusts its directory. Repeat configuration merging, inherited include roots and external/log/update effects on Linux/current client versions.
- [ ] Review generated gemini-extension.json and native overlays, then load/link/install only in disposable native configurations. Enable preview subagents through explicit native setup, verify all seventeen skills/eight agents and actual invocation, and confirm inheritance/precedence. Actual 0.27.0 static loaders passed; that is not a model/runtime permission check.
- [ ] Verify observer tool isolation, no shell/write/memory/MCP/delegation route, sequential main-session handoffs, inherited models and exact plain-text questions when ask is unavailable. Repeat against the intended current version; 0.27.0 uses search_file_content while newer documentation also names grep_search.
- [ ] Exercise user/project install/uninstall, absolute GEMINI_CLI_HOME, external ownership/backups, relocation and special paths. --target all now includes Gemini; default doctor stays tier A, so select --target gemini explicitly.
- [ ] Run the shared framing scenario with a new --target gemini run and exact --pin, then explicit --live after native trust/auth/permissions setup. Keep FIXTURE_PASS separate from actual process/journal evidence and inspect native external/ignored effects.
- [ ] Review unapplied HTTP/stdio MCP snippets, exact live tools/arguments, OAuth discovery and header placeholders under the native credential store. Static detection observes declaration metadata only; no authenticated tool ran.
- [ ] Activate the generated extension explicitly and verify its BeforeTool hook environment binding, exact target/core checks, read allow and runtime-write/push denial. Actual 0.27.0 loader/runner APIs passed a disposable shell-special-path probe without models; full native activation and permission behavior remain unverified. Loose overlays retain the per-repository Git fallback and never rewrite shared settings.
- [ ] Repeat on Linux and supported Node/client versions. Current generator/launcher/static-loader execution is macOS arm64/Node 24/Gemini 0.27.0 only.

## Antigravity native activation (P5-01 component)

- [ ] Verify the conditional headless observer in a disposable real native setup: unique primary read-only agent, scoped hook, inherited model/auth and native sandbox. Confirm a read-only init is emitted before any assignment under request-review/strict permissions. Actual AGY 1.4.2 startup ordering is unverified; a client waiting for input first must remain unavailable, without a probe prompt or bypass.
- [ ] Inspect initial tool names/cwd, strict final JSONL conversation/one-turn success, native hook activation and external/startup effects. A broad/malformed/missing init must receive no assignment, and failed/timeout/cancelled workers must not count as refutations. Current proof uses local synthetic processes and authored hook payloads only; repeat on Linux/native versions.
- [ ] Load the generated plugin or owned overlays in disposable agy configuration. Confirm seventeen wl-agy- skills/eight agents, Codex coexistence, inherited models, observer tools/off execution policy, writer sandbox and sequential role handoffs. agy 1.4.2 version/help ran; listing could not bind a local port in this sandbox, so no native loader pass is claimed.
- [ ] Confirm native named hooks fire with toolCall/workspacePaths and that allow preserves subsequent/default policy. Exercise denied repository runtime writes, guarded commits/pushes, changed core, missing/multiple workspaces and relocated special paths. Authored transport tests call the actual core but do not prove native activation or policy semantics.
- [ ] Repeat user/project install/uninstall and shared project hooks.json refusal. Preserve personal hook maps; inspect standalone plugin delivery when the shared slot is occupied. User core/resources and ownership stay in the external store.
- [ ] Prepare a fresh --target antigravity run with exact --pin, inspect input.txt JSONL and the agy recipe, then explicitly run --live after native trust/auth/model/permissions setup. Inspect actual output protocol and external effects independently of the structural journal verdict.
- [ ] Review serverUrl/stdio MCP recipes and native OAuth/tool execution. Header recipes are refused; no credential is copied or rendered. Repeat on Linux and supported Node/client versions.

Both local hook transports are implemented. Actual Gemini/Antigravity activation,
model, permission and MCP checks do not block other roadmap code.

## Cursor native activation (P5-02)

- [ ] Load generated native plugins or owned overlays in disposable client configuration. Verify seventeen skills/eight roles, native manifest precedence over the portable skills-only manifest, inherited models, foreground handoffs and readonly observers. Version/help and pure hook validators are metadata/contract evidence, not actual model/role isolation.
- [ ] Verify preToolUse activation, empty responses preserving native permissions, failClosed behavior, denied runtime Write/Delete and guarded Shell mutations. Test working_directory, multiple roots, missing/changed core and relocated special paths. Inspect actual MCP/provider behavior under readonly before assuming isolation.
- [ ] Repeat user/project install/uninstall and preserve unrelated rules. Existing shared hooks.json must be refused before any selected client writes. Standalone plugins require explicit absolute CURSOR_PLUGIN_ROOT environment data; managed overlays bind their owned core without root substitution into shell text.
- [ ] Prepare a fresh --target cursor run with the exact observed calendar pin, then explicitly run --live after native trust/auth/model setup. Inspect native output/external effects separately from structural journal verdicts. Synthetic agent stdin/calendar tests and installed-core simulation do not prove native conformance.
- [ ] Review unapplied URL/stdio MCP snippets and environment references, then verify native OAuth/actual tools through the client's credential store. No token is expanded/copied by rendering or detection. Repeat on Linux and supported Node/client versions.

## Local distribution preview and publication (P5-05)

- [ ] After explicit visibility/package ownership/version decisions, configure and verify the protected release environment and exact npm trusted publisher. Dispatch preparation only first; inspect the immutable artifact, exact range/notes, npm archive and native tar hidden files/modes. Current actual package stays private 0.0.0.
- [ ] Repeat bundle verification on Linux/supported Node versions and inspect an actual GitHub-hosted preparation run. Verify artifact ID/digest mismatch refusal and review the exact concrete bytes before explicit publish activation; no rebuild may follow approval.
- [ ] Run owner-authorized OIDC publication and verify actual npm provenance, source/tag SHA, stable/prerelease labels, GitHub assets and native download/install. Test partial failure/reconciliation in an owner-controlled disposable publication project; never blindly retry or overwrite an existing release/tag/version. Local logging transports are simulation only.
- [ ] Register the exported relative marketplace in an isolated real Claude configuration, install wholeloop@wholeloop and confirm all seventeen skills/eight agents, copied core and hook activation after moving the delivery tree. Native strict validation passed locally; it is not installation/discovery.
- [ ] Test each exported native target with its real client and credential store. Repeat owned output/backup/unknown-file/dry-run/relocation checks on Linux and supported Node/client versions; current automated execution is macOS arm64 only.
- [ ] Choose public repository visibility and hosting explicitly, verify npm ownership and configure trusted publishing/provenance once release automation is implemented. The local exporter changes neither repository visibility nor package privacy and performs no publication.
- [ ] Run release preflight from the actual source checkout with the intended built/package/lock version and genuine CI repository/event context. Inspect blocked reasons and masked index flags without silently clearing personal setup. A ready local consistency plan is neither authenticated context nor permission to publish; actual ownership/OIDC/provenance and release activation remain separate.
- [ ] Record actual fresh-machine installation time and review release notes without attribution after delivery activation. Run the local release notes draft against the intended exact range, check actual breaking intent/migration guidance and inspect identity-only rejections. Repeat complete-clone/range/refusal behavior on Linux and supported Node releases; draft impact alone does not verify compatibility. Publication automation/provenance and optional compiled binaries remain code work.
- [ ] Repeat package:check on Linux and supported development Node/npm releases, plus installed-core runtime checks on Node 20. Inspect a retained interrupted/failed fixture before removal. Local offline npm 11.8.0 packaging/install/bin-links/managed-file checks passed on macOS arm64/Node 24.1.0 with private true; native activation and fresh-machine timing remain separate.

These owner checks do not block remaining release tooling or other roadmap implementation.

## Generated references (P5-06 local controls)

- [ ] After changing source contracts, rebuild before running docs check. Follow the chosen client onboarding section and keep the selected absolute core path when changing projects; native file installation does not create a global alias. Confirm command/config/provider/adapter sections describe that build, not an older executable on PATH.
- [ ] On Linux and supported Node releases, repeat read-only drift detection, explicit selective/full regeneration, malformed-marker refusal and preservation of surrounding prose. Current compiled execution is macOS arm64/Node 24 only.
- [ ] If regeneration is interrupted during writes, inspect the affected pages/markers before rerunning. All selected markers are preflighted, but filesystem failures do not provide multi-file crash atomicity.

The generated provider and adapter tables record declarations only. Check that
local engine changes retain unverified native status. Native capability-matrix
collection/version resolution/issue automation remain P5-04 implementation work.
The local P5-06 references/banner/onboarding deliverables are complete; real native
discovery, activation, permissions and first-step checks remain in the client
sections above. Overview pages retain native/host verification boundaries.

## Public contracts and v1 candidate (P5-07 component)

- [ ] On a disposable external copy of an older store, repeat gate/suite reads and projection rebuild after upgrade. Root schema metadata/wrappers must not rewrite journal envelopes or change payload acceptance. Exact prior rule hashes and local replay tests passed; physical upgrade/Linux/other supported Node execution remain owner checks.
- [ ] Review the v1 candidate's schema/step/command/exit boundaries against actual supported workflows and release-note breaking intent. Repeat declaration checks on Linux/supported development Node versions and installed-core checks on supported runtime Node versions. Fingerprints flag changes without proving runtime semantics; no current surface is deprecated and actual release/tag/announcement remains unperformed.

## Disposable standalone framing conformance (P1-14)

- [ ] Build, then prepare one fresh run per actual tier-A client with --target and its exact --pin version. Inspect returned fixture/prompt/native recipe and executable resolution; a version token alone is not binary provenance. Retain source/scenario/core hashes.
- [ ] Arrange native trust, auth/model selection and external-state permissions without modifying the fixture baseline. Invoke `conformance run <id> --live --json`, inspect process/journal/artifact results and record each actual result. Native customizations remain enabled; no permission bypass or credential copy is performed. Client startup files may trigger an explicit workspace-change failure.
- [ ] Confirm the real installed skill supplies the random note marker, creates one owned standalone initiative, completes framing with a go receipt and stops before write-spec. A marker proves instruction consumption, not an adversarial loader attestation; review narrative evidence/challenge quality separately.
- [ ] Exercise actual timeouts, cancellation and native failures; the report must name CLI, step and missing events without retaining stdout/stderr. Interrupted/failed fixtures cannot be retried or relabelled. Inspect retained evidence and prepare a new run.
- [ ] Inspect native logs, ambient plugins/compatible user skills, ignored files, Git metadata, external writes and any remote effects. This structural scenario does not validate native JSON protocol, read-only role isolation, hook activation or the broader P0-03 matrix.
- [ ] Repeat on Linux and supported Node versions before claiming portability. Current simulation/compiled-runner execution is macOS arm64/Node 24.

Automated tier-A/Gemini/Antigravity/Cursor installed-launcher simulations report FIXTURE_PASS, never a
native conformance PASS. Preparation launches no model; --live is an explicit
owner action that can use authenticated models and incur cost. Actual model runs
remain unexecuted here and do not block further implementation.

## Native installation and observed diagnostics (P1-13)

- [ ] Run native user/project install/uninstall with explicit targets in disposable client configurations. Verify all seventeen wl-prefixed skills/eight roles, native discovery, restart/trust behavior, permission inheritance and compatibility precedence. Filesystem/transport fixtures do not establish actual client activation.
- [ ] Verify source-installed Claude scoped skill/agent hooks, Copilot dedicated user/project hooks, OpenCode helper import and Codex per-repository Git fallback. Generated plugins are a separate delivery format; no shared settings/MCP/auth store is rewritten.
- [ ] Repeat project relocation and user config overrides, including URL/shell-special paths. Inspect ownership receipts in the external store, backups of replaced/removed bytes, edited/unowned refusal and missing-file uninstall; no automatic adoption/force option exists.
- [ ] Interrupt actual installs/upgrades/uninstalls, inspect the pending receipt/lock and recover all pending targets together only after confirming the writer stopped. Synthetic mixed-version recovery is not physical-crash evidence; unknown staging files or edited backups need manual preservation/inspection.
- [ ] Run doctor with the actual installed clients and explicit artifact directories. Confirm each reported token comes from the intended executable/PATH and inspect vendor requirements separately; a version does not prove native skills, hooks, permissions or authentication.
- [ ] On each platform, exercise selected missing clients, failed/slow version commands, stale/copied artifact hashes/modes and malformed declarations. Failures must offer instructions and repair/diagnostic argv without exposing raw output or config values.
- [ ] Verify the atomic external-store probe and cleanup under real permissions/filesystems, including inaccessible and symlinked Git destinations. Inspect any failed cleanup; retain other state and do not repair permissions automatically.
- [ ] Repeat on Linux and supported Node releases. Current automated execution is macOS arm64/Node 24; npm recipes for current Claude/Copilot require Node 22 or newer even though the bundled core supports Node 20.

Native install/uninstall and managed doctor inspection are implemented. Actual
activation and corrective commands requiring the owner's platform/configuration
choices remain verification. Those checks do not block independent conformance code.

## Common guards and Git fallback (P3-08)

- [ ] Capture actual before-tool events on Claude/Copilot/OpenCode; compare schema, tool names, cwd, write paths and event ordering with the authored fixtures. The Codex-shaped SDK fixture is synthetic; verify its actual CLI Git fallback instead of treating desktop hooks as CLI support.
- [ ] In disposable clients, try wrong-checkout/default-branch Build commits with the returned WL_SUBJECT environment, extra/deleted/stale push refs and reserved runtime writes. Normal native reads/permissions must retain their ordinary behavior; synthetic transport tests do not establish client enforcement.
- [ ] Exercise inner/outer timeouts, inaccessible stores, managed policies and disabled hooks. Copilot outer hook timeouts can fail open; retain Git fallbacks and inspect real sandbox access to the external store.
- [ ] Inspect existing hooks before an explicit guard hooks install on a disposable project. Verify original execution/exit codes and changed-file/config refusal; uninstall must restore only prior local configuration and retain the returned backup. Relative/multiple effective and worktree-specific hook paths need manual chaining.
- [ ] Recover a physical interruption by inspecting the external ownership receipt/lock and current Git configuration. Do not delete prepared/changed files or steal locks. Reinstall after reviewing new original hook names or upgrading the pinned core.
- [ ] Repeat actual Git-hook chaining, local bare SSH-shaped pushes, native root expansion, symlinks and timing fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64/Node 24 only.

Native installation returns explicit per-repository Git activation/removal commands.
No hooks were installed in this repository, no actual project push ran and no model
session was executed by these synthetic/temporary tests.

## Additional tier-A artifacts (P1-11)

- [ ] Load generated Codex/Copilot portable skill packages and install the appropriate native agent overlays, including Codex project/user TOML agents. Verify all seventeen prefixed skills/eight agents and their actual invocation; a portable skill package does not prove Codex agent discovery.
- [ ] In actual clients, verify loaded skill-directory reporting, launcher execution, checked artifact roots and conductor handoff after relocation and symlinked installation. Missing context must ask rather than selecting another wl on PATH.
- [ ] Exercise disposable read-only sentinels and actual command/provider handoffs. Codex custom agents inherit the parent sandbox; verify the checked read-only parent/headless path rather than trusting instructions or an unsupported per-role sandbox override.
- [ ] Inspect OpenCode/Copilot native permission behavior, inherited repository instructions and native external-directory asks. Static mappings and partial/native listings do not prove runtime enforcement, complete isolation or independent workers.
- [ ] Repeat native discovery, launcher/symlink, permission and copied-runtime fixtures on Linux and supported Node versions.

Native guard bindings and the Codex Git fallback are implemented. Native/headless
model conformance remains pending and does not block independent installation work.

## Generated Claude artifacts (P1-10)

- [ ] Install a generated plugin in an isolated real client configuration, list all seventeen skills/eight agents and invoke a unique marker. Static plugin validate passed locally; it does not establish discovery or execution.
- [ ] Confirm plugin-root substitution and conductor root handoff select the copied core in paths with spaces, including after moving the artifact tree away from the source checkout.
- [ ] Exercise read-only roles against a disposable sentinel, including roles with shell access and managed policy. Confirm model tier aliases and batched missing-context questions; no independent model session has been run.
- [ ] Repeat owned output, backup/mode/symlink and bundled runtime fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64 only.

Native hook registration and the other tier-A renderers are implemented; actual
hook capture and installed-client behavior remain owner checks.

## Conformance matrix and nightly activation (P5-04)

- [ ] After explicit native runs, wrap their exact reports with pinned/latest channel and actual observedAt timestamps. Compare the matrix with the original external reports, including actual client versions, core/source/scenario bindings and named assertions. Imported reports are not authenticated by the renderer.
- [ ] Independently diagnose model/authentication/managed-policy failures. A successful framing process with missing journal assertions is a structural failure; it is not evidence that every native capability regressed.
- [ ] Compare/write the observation page against the original external reports with explicit --docs/--at and optional --write. Verify original dates, stale/simulation distinctions, source privacy and unchanged prose. Repeat refusal/idempotency on Linux and supported Node releases; inspect interrupted writes before regenerating.
- [ ] Confirm scheduled collection, latest-version resolution, service credentials and issue permissions/deduplication once their code is implemented. Current local matrix/page tests do not exercise CI or send issues.
- [ ] Repeat CLI/read-boundary and timestamp fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64 only.

These owner checks do not block remaining collection, automation or documentation code.

## Headless gate processes (P5-03)

- [ ] Execute one pinned review and verification round with actual native, headless and sequential workers. Compare coverage/quorum/verdict, independently inspect evidence quality and record exact client versions. Synthetic parity tests do not establish real model equivalence.
- [ ] On actual Claude/Codex clients, verify stdin/final-result normalization, no reused conversation, read-only tool/sandbox enforcement, disabled MCP/customization and non-interactive denial. Inspect managed policies/hooks and client-owned logs; current help probes are not a live pass.
- [ ] Interrupt real clients and confirm owned descendants stop, incomplete workers remain unknown and no failed refuter adds a vote. Recover a physical-crash lock only after inspecting owner.json and confirming its process stopped.
- [ ] Inspect ignored/transient-restored files and external side effects; repository snapshots cannot prove their absence. Confirm authentication uses the client's credential store without plaintext copies.
- [ ] Repeat process-group, timing, permission and worker fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64 only.

OpenCode/Copilot recipes have local fixture coverage. Verify OpenCode native
deny-default agent permissions, external-directory containment, completed-message
JSONL and inherited managed configuration. Verify Copilot stdin/silent output,
read-only available-tool filtering and non-interactive refusal without broad
grants. Inspect custom MCP startup and trusted-folder hooks independently: tool
restrictions do not prove that these startup effects are disabled. Keep credential
stores in place; no copied tokens or permission bypasses are needed.
Verify Cursor Ask/sandbox plus actual worker-local cli.json/hooks.json discovery,
read/search-only hook activation, native denial precedence, no reused session and
successful final JSON. Exercise shell, write/delete, web, MCP, unknown tools and
missing Node against disposable sentinels; inspect native startup effects and logs.
Gemini/Antigravity recipes remain code work. None of these owner checks
blocks independent local roadmap work.

## URL adoption and shared publication (P2-08)

- [ ] In each real client, adopt one actual docs URL and one tracker item using authenticated complete revision-bound reads. Confirm URL variants reuse one initiative, unresolved owner/title questions appear together, and imports fabricate no approval or completed Define step.
- [ ] Select explicit sandbox destinations, switch to shared and publish existing artifacts through the conductor. Complete each Define step and verify its outbox is consumed; a bare CLI completion queues without an authenticated writer.
- [ ] Confirm the real provider's conditional revision semantics preserve unrelated/concurrent edits and its complete read normalizes the exact published chunk. CLI imported observations are labelled imports, not proof of a live tool call.
- [ ] Interrupt after a remote create/update and before its response/receipt. Locate and read the resource, reconcile once, and confirm no client blindly retries the write. Local mode pauses new requests but cannot revoke already handed-off work.
- [ ] Resume/rebuild from another real CLI, inspect pinned destinations and sharing/outbox projections outside the repository, and repeat local fixtures on Linux and supported Node versions.

These owner checks do not block independent local implementation.

## Grounding corpus and real workers (P4-07)

- [ ] Review every original dataset label and trap reason independently; verify source/unit/query/window semantics before treating the seed as representative.
- [ ] Export blind inputs and isolate real workers from labels, this guide, the corpus and baseline. Collect complete digest-bound predictions and preserve actual model/client/query execution records separately; provenance metadata alone proves nothing.
- [ ] Score the exact seed and inspect every failed or missing assertion, including real zero, wrong sources/units and absent metrics. Compare real worker results with prior real worker results, not the synthetic core baseline as model-quality evidence.
- [ ] Evaluate research/framing prose, launch/decision narrative and qualitative statistics separately. This seed covers structured ramp/impact numeric collectors only and explicitly lists the other steps as unevaluated.
- [ ] Add real escaped failures with reviewed original fixtures and calibrate meaningful workload thresholds. The twenty-case seed establishes no population rate or causal production effect.

These checks do not block subsequent independent local implementation.

## sync and actual service agreement (P4-06)

- [ ] Authenticate code-host reads in disposable GitHub/GitLab projects and verify complete exact PR/head/base/repository/commit identity across normal, closed-unmerged, rebased and squash-merged outcomes. Imported fixture observations do not prove those remote facts.
- [ ] Bind actual tracker providers/references/state IDs through the SDK host. Verify complete revision-bound read, conditional transition and observed final state, including provider permission errors and concurrent human edits. The CLI has no authenticated tracker executor.
- [ ] Interrupt after tracker transition and reconcile by reads without repeating writes. Verify manually reopened tracker/local work is retained and old publication plans cannot re-close it.
- [ ] Schedule sync with explicit repository/store context. Inspect unbound tracker handoffs and unknown reads rather than treating exit success as proof of every service's health.
- [ ] Stop worktree leases deliberately, inspect processes/ignored files and confirm local integration before cleanup. Remote squash/rebase merges may be retained by the ancestry guard; sync never fetches, stops processes, forces removal or deletes branches.
- [ ] Repeat real Git/CLI cleanup and recovery checks on Linux/supported Node versions. Local tests use synthetic providers plus temporary real Git worktrees on macOS/Node 24; no actual wholeloop worktree or remote service was changed.

These checks do not block subsequent local grounding work.

## Rollout providers and remaining bridges (P4-05)

- [ ] Compare the implemented LaunchDarkly/Unleash/GrowthBook/PostHog REST readers against authenticated disposable-service captures and exact supported versions. Current HTTP fixtures are synthetic, not owner acceptance. Verify scope/cohort semantics and preserve unknown for complex targeting or missing access; PostHog environment scope is explicitly owner-configured, not API-observed.
- [ ] Capture actual dashboard-write tool schemas/permissions and target data-source requirements for PostHog/Mixpanel/Amplitude/Metabase/Grafana. Grafana now has an explicit create-only/readback bridge; Mixpanel/Amplitude/Metabase bridges remain code work. PostHog has explicit project-check/create/readback and inspectable partial receipts. Default local output remains a pending exact-metric handoff with createdRemotely=false, not a remote chart.
- [ ] Capture real MCP rosters/arguments, project/site/datasource IDs and permissions for Datadog/Grafana/Figma. Offline binding fixtures use synthetic normalized results and establish no remote compatibility.
- [ ] Pull/verify the pinned Grafana container and read-only categories on supported platforms; pass credentials from the host store, never literal secret arguments or plaintext config. No container was pulled or run locally.
- [ ] Review and manually post destination-labelled Slack/Teams/email drafts. Confirm no sending capability is present. Review/apply flag proposals externally; native proposal results are explicitly unapplied.
- [ ] Exercise config-file reads/proposals and external-store conflict/idempotency on Linux and supported Node versions. The native reader requires explicit flag/environment/enabled/exposure/audience and never changes repository bytes.

P4-05 remains partial. These bridge tasks do not block independent sync/grounding implementation.

## decide-next and actual follow-up (P4-04)

- [ ] Run the challenger in each real client with supportive/balanced/adversarial profiles. Inspect actual opposing reasoning, all four coverage areas, question budgets and loaded learn.decision guidance. Fixture labels do not establish semantic critique or model independence.
- [ ] Inspect actual checkpoint query/cohort truth and self-reported references, all unknowns and pending checkpoints before the human outcome. The core checks identity and coverage, not causality or the honesty of supplied person/reason fields.
- [ ] Verify iteration drafts carry the exact evidence and unresolved validation/cost/stop questions. Complete frame-problem explicitly; reopened pre-spec ideas must retain prior history without reusing developed scope approvals.
- [ ] Review proposed flag/code cleanup and implement or publish it through an explicitly authorized follow-up. Keep/kill/unflag change no actual flag or code, and local proposals are not remote tracker tasks.
- [ ] Interrupt around decision persistence and canonical closure, then recover with learn complete. Verify one iteration/decision, no premature parent closure, and reopened-scope eligibility. Automated recovery rebuilds a real journal prefix; it does not simulate physical power loss.
- [ ] Repeat CLI/process and canonical path checks on Linux/supported Node versions. Local verification uses macOS/Node 24 and synthetic challenger responses; no model, authenticated publication or production change ran.

These checks do not block subsequent local implementation.

## measure-impact and real grounding (P4-03)

- [ ] Execute pinned queries against disposable real sources; inspect event/cohort definitions, units, source references, timezones and complete rolling windows. Normalized fixtures establish arithmetic, not provider truth or causality.
- [ ] Verify actual launch anchors and configured checkpoint offsets, including custom names and late execution. Inspect due dates in status/next and source ownership for scopes cut from earlier specs.
- [ ] Run read-only analysts in actual clients and verify source isolation, loaded learn.report guidance and complete layouts. Inspect quotes for sensitive material and numeric assertions; source text is not a verified metric.
- [ ] Review actual unknown reasons with owners and preserve genuine zero values. Test permissions, absent metrics, malformed responses and unit mismatches without invented estimates.
- [ ] Authenticate comms.draft and docs providers in disposable destinations. Confirm unsent drafts, fresh complete document reads, exact revision updates, preserved unrelated content and one marker-bound appended note. Native threaded/tracker comments need host-specific extensions.
- [ ] Interrupt publication, inspect the retained intent and actual remote outcome before any new write. Do not clear ambiguity or retry blindly.
- [ ] Repeat CLI/process checks on Linux and supported Node versions. Local workers/providers were synthetic on macOS/Node 24; no live query, draft or document write ran.

These checks do not block further local implementation.

## ramp-exposure and actual exposure changes (P4-02)

- [ ] Authenticate source/flag providers in a disposable environment. Verify exact query semantics, units, timezones, complete windows and cohort ownership; normalized fixture numbers do not establish source correctness.
- [ ] Inspect real flags.propose-change permissions and responses: create only a proposal, explicitly applied=false. Verify no toggle/apply action is possible through the selected client/server. Known route checks cannot prove opaque tools safe.
- [ ] Exercise go/hold/rollback across real sessions and CLIs. Confirm person/reason/exact evidence, separate fresh flag reads, actual audience percentages and full windows after every confirmation or restored control. Inspect continuous control history externally; snapshots cannot prove stability between reads.
- [ ] Inspect retained intent after an interrupted proposal before further writes. Never clear ambiguity or retry blindly; reconcile the actual remote request manually.
- [ ] Verify manual-control attestations against actual external evidence and keep normalized response files sanitized, with no credentials or private logs. The core trusts explicit host observations.
- [ ] Repeat CLI/process checks on Linux and supported Node versions. Local tests use macOS/Node 24 and synthetic hosts; no actual flag or remote proposal was changed/created.

These checks do not block subsequent local implementation.

## prepare-launch and real no-send isolation (P4-01)

- [ ] Complete the adapter test for every target CLI once P1 adapters/conformance are available: inspect the launcher's actual tool set and prove sending tools are unavailable. Canonical read-only metadata and synthetic typed hosts do not satisfy this acceptance criterion.
- [ ] Validate actual repository voice/template use and scope-pinned measurement ownership with a real launcher. Inspect semantic correctness of drafts, stage/audience coverage and original metric queries/targets/windows.
- [ ] Authenticate draft/create providers in disposable projects and confirm actual remote unsent drafts, metric-linked dashboards and enablement docs. Known-route checks cannot prove opaque tool/server semantics; inspect real permissions and responses.
- [ ] Interrupt after remote creation, inspect the retained intent and actual remote artifact, and reconcile manually before any further write. There is no blind retry of an ambiguous/pending launch publication.
- [ ] Confirm actual merged work and current flag state before exposure. Preparing a kit deliberately does not claim either observation; no send or flag change was exercised locally.
- [ ] Run the relevant process/CLI checks on supported Linux/Node versions. Local execution remains macOS/Node 24; provider/launcher workers were synthetic.

The adapter criterion stays unchecked; it does not block dependent local rollout work.

## Gate evaluation and real model calibration (P3-10)

- [ ] Review each labelled contract, defect and look-alike with actual repository standards. These are original authored snippets, not executed production regressions; case-level finding presence does not prove finding-level semantic precision.
- [ ] Export blind --inputs, hide labels/reasons/descriptive files and collect real independent reviewers/refuters with stable opaque IDs. Preserve complete gate observations and actual host execution evidence separately; a recorded provenance string alone proves nothing.
- [ ] Score the exact corpus digest with before/after matrices, coverage and unknowns. Compare against a recorded model/host baseline, never against the synthetic arithmetic fixture as evidence of model quality.
- [ ] Add real escaped defects/look-alikes and calibrated custom-lens cases with explicit labels. Set justified regression thresholds for the intended workload; the small seed is not a population estimate.

These checks do not block further local workflows.

## Environment ledger and actual undo (P3-09)

- [ ] Declare actual process/container/data/service effects before hand-back. Verify each appears with complete non-secret undo argv/cwd in the Build/PR receipt and current env report, including shared ancestor and child-part effects.
- [ ] Exercise undo recipes on disposable resources using the supported platforms. The ledger tests deliberately do not execute undo, so no cleanup success is implied by a stored recipe.
- [ ] Inspect dependencies and current ownership before following reverse declaration order. Verify repeated cleanup is safe in the actual tool and preserve resources still in use.
- [ ] Keep credentials in encrypted, OS or tool stores. Common shape/flag exclusions are not a complete secret detector; inspect recipe files and resource identifiers before declaration.
- [ ] Confirm effects added during human testing appear in the current report while historical step receipts retain the ledger at their completion time.

These checks do not block subsequent local implementation.

## open-pr and code-host execution (P3-07)

- [ ] Authenticate gh/glab using their own credential stores and exercise explicit prepare → human test → open in a disposable remote project. Confirm exact source SHA, named base, draft status, no implicit fork and no ready/reviewer/merge action.
- [ ] Test a self-managed host/group path and remote permission failure. Fork heads, nonstandard SSH ports and multiple push destinations require an explicit host extension; they are not guessed.
- [ ] Interrupt after the push and after remote creation, inspect what exists, and reconcile the observed matching draft URL. A request with no remote PR remains an explicit owner recovery case; do not clear intent or retry blindly.
- [ ] Confirm real template/style use and complete manual-test notes in each client. New code or a changed plan must invalidate approval; a bare test-it answer must not publish.
- [ ] Verify actual tracker mirroring and sibling PR back-links through the chosen host, and inspect all external environment writes/undo steps through the integrated environment ledger. Current publication records local links and carries stored tracker/known sibling references in the body.
- [ ] Exercise explicit PR comments and their stable round marker on a disposable remote. Sequential retries reconcile; simultaneous hosts still need coordination.
- [ ] Repeat process-group cleanup and Git/CLI fixtures on Linux/Node 20/22. Local execution used macOS/Node 24; the only real push was to a temporary local bare repository.

These checks do not block remaining local implementation.

## review-code and incremental inputs (P3-06)

- [ ] Exercise the canonical skill in each real client. Confirm loaded repo rubric content and the incremental patch reach every reviewer/refuter; recheck prior kept findings even when unchanged in the new patch.
- [ ] Resolve an authenticated PR head through the host and inspect its isolated named-branch workspace. The CLI does not fetch or authenticate PRs.
- [ ] Repeat exact-index, mode, symlink and interruption/recovery fixtures on Linux and supported Node/Git versions. Local execution used macOS/Node 24/Git 2.49.
- [ ] Inspect sensitive project paths before snapshotting. Filename/content exclusions are conservative, not encryption or a complete secret detector. Preserve private objects alongside the journal when moving state.
- [ ] After configuring a codehost.comment-pr provider, explicitly request a test comment, confirm no approval/request-changes is emitted and reconcile an ambiguous network outcome before retrying. Synthetic host tests did not publish anything.

These checks do not block other local implementation.

## verify-works and process execution (P3-05)

- [ ] Execute real project suites through each host, including instruction-file verify.suite bindings and monorepo command selection. Confirm actual criteria/changed-test observations rather than relying on structural lint or stub workers.
- [ ] Test process-group timeout/output-limit cleanup on Linux and supported Node versions. The local runner fixtures executed only on macOS/Node 24.
- [ ] Resolve an authenticated PR head/criteria through the host, supply its local named branch, and inspect the isolated worktree. Missing criteria must stay a question; the current CLI does not fetch PRs.
- [ ] Inspect suite effects outside tracked/non-ignored worktree files and supply undo steps. After a physical interruption, inspect the retained intent before starting another round; no automatic retry is allowed.
- [ ] Verify shared raw output remains transient in client context, durable receipts contain only hashes/exit metadata, and actual failed processes cannot be argued into a passing verdict.

These checks do not block the remaining local implementation.

## Builder host and build-slice (P3-04)

- [ ] Run the canonical skill in each actual client. Confirm the preflight appears before provisioning, resolved repository build instructions are loaded, and all writes stay in the allocated workspace. Typed-host fixtures are local conformance scenarios, not live client captures.
- [ ] Confirm native/sequential workers are independent and genuinely read-only in gates. Exercise guided/staged/parallel pacing, an interrupted partial gate and cancellation of already-running workers.
- [ ] Exercise an authenticated issue read through the chosen tracker, validate complete body/reference/revision normalization, and agree criteria explicitly. The CLI itself does not fetch issues.
- [ ] Test real project behavior and external environment effects; current worker fixtures are synthetic; suite execution and incremental review have local fixtures but require actual host observations. Green machine gates must still hand back for human testing without a push or PR.

These checks remain for the owner and do not block other local implementation.

## Gate engine (P3-03)

- [ ] Run the same pinned plan in actual native and sequential clients; compare complete results and use genuinely independent refutation sessions. Unit fixtures supply synthetic workers and do not prove client isolation or model quality.
- [ ] Confirm read-only tool enforcement in each client and a reported failure when a reviewer changes code. Boundary snapshots cannot observe a write restored before the next check.
- [ ] Exercise project/run budgets and a person-requested mid-run extension on real work. Confirm EXHAUSTED hands back findings and no host silently resets a failed run.
- [ ] Inspect ignored files, external symlink targets, submodules, external services and test side effects explicitly. The current gate snapshot covers tracked/untracked non-ignored files, index, HEAD and branch, and blocks on submodules.
- [ ] Repeat Git/permissions/symlink fixtures on Linux and supported Node versions. Local macOS execution is not cross-platform evidence.

These owner checks do not block implementation of the remaining local workflows.

## Owner actions still pending

| Task | Action | Current evidence |
| --- | --- | --- |
| P0-01 | Authenticate to npm and reserve the package when ready to make the name public | No package was published in this session |
| P0-03 | Follow the isolated-session [conformance checklist](../test/conformance/notes/README.md) for all four tier-A CLIs | Version/help only; permissions, discovery, hooks, questions, MCP and plugin loading remain unverified |
| P0-06 | Optionally enable the local hook with `npm run hooks:install`; preserve any existing hook chain | A real hook was exercised in a temporary git repository; this checkout's Git configuration was not changed |
| CI | Run the updated workflow on Linux/macOS, including Node 20 runtime and a PR containing a rejected message | Local checks ran on macOS arm64 / Node 24.1.0; no remote CI run or push was performed |
| P1-03 | Optionally exercise forced interruption during a store write, preserve the journal, inspect the lock owner and rebuild after recovery | Concurrent processes, failed batches, malformed journals, symlinks and byte-identical rebuild are tested; physical power loss is not |

## Provider validation still pending

MCP snippets for Claude, Codex, OpenCode and Copilot are golden-tested for HTTP
and stdio. Merge a snippet into an isolated client configuration and verify an
actual tool call and authentication before calling that integration supported.
The eight destination providers have synthetic host-boundary transcripts, not
live captured responses. Verify actual tool names/arguments, complete reads,
rich-text preservation, revision conflicts and confirmed external links for each
configured destination. Check Notion async results and aliases, GitLab version,
Atlassian fields/permissions, and optional gws creation plus content insertion.
No integration was installed. Registry detection only establishes declarations or executable presence. No live
provider operation, model session or OAuth flow was executed here.

## Source validation still pending

For each configured source, verify the actual project/tenant, regional endpoint,
live tool schema, permissions, pagination/truncation, query reference and exact
window/timezone. All eleven source transcripts are synthetic. Replace Metabase's
example endpoint and configure Zendesk's real tenant/host authentication. Verify
PostHog tools mode and BigQuery read-only IAM/cost controls. For PostgreSQL use a
restricted libpq service and verify server read-only rejection, function privileges
and timeout behavior; process tests used a fixture executable, not a database.
Failed or incomplete access must produce an explicit unknown rather than a baseline.

## Worktree validation still pending

On a representative project, verify dependency/setup commands, actual port
binding, submodules/LFS, platform-specific Git behavior and the explicit checkout
opt-out. Local tests used Git 2.49.0 on macOS with real temporary repositories,
concurrent CLI creation, dirty source checkouts, stacked branches, locks and
conservative prune. Linux and physical process interruption remain unrun. After
an interruption, inspect stale lock ownership before clearing it and retrying the
recorded intent. Stop currently records a lease; no worker/dev-server process
controller is implemented. Open does not count as the person's test-it approval.

## Slicing validation still pending

Exercise slice-work with real repository conventions and a challenger in slicing
mode. Verify that the declared single outcome and demonstration describe a real
vertical user journey, and that all slices together deliver the scope. Local
fixtures validate shape, inherited criteria, stable IDs, dependencies and at most
one part per repository. Contract-first routing is automated; actual contract
implementation and builder execution are later tasks. Worktree lifecycle has
separate real Git tests and the owner checks above.
Remote tracker items/relationships remain pending host writes until linked.

## Definition eval validation still pending

Run the thirty-case seed through a real host challenger with expected labels
hidden. Preserve raw findings, actual model/client versions and run settings;
score complete predictions with `eval definitions --predictions`. The committed
90% recall/0% false-alarm baseline measures deterministic lint only and retains
two known semantic misses. It does not establish live challenger quality.

## Definition challenger validation still pending

Exercise all four modes in a host using the returned instructions and exact
artifact. Verify that every mode reports evidence and counterexamples, preserves
unknowns and leaves files unchanged. Compare challenge dials: tone and extra
counter-questions can differ, coverage and findings cannot. Numeric lint only
proves supported pairwise contradictions with explicitly matching contexts/units;
free-text semantics and multi-constraint consistency remain independent review.

## Scope validation still pending

Run cut-scopes with actual repository flag naming guidance and ask the challenger
whether each cut can ship independently. Review the completed plan before
approving. Exercise rejection, stable-key revision and choosing between multiple
scopes. Local tracker references and dependency rollback are automated tests;
remote tracker execution, actual links and semantic critique remain unverified.
Child scopes exist as drafts and cannot bypass the initiative's pending approval.

## Spec validation still pending

Run write-spec with a bound repository guide in a real host session. Verify that
the guide is followed, the challenger catches semantic defects, metrics come from
actual source evidence and the person reviews the completed revision. Local tests
use a fictional baseline/query fixture; validation does not execute those queries
or authenticate the named provider. Exercise rejection, correction and fresh
approval. External publication remains a pending handoff until linked.

## Framing validation still pending

In a real host session, verify that supportive/balanced/adversarial challenge
changes tone while preserving every framing question, and that insufficient
evidence triggers research and explicit TBD markers. Exercise an on-hold call,
its reopening condition and an explicit reopen. Remote publication remains a
pending handoff; verify the host write and record its link before reporting it
published. Cross-repository continuation uses explicit IDs.

## Research validation still pending

Run the research skill with real source tools and independent challenger sessions
once a host adapter is available. Verify source authentication, failure-to-open-
question handling, read-only workers, actual native fan-out and the same result
under sequential execution. Local tests use stubbed workers and fixture evidence;
no real research claim or live provider call was produced in this session.

## Canonical skill validation still pending

P1-12 is verified through compiled CLI workflow tests, including a sentence,
explicit owner, full framing artifact, no-go outcome, artifact receipt, read-only status and scoped setup. After P0-03
conformance and adapter generation, exercise the four canonical skills in real
client sessions: question rendering, repository guidance loading, preflight and
receipt language, and stopping at unavailable work or human decisions. No model
session was executed to establish these behaviors in a host client.

## Extension smoke checks

Use an isolated configuration home when selecting a custom profile. Run
`profile scaffold onboarding --output .wholeloop/profiles/onboarding`, inspect
the kit, then `profile test onboarding` and `profile preset onboarding --scope run`.
For templates, `template test spec` reports mandatory-section dependents. Lens
validation checks manifests and prompt resources only; actual gate execution and
other workflow-specific template selection remain pending.

## Current smoke scenario

Use a temporary `XDG_STATE_HOME` outside any repository and a temporary
`XDG_CONFIG_HOME` to avoid changing personal defaults. Build first with
`npm run build`, then use `node /absolute/path/to/wholeloop/dist/wl.mjs`:

1. Begin `step begin frame-problem --input "Find past orders" --owner "Alex" --json`.
2. Copy its initiative ID. Complete it with `step complete frame-problem
   --for <id> --artifact <file> --json`; the file must contain all returned framing headings. Use
   `test/fixtures/framing/frame.md` as a smoke fixture in a temporary location;
   actual framing must distinguish observed evidence from explicit TBD markers.
3. Inspect `state get`, `open` and `step plan` for that ID. The next step is
   `write-spec`, now available. Complete a spec using the returned schema/sections
   and verify that `next` stops at `approve-spec`; cut-scopes is now available. Approve the spec, complete a scope plan, and verify
   that both initiative and child continuation stop at approve-scopes. After
   approval, slice-work is available; complete a vertical slice plan and inspect
   contract-first routing. build-slice remains unavailable.
4. Send a local `msg send --thread <id> --to builder --kind note --body "Ready"`.
   Read it with `msg read --for builder --reader a`, then repeat: the second
   read is empty. A different reader still sees it.
5. Run `resume <id> --json` and `state rebuild --json`; the pack stays bounded
   and projections rebuild without changing the journal.
6. Inspect `profile show --json`; try a preset and a dial only in the temporary
   config home. `profile set depth=technical --scope run --json` must leave
   configuration unchanged.

These core paths also have automated tests. Generated client adapters, live canonical skill sessions,
live provider integrations and later step workflows remain unimplemented; do not
interpret this smoke scenario as their conformance validation.

[Roadmap](./README.md) · [Journal](./journal.md)
