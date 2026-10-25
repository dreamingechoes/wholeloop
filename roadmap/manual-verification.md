# Manual verification — current implementation

> Automated results and pending work are separate. A checked roadmap task means its local acceptance checks passed, not that every target CLI or platform has been exercised. Expanded-scope planning updated 2026-10-24; historical execution observations retain their original dates.

## How to use this backlog

Start with [V1 acceptance](../docs/v1-acceptance.md) for the ordered trial plan, commands, passing results and who does each part. This page retains detailed regressions and limitations rather than assigning every item to the owner.

## Expanded 1.0 acceptance boundary

[Phase 6](./phase-6-autonomous-delivery.md) adds 34 reviewed/accepted implementation tasks, authorized for sequential execution, before final 1.0 release. Their [validation plan](./specifications/autonomous-delivery/09-validation-and-acceptance.md) defines new automated, native/backend and hosted checks. The original fourteen open tasks and observations below retain their exact scope; the expanded roadmap now has 88 tasks, 53 complete and 35 open (20 new implementation tasks, one implemented task awaiting Linux-host acceptance, plus the fourteen original open tasks).

- [x] Review and accept all new tasks for 1.0 and authorize sequential implementation (owner, 2026-10-24).
- [ ] After implementation, observe actual no-intervention research/implementation, effective runtime containment and behavioral/integration proof at the specified reference-client/platform scope.
- [ ] Separately authorize disposable hosted publication/conditional-merge trials and retain their actual outcomes.

P6-01 intake is implemented and automatically verified: 52 intake cases, complete macOS checks and Linux Node 20/24 CLI/file-boundary trials. The [tutorial](../docs/tutorials/delivery-intake.md) is executable without an account. P6-02 plan/envelope preparation is also verified: 42 planning cases, full macOS checks and the exact tutorial/replay on Linux Node 20/24. See the [planning tutorial](../docs/tutorials/delivery-plan.md). P6-03 operator grants, revocation and broker admission/request contracts pass 42 new cases and 460 focused checks on macOS/Linux, plus the exact tutorial on Linux Node 20/24. See the [authorization guide](../docs/tutorials/delivery-authorization.md). Actual worker/backend containment remains P6-12/P6-27 acceptance; fixtures are not certification. No new manual check is required to continue P6-04. Only design review/implementation authorization above is confirmed for the still-pending full-flow acceptance. The execution checks remain future acceptance, not work already executed or permission to mutate a real project. Existing native/account checks need not block independent local implementation after authorization. Zero-intervention product usage remains opt-in; runtime policies are unchanged today.

Current local remediation is implemented and tested: exact owner-decision framing, final revision review and bounded redacted native diagnostics. After explicit private-harness disclosure approval, fresh native trials executed on OpenCode, Copilot and Antigravity. None passed: OpenCode began framing before its deadline and a longer diagnostic attempt ended with a provider error mentioning HTTP 503; Copilot and Antigravity reported native tool permission denials. The latter's soft-denial format exposed and now has a diagnostic regression fix. Any further implementation defect discovered by those trials remains technical work, not an owner acceptance checkbox. Track it in [V1 acceptance](../docs/v1-acceptance.md#1-finish-implementation-defects-first) and the journal before claiming technical closure.

OpenCode V1/V2 compatibility now has separate deterministic renderers and native execution recipes (ADR-0088). Actual V2 inspector discovery/read and an isolated user-scope hook read/deny are observed. Complete native review remains unaccepted: a six-lens synthetic review attempt failed with five 60-second timeouts and one invalid response; a separate 120-second lens attempt also timed out. Do not mark native gate parity or the whole platform task complete from the smaller probes.

Actual Codex headless rounds gate-77f0a395c890806f and gate-78beec965bc15544 each fail with five invalid responses and one accepted response; the repository is unchanged. Bounded diagnostics establish missing envelope identities in those five JSON objects. ADR-0091 adds an exact native generation schema, preserving strict host validation. Preserve both failed rounds. The new compiled CLI gate-35be1f516f42cb8c on core 9ea3a298 now passes all six workers in actual Codex 0.163.0, with no missing coverage or repository edits. That fulfills P5-03's one-real-run criterion together with stubbed three-engine verdict/quorum parity; earlier failures and wider native checks remain unchanged.

Remote service integrations are **experimental · fixture-tested · service-unverified** under [ADR-0084](../docs/decisions/0084-experimental-integrations-and-scoped-live-verification.md). Their authenticated account/API/rendering checks below are deferred certification, not prerequisites for 1.0, and remain unchecked until actually executed. You do not need accounts with every listed vendor. This does not waive missing implementation, native-client/permission/hook tests, release CI or publication decisions. The Amplitude dashboard write remains a pending handoff until its MCP contract is known; ADR-0085 removes the requirement for another HTTP implementation.

## Executable API and CLI checks (2026-10-25)

P6-15 implements the [fixed behavior host](../docs/tutorials/delivery-behaviors.md), closed explicit inputs, exact owned endpoints and declared commands, scoped test effects, complete observed output and response assertions, real service restart and once-per-round suite reuse. An excluded sensitive header is unobserved and cannot prove absence. The actual controller invoker and private client close remain separate from the application's daemon-observed exit; unobserved application PIDs/signals are labelled accordingly.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2602 tests in 113 files (301.87 seconds), lint/types/build/smoke, offline package, 321-file docs/references, 149-file harness, 320-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2602 tests in 113 files (77.12 seconds), no skips; isolated non-root container without network, credentials, private history or Docker socket |
| macOS controller / Docker 29.9.2 Linux aarch64 daemon | Actual disposable API/CLI applications and owned volumes: broken persistence despite green units, a real restart and repaired persistence, wrong exit and missing/zero failures, an observed negative exit seven, stale candidate refusal, cached failed suites and unchanged gate budget; successful exact retirement |
| macOS Node 24 and Linux Node 20.0.0/24.22.0 | Final bundle's inert behavior-schema command returns identical JSON; guide shell syntax passes ShellCheck. This is a runtime/contract probe, not a Node 20 Docker/native-model certification |

Final pre-evidence immutable candidate archive: 8f2f2118f47448af4adf9f810570d81c7f27facb9c73cbc222632453032db3a6. Copied core: 2f36e7919df2edb5d3c199c6eba23104f529974491cd2feccc1e9d6ed34f5a9e. Pre-evidence package receipts: macOS 459ba83bca62b76808209e4ef0c39c7c8353be340128532a8af4bbd981eb2df2 and Linux 3ae6707c4e0ec6b304e3f5778d988af1e84b1373022762f200f1fb3e39ad4a84. Preserve the dependency-cache build distinction. Recheck final evidence-only docs/package separately instead of equating its package with that archive.

Final actual model-free evaluator: nine observations pass and exact teardown is observed. Retained report SHA-256: 95325c90d825fb1bc39f7a87cd447a222c3cf2535cefc4ac7ab52f2e8f1e8467; runner SHA-256: 1d276d84a9e3e2b2d91a5bf655b15833459d5146a644d3521fdc9fb4895be2d7. Final evidence-only local package: a62c0a414d0974d56bf5b5659240775eb2c5c1714a66f7404e958a3f6b5fdded. These identify their own executions; the runner is not the published bundle.

Preserve all earlier failed trials. The first evaluator fails during module packaging before resource creation; the next uses an invalid running transition with no worker attempt, and the next exposes the real pending-effect authority-watch cancellation. Bind only the current trusted host's exact pending test effect and retain all authority/deadline checks. A later suite fixture chooses an undiscovered script name; select the declared test script rather than weakening discovery. The first full concurrent macOS run passes 2598 of 2599 tests but hits the unchanged thirty-second user-install fixture timeout. Separate complete runs pass without a timeout increase. The final review also catches an excluded-header absence projection and adds regressions.

The native drain probe observes only 196608 of 220000 bytes with immediate wrapper exit. Natural exit retains all 220000 bytes; the actual wrapper remains exit one while its observed client exits seven. Verify that private finished close against the daemon's application exit before accepting complete CLI output. Preserve the actual regression and final Docker observations. Exact-resource cleanup retires the four earlier failed evaluator environments while retaining all external reports and data history. No hosted service, native model, PR or merge is executed. P6-12 independent Linux-host acceptance remains open; continue P6-16 without waiting for unrelated manual checks.

## Behavioral acceptance contract checks (2026-10-25)

P6-14 pins acceptance definitions before observed builder admission, requires complete applicable criterion coverage and inherited ownership, and binds controller-host receipts to an exact invocation and current owned candidate. Thirty-nine new cases cover artifacts/metadata, immutable definitions, current inputs, unknown invokers, human/fixture provenance and compiled CLI behavior. The three focused acceptance/compatibility files pass 375 cases. Objective API/CLI and browser execution hosts remain P6-15/P6-16; no fixture is actual application or native certification.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2566 tests in 110 files (299.03 seconds), lint/types/build/smoke, offline package, 319-file docs/references, 149-file harness, 318-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2566 tests in 110 files (75.55 seconds), no skips; isolated non-root container without network, credentials, private history or Docker socket |
| macOS Node 24 and Linux Node 20.0.0/24.22.0 | Exact planning prerequisite and acceptance tutorial pass with ShellCheck; inert preparation invokes no Docker, model or account |

Final immutable candidate archive: 76d5c183d7b662db13dca15af8382d56bd1301b388c7cbb05a56c8ec35b85951. Copied core: 7861f1ed88580bd4cc4054091b816f4490f2136fb1992172d04c74f7807e5a14. Pre-evidence package receipts: macOS 2e58e16a275d1a5b9dbb3d9839c5eef0f611f39ab9bbd66c424417e9f75e730d and Linux be68f43c9d6ed2e24c2cb4fb8da0caad85dc4c3af7d064df71687d48f95e833b. Preserve the dependency-cache build distinction. The final README count/evidence update receives a separate local docs/Markdown/package check; do not equate that package with the pre-evidence archive. Final evidence-only local package: 5d6720513cdb198eed3b1f10cb23d2e66f8b93e79489088886a609a9a1af111d.

Preserve the initial fixture failures: the optional clock must be omitted rather than explicitly undefined, revocation uses grant, unknown CLI options exit 4, and StateStore append returns no event. Read the actual appended event from its transaction view; no existing enforcer is weakened. The first full macOS check passes 2564 of 2565 cases but detects a real short-deadline defect: intent persistence can consume the deadline, and a non-success receipt observed afterward is incorrectly rejected as a changed binding. The final implementation spends the original deadline, refuses late host dispatch, distinguishes never-started/stopped from unknown invokers, and retains readable interruption evidence. Add the deterministic persistence/expiry regression and pass final complete checks.

