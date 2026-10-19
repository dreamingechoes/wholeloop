# Manual verification — current implementation

> Automated results and pending work are separate. A checked roadmap task means
> its local acceptance checks passed, not that every target CLI or platform has
> been exercised. Updated 2026-10-19.

## Generated references (P5-06 local controls)

- [ ] After changing source contracts, rebuild before running docs check. Confirm command/config/provider sections describe that build, not an older executable on PATH.
- [ ] On Linux and supported Node releases, repeat read-only drift detection, explicit selective/full regeneration, malformed-marker refusal and preservation of surrounding prose. Current compiled execution is macOS arm64/Node 24 only.
- [ ] If regeneration is interrupted during writes, inspect the affected pages/markers before rerunning. All selected markers are preflighted, but filesystem failures do not provide multi-file crash atomicity.

The generated provider table records declarations only. Native capability-matrix
collection/generation and remaining per-CLI onboarding refinements are still
implementation work, separate from these manual checks. Overview pages now reflect
local implementation while retaining native/host verification boundaries.

## Disposable standalone framing conformance (P1-14)

- [ ] Build, then prepare one fresh run per actual tier-A client with --target and its exact --pin version. Inspect returned fixture/prompt/native recipe and executable resolution; a version token alone is not binary provenance. Retain source/scenario/core hashes.
- [ ] Arrange native trust, auth/model selection and external-state permissions without modifying the fixture baseline. Invoke `conformance run <id> --live --json`, inspect process/journal/artifact results and record each actual result. Native customizations remain enabled; no permission bypass or credential copy is performed. Client startup files may trigger an explicit workspace-change failure.
- [ ] Confirm the real installed skill supplies the random note marker, creates one owned standalone initiative, completes framing with a go receipt and stops before write-spec. A marker proves instruction consumption, not an adversarial loader attestation; review narrative evidence/challenge quality separately.
- [ ] Exercise actual timeouts, cancellation and native failures; the report must name CLI, step and missing events without retaining stdout/stderr. Interrupted/failed fixtures cannot be retried or relabelled. Inspect retained evidence and prepare a new run.
- [ ] Inspect native logs, ambient plugins/compatible user skills, ignored files, Git metadata, external writes and any remote effects. This structural scenario does not validate native JSON protocol, read-only role isolation, hook activation or the broader P0-03 matrix.
- [ ] Repeat on Linux and supported Node versions before claiming portability. Current simulation/compiled-runner execution is macOS arm64/Node 24.

Automated four-target installed-launcher simulations report FIXTURE_PASS, never a
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

## Headless gate processes (P5-03)

- [ ] Execute one pinned review and verification round with actual native, headless and sequential workers. Compare coverage/quorum/verdict, independently inspect evidence quality and record exact client versions. Synthetic parity tests do not establish real model equivalence.
- [ ] On actual Claude/Codex clients, verify stdin/final-result normalization, no reused conversation, read-only tool/sandbox enforcement, disabled MCP/customization and non-interactive denial. Inspect managed policies/hooks and client-owned logs; current help probes are not a live pass.
- [ ] Interrupt real clients and confirm owned descendants stop, incomplete workers remain unknown and no failed refuter adds a vote. Recover a physical-crash lock only after inspecting owner.json and confirming its process stopped.
- [ ] Inspect ignored/transient-restored files and external side effects; repository snapshots cannot prove their absence. Confirm authentication uses the client's credential store without plaintext copies.
- [ ] Repeat process-group, timing, permission and worker fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64 only.

OpenCode/Copilot recipes are still unimplemented code, separately tracked in P5-03;
these owner checks do not block other local roadmap work.

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

- [ ] Capture authenticated read-only client/API contracts for LaunchDarkly/Unleash/GrowthBook/PostHog so their service-specific bridges can be implemented and tested. This is open roadmap code work, not an owner test already passed. Virtual host contracts are not real readers; capture complete matching flag/environment observations and preserve unknown for complex targeting or missing access.
- [ ] Capture actual dashboard-write tool schemas/permissions and target data-source requirements for PostHog/Mixpanel/Amplitude/Metabase/Grafana. Remote creation/normalization remains open roadmap code work. Current output is a pending exact-metric handoff with createdRemotely=false, not a remote chart.
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