The [acceptance guide](../docs/tutorials/delivery-acceptance.md) explains stable definitions, current reports, sealed private artifacts, literal empty/zero values, human notes and pending execution hosts. Complete-object credential scanning precedes eight-MiB chunking; metadata strings are also checked individually. Twenty-MiB bounds, run-byte accounting, actual symlink/byte tampering and cross-chunk credential refusal pass. Machine/fixture results never write the original supervised testing ledger, and an exact-candidate historical PR note still leaves a new human-only case pending. Continue P6-15 without waiting for original manual/native checks. No hosted service, native model, PR or merge is executed.

## Owned environment lifecycle checks (2026-10-25)

P6-13 implements operator-only digest-bound stop/reconcile/retire requests, permanent startup fences, private native cancellation, observed shutdown, retained volumes and interruption recovery. Fourteen lifecycle cases, four actual native-process cases and an additional backend history-budget regression pass, together with automatic closed-contract checks. Six focused environment files pass 110 cases. The old undo ledger and topic/worktree rules remain unchanged.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2504 tests in 108 files (362.24 seconds), lint/types/build/smoke, offline package, 316-file docs/references, 148-file harness, 315-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2504 tests in 108 files (88.80 seconds), no skips; isolated non-root container without network, private history, credentials or Docker socket |
| macOS arm64 controller / Docker 29.9.2 / Linux aarch64 daemon | Seventeen actual observations pass: original app/data/boundary/setup cases plus shutdown with retained volumes, a same-name unrelated volume and killed retirement controllers recovered by fresh compiled CLI processes |
| macOS Node 24 and Linux Node 20.0.0/24.22.0 | Exact lifecycle-schema instruction passes with ShellCheck; the full operational procedure still requires an actual owned environment |

Final immutable candidate archive: 2fed11a246aa3cc9c92fcc460f38b72883ce93122939b72b8ba869de76c86f4e. Copied core: ee539c3d00c4772eab9a01f691944bf21530c8ba2c9186a228154ad2fa3172a6. Pre-evidence package receipts: macOS be43897ae5abb992d9692325f9c636c70d4f44e085513adb32f3a671a46ee298 and Linux 5e01c5cf5194e9e75d06f866b7ba9be5ca589474cf2765104f17603120d89127. Keep the established dependency-cache build distinction; evidence-only docs receive a final docs/Markdown/package check. External trial reports and interruption metadata remain retained; successful exact-owned test resources and separately owned collision fixtures are retired after their assertions pass.

Preserve initial failures and corrections. A sandbox-denied process-table read correctly remains unknown; execute actual process verification with permission to read numeric PID/group metadata. Fix the missing live marker and invalid invocation/reason fields in synthetic fixtures without weakening the schemas. The first complete macOS check passes 2501 of 2502 cases but its new startup fixture exceeds three seconds under parallel load; retain that failure and give only the synthetic startup ten seconds, keeping product deadlines. The final candidate adds credential refusal before metadata persistence and reserves immutable history for observed stop/retirement. Final complete checks and real backend trials pass. The first harness check correctly rejects undeclared rule mappings; add their canonical hard rules and pass enforcement.

The [lifecycle guide](../docs/tutorials/delivery-lifecycle.md) explains current reviews, historical idempotent receipts, partial cleanup, private cancellation, legacy invoker uncertainty and explicit data retirement. No PID from history is signaled. No fixture becomes human testing, actual native/model certification or remote publication. P6-12 remains acceptance-open for ENV-07 on an independent Linux host, which is separate from the Linux controller container and this Linux VM daemon. Continue P6-14 under the existing authorization.

## Owned Docker application backend checks (2026-10-25)

P6-12 implementation is complete and remains acceptance-open for an independent Linux host. Forty-one backend unit cases plus one compiled CLI canary cover capability/denial policy, actual-inspect-shaped fixtures, private-authority refusal, immutable ownership, image/index/manifest/platform bindings, output bounds, compatible bounded snapshots and preserved input-file planning contracts. The six focused files pass 504 environment/contract checks. Actual Docker observations below are separate from fixtures and native/model acceptance.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2461 tests in 106 files (334.74 seconds), lint/types/build/smoke, offline package, 314-file docs/references, 148-file harness, 313-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2461 tests in 106 files (72.86 seconds), no skips; isolated non-root controller container without network, private history, credentials or Docker socket; backend execution there is fixture scope |
| macOS Node 24 and Linux Node 20.0.0/24.22.0 | Exact closed-runtime-schema guide assertions pass with ShellCheck; these launch no Docker/model |
| macOS arm64 controller / Linux aarch64 daemon / Docker 29.9.2 | Actual model-free evaluation passes ten observations: two app endpoints/data sets, copied read-only inputs/implementation, denied controller/home/credential/sibling/socket/environment access, denied setup/runtime egress, no effect reissue, stale candidate invalidation and setup exit 7 refusing readiness |
| Independent Linux host/backend | Not executed; ENV-07 remains unchecked. Repeat the explicit evaluation on an available Linux host and record the actual controller/daemon/architecture; no service/model accounts are needed |

Frozen candidate archive f69f7e627d7396fab32b71f5301a14ea9a2155ac59c0ecfc4307b11765ffe619 is based on 2e229a2 plus P6-12 source/tests. Copied core: 9fe69a3d578dee041b8379c312e175796a1e728199ac595532ce9701055ab006. Pre-evidence package receipts: macOS eea7bfd7be62f2e687de943c8278061123b503a5c4dc7ad05ee9f1ae94f59b7f and Linux c09e633dfdebd167db5ca54f3be3915ddcd976c8cbb4dafd0020b2063e078d90. Preserve the existing dependency-path build distinction; final evidence-only docs receive another local package/docs check.

Actual final evaluation command: npm run eval:environments -- --retire-success. The retained final report has status pass, ten checks and exact-owned-absence-observed. Its actual controller/daemon scope does not establish a native model/tool permission guarantee or an independent Linux host. Versioned receipts retain current resource IDs, labels, creation fingerprints, original deadlines, exact copied bytes and image/platform identities; no raw image environment or credentials enter reports. The explicit fixture teardown observes absence; unexpected failures remain retained.

Preserve failures and corrections:

- The first actual app trial returns internal readiness but no allocated host port. Its evaluation fails. Fix the erroneous ready condition, keep application networking isolated and introduce the fixed-target controller publisher; the repeated actual endpoint returns HTTP 200.
- The first anonymized inspection fixture assigns volume names by array order. The positive policy comparison fails while its negative cases were already different. Correct names by mount destination and require baseline equality before each mutation; final negative cases now exercise the intended control independently.
- Precise platform image inspection exposes engine root ID sha256:925de64a85319052d6971ae81ef2417da956e8a3a2c4a0fac732327970f017f5 and selected arm64 manifest sha256:0e84a1a8a11b9a42374419513e0825262dfd6f072eeb4a724c52fc0aab3061d2. The first stricter run refuses startup. Preserve that failure, bind both IDs/platforms and pass the final actual input/setup/data/boundary trials. Retire the three reviewed failed-probe resources only after exact ownership/daemon checks and observed absence; retain their diagnostic history.
- Initial fixture TypeScript errors use mutable types for readonly tables and a null-only capability field. Correct fixture types, not product guards. No original native failure or service-unverified integration becomes passed.

The backend has no remaining P6-12 code blocker. P6-13 has since passed its own local/reference lifecycle checks above, under the owner's explicit instruction to defer manual/host acceptance. P6-12 stays open for ENV-07; actual native clients/models remain P6-27, with original fourteen open tasks unchanged. No hosted publication, merge, production resource or account-bound service trial occurs.

## Environment planning platform checks (2026-10-25)

P6-11 adds inert recipe discovery, exact selected non-secret UTF-8 bytes, explicit command origins, immutable image descriptors, logical mounts, service dependencies, finite capacity, network phases and retained manifests. Forty new cases include actual descriptor/path/symlink/oversize reads, duplicate package JSON, stale selection, corrupted historical bytes and independent compiled commands. Malicious candidate hooks and existing undo declarations remain unexecuted.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2407 tests in 104 files (324.63 seconds), lint/types/build/smoke, offline package, 312-file docs/references, 148-file harness, 311-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2407 tests in 104 files (72.05 seconds), no skips; isolated non-root container without network/private history/credentials |
| macOS Node 24 and Linux Node 20.0.0/24.22.0 | Exact environment-planning tutorial passes; ShellCheck passes; no Docker/application startup is needed |

Immutable candidate archive 171e42b451903fbdad1fe7f7cdeeb95b071601dd2daa107f8924ea5c423e0836 is based on c3dcc13 plus P6-11 source/tests. Copied core: 1cd2557e7e4f9a787c10a1f1f87f955794df07ccea86b0b31ffc374958b8f9ff. Pre-evidence package receipts are macOS 1927ee7b98a96e9836eeb43b882c0d2c161d19320f020cae5f0bd1b8625d5797 and Linux f8125fc4d5902ce213ff3ed03e949a12a5ec059397fd57ec3fd9bea12d902f63. Preserve their existing dependency-path build distinction; final evidence-only docs receive another local package/docs check.

The initial targeted run has one test expectation failure after the CLI correctly rejects a changed source with exit 3: the test checks a nonexistent error property. Assert the actual message property, keeping the rejection and every guard. Add a final package-filename regression so npm run cannot bind another JSON file. All final cases/checks pass. The first documentation run rejects a missing docnav marker and stale generated command reference; correct/regenerate both and retain their earlier refusal.

Actual Docker version/image/capacity reads for subsequent work observe client/daemon 29.9.2, a Linux aarch64 daemon with four CPUs and 4107141120 bytes memory behind this macOS host, and an already cached Linux arm64 Node image. These read-only observations create no backend resources and do not establish actual application/denial/lifecycle acceptance. P6-12/P6-13/P6-27 retain those obligations, including a separate real Linux-host observation.

## Native delivery host checks (2026-10-25)

P6-09 implements separate pinned Claude/Codex transports with observed capability requirements, fresh bounded inputs, actual runtime registration, current authority checks, owned artifact capture and sanitized receipts. Other expanded targets remain explicitly unverified. Thirty new cases use actual synthetic processes; no actual model/account execution or service certification occurs.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2359 tests in 103 files (315.22 seconds), lint/types/build/smoke, offline package, 309-file docs/references, 147-file harness, 308-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2359 tests in 103 files (67.67 seconds), no skips; isolated non-root container without network/private history/credentials |
| macOS Node 24 and Linux Node 20.0.0/24.22.0 | Exact combined tutorials including native-schema assertions pass; shellcheck passes |

Final code candidate archive 2a320d129c57a779776c4831dc8badf6fda23a580f2d7da346498a79e14c7c7e is based on 627a732 plus P6-09 source/tests. Copied core: 69c290621b73a935437f2b4061360a7ff3374d5e3766fdf948174da342352c34. Pre-evidence package receipts: macOS 60e95754d2daf7d08e9453e075e80bac90be1287d5e221c857224640b8846a72 and Linux 5698e86d9021221767c0c22c9a0b46676b85dcf9e33689470d9240db5fdf61b2. Preserve the documented dependency-path build difference. Final evidence-only docs receive another local package/docs check.

Initial full checks pass 2356 tests on both hosts. Final review identifies a needless application-workspace requirement for source-only research. Add two actual synthetic reference-client runs and a read-only mutation regression; the first research fixture correctly fails empty-work validation, then is corrected to own its actual source criterion. All thirty native cases and final full checks pass. Preserve those failures rather than weakening validation.

Actual isolated-HOME version/help probes observe Codex 0.163.0, Claude 2.1.307, OpenCode 2.1.1, Copilot 1.0.83, Cursor 2026.07.16-899851b, Gemini 0.27.0 and Antigravity 1.4.7. Antigravity help returns empty stdout, so it establishes no help flags. These probes launch no model and change no historical native certification.

A separate actual macOS Codex permission-profile-only command reports allowed owned output plus denied forbidden-sibling read and write. The first nested sandbox probe fails with OS sandbox_apply denial; a later profile probe denies Node's default OpenSSL configuration. Selecting an empty probe-owned OpenSSL configuration permits the unchanged narrow profile test. This verifies that one command filesystem profile on macOS, not native model/tools/accounts, Linux containment or the complete backend. P6-12/P6-27 retain those actual acceptance obligations.

## Worker protocol platform checks (2026-10-24)

P6-08 adds exact fresh assignments/results, role-scoped tools, private verifier audiences, bounded hash-pinned resume packs and separate controller execution observations. Thirty new tests exercise all seven schema roles, hostile/truncated output, current runtime/fence/private-grant checks, actual disposable worktree snapshots and guidance files, deadline refusal and artifact-byte observation. Actual native permission/filesystem denial and complete unattended delivery remain P6-09/P6-12/P6-27; no actual model or new service capability is certified.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2324 tests in 102 files (273.22 seconds), lint/types/build/smoke, offline package, 307-file docs/references, 147-file harness, 306-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2324 tests in 102 files (61.70 seconds), no skips; isolated non-root container without network/private history/credentials |
| macOS and Linux arm64 / Node 20.0.0 and 24.22.0 | Exact combined tutorials including worker-schema assertions pass; macOS executes Node 24 and Linux executes both versions; shellcheck passes |

The immutable code candidate archive is 25b76c1c1984341d51c7b73936c55d5653ed9915d8b075b758497507e2c4e0b6, based on 07078e5 plus P6-08 source/tests. The copied macOS core is 64edc5325f13e18cc0548ef5d8fc58e6031a36de63613629f7f1b366b68eae45. Actual pre-evidence-update package receipts are macOS cfdf70af75e779137bdbd8b5b6d18df300128425c4f5af78296ae75607c76fb2 and Linux fee7daf2fea23c7e53a4c559d2c62acfb2bf9314e6ff88b5bb8826165e45f0db. Isolated dependency-cache paths retain their documented build difference; do not exchange exact-byte receipts. Final README/evidence edits receive another package check.

Focused checks initially reject a traversal fixture at the schema layer and a success fixture missing the newly required actual artifact reader. Exercise nested traversal at the semantic boundary and provide the bounded reader; preserve those refusals and all guards. Native version/help-only probes in an isolated empty HOME observe Codex 0.163.0 and Claude 2.1.307 without launching models. These are static observations for subsequent host work, not actual role, authentication or containment certification.

## Persistent budget platform checks (2026-10-24)

P6-07 adds persistent finite deadlines, reservations, CI/restart/repair counters, usage provenance, no-progress signatures and binary artifact accounting. Twenty-six new budget cases cover fake clocks, derived/revised plans, unknown historical usage, hard-cap refusal, stream deduplication, overrun evidence, actual concurrent processes and SIGKILL before/after artifact replacement. Missing historical usage remains explicitly unmetered and keeps newer totals partial; retroactive hard constraints refuse. Prior gate events and native/service acceptance retain their meanings.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2287 tests in 101 files (269.63 seconds), lint/types/build/smoke, offline package, 304-file docs/references, 146-file harness, 303-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2287 tests in 101 files (68.86 seconds), no skips; isolated non-root container, no network/private history/credentials |
| macOS and Linux arm64 / Node 20.0.0 and 24.22.0 | Exact combined planning, authorization, replay, queue, checkpoint and budget tutorials pass; macOS executes Node 24 and Linux executes both versions |

The final code candidate archive is 3be6fdf392fb4e3f39903932d90d52161b637a5648e36f3c44f7c9d7637b27ac, based on 5f8d81f plus P6-07 source/tests; the copied macOS core is 85c9bc61c73c25caa6926e8038440140c3a80988ceeb329cae36db33ca89f30b. Actual pre-evidence-update package receipts are macOS 1a2ce5655b5d77cc01ba29f6c0432c00c59a51a30cd2031f5877954f40c826f6 and Linux 2025034c41984a216a3d6081aeb400b77ed4325caa0bd5cd8fda12d685b28f01. The Linux build uses the isolated dependency-cache path described below; these archives are not claimed identical. Final README/evidence edits receive another local package check.

Preserve initial checks: both hosts pass 2286 tests before final review identifies unmetered legacy accounting. Add that regression, correct its missing queued-state setup and two expected report fields after the first targeted failure, then pass the final 2287-test checks. The first CLI probe also incorrectly supplies --store to the schema-only command; correct the probe, retaining option validation. Earlier process-timeout fixtures use an injected admission clock so the 1 ms test still reaches the actual bounded host call. No assertion is weakened and no fixture becomes native model, hard-metering, service or semantic QA certification.

## Expanded delivery platform checks (2026-10-24)

P6-01–P6-06 local contracts are implemented: immutable intake/planning, operator/broker separation, replayable state, queue/fencing, exact checkpoints and conservative worker/effect/lock recovery. This does not certify actual native/backend containment, behavioral QA or hosted publication/merge. Those remain on the expanded acceptance plan.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2252 tests in 98 files (282.61 seconds), lint/types/build/smoke, offline package, docs/references/harness/Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2252 tests in 98 files (54.01 seconds), no skipped cases; isolated non-root container, no network/private history/credentials |
| Linux arm64 / Node 20.0.0 and 24.22.0 | Exact combined planning, authorization, cache recovery, queue and checkpoint tutorials pass against the copied macOS-built core |

The immutable code candidate archive is 6d22b942d89fce2b0bef19c5be1b92e16d1e514b8812501bd16f72427193ed13, based on 4175e68 plus P6-06 source/tests. Actual SIGKILL cases cover checkpoint manifest/journal boundaries and effect issue/invocation boundaries. Recovery retains the same run, an exhausted legacy gate and writer ownership evidence. Actual owned-child cancellation preserves a separate unrelated child. Backend/model/service fixtures remain explicitly fixtures.

Preserve the first Linux failure: /tmp was mounted noexec, preventing executable hook/client fixtures and producing 31 failures. Confirm the mount flags, enable execution only in the isolated temporary filesystem and repeat the unchanged candidate successfully. No assertion or product policy is weakened.

The copied macOS core is d06b99d57c76ae0aff27f61d059c362d907b6df1acb1017cb8b7cc87fdb1e329. The source-built Linux core is 846f317b215f139e2484c810abb326f2be419dba9bb9bc19f4c7075d75564ee4; its immutable dependency cache uses a different filesystem path. Replacing only that embedded dependency-source prefix yields the exact macOS core hash. The actual pre-evidence-update offline package receipts remain distinct: macOS a1e67f88a74f6f146a0b679ebac6c066224ec75f5bc5711ec45155cf08f13c33 and Linux 865002bae023ca2a98a32be1726a9be3bbfb8b98225136db8077da666858aee6. Do not exchange their exact-byte receipts or describe those archives as identical. Final README/evidence edits have their own package check; no package is published.

## Automated platform checks (2026-10-22)

The exact a9c2964 archive passes 1907 tests on both environments. The subsequent native-output-schema candidate also passes the complete check on both:

| Environment | Node / npm | Executed result |
| --- | --- | --- |
| macOS arm64 | 24.22.0 / 11.8.0 | 1925 tests in 87 files; complete check passes |
| Debian bookworm Linux arm64, Docker | 24.22.0 / 11.19.1 | 1925 tests in 87 files; complete check passes |
| macOS arm64 | 22.23.1 / 11.8.0 | 1925 tests in 87 files (272.82 seconds); complete check passes |
| Debian bullseye Linux arm64, Docker | 20.0.0 / 9.6.4 | Built runtime only: offline package, smoke, docs, harness, three corpora and eight explicit conformance simulations pass |

The Node 24 Linux check uses Git 2.39.5 and the official Node image pinned to sha256:925de64a85319052d6971ae81ef2417da956e8a3a2c4a0fac732327970f017f5. Dependencies are prepared separately with only the package manifests. The source check then runs without network or native credentials, as a non-root user with no capabilities, from an immutable source archive and a fresh synthetic Git baseline. It does not mount the real checkout/history or personal directories. The candidate archive SHA-256 is ffdbde1a83e8f30f67ed149d4fc1910e78a5ee7c75f246959ae33f3d8309715a, based on a417fc0 with the new source/tests. A Docker EOF interrupts the first candidate attempt; retain its partial log and repeat in a fresh container. The successful run takes 52.62 seconds with no skipped tests. Its offline package SHA-256 matches macOS: 6956be93c238a526a84b7b72a289bc88cf4c7c1b6570ff9b1f4fc324cdc55d5f.

The subsequent Markdown normalization candidate passes the complete check on macOS and Linux arm64/Node 24.22.0: 1955 tests in 88 files, including 30 layout regressions, with no skips. The package SHA-256 is 728823fdb029b0412395f2b7d3d412b998fa2bf047619085cb227c3757be28be on both hosts; the core is 3d143f492873aa027f41d0f13af9d8fabd3f7b6c8ed60603807b01884de8f178. The network-disabled Linux candidate archive is 274754578ae6c84c11aacf20f67ebff663ff30d15f0d0ae4a0d7b49d147e217c, based on 50d4191. Restore literal fixtures after the first failed evaluation and synchronize embedded guidance after the next generated-catalog failure; preserve both earlier attempts. Final checks pass after those corrections. This is source/core automation, not new native or service certification.

The additional Node checks use source revision 455433c and core SHA-256 9ea3a2985503d57aef4f38ef60d06dfd9173db858e629713e165008db5315b58. The Node 20 image is pinned to sha256:942fa0013e9adfbde06ad07433bdb0a67cc2ac0d5a3db38f12a9c8f710b41f1c; it has Git 2.30.2. Its credential-free, network-disabled container receives an immutable source archive (63096aff51dc27127e044e82741add452563305c995980d1c606c2b0f760004a) and a separate already-built bundle, with no development dependencies or real checkout/history. Offline package installation verifies both aliases and Codex managed install/idempotency/removal. The npm 9 archive has its own valid SHA-256, 94611448defd9e8aa53a0389095ae7717f1dda1ea955fae336be77c340aba7d5; do not require different npm versions to produce byte-identical archives.

All seven pinned adapter scenarios plus OpenCode 2.1.1 return FIXTURE_PASS with simulation evidence; missing/conflicting execution modes refuse and report replay matches exactly. No native client runs. Definitions (30 cases), gates (24 supplied prediction cases) and grounding (20 cases) return exactly the same JSON as macOS Node 24. Definitions retain two semantic misses; supplied gate predictions retain six misses and two false positives after refutation. Those are existing evaluator limitations, not perfect model-quality scores. Grounding passes all 20 cases. CI now repeats offline package execution, harness and the three built-CLI corpora under Node 20 after building on Node 22. The exact YAML run block also passes locally in a fresh Node 20 container; actual hosted execution is still pending.

- [x] Execute lint/types, all unit/process/Git/worktree/compiled CLI fixtures, build/smoke, offline npm packaging, schema compatibility, references, docs, harness, Markdown and all 35 Mermaid diagrams on Linux arm64/Node 24. No test is skipped.
- [x] Run the complete check on macOS arm64/Node 22.23.1, including all 1925 tests and the offline package. No test is skipped.
- [x] Execute the scoped Node 20.0.0 Linux arm64 built-runtime checks above, including eight explicitly simulated adapter/dialect scenarios and exact three-corpus parity with Node 24.
- [ ] Repeat other supported Node/platform combinations, including Linux x64 and the remaining Node 20 workflow/provider/native surfaces. The scoped runtime probes do not establish every installed command or actual client/service behavior.
- [ ] Execute real native-client discovery/permissions/hooks/models, authenticated services and hosted release/Actions workflows on Linux. PATH fixtures and local publication simulations do not establish those results.

Earlier per-component observations below remain historical. Their automated fixtures now also have the Linux arm64/Node 24 result above; references to other versions or real clients/services stay open. New technical defects found by native trials still require implementation rather than an owner acceptance waiver.

## Owner-observed Claude framing and session recovery (2026-10-22)

The owner exercised source-installed user-scope loose skills in Claude Code, then closed the session, opened a new one and invoked status again. The local CLI reports Claude Code 2.1.306 on macOS arm64 with Node 24.22.0; the installed source revision was f714820. These are interactive observations and independent read-only core checks, not a collected conformance-runner verdict.

- [x] Invoke wl-frame-problem from a sentence in the actual client. Observe the eight framing questions, explicit unknowns and a pause for the owner's decision.
- [x] Complete an explicitly fictitious scenario with the owner's on-hold outcome. Independently inspect the English external-store artifact and core state: framing completed, initiative closed, no next step, and the approved reason/reopen condition retained.
- [x] Close Claude, open a new session and invoke wl-status with the same initiative ID. The owner reports the same closed initiative, completed framing, no next step and retained on-hold note.
- [ ] Repeat narrative decision fidelity on a new run using frame draft/finalize (ADR-0086): the stored artifact preserves the owner's reopen condition but also introduces stricter reopening requirements and drop rules without approval. The core now renders only explicitly approved decision data and rejects extra stop rules at finalization. Verify actual client behavior; retain the original artifact as historical defect evidence.
- [ ] Verify final semantic revision review in a new native run with frame finalize. The transcript reports two challenger rounds, followed by a third draft that received structural validation only; this does not establish final-content review or independent reviewer isolation. The core now rejects mismatched final digests and incomplete coverage; actual semantic truth and role isolation remain acceptance.

This observation does not close plugin installation/all-entrypoint discovery, actual hook denial, role isolation, authenticated providers, the go/spec path, the random-marker runner scenario or other clients/platforms. The unchecked aggregate checks below remain open for those broader requirements.

## Automatic native-client trials (2026-10-22)

The owner authorized actual model-backed execution of the other installed clients. Run fresh disposable fixtures; retain earlier failures rather than relabelling them after a code change. All observations below are on macOS arm64/Node 24.22.0.

| Client | Observed version | Actual result | Remaining issue |
| --- | --- | --- | --- |
| Codex | 0.163.0 | PASS with live-process-and-journal evidence, no missing events/problems | Standalone framing only; hooks, permissions and broader workflow remain separate |
| OpenCode | 2.1.1 | Fresh FAIL on core 1237b1be: initiative created and framing started, but the 180-second deadline expired | A longer diagnostic-only attempt on core 40482b4d exited 1 with a provider error mentioning HTTP 503; no completed framing or passing receipt |
| Copilot | 1.0.83 | Fresh FAIL on core 1237b1be: exit 0, no journal events and permission-denied diagnostic | Native permission review for the exact checked launcher is required; no broad tool grants were added |
| Gemini | 0.27.0 | FAIL; process exited 1 without required events | A separate short probe reports IneligibleTierError; native account/project eligibility needs resolution |
| Antigravity | 1.4.4 | Fresh FAIL on core 40482b4d: exit 0, no journal events and permission-denied diagnostic | A tool step errors and the successful terminal result lists denied actions; scoped native command approval is required |
| Cursor | 2026.07.16-899851b | FAIL; process exited 1 without required events | A separate short probe reports missing native authentication |

- [x] Execute and retain the six initial real reports outside Git, with exact observed versions.
- [x] Correct the prompt's appended punctuation and obtain an actual Codex standalone framing PASS on bundled core 04fe3f55 (digest prefix); do not loosen the judge's exact-input comparison.
- [ ] Obtain a passing fresh scenario for OpenCode, Copilot, Gemini, Antigravity and Cursor after diagnosing each actual failure.
- [ ] Verify the isolated permission/hook/client-specific spike in addition to structural framing. One passing client cannot close the four-client P1-14 or seven-client platform acceptance.

Technical remediation under ADR-0087 adds conformance diagnose with bounded, redacted event/error categories, a private OpenCode 2 server and documented AGY stream-only invocation. Actual no-tool probes on OpenCode 2.1.1, Copilot 1.0.83 and Antigravity 1.4.4 returned model responses, including piped Copilot and both AGY input variants. This is transport/model-access evidence only. A later full-trial host invocation was rejected by automatic approval review over possible private harness disclosure before native execution; it is not a new native failure. The owner subsequently explicitly approved that disclosure. Fresh execution on core 1237b1be created OpenCode's initiative but timed out; Copilot reported a permission denial. Antigravity's ERROR tool step and nonempty denied_actions inside a SUCCESS result initially escaped classification. Recognize both bounded structured fields without retaining parameters, actions or responses; an actual fresh run on core 40482b4d now reports permission-denied and remains FAIL. Earlier receipts are preserved. Do not promote these failures or no-tool probes to passes.

A longer OpenCode diagnostic attempt observed tool execution and repeated native retries, then an error envelope with type/message/status/response fields and provider/request/503 markers. Only bounded metadata was emitted, not native text. This is an upstream availability signal, not proof that all OpenCode behavior is correct. Map structured numeric HTTP 502/503/504 errors to connection-failed; fixture tests cover that mapping and unrelated/malformed statuses. No repeated native 503 response is forced, and no model/account is substituted to get a pass.

The Codex receipt and exact passing core are retained externally. Later OpenCode and Antigravity recipe changes have their own receipts/core identities; do not present different-build observations as a comparable pinned/latest regression. No native permission bypass, credential copying, service write or project push was requested by these scenarios. Native ambient side effects are not fully observed by the structural judge.

### OpenCode V2 transport and guard observations

- [x] Preserve the default/pinned V1 render and add explicit adapter build-native selection. Managed install/conformance/headless execution select the observed exact version; unsupported future majors refuse.
- [x] Keep native version initialization out of the real home, including install dry-run. Actual --version cache/log side effects were found by a failing regression and isolated in a temporary child home.
- [x] Actual OpenCode 2.1.1 discovers the inspector from the worker's isolated global config and returns WL_READY. Project-config discovery failed for this noninteractive worker. No personal configuration or permission bypass is used.
- [x] With that V2 inspector, read the assigned external synthetic README through the actual native reader and receive WL_READY. This is a positive read test, not complete permission isolation.
- [x] In an isolated user-scope V2 installation on core e601507c, observe actual native README read success and reserved runtime write denial with the core's reason. The reserved file does not exist afterwards. No project checkout or personal native configuration is changed.
- [ ] Verify project-scope hook activation/trust and negative read-only permission boundaries on the intended native setup. Current policy tests are synthetic; the observed user-scope guard denial covers one version/configuration only.
- [ ] Obtain a complete real gate review and parity result. The bounded six-lens source-API attempt failed (five timeouts, one invalid response); single-lens retries also timed out. A bounded observer later found a completed response in a Markdown fence; the new strict V2 codec unwraps only one exact JSON object before unchanged assignment/schema validation. Preserve earlier failures; this format fix alone is not a new native gate pass.
- [ ] Repeat complete framing with the exact approved/reviewed final draft, and repeat supported-version/Linux checks. Earlier V1-rendered receipts are not passes for the new V2 transport.

## Remote rollout bridge (P4-05 component)

- [ ] When Amplitude is actually needed, use client MCP discovery to capture its exact dashboard/chart write and readback contracts. Preserve only non-secret schemas/permissions. Until then, its dashboard operation stays a pending handoff. Under ADR-0085 this is deferred service certification, not a requirement to implement another HTTP host or a 1.0 blocker.

- [ ] In a disposable Mixpanel workspace, verify official regional App API/Bearer access and exact project/workspace inventory before creation. Review actual native Insights query/cohort/time parameters and expected window/timezone, create one private dashboard/owned report deliberately, then check v2 report identity/params, dedicated relationship, privacy/public-link fields and actual rendering. Confirm complete scope/envelope behavior, permission failures and retained partial references without retry. Current responses are synthetic; no actual API/native query/time scope/rendering/traffic/Linux acceptance is established.

- [ ] In a disposable Metabase deployment, review the exact native SQL, its expected day window/timezone in the real dialect, database/collection IDs and underlying read-only database role. Verify API-key permissions, new dashboard-owned card placement and legacy-mbql=true readback after current MBQL conversion. Check actual parameters/series/sharing, metadata-query side effects, normalization and rendered table. Review retained partial references on failure; no cleanup/retry occurs. Current HTTP fixtures establish no actual server/SQL/time-scope/rendering/traffic/Linux acceptance.

- [ ] In a disposable PostHog project, verify the dashboard bridge's exact organization/project/timezone precondition, original HogQL filters placeholder, pinned day window and actual table rendering. Confirm current-version support for the documented but deprecated dashboards write field during insight creation and non-deprecated attachment readback. Verify null overrides, server normalization, one active tile, permission failures and partial dashboard/insight outcomes. Inspect retained pending references before any further action; no cleanup/retry is automatic. Current HTTP tests are synthetic; no actual create, query, rendering, traffic or Linux acceptance is established.

- [ ] In a disposable Grafana 12+ deployment, review the exact completed metric/source query and bridge folder/namespace/Prometheus datasource/new dashboard UID. Preview launch dispatch, authorize only a deliberate create/read, and compare actual stored/rendered chart, unit/target description and window/timezone. Confirm existing UID conflicts, strict readback (including server-added defaults), permission/PromQL failures and lost-response behavior. Inspect retained intent/partial creation before any further action; there is no overwrite/delete/retry path. Current API responses are synthetic; no actual creation, query validity, rendering, traffic or Linux acceptance is established.

- [ ] In a disposable PostHog project, review the explicit project/environment mapping, preview both read stages and authorize read-only credentials. Compare simple decimal/zero/full/inactive person rollout with the real console/SDK; confirm exact-case unique lookup and unchanged detail identity. Verify pagination, targeting, experiments, runtime restrictions, evaluation contexts, variants, continuity, holdouts and unsupported controls remain unknown. Check the configured mapping is labelled explicitly and never accepted as API-observed deployment scope. Current HTTP evidence is synthetic; actual service/native/Linux acceptance remains open.

- [ ] In a disposable GrowthBook project, verify the explicit reader uses the published revision and live environment controls despite contradictory drafts. Compare default/force/forward/reverse/zero/full state, JSON boolean handling, project scope, compiled definitions and decimal percentages against the actual management API/SDK. Confirm hashed cohorts are labelled contexts with id and cannot satisfy all-context ramp claims; check missing-ID fallback behavior separately. Current responses are synthetic; actual credentials/API/native/Linux acceptance remains open.

- [ ] Repeat the remaining built-CLI/provider runtime scenarios across supported Node/platform versions. The complete check now passes on macOS Node 22 and macOS/Linux Node 24; Node 20 Linux package/corpora/conformance simulations pass at the scoped surface above. Actual Node 20.0.0 macOS arm64 also passes the earlier compiled flag preview and synthetic signal-bearing host subset. Complete Node 20 behavior and actual native/server acceptance remain unverified.

- [ ] In a disposable Unleash project, configure the explicit Admin reader and authorize a read with the exact deployment/subpath/project/environment. Compare default and default-stickiness percentage/disabled state with the native console, verify environment variants are fetched, and inspect dependency/targeted/union/release-plan/safeguard refusal. Current tests use synthetic responses and source API contracts; actual authentication/version/native/Linux behavior remains unverified.

- [ ] Configure the explicit LaunchDarkly reader with a restricted REST token from the credential store and exact project/environment. Review the default plan, then authorize a live read only in a disposable test project. Confirm complete simple boolean/direct/weighted/reversed/off configurations match actual native state, no credential/raw targeting prose appears in output and no flag changes. Current HTTP tests are synthetic, not authenticated captures.
- [ ] Verify rules, prerequisites, targets, experiments, custom buckets, incomplete responses, missing permissions and deadline failures stay unknown. Feed only the exact normalized result into its matching ramp request fingerprint and retain actual completion time. Repeat actual API/native/Linux behavior; remote certification remains deferred and no additional HTTP bridge is required under ADR-0085.

## Explicit conformance collection (P5-04 component)

- [x] Deliver the explicitly selected nightly OpenCode model through the documented V1/V2 --model flag, validating before native startup. Keys remain environment-only; no native config is written or model/account chosen automatically (ADR-0090). Synthetic transport passes do not establish authenticated Actions/model access.
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

Both local hook transports are implemented. Actual Gemini/Antigravity activation, model, permission and MCP acceptance remains unverified.

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
- [ ] Choose public repository visibility and hosting explicitly, verify npm ownership and activate and verify the implemented trusted publication/provenance workflow. The local exporter changes neither repository visibility nor package privacy and performs no publication.
- [ ] Run release preflight from the actual source checkout with the intended built/package/lock version and genuine CI repository/event context. Inspect blocked reasons and masked index flags without silently clearing personal setup. A ready local consistency plan is neither authenticated context nor permission to publish; actual ownership/OIDC/provenance and release activation remain separate.
- [ ] Record actual fresh-machine installation time and review release notes without attribution after delivery activation. Run the local release notes draft against the intended exact range, check actual breaking intent/migration guidance and inspect identity-only rejections. Repeat complete-clone/range/refusal behavior on Linux and supported Node releases; draft impact alone does not verify compatibility. Publication automation is implemented locally; actual hosted/OIDC provenance remains owner verification. Optional compiled binaries remain optional future code work.
- [x] Repeat package:check on Linux arm64/Node 24.22.0/npm 11.19.1: actual offline archive/install/bin-links/managed-file execution passes, matching the macOS package hash. Package privacy stays true and no publication occurs.
- [ ] Repeat other supported development Node/npm/platform combinations and the complete installed-core Node 20 runtime surface. Inspect retained interrupted/failed fixtures before removal; native activation and fresh-machine timing remain separate.

## Generated references (P5-06 local controls)

- [ ] After changing source contracts, rebuild before running docs check. Follow the chosen client onboarding section and keep the selected absolute core path when changing projects; native file installation does not create a global alias. Confirm command/config/provider/adapter sections describe that build, not an older executable on PATH.
- [x] On Linux arm64/Node 24, repeat read-only drift detection, explicit selective/full regeneration, malformed-marker refusal and preservation of surrounding prose through the compiled fixtures and complete check.
- [ ] Repeat the generated-reference fixtures on other supported Node/platform combinations.
- [ ] If regeneration is interrupted during writes, inspect the affected pages/markers before rerunning. All selected markers are preflighted, but filesystem failures do not provide multi-file crash atomicity.

The generated provider and adapter tables record declarations only. Check that local engine changes retain unverified native status. Native capability-matrix collection/version resolution/issue automation remain P5-04 implementation work. The local P5-06 references/banner/onboarding deliverables are complete; real native discovery, activation, permissions and first-step checks remain in the client sections above. Overview pages retain native/host verification boundaries.

## Public contracts and v1 candidate (P5-07 component)

- [ ] On a disposable external copy of an older store, repeat gate/suite reads and projection rebuild after upgrade. Root schema metadata/wrappers must not rewrite journal envelopes or change payload acceptance. Exact prior rule hashes and local replay tests passed; physical upgrade/Linux/other supported Node execution remain owner checks.
- [ ] Review the v1 candidate's schema/step/command/exit boundaries against actual supported workflows and release-note breaking intent. Repeat declaration checks on Linux/supported development Node versions and installed-core checks on supported runtime Node versions. Fingerprints flag changes without proving runtime semantics; no current surface is deprecated and actual release/tag/announcement remains unperformed.

## Disposable standalone framing conformance (P1-14)

- [x] Supply an explicit fictional owner declaration for the final exact fixture digest and decision. Require the matching final-review note and artifact; installed-core simulations use a labelled simulated reviewer and remain FIXTURE_PASS (ADR-0089). This closes the one-shot scenario's missing test input, not real-human or native semantic acceptance.
- [ ] Obtain fresh native passes on the remaining clients for the revised scenario. OpenCode 2.1.1 run cf-c8f17565452bed83624a65b7 on core da2b4506 failed before journal creation (exit 1, one unclassified native error). Preserve the failure and inspect native availability without guessing its cause or weakening final-review checks. Earlier passes have different scenario/core hashes.
- [x] The revised fictional final-approval scenario passes on actual Codex 0.163.0, core 10cca6bc, run cf-ade63be4ab7e78074a428393 through the source-API runner with a temporary closed-category observer. Exact version, marker, final-review note, bytes/decision and journal chain match, with no missing events/problems. Preserve the earlier incomplete run cf-f957433ff689971ec75c84aa; neither outcome establishes reviewer truth/isolation or other workflows/clients.
- [ ] Build, then prepare one fresh run per actual tier-A client with --target and its exact --pin version. Inspect returned fixture/prompt/native recipe and executable resolution; a version token alone is not binary provenance. Retain source/scenario/core hashes.
- [ ] Arrange native trust, auth/model selection and external-state permissions without modifying the fixture baseline. Invoke `conformance run <id> --live --json`, inspect process/journal/artifact results and record each actual result. Native customizations remain enabled; no permission bypass or credential copy is performed. Client startup files may trigger an explicit workspace-change failure.
- [ ] Confirm the real installed skill supplies the random note marker, creates one owned standalone initiative, completes framing with a go receipt and stops before write-spec. A marker proves instruction consumption, not an adversarial loader attestation; review narrative evidence/challenge quality separately.
- [ ] Exercise actual timeouts, cancellation and native failures; the report must name CLI, step and missing events without retaining stdout/stderr. Interrupted/failed fixtures cannot be retried or relabelled. Inspect retained evidence and prepare a new run.
- [ ] Inspect native logs, ambient plugins/compatible user skills, ignored files, Git metadata, external writes and any remote effects. This structural scenario does not validate native JSON protocol, read-only role isolation, hook activation or the broader P0-03 matrix.
- [x] Repeat all seven installed-launcher simulations and compiled conformance-runner fixtures on Linux arm64/Node 24 in the complete 1925-test check. Results remain simulation, not native Linux passes.
- [ ] Repeat real clients and other supported Node/platform combinations before making broader portability claims.

Automated tier-A/Gemini/Antigravity/Cursor installed-launcher simulations report FIXTURE_PASS, never a native conformance PASS. Preparation launches no model; --live is an explicit owner action that can use authenticated models and incur cost. The interactive Claude observation above is separate from this unexecuted live runner scenario; actual observations remain separate from local fixture coverage.

## Native installation and observed diagnostics (P1-13)

- [ ] Run native user/project install/uninstall with explicit targets in disposable client configurations. Verify all seventeen wl-prefixed skills/eight roles, native discovery, restart/trust behavior, permission inheritance and compatibility precedence. Filesystem/transport fixtures do not establish actual client activation.
- [ ] Verify source-installed Claude scoped skill/agent hooks, Copilot dedicated user/project hooks, OpenCode helper import and Codex per-repository Git fallback. Generated plugins are a separate delivery format; no shared settings/MCP/auth store is rewritten.
- [ ] Repeat project relocation and user config overrides, including URL/shell-special paths. Inspect ownership receipts in the external store, backups of replaced/removed bytes, edited/unowned refusal and missing-file uninstall; no automatic adoption/force option exists.
- [ ] Interrupt actual installs/upgrades/uninstalls, inspect the pending receipt/lock and recover all pending targets together only after confirming the writer stopped. Synthetic mixed-version recovery is not physical-crash evidence; unknown staging files or edited backups need manual preservation/inspection.
- [ ] Run doctor with the actual installed clients and explicit artifact directories. Confirm each reported token comes from the intended executable/PATH and inspect vendor requirements separately; a version does not prove native skills, hooks, permissions or authentication.
- [ ] On each platform, exercise selected missing clients, failed/slow version commands, stale/copied artifact hashes/modes and malformed declarations. Failures must offer instructions and repair/diagnostic argv without exposing raw output or config values.
- [ ] Verify the atomic external-store probe and cleanup under real permissions/filesystems, including inaccessible and symlinked Git destinations. Inspect any failed cleanup; retain other state and do not repair permissions automatically.
- [ ] Repeat on Linux and supported Node releases. Current automated execution is macOS arm64/Node 24; npm recipes for current Claude/Copilot require Node 22 or newer even though the bundled core supports Node 20.

Native install/uninstall and managed doctor inspection are implemented. Actual activation and corrective commands requiring the owner's platform/configuration choices remain verification. Native conformance is tracked separately below.

## Common guards and Git fallback (P3-08)

- [ ] Capture actual before-tool events on Claude/Copilot/OpenCode; compare schema, tool names, cwd, write paths and event ordering with the authored fixtures. The Codex-shaped SDK fixture is synthetic; verify its actual CLI Git fallback instead of treating desktop hooks as CLI support.
- [ ] In disposable clients, try wrong-checkout/default-branch Build commits with the returned WL_SUBJECT environment, extra/deleted/stale push refs and reserved runtime writes. Normal native reads/permissions must retain their ordinary behavior; synthetic transport tests do not establish client enforcement.
- [ ] Exercise inner/outer timeouts, inaccessible stores, managed policies and disabled hooks. Copilot outer hook timeouts can fail open; retain Git fallbacks and inspect real sandbox access to the external store.
- [ ] Inspect existing hooks before an explicit guard hooks install on a disposable project. Verify original execution/exit codes and changed-file/config refusal; uninstall must restore only prior local configuration and retain the returned backup. Relative/multiple effective and worktree-specific hook paths need manual chaining.
- [ ] Recover a physical interruption by inspecting the external ownership receipt/lock and current Git configuration. Do not delete prepared/changed files or steal locks. Reinstall after reviewing new original hook names or upgrading the pinned core.
- [ ] Repeat actual Git-hook chaining, local bare SSH-shaped pushes, native root expansion, symlinks and timing fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64/Node 24 only.

Native installation returns explicit per-repository Git activation/removal commands. No hooks were installed in this repository, no actual project push ran and no model session was executed by these synthetic/temporary tests.

## Additional tier-A artifacts (P1-11)

- [ ] Load generated Codex/Copilot portable skill packages and install the appropriate native agent overlays, including Codex project/user TOML agents. Verify all seventeen prefixed skills/eight agents and their actual invocation; a portable skill package does not prove Codex agent discovery.
- [ ] In actual clients, verify loaded skill-directory reporting, launcher execution, checked artifact roots and conductor handoff after relocation and symlinked installation. Missing context must ask rather than selecting another wl on PATH.
- [ ] Exercise disposable read-only sentinels and actual command/provider handoffs. Codex custom agents inherit the parent sandbox; verify the checked read-only parent/headless path rather than trusting instructions or an unsupported per-role sandbox override.
- [ ] Inspect OpenCode/Copilot native permission behavior, inherited repository instructions and native external-directory asks. Static mappings and partial/native listings do not prove runtime enforcement, complete isolation or independent workers.
- [ ] Repeat native discovery, launcher/symlink, permission and copied-runtime fixtures on Linux and supported Node versions.

Native guard bindings and the Codex Git fallback are implemented. Native/headless model conformance remains pending and does not block independent installation work.

## Generated Claude artifacts (P1-10)

- [ ] Install a generated plugin in an isolated real client configuration, list all seventeen skills/eight agents and invoke a unique marker. Static plugin validate passed locally; it does not establish discovery or execution.
- [ ] Confirm plugin-root substitution and conductor root handoff select the copied core in paths with spaces, including after moving the artifact tree away from the source checkout.
- [ ] Exercise read-only roles against a disposable sentinel, including roles with shell access and managed policy. Confirm model tier aliases and batched missing-context questions; no independent model session has been run.
- [ ] Repeat owned output, backup/mode/symlink and bundled runtime fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64 only.

Native hook registration and the other tier-A renderers are implemented; actual hook capture and installed-client behavior remain owner checks.

## Conformance matrix and nightly activation (P5-04)

- [ ] After explicit native runs, wrap their exact reports with pinned/latest channel and actual observedAt timestamps. Compare the matrix with the original external reports, including actual client versions, core/source/scenario bindings and named assertions. Imported reports are not authenticated by the renderer.
- [ ] Independently diagnose model/authentication/managed-policy failures. A successful framing process with missing journal assertions is a structural failure; it is not evidence that every native capability regressed.
- [ ] Compare/write the observation page against the original external reports with explicit --docs/--at and optional --write. Verify original dates, stale/simulation distinctions, source privacy and unchanged prose. Repeat refusal/idempotency on Linux and supported Node releases; inspect interrupted writes before regenerating.
- [ ] Confirm scheduled collection, latest-version resolution, service credentials and issue permissions/deduplication once their code is implemented. Current local matrix/page tests do not exercise CI or send issues.
- [ ] Repeat CLI/read-boundary and timestamp fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64 only.

## Headless gate processes (P5-03)

- [x] Pass the roadmap's stubbed native/sequential/headless verdict/quorum comparison and one actual compiled-CLI six-lens review: Codex 0.163.0, core 9ea3a298, gate-35be1f516f42cb8c. Six workers succeed, no coverage is missing and the repository is unchanged. Preserve previous failed rounds; no real refutation or adversarial isolation is inferred.
- [ ] Execute one pinned review and verification round with actual native, headless and sequential workers. Compare coverage/quorum/verdict, independently inspect evidence quality and record exact client versions. Synthetic parity tests do not establish real model equivalence.
- [ ] On actual Claude/Codex clients, verify stdin/final-result normalization, no reused conversation, read-only tool/sandbox enforcement, disabled MCP/customization and non-interactive denial. Inspect managed policies/hooks and client-owned logs; current help probes are not a live pass.
- [ ] Interrupt real clients and confirm owned descendants stop, incomplete workers remain unknown and no failed refuter adds a vote. Recover a physical-crash lock only after inspecting owner.json and confirming its process stopped.
- [ ] Inspect ignored/transient-restored files and external side effects; repository snapshots cannot prove their absence. Confirm authentication uses the client's credential store without plaintext copies.
- [x] Repeat process-group, timing, permission and worker fixtures on Linux arm64/Node 24 in the complete check. Real native Linux clients and other Node/platform combinations remain open.

OpenCode/Copilot recipes have local fixture coverage. Verify OpenCode native deny-default agent permissions, external-directory containment, completed-message JSONL and inherited managed configuration. Verify Copilot stdin/silent output, read-only available-tool filtering and non-interactive refusal without broad grants. Inspect custom MCP startup and trusted-folder hooks independently: tool restrictions do not prove that these startup effects are disabled. Keep credential stores in place; no copied tokens or permission bypasses are needed. Verify Cursor Ask/sandbox plus actual worker-local cli.json/hooks.json discovery, read/search-only hook activation, native denial precedence, no reused session and successful final JSON. Exercise shell, write/delete, web, MCP, unknown tools and missing Node against disposable sentinels; inspect native startup effects and logs. Gemini/Antigravity private observer recipes now have local fixture coverage. Verify actual positive read-only registry/private settings and init-before-assignment behavior; a client that waits for input before initialization remains unavailable. None of these owner checks blocks independent local roadmap work.

## URL adoption and shared publication (P2-08)

- [ ] In each real client, adopt one actual docs URL and one tracker item using authenticated complete revision-bound reads. Confirm URL variants reuse one initiative, unresolved owner/title questions appear together, and imports fabricate no approval or completed Define step.
- [ ] Select explicit sandbox destinations, switch to shared and publish existing artifacts through the conductor. Complete each Define step and verify its outbox is consumed; a bare CLI completion queues without an authenticated writer.
- [ ] Confirm the real provider's conditional revision semantics preserve unrelated/concurrent edits and its complete read normalizes the exact published chunk. CLI imported observations are labelled imports, not proof of a live tool call.
- [ ] Interrupt after a remote create/update and before its response/receipt. Locate and read the resource, reconcile once, and confirm no client blindly retries the write. Local mode pauses new requests but cannot revoke already handed-off work.
- [ ] Resume/rebuild from another real CLI, inspect pinned destinations and sharing/outbox projections outside the repository, and repeat local fixtures on Linux and supported Node versions.

## Grounding corpus and real workers (P4-07)

- [ ] Review every original dataset label and trap reason independently; verify source/unit/query/window semantics before treating the seed as representative.
- [ ] Export blind inputs and isolate real workers from labels, this guide, the corpus and baseline. Collect complete digest-bound predictions and preserve actual model/client/query execution records separately; provenance metadata alone proves nothing.
- [ ] Score the exact seed and inspect every failed or missing assertion, including real zero, wrong sources/units and absent metrics. Compare real worker results with prior real worker results, not the synthetic core baseline as model-quality evidence.
- [ ] Evaluate research/framing prose, launch/decision narrative and qualitative statistics separately. This seed covers structured ramp/impact numeric collectors only and explicitly lists the other steps as unevaluated.
- [ ] Add real escaped failures with reviewed original fixtures and calibrate meaningful workload thresholds. The twenty-case seed establishes no population rate or causal production effect.

## sync and actual service agreement (P4-06)

- [ ] Authenticate code-host reads in disposable GitHub/GitLab projects and verify complete exact PR/head/base/repository/commit identity across normal, closed-unmerged, rebased and squash-merged outcomes. Imported fixture observations do not prove those remote facts.
- [ ] Bind actual tracker providers/references/state IDs through the SDK host. Verify complete revision-bound read, conditional transition and observed final state, including provider permission errors and concurrent human edits. The CLI has no authenticated tracker executor.
- [ ] Interrupt after tracker transition and reconcile by reads without repeating writes. Verify manually reopened tracker/local work is retained and old publication plans cannot re-close it.
- [ ] Schedule sync with explicit repository/store context. Inspect unbound tracker handoffs and unknown reads rather than treating exit success as proof of every service's health.
- [ ] Stop worktree leases deliberately, inspect processes/ignored files and confirm local integration before cleanup. Remote squash/rebase merges may be retained by the ancestry guard; sync never fetches, stops processes, forces removal or deletes branches.
- [ ] Repeat real Git/CLI cleanup and recovery checks on Linux/supported Node versions. Local tests use synthetic providers plus temporary real Git worktrees on macOS/Node 24; no actual wholeloop worktree or remote service was changed.

## Rollout providers — deferred service certification (P4-05)

- [ ] In a real native client, inspect tools/schemas, review operation bindings and run provider plan against non-secret external metadata. Verify actual authentication, argument translation and normalized results for the chosen operation. Confirm a permission failure remains pending/unknown with no HTTP fallback. Routing, once-only dispatch and unknown handling are covered by synthetic tests; this checkbox is actual client/service certification.
- [ ] Compare the implemented LaunchDarkly/Unleash/GrowthBook/PostHog REST readers against authenticated disposable-service captures and exact supported versions. Current HTTP fixtures are synthetic, not owner acceptance. Verify scope/cohort semantics and preserve unknown for complex targeting or missing access; PostHog environment scope is explicitly owner-configured, not API-observed.
- [ ] Capture actual dashboard-write tool schemas/permissions and target data-source requirements for PostHog/Mixpanel/Amplitude/Metabase/Grafana. Grafana now has an explicit create-only/readback bridge. Amplitude retains a pending handoff until a reviewed client MCP contract is supplied; a dedicated HTTP host is not required. Mixpanel has explicit workspace-bound private creation and dedicated report/relationship readback. Metabase has a create-only owned-question bridge with unverified owner-reviewed native SQL time scope. PostHog has explicit project-check/create/readback and inspectable partial receipts. Default local output remains a pending exact-metric handoff with createdRemotely=false, not a remote chart.
- [ ] Capture real MCP rosters/arguments, project/site/datasource IDs and permissions for Datadog/Grafana/Figma. Offline binding fixtures use synthetic normalized results and establish no remote compatibility.
- [ ] Pull/verify the pinned Grafana container and read-only categories on supported platforms; pass credentials from the host store, never literal secret arguments or plaintext config. No container was pulled or run locally.
- [ ] Review and manually post destination-labelled Slack/Teams/email drafts. Confirm no sending capability is present. Review/apply flag proposals externally; native proposal results are explicitly unapplied.
- [ ] Exercise config-file reads/proposals and external-store conflict/idempotency on Linux and supported Node versions. The native reader requires explicit flag/environment/enabled/exposure/audience and never changes repository bytes.

P4-05 implementation is complete under ADR-0085: client MCP takes priority, HTTP is explicitly selected and failed calls do not switch transport. The unchecked service/account cases above are deferred certification under ADR-0084, not release blockers or executed live tests.

## decide-next and actual follow-up (P4-04)

- [ ] Run the challenger in each real client with supportive/balanced/adversarial profiles. Inspect actual opposing reasoning, all four coverage areas, question budgets and loaded learn.decision guidance. Fixture labels do not establish semantic critique or model independence.
- [ ] Inspect actual checkpoint query/cohort truth and self-reported references, all unknowns and pending checkpoints before the human outcome. The core checks identity and coverage, not causality or the honesty of supplied person/reason fields.
- [ ] Verify iteration drafts carry the exact evidence and unresolved validation/cost/stop questions. Complete frame-problem explicitly; reopened pre-spec ideas must retain prior history without reusing developed scope approvals.
- [ ] Review proposed flag/code cleanup and implement or publish it through an explicitly authorized follow-up. Keep/kill/unflag change no actual flag or code, and local proposals are not remote tracker tasks.
- [ ] Interrupt around decision persistence and canonical closure, then recover with learn complete. Verify one iteration/decision, no premature parent closure, and reopened-scope eligibility. Automated recovery rebuilds a real journal prefix; it does not simulate physical power loss.
- [ ] Repeat CLI/process and canonical path checks on Linux/supported Node versions. Local verification uses macOS/Node 24 and synthetic challenger responses; no model, authenticated publication or production change ran.

## measure-impact and real grounding (P4-03)

- [ ] Execute pinned queries against disposable real sources; inspect event/cohort definitions, units, source references, timezones and complete rolling windows. Normalized fixtures establish arithmetic, not provider truth or causality.
- [ ] Verify actual launch anchors and configured checkpoint offsets, including custom names and late execution. Inspect due dates in status/next and source ownership for scopes cut from earlier specs.
- [ ] Run read-only analysts in actual clients and verify source isolation, loaded learn.report guidance and complete layouts. Inspect quotes for sensitive material and numeric assertions; source text is not a verified metric.
- [ ] Review actual unknown reasons with owners and preserve genuine zero values. Test permissions, absent metrics, malformed responses and unit mismatches without invented estimates.
- [ ] Authenticate comms.draft and docs providers in disposable destinations. Confirm unsent drafts, fresh complete document reads, exact revision updates, preserved unrelated content and one marker-bound appended note. Native threaded/tracker comments need host-specific extensions.
- [ ] Interrupt publication, inspect the retained intent and actual remote outcome before any new write. Do not clear ambiguity or retry blindly.
- [ ] Repeat CLI/process checks on Linux and supported Node versions. Local workers/providers were synthetic on macOS/Node 24; no live query, draft or document write ran.

## ramp-exposure and actual exposure changes (P4-02)

- [ ] Authenticate source/flag providers in a disposable environment. Verify exact query semantics, units, timezones, complete windows and cohort ownership; normalized fixture numbers do not establish source correctness.
- [ ] Inspect real flags.propose-change permissions and responses: create only a proposal, explicitly applied=false. Verify no toggle/apply action is possible through the selected client/server. Known route checks cannot prove opaque tools safe.
- [ ] Exercise go/hold/rollback across real sessions and CLIs. Confirm person/reason/exact evidence, separate fresh flag reads, actual audience percentages and full windows after every confirmation or restored control. Inspect continuous control history externally; snapshots cannot prove stability between reads.
- [ ] Inspect retained intent after an interrupted proposal before further writes. Never clear ambiguity or retry blindly; reconcile the actual remote request manually.
- [ ] Verify manual-control attestations against actual external evidence and keep normalized response files sanitized, with no credentials or private logs. The core trusts explicit host observations.
- [ ] Repeat CLI/process checks on Linux and supported Node versions. Local tests use macOS/Node 24 and synthetic hosts; no actual flag or remote proposal was changed/created.

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

## Environment ledger and actual undo (P3-09)

- [ ] Declare actual process/container/data/service effects before hand-back. Verify each appears with complete non-secret undo argv/cwd in the Build/PR receipt and current env report, including shared ancestor and child-part effects.
- [ ] Exercise undo recipes on disposable resources using the supported platforms. The ledger tests deliberately do not execute undo, so no cleanup success is implied by a stored recipe.
- [ ] Inspect dependencies and current ownership before following reverse declaration order. Verify repeated cleanup is safe in the actual tool and preserve resources still in use.
- [ ] Keep credentials in encrypted, OS or tool stores. Common shape/flag exclusions are not a complete secret detector; inspect recipe files and resource identifiers before declaration.
- [ ] Confirm effects added during human testing appear in the current report while historical step receipts retain the ledger at their completion time.

## open-pr and code-host execution (P3-07)

- [ ] Authenticate gh/glab using their own credential stores and exercise explicit prepare → human test → open in a disposable remote project. Confirm exact source SHA, named base, draft status, no implicit fork and no ready/reviewer/merge action.
- [ ] Test a self-managed host/group path and remote permission failure. Fork heads, nonstandard SSH ports and multiple push destinations require an explicit host extension; they are not guessed.
- [ ] Interrupt after the push and after remote creation, inspect what exists, and reconcile the observed matching draft URL. A request with no remote PR remains an explicit owner recovery case; do not clear intent or retry blindly.
- [ ] Confirm real template/style use and complete manual-test notes in each client. New code or a changed plan must invalidate approval; a bare test-it answer must not publish.
- [ ] Verify actual tracker mirroring and sibling PR back-links through the chosen host, and inspect all external environment writes/undo steps through the integrated environment ledger. Current publication records local links and carries stored tracker/known sibling references in the body.
- [ ] Exercise explicit PR comments and their stable round marker on a disposable remote. Sequential retries reconcile; simultaneous hosts still need coordination.
- [ ] Repeat process-group cleanup and Git/CLI fixtures on Linux/Node 20/22. Local execution used macOS/Node 24; the only real push was to a temporary local bare repository.

## review-code and incremental inputs (P3-06)

- [ ] Exercise the canonical skill in each real client. Confirm loaded repo rubric content and the incremental patch reach every reviewer/refuter; recheck prior kept findings even when unchanged in the new patch.
- [ ] Resolve an authenticated PR head through the host and inspect its isolated named-branch workspace. The CLI does not fetch or authenticate PRs.
- [ ] Repeat exact-index, mode, symlink and interruption/recovery fixtures on Linux and supported Node/Git versions. Local execution used macOS/Node 24/Git 2.49.
- [ ] Inspect sensitive project paths before snapshotting. Filename/content exclusions are conservative, not encryption or a complete secret detector. Preserve private objects alongside the journal when moving state.
- [ ] After configuring a codehost.comment-pr provider, explicitly request a test comment, confirm no approval/request-changes is emitted and reconcile an ambiguous network outcome before retrying. Synthetic host tests did not publish anything.

## verify-works and process execution (P3-05)

- [ ] Execute real project suites through each host, including instruction-file verify.suite bindings and monorepo command selection. Confirm actual criteria/changed-test observations rather than relying on structural lint or stub workers.
- [ ] Test process-group timeout/output-limit cleanup on Linux and supported Node versions. The local runner fixtures executed only on macOS/Node 24.
- [ ] Resolve an authenticated PR head/criteria through the host, supply its local named branch, and inspect the isolated worktree. Missing criteria must stay a question; the current CLI does not fetch PRs.
- [ ] Inspect suite effects outside tracked/non-ignored worktree files and supply undo steps. After a physical interruption, inspect the retained intent before starting another round; no automatic retry is allowed.
- [ ] Verify shared raw output remains transient in client context, durable receipts contain only hashes/exit metadata, and actual failed processes cannot be argued into a passing verdict.

## Builder host and build-slice (P3-04)

- [ ] Run the canonical skill in each actual client. Confirm the preflight appears before provisioning, resolved repository build instructions are loaded, and all writes stay in the allocated workspace. Typed-host fixtures are local conformance scenarios, not live client captures.
- [ ] Confirm native/sequential workers are independent and genuinely read-only in gates. Exercise guided/staged/parallel pacing, an interrupted partial gate and cancellation of already-running workers.
- [ ] Exercise an authenticated issue read through the chosen tracker, validate complete body/reference/revision normalization, and agree criteria explicitly. The CLI itself does not fetch issues.
- [ ] Test real project behavior and external environment effects; current worker fixtures are synthetic; suite execution and incremental review have local fixtures but require actual host observations. Green machine gates must still hand back for human testing without a push or PR.

## Gate engine (P3-03)

- [ ] Run the same pinned plan in actual native and sequential clients; compare complete results and use genuinely independent refutation sessions. Unit fixtures supply synthetic workers and do not prove client isolation or model quality.
- [ ] Confirm read-only tool enforcement in each client and a reported failure when a reviewer changes code. Boundary snapshots cannot observe a write restored before the next check.
- [ ] Exercise project/run budgets and a person-requested mid-run extension on real work. Confirm EXHAUSTED hands back findings and no host silently resets a failed run.
- [ ] Inspect ignored files, external symlink targets, submodules, external services and test side effects explicitly. The current gate snapshot covers tracked/untracked non-ignored files, index, HEAD and branch, and blocks on submodules.
- [ ] Repeat Git/permissions/symlink fixtures on Linux and supported Node versions. Local macOS execution is not cross-platform evidence.

## Owner actions still pending

| Task | Action | Current evidence |
| --- | --- | --- |
| P0-01 | Authenticate to npm and reserve the package when ready to make the name public | No package was published in this session |
| P0-03 | Follow the isolated-session [conformance checklist](../test/conformance/notes/README.md) for all four tier-A CLIs | Owner-observed Claude loose-skill framing/status and session recovery; broad discovery, permissions, hooks, MCP, plugin loading and other clients remain unverified |
| P0-06 | Optionally enable the local hook with `npm run hooks:install`; preserve any existing hook chain | A real hook was exercised in a temporary git repository; this checkout's Git configuration was not changed |
| CI | Run the updated workflow on Linux/macOS, including Node 20 runtime and a PR containing a rejected message | Local checks also passed on macOS arm64 / Node 24.22.0; no remote CI run or push was performed |
| P1-03 | Optionally exercise forced interruption during a store write, preserve the journal, inspect the lock owner and rebuild after recovery | Concurrent processes, failed batches, malformed journals, symlinks and byte-identical rebuild are tested; physical power loss is not |

## Provider validation still pending

MCP snippets for Claude, Codex, OpenCode and Copilot are golden-tested for HTTP and stdio. Merge a snippet into an isolated client configuration and verify an actual tool call and authentication before calling that integration supported. The eight destination providers have synthetic host-boundary transcripts, not live captured responses. Verify actual tool names/arguments, complete reads, rich-text preservation, revision conflicts and confirmed external links for each configured destination. Check Notion async results and aliases, GitLab version, Atlassian fields/permissions, and optional gws creation plus content insertion. No integration was installed. Registry detection only establishes declarations or executable presence. No live provider operation, model session or OAuth flow was executed here.

## Source validation still pending

For each configured source, verify the actual project/tenant, regional endpoint, live tool schema, permissions, pagination/truncation, query reference and exact window/timezone. All eleven source transcripts are synthetic. Replace Metabase's example endpoint and configure Zendesk's real tenant/host authentication. Verify PostHog tools mode and BigQuery read-only IAM/cost controls. For PostgreSQL use a restricted libpq service and verify server read-only rejection, function privileges and timeout behavior; process tests used a fixture executable, not a database. Failed or incomplete access must produce an explicit unknown rather than a baseline.

## Worktree validation still pending

On a representative project, verify dependency/setup commands, actual port binding, submodules/LFS, platform-specific Git behavior and the explicit checkout opt-out. Local tests used Git 2.49.0 on macOS with real temporary repositories, concurrent CLI creation, dirty source checkouts, stacked branches, locks and conservative prune. These fixtures also pass on Linux arm64/Node 24/Git 2.39.5; other platforms/versions and physical process interruption remain unrun. After an interruption, inspect stale lock ownership before clearing it and retrying the recorded intent. Stop currently records a lease; no worker/dev-server process controller is implemented. Open does not count as the person's test-it approval.

## Slicing validation still pending

Exercise slice-work with real repository conventions and a challenger in slicing mode. Verify that the declared single outcome and demonstration describe a real vertical user journey, and that all slices together deliver the scope. Local fixtures validate shape, inherited criteria, stable IDs, dependencies and at most one part per repository. Contract-first routing is automated; actual contract implementation and builder execution are later tasks. Worktree lifecycle has separate real Git tests and the owner checks above. Remote tracker items/relationships remain pending host writes until linked.

## Definition eval validation still pending

Run the thirty-case seed through a real host challenger with expected labels hidden. Preserve raw findings, actual model/client versions and run settings; score complete predictions with `eval definitions --predictions`. The committed 90% recall/0% false-alarm baseline measures deterministic lint only and retains two known semantic misses. It does not establish live challenger quality.

## Definition challenger validation still pending

Exercise all four modes in a host using the returned instructions and exact artifact. Verify that every mode reports evidence and counterexamples, preserves unknowns and leaves files unchanged. Compare challenge dials: tone and extra counter-questions can differ, coverage and findings cannot. Numeric lint only proves supported pairwise contradictions with explicitly matching contexts/units; free-text semantics and multi-constraint consistency remain independent review.

## Scope validation still pending

Run cut-scopes with actual repository flag naming guidance and ask the challenger whether each cut can ship independently. Review the completed plan before approving. Exercise rejection, stable-key revision and choosing between multiple scopes. Local tracker references and dependency rollback are automated tests; remote tracker execution, actual links and semantic critique remain unverified. Child scopes exist as drafts and cannot bypass the initiative's pending approval.

## Spec validation still pending

Run write-spec with a bound repository guide in a real host session. Verify that the guide is followed, the challenger catches semantic defects, metrics come from actual source evidence and the person reviews the completed revision. Local tests use a fictional baseline/query fixture; validation does not execute those queries or authenticate the named provider. Exercise rejection, correction and fresh approval. External publication remains a pending handoff until linked.

## Framing validation still pending

In a real host session, verify that supportive/balanced/adversarial challenge changes tone while preserving every framing question, and that insufficient evidence triggers research and explicit TBD markers. Exercise an on-hold call, its reopening condition and an explicit reopen. Remote publication remains a pending handoff; verify the host write and record its link before reporting it published. Cross-repository continuation uses explicit IDs.

## Research validation still pending

Run the research skill with real source tools and independent challenger sessions once a host adapter is available. Verify source authentication, failure-to-open- question handling, read-only workers, actual native fan-out and the same result under sequential execution. Local tests use stubbed workers and fixture evidence; no real research claim or live provider call was produced in this session.

## Canonical skill validation still pending

P1-12 is verified through compiled CLI workflow tests, including a sentence, explicit owner, full framing artifact, no-go outcome, artifact receipt, read-only status and scoped setup. After P0-03 conformance and adapter generation, exercise the four canonical skills in real client sessions: question rendering, repository guidance loading, preflight and receipt language, and stopping at unavailable work or human decisions. No model session was executed to establish these behaviors in a host client.

## Extension smoke checks

Use an isolated configuration home when selecting a custom profile. Run `profile scaffold onboarding --output .wholeloop/profiles/onboarding`, inspect the kit, then `profile test onboarding` and `profile preset onboarding --scope run`. For templates, `template test spec` reports mandatory-section dependents. Lens validation checks manifests/resources. Typed gate execution and workflow template loading have local fixtures; verify actual model/gate behavior and repository guidance effects separately.

## Current smoke scenario

Use a temporary `XDG_STATE_HOME` outside any repository and a temporary `XDG_CONFIG_HOME` to avoid changing personal defaults. Build first with `npm run build`, then use `node /absolute/path/to/wholeloop/dist/wl.mjs`:

1. Begin `step begin frame-problem --input "Find past orders" --owner "Alex" --json`.
2. Copy its initiative ID. Complete it with `step complete frame-problem
   --for <id> --artifact <file> --json`; the file must contain all returned framing headings. Use `test/fixtures/framing/frame.md` as a smoke fixture in a temporary location; actual framing must distinguish observed evidence from explicit TBD markers.
3. Inspect `state get`, `open` and `step plan` for that ID. The next step is `write-spec`, now available. Complete a spec using the returned schema/sections and verify that `next` stops at `approve-spec`; cut-scopes is now available. Approve the spec, complete a scope plan, and verify that both initiative and child continuation stop at approve-scopes. After approval, slice-work is available; complete a vertical slice plan and inspect contract-first routing. Continue build-slice only after its returned agreement, contract/worktree and repository preconditions are satisfied; actual client workers still need separate native verification.
4. Send a local `msg send --thread <id> --to builder --kind note --body "Ready"`. Read it with `msg read --for builder --reader a`, then repeat: the second read is empty. A different reader still sees it.
5. Run `resume <id> --json` and `state rebuild --json`; the pack stays bounded and projections rebuild without changing the journal.
6. Inspect `profile show --json`; try a preset and a dial only in the temporary config home. `profile set depth=technical --scope run --json` must leave configuration unchanged.

These core paths also have automated tests. Generated client adapters and later step workflows are implemented locally with separate fixtures; actual canonical skill sessions and authenticated provider/native acceptance remain unverified. Amplitude retains a pending dashboard handoff until a reviewed live MCP contract is supplied; no additional HTTP host is required. Do not interpret this smoke scenario as those acceptance checks or as permission to publish.

[Roadmap](./README.md) · [Journal](./journal.md)
