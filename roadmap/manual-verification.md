# Manual verification — current implementation

> Automated results and pending work are separate. A checked roadmap task means its local acceptance checks passed, not that every target CLI or platform has been exercised. Expanded-scope planning updated 2026-10-24; historical execution observations retain their original dates.

## How to use this backlog

Start with [V1 acceptance](../docs/v1-acceptance.md) for the ordered trial plan, commands, passing results and who does each part. This page retains detailed regressions and limitations rather than assigning every item to the maintainer.

## Per-client native checks (2026-11-08)

`npm run native:check -- <client>` runs the low-quota checks for one installed client: the version (no model), the read-only probe (one short turn) and the standalone framing scenario (one scenario), each only with `--live`. See [V1 acceptance](../docs/v1-acceptance.md#4-let-the-automatic-runner-cover-the-other-clients) for the commands and verdicts. Fake-client tests cover every verdict; a plan-only run against the installed Codex 0.166.0 observed its version and called no model.

Live results on 2026-11-08, macOS arm64, Node 24.22.0. A read-only PASS feeds P0-03, P1-11, P5-01 or P5-02 for that client; a framing PASS feeds P1-14, P5-01 or P5-02.

| Client | Version | Read-only probe | Framing scenario |
| --- | --- | --- | --- |
| Claude Code | 2.1.319 | PASS: the recipe exposes no write or shell tool | PASS, run cf-1422b6df04fd5ec12a08f329 on core 1c0638ed |
| Codex | 0.166.0 | PASS: the read-only sandbox refused all three writes through its shell tool | Not repeated; the revised scenario passed earlier on 0.163.0 |
| OpenCode | 2.2.5 | PASS: no write or shell tool | PASS, run cf-97f187d81879d2af1d9d7b65 on core f140b242, after two failures kept below |
| Copilot | 1.0.83 | PASS: no write or shell tool | PASS, run cf-6d2e1e761ad5cc3fd17862d5, after granting only the exact launcher and the three framing files |
| Gemini | 0.67.0 | BLOCKED: the workspace is untrusted, and the worker settings file is ignored | Not run; paused by the maintainer |
| Antigravity | 1.5.3 | PASS: the observer had no write tool and the workspace is unchanged | PASS, run cf-9ea0ac99ec4ae55e10cea088, with the review performed in its single turn |
| Cursor | 2026.11.05-86047df | PASS: its policy refused Write and Shell | PASS, run cf-45e0ec29f8536bf06a715170, with workspace trust and the free plan's `auto` model |

- [x] The first OpenCode run recorded the wholeloop checkout as the initiative's repository: OpenCode 2.x takes its project from `PWD`, which a spawned worker inherited from its parent. Every worker now gets `PWD` equal to its working directory. The next run lacked only the skill-marker note, which the model skipped; the run after it passed.
- [x] Copilot: its conformance recipe grants only the exact checked launcher, run as an executable, and the draft, decision and review files ([ADR-0087](../docs/decisions/0087-redacted-native-diagnostics-and-explicit-invocations.md)). The first run with those grants hit the 1 MiB output bound; the scenario now allows 16 MiB.
- [x] Cursor: both recipes pass `--trust` for a directory wholeloop created, and the hook takes Cursor 2026.11's empty Shell `cwd` from the call or the only workspace root ([ADR-0057](../docs/decisions/0057-cursor-native-formats-and-non-granting-hooks.md)). The maintainer set the client's default model to `auto`.
- [x] Antigravity: the init check binds to the worker's own observer instead of the tool list, the guard and observer hook read 1.5's `read_file`/`write_file` and their `Path` argument, and the conformance recipe grants the exact launcher and framing files for writing and reading ([ADR-0072](../docs/decisions/0072-antigravity-startup-gated-observer-workers.md)).
- [x] Antigravity framing failed in the official runner because the session handed the final review to a background subagent and ended its single turn; the runner then stopped the process group with that subagent. A copy of the official event stream showed it. The prompt now asks Antigravity to perform the review in its turn, and the next official run passed.
- [ ] Gemini 0.67: system settings files are honoured only when owned by root, so the worker's read-only settings are skipped; move the policy to the policy engine (`--policy`) and decide on workspace trust. Paused by the maintainer.
- [x] Hook payloads (P3-08): real Claude Code, Copilot and OpenCode payloads are fixtures that normalize to the same events; Copilot's raw `apply_patch` text no longer makes the guard deny every edit, and the generated Copilot plugin's guard denies `git push` live.
- [x] Codex 0.166 hook payloads: captured without a bypass flag after the maintainer trusted the disposable repository's hooks once interactively. They normalize like the other clients; Codex sends `apply_patch` text as `tool_input.command`, which made the guard deny every Codex patch until the normalizer read it.
- [ ] MCP inheritance in launchers (P4-01) is not automated yet.

## Expanded 1.0 acceptance boundary

[Phase 6](./phase-6-autonomous-delivery.md) adds 38 reviewed/accepted implementation tasks, authorized for sequential execution, before final 1.0 release. Their [validation plan](./specifications/autonomous-delivery/09-validation-and-acceptance.md) defines new automated, native/backend and hosted checks. The original fourteen open tasks and observations below retain their exact scope; the [roadmap index](./README.md) holds the current task counts, including the [Phase 7](./phase-7-release-readiness.md) release-readiness tasks added on 2026-11-07.

- [x] Review and accept all new tasks for 1.0 and authorize sequential implementation (2026-10-24).
- [ ] After implementation, observe actual no-intervention research/implementation, effective runtime containment and behavioral/integration proof at the specified reference-client/platform scope.
- [ ] Separately authorize disposable hosted publication/conditional-merge trials and retain their actual outcomes.

P6-01 intake is implemented and automatically verified: 52 intake cases, complete macOS checks and Linux Node 20/24 CLI/file-boundary trials. The [tutorial](../docs/tutorials/delivery-intake.md) is executable without an account. P6-02 plan/envelope preparation is also verified: 42 planning cases, full macOS checks and the exact tutorial/replay on Linux Node 20/24. See the [planning tutorial](../docs/tutorials/delivery-plan.md). P6-03 operator grants, revocation and broker admission/request contracts pass 42 new cases and 460 focused checks on macOS/Linux, plus the exact tutorial on Linux Node 20/24. See the [authorization guide](../docs/tutorials/delivery-authorization.md). Actual worker/backend containment remains P6-12/P6-27 acceptance; fixtures are not certification. No new manual check is required to continue P6-04. Only design review/implementation authorization above is confirmed for the still-pending full-flow acceptance. The execution checks remain future acceptance, not work already executed or permission to mutate a real project. Existing native/account checks need not block independent local implementation after authorization. Zero-intervention product usage remains opt-in; runtime policies are unchanged today.

Current local remediation is implemented and tested: exact owner-decision framing, final revision review and bounded redacted native diagnostics. After explicit private-harness disclosure approval, fresh native trials executed on OpenCode, Copilot and Antigravity. None passed: OpenCode began framing before its deadline and a longer diagnostic attempt ended with a provider error mentioning HTTP 503; Copilot and Antigravity reported native tool permission denials. The latter's soft-denial format exposed and now has a diagnostic regression fix. Any further implementation defect discovered by those trials remains technical work, not a maintainer acceptance checkbox. Track it in [V1 acceptance](../docs/v1-acceptance.md#1-finish-implementation-defects-first) and the journal before claiming technical closure.

OpenCode V1/V2 compatibility now has separate deterministic renderers and native execution recipes (ADR-0088). Actual V2 inspector discovery/read and an isolated user-scope hook read/deny are observed. Complete native review remains unaccepted: a six-lens synthetic review attempt failed with five 60-second timeouts and one invalid response; a separate 120-second lens attempt also timed out. Do not mark native gate parity or the whole platform task complete from the smaller probes.

Actual Codex headless rounds gate-77f0a395c890806f and gate-78beec965bc15544 each fail with five invalid responses and one accepted response; the repository is unchanged. Bounded diagnostics establish missing envelope identities in those five JSON objects. ADR-0091 adds an exact native generation schema, preserving strict host validation. Preserve both failed rounds. The new compiled CLI gate-35be1f516f42cb8c on core 9ea3a298 now passes all six workers in actual Codex 0.163.0, with no missing coverage or repository edits. That fulfills P5-03's one-real-run criterion together with stubbed three-engine verdict/quorum parity; earlier failures and wider native checks remain unchanged.

Remote service integrations are **experimental · fixture-tested · service-unverified** under [ADR-0084](../docs/decisions/0084-experimental-integrations-and-scoped-live-verification.md). Their authenticated account/API/rendering checks below are deferred certification, not prerequisites for 1.0, and remain unchecked until actually executed. You do not need accounts with every listed vendor. This does not waive missing implementation, native-client/permission/hook tests, release CI or publication decisions. The Amplitude dashboard write remains a pending handoff until its MCP contract is known; ADR-0085 removes the requirement for another HTTP implementation.

## Pull-request contribution workflow (P7-09, 2026-11-07)

The rulesets, CODEOWNERS, pull request template and title check are in the repository; nothing has been applied to the hosted repository.

- [ ] Set the merge options: squash merging only, with the pull request title as the commit title and the commit messages as its body, and delete branches on merge (`gh api -X PATCH repos/dreamingechoes/wholeloop -F allow_merge_commit=false -F allow_rebase_merge=false -F allow_squash_merge=true -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=COMMIT_MESSAGES -F delete_branch_on_merge=true`).
- [ ] Apply both rulesets (`gh api repos/dreamingechoes/wholeloop/rulesets --method POST --input .github/rulesets/main.json`, then the same for `release-tags.json`), and confirm a direct push to `main` is refused and a pull request cannot merge before its required checks pass.
- [ ] Announce the switch: replace the bootstrap line in `AGENTS.md` and the bootstrap note in `CONTRIBUTING.md` with the pull-request workflow, record it in the journal and mark P7-09 complete. Proposed `AGENTS.md` line: "**Pull requests to `main`.** Every change reaches `main` through a branch and a pull request with passing required checks, squash-merged under a Conventional Commit title."

## Release automation (P7-08, 2026-11-07)

The release pull request, release-on-merge, post-publication verification and failure marking are implemented and tested with a fixture repository and logging stand-ins for GitHub and npm; no hosted run has executed.

- [x] Allow GitHub Actions to create pull requests (2026-11-08; the default workflow token stays read-only).
- [ ] When the repository becomes public, add the maintainer as required reviewer of the `release` environment. It exists since 2026-11-08 limited to `main`, but required reviewers need a paid plan on a private repository; until then the release preflight refuses to publish from a private repository.
- [ ] Dispatch the Release pull request workflow for `1.0.0-rc.1` and confirm the hosted tree check passes, the branch and pull request are created and the dispatched CI run reports the required checks on the pull request.
- [ ] Merge it and confirm the Release workflow plans a release from the push, prepares the bundle and stops at the `release` environment until approval; confirm an ordinary push to `main` that changes `package.json` without a new version prepares nothing.
- [ ] After the first publication, confirm the verify job installs the version from the registry on Node 20 and passes, and that `gh release edit` accepts `--prerelease --latest=false` together by marking a disposable release as failed.

## Pre-publication history audit (P7-06, 2026-11-07)

- [ ] Immediately before switching the repository to public (P7-14), run `npm run scan:history` on the final `main`, review any new finding, and confirm no other ref is pushed.
- [x] Delete the local backup ref `refs/backup/pre-neutral-rewrite` once the rewritten history is confirmed (2026-11-08; it pointed to the pre-rewrite 27e3104).

## Supply-chain automation (P7-05, 2026-11-07)

The workflows, Dependabot configuration, licence and advisory checks and the release SBOM are implemented and linted locally; none of the hosted runs has executed.

- [x] Enable Dependabot alerts and security updates (2026-11-08).
- [ ] When the repository becomes public, enable private vulnerability reporting, which GitHub offers only on public repositories. CodeQL, Scorecard and dependency review skip while the repository is private, because code scanning needs Advanced Security there; they start running at the switch.
- [ ] After the next push, confirm CodeQL, Scorecard and CI (including `check-dependencies.mjs --audit` and `npm audit signatures`) run green, and that dependency review runs on the first pull request.
- [x] Review the first Dependabot pull requests for npm and the pinned actions (2026-11-08). The action pins and the development updates that were at least two weeks old are applied on `main` (`@biomejs/biome` 2.6.3 with YAML formatting kept off, `mermaid` 12.2.0, `jsdom`, `smol-toml`, the MCP SDK); `markdownlint-cli2` 0.24.0 was declined because it adds a high-severity `re2js` advisory; the `@types/node` major was closed and is now ignored, and Dependabot waits fourteen days for new versions, as ADR-0019 requires.
- [ ] Apply the security updates once their fixes are two weeks old: `vitest` 5.1.0 from 2026-11-16 and `undici` 8.12.4 from 2026-11-19 (pull requests #4 and #5). The `markdown-it` advisory under `markdownlint-cli2` 0.23.3 has no compliant fix yet. All three are development-only and none reaches the published bundle.

## Repository guidance in autonomous runs (P6-40, 2026-11-07)

Guidance proposal, base-commit pins, manifest verification and per-role delivery are implemented and tested with real Git fixtures and the composition.

- [ ] Add a repository skill to the hosted trial fixture that the task cannot be completed without (for example a required status format), prepare an EVAL-09 plan with `wl delivery guidance`, and confirm on each reference client that the builder follows it while the reviewer never receives it. This needs a push to the hosted trial repository and model accounts.
- [ ] Repeat the proposal on a real repository whose skills span several clients and confirm the pins match what `wl resolve` shows for each slot.

## Execution isolation and secret handling (2026-11-06)

- [ ] Restrict standalone headless gate workers (`src/fanout/host.ts`) to an allowlisted environment, as delivery workers already are. Each supported client needs its authentication variables (or credential-store paths) declared per adapter and verified with a signed-in client: today these workers inherit the caller's complete environment, including unrelated secrets. See [Execution isolation](../docs/architecture/execution-isolation.md#known-gaps).
- [ ] Repeat the Docker preflight, owned environments and refusals of credential files on a second Linux daemon version and on a rootless or Colima socket before claiming them beyond the reference engines.

## CI correction SDK evidence (2026-11-05)

The version-two CI producer has actual local Git/Docker execution with explicitly synthetic native clients, API, CI and protection facts. The initial command fails when its original-production reader compares CI's typed reason to the legacy reason. A read-only red/green control fixes that comparison while preserving its failed stage and both exact retired environments. The second command records a passed correction, fresh verification/review/integration/acceptance, the original PR's second non-force push and fresh CI, then correctly blocks merge without its grant. Its wrapper still fails by reading a stale synthetic-server JSON cache. Preserve report SHA-256 `a243d1077a4eda01108f1df916834809161d57dbf60a15a6ff29e414f0f282ce` as failed.

The corrected shared verifier reads the API and actual bare objects, proves the old CI file failed and the new one passed, exactly two issued pushes, no merge effect, the same original PR, current recorded stage bindings and four exact retired environments. It appends no journal event, replays no production and restores no eligibility after retirement. Readback report SHA-256: `ff40ecf01f32b20b89a68cb365bacef3b7baab619aff7c462cf7f81c2eaa7b87`. The complete live command was not repeated after its reporter-only correction; the verifier itself was executed on the retained complete core run. Keep that distinction and both failed development commands. These macOS arm64 controller/Linux aarch64 Docker-daemon controls do not certify native/model, containment or hosted behavior. Separate Linux arm64 Node 20.0.0/24.22.0 SDK component checks pass offline, not a full Linux suite.

Native/reference and actual hosted checks remain open. The public composer still refuses `to-merge`; only the existing separate SDK installation supplies its runtime capability, and the exact grant remains independently required. The Proposed wider envelope and credential options remain unchanged. No wholeloop source push runs.

## Public runner checks (2026-11-01)

P6-10 is complete on automated synthetic/reference-transport evidence: the compiled `wl delivery run` and `wl delivery reconcile` lifecycle, owned process-group cancellation and interactive-tool canaries pass on the Linux x64 VM. That evidence certifies neither a native client nor a hosted service.

- [ ] A bound reference client passes its trusted runtime proof and runs a public route end to end (P6-27).
- [ ] A hosted endpoint (PR, CI or merge) is reached by a public run (P6-20–P6-24 hosted trials).

## Native evaluation campaign inputs (2026-11-03)

Claude EVAL-09 is deferred until the operator's reported quota reset on 2026-11-06 (hour unknown). Continue quota-independent roadmap implementation in the meantime. No fresh login or native trial is requested before quota is available; this does not change the accepted reference versions, trial counts or retained failed attempts.

The reference clients are fixed for the whole P6-27 campaign, so its three trials per scenario stay comparable. Both clients were observed installed and signed in on the macOS arm64 development host; each trial receipt still records the version and model it actually observed.

| Client | Version | Binary | Account | Model |
| --- | --- | --- | --- | --- |
| Claude Code | 2.1.316 (native installer, auto-update off) | `claude` | claude.ai subscription | `claude-opus-5-5`, exact ID rather than the `opus` alias, which can move |
| Codex | 0.166.0 (Homebrew cask) | `codex` | ChatGPT subscription | `gpt-6.1-sol`, reasoning effort `high` |

A Homebrew cask cannot be pinned, so no general `brew upgrade` runs during the campaign. A trial that observes another version or model is reported separately, not counted toward the three.

- [x] Reference clients installed, signed in, versions and models fixed (2026-11-03).
- [x] Per-trial budget fixed: wall-time and attempt limits only (2026-11-03). Both accounts are the smallest subscription tiers (Claude Pro, ChatGPT Plus), which meter no reliable token or currency cap, so no hard token or currency limit is declared that the runner could not enforce; each receipt keeps the usage its client reports.
- [x] Research trial sources fixed (2026-11-03): the public web through each client's own search and fetch tools, and the trial repository's files. No account-bound provider is connected, so research trials need no new credential and read nothing private.
- [x] The code pin follows the installed versions ([ADR-0202](../docs/decisions/0202-campaign-reference-client-versions.md)). The six model-free Codex 0.166.0 boundary controls (`npm run eval:native-boundary`) pass on macOS arm64 with every boundary property observed and the workspace unchanged; no model or account was used (2026-11-03).
- [x] Dedicated client homes signed in by hand (2026-11-03): `~/.local/state/wholeloop-native/claude` (Keychain login, no credential file) and `~/.local/state/wholeloop-native/codex` (client-owned `auth.json`, mode 600). Both answer their own status command with a clean environment; Claude Code needs the real home for its Keychain.
- [x] The six model-free Claude Code 2.1.316 controls (`npm run eval:claude-boundary`) pass on macOS arm64 inside the launch's `sandbox-exec` profile, authenticated through the dedicated home, with the workspace unchanged ([ADR-0203](../docs/decisions/0203-contained-claude-code-boundary.md)). Without the profile's leading deny the observer refuses (2026-11-03).
- [x] One authorized model call under the Claude profile confirms the client completes a turn inside it (network, certificates, caches). It was approved on 2026-11-03. It found that the client needs `CLAUDE_CODE_TMPDIR`, now set for every contained launch, and then completed in 5.1 s with the outside read denied. That turn ran on 2.1.317 after the native installer updated the client on its own, so it did not count. The 2.1.316 pin was kept, and the turn repeated on the exact `versions/2.1.316` binary completed in 5.3 s with 278 output tokens and the outside read denied ([ADR-0203](../docs/decisions/0203-contained-claude-code-boundary.md)). The runtime document names that exact binary, not the symlink the installer moves.
- [x] Pilot: one Claude research trial (EVAL-10), run with `npm run eval:live-research` and the documented `WHOLELOOP_LIVE_*` variables. It refuses to start without `WHOLELOOP_LIVE_CONFIRM=spend-quota`. Its first attempt (2026-11-03) stopped before any model call: the runner did not manage `sandbox-exec` as an owned client, so the observer refused the launch. Fixed in the same increment. The pilot measures quota use and duration before the campaign is sized. Codex trials wait for its weekly quota reset; an attempt stopped by an exhausted subscription window is reported as a failed trial, not retried silently. Later attempts found three more defects ([ADR-0206](../docs/decisions/0206-live-research-pilot-findings.md)). The last attempt ran 793 s with no human wait and 25 successful Claude launches, and its brief completed with unknowns: seven cited claims and no refutation. The delegated source judge then rejected the brief, so the run ended blocked. Not a pass. Quota use was not measured, because the report does not yet record client usage. A diagnostic repeat after those fixes, approved explicitly, completed (2026-11-03): 968 s, no human wait, 26 successful Claude launches, both delegated decisions accepted and their challengers supported them. Client-reported usage: 64,581 output tokens, 805,764 cache-read and 621,401 cache-creation tokens, and a client cost estimate of 6.62 USD at API rates, which the subscription does not bill. It is a diagnostic, not one of the three required trials.
- [x] Hosted trial repository and authorization fixed (2026-11-03): private `dreamingechoes/wholeloop-trials` on the maintainer's personal account, created only for these trials. Authorized for that repository alone: creating it with a trivial fixture application and CI workflow, protecting `main` (pull request and CI check required), and non-force pushes, owned PRs, readying and exact-revision merges by public runs. After the campaign it stays private until wholeloop itself is published; it is then either made public as reviewable trial evidence, after its PR texts and logs are reviewed for personal data, or deleted. Every receipt is therefore self-contained (revisions, check names, sanitized responses) and never depends on a PR link staying reachable.
- [ ] Maintainer decision on the worker credential design drafted in `docs/decisions/0209-controller-owned-native-credentials.md` (Proposed, 2026-11-04). It covers controller-owned credentials injected per launch, a preflight, pausing on an exhausted usage window, and Antigravity as an unavailable worker. Probes with fabricated credentials showed the injection path works on six of the seven clients. Before acceptance it still needs one real call per client and account kind, the lifetime of a `claude setup-token` token, a usage-window signal, a headless Linux secret store and the Windows path.
- [x] Private hosted fixture published and branch protection observed (2026-11-04): `main` is exactly `3aeeef7b3045dadddb67404530f914b4bf41ab18`. A separate GET confirms required PRs, strict `test` from the observed GitHub Actions issuer `15368`, enforcement for administrators, and disabled force pushes/deletion. The initial hosted check fails at the intended assertion (`pending` versus `public fixture`, Node 22.23.4), not during checkout or setup. This proves initial hosting/protection and a negative suite baseline; native PR publication and conditional merge remain open. The operator explicitly authorized all pushes necessary for this trial on 2026-11-04.

## Codex-only campaign preflight (2026-11-05)

The dedicated Codex 0.166.0 ChatGPT home, GitHub keyring and private trial protection are available. All six model-free boundary controls pass. The first live research attempt completes two successful host-observed model calls with zero human waits, then blocks on the concrete research-plan evidence defect fixed by [ADR-0215](../docs/decisions/0215-reviewed-public-research-plan.md). Its failed report remains retained; the corrected-core campaign is separate.

The fresh 2026-11-05 standalone framing control on Codex 0.166.0 passes through the actual native process and journal on the corrected core. It requests gpt-6.1-sol/high explicitly and passes no ambient API key. The scripted fictional-owner approval remains a protocol fixture, not actual human approval, semantic review, native isolation or complete supervised delivery acceptance. Original human workflow obligations remain open.

A read-only stdio probe observes ChatGPT Plus and actual quota metadata through account/read and account/rateLimits/read, with no thread, turn or model call. The service reports 3 percent usage in its 10080-minute window and a reset timestamp. A reached-limit type is absent because this sample is not exhausted. The [official App Server rate-limit contract](https://learn.chatgpt.com/docs/app-server#6-rate-limits-chatgpt) and the locally generated 0.166.0 protocol support this read. Actual exhaustion, renewal, API-account authentication, Linux secret-store and WSL2 acceptance remain separate; this probe enables no credential or pause/resume feature.

The corrected evaluator candidate passes the full 2026-11-05 macOS arm64/Node 24 gate (4297 tests, 253 files, 752s) and isolated Linux arm64/Node 24 gate (4296 passed, one existing macOS-only sandbox-exec test skipped, 253 files, 187s). The skipped control passed on macOS. Retain the initial Linux cache-setup failure and its corrected private writable cache; no test or product guard was weakened. Bundles and offline package bytes match across these two builds. This model-free container evidence does not certify an independent Linux host, native client/accounts, Windows or WSL2.

The ADR-0217 candidate passes 4302 macOS tests and 4301 Linux-container tests with one existing macOS-only skip (254 files each), plus every full gate step. Built bundles and Node 24 package bytes match. Separate Node 20.0.0 runtime/package/docs/harness/baseline-evaluator execution succeeds on Linux; baseline prediction quality is unchanged and modern Git/native workflows are not certified by that runtime image. On 2026-11-05 the maintainer explicitly defers Windows and WSL2 validation; leave them unchecked and continue accessible macOS/Linux work. No Windows environment is installed or enabled.

The third actual implementation pilot on the ADR-0217 core has a valid current identity and HTTP format, but returns blocked because complete changed-file scope is not observable through the installed runners. Retain the failed original report SHA-256 8a40895aeda4573a26a42e91ba9f20ae74437629564165b116dd374bc93ac1ea, one successful native call, zero human waits and zero publication. The fixed controller-owned committed-diff host ([ADR-0218](../docs/decisions/0218-controller-owned-repository-diff.md)) is an implementation correction; new native campaign acceptance remains required. Windows/WSL2 remain deferred, and credential/envelope proposals remain unaccepted.

The fourth actual Codex attempt on 67a3f03 passes acceptance definitions containing API, committed repository scope and the declared suite, then creates its owned workspace. It blocks at builder planning because the outer artifact is labelled plan instead of the fixed report contract, despite a valid plan body. Preserve its 72-second failed report, both successful native calls, zero human waits and no hosted publication. ADR-0219 narrows generation transport for the exact producer cells without rewriting the old receipt. New native campaign acceptance remains open; the completed macOS/Linux gates for the preceding candidate are separate evidence.

The fifth actual Codex attempt on 8ba477a passes production transport and reaches independent build-plan judgment. The judge correctly refuses the trial's premature demand for suite/HTTP execution before implementation. The fixture now distinguishes proposed validation at plan approval from observed validation at acceptance; the complete acceptance rubric retains its exact original hash. The original failed report, blocked judgment, budgets, base and workspace remain intact. This fixes trial setup and establishes no native campaign pass.

The sixth actual Codex attempt on 3a572d9 passes independent build-plan approval and reaches the real builder. It fails output validation after 157 seconds; the only changed file is status.txt with an extra newline, which still violates the unchanged suite. Its raw rejected response was not retained, so the exact decoder cause remains unknown. ADR-0220 adds private closed phase/problem categories for future failures without storing raw output or changing validation. ADR-0221 independently narrows generation to the criterion claims its assigned role can already return; it does not establish that historical failure's cause. Keep the failed report/workspace and all original campaign requirements; no native success or hosted publication is inferred.

## Implementation-to-PR trial procedure (2026-11-04)

The eighth actual Codex implementation attempt on 67fc8c7 blocks at independent plan approval after 108 seconds and four successful native receipts. Its judges correctly identify missing repository feasibility facts and the completed pinned acceptance-definition prerequisite. ADR-0223 supplies one bounded original-candidate context to both producer and judges, without weakening that rubric or exposing private case contents. The trial's mutable status input is captured as initial source data, not an immutable recipe pin. Retain all ten failed native pilots and their original scopes; no builder run, native campaign pass or hosted publication is inferred from this blocked attempt.

The following actual Docker/Git component rehearsal with synthetic model/GitHub transports passes publication to its local bare remote but blocks at the final handoff. Preserve its failed 545-second report and fourteen successful synthetic calls; both exact environments are observed retired after readback. The candidate and assembly remain current, while integration reinspection and current acceptance refuse. This separate failure must be resolved before the next paid implementation trial; it is neither a native campaign attempt nor hosted acceptance.

A subsequent temporary diagnostic-copy rehearsal passes all thirteen stages in 619 seconds with fourteen synthetic receipts, zero human waits and both exact environments retired; report SHA-256 e69f0eb81769eb5c27b1dbe4d209d6294dbdce386d506b767e530508b6379e06. The earlier final handoff failure remains unreproduced, not rewritten as passed. An independent control also confirms late synchronous reads can defeat the timer race. ADR-0224 adds a monotonic elapsed refusal without increasing deadlines; this invalidates any bounded-read claim from that diagnostic pass. Retain both reports and require an unmodified full rehearsal with honest original read budgets before another paid trial. Current-proof read performance remains technical implementation work, not a maintainer approval checkbox.

The next unmodified-bundle, model-free rehearsal on 9842c5e blocks publication after 395 seconds despite passing all preceding code, QA, integration and acceptance stages. Preserve failed report SHA-256 f4a7e98bf6f7d0e919940c754aae75d7205c1d62a773aea7ebbaf15f0826a7b2, fourteen successful synthetic receipts and both exact retired environments. Read-only diagnosis confirms that the original completed repository-read wrapper's numeric PID/group is reused by a later system service during publication. ADR-0225 retains only process-local positively witnessed original closure with identical current input bytes and an available fresh table; cold or changed evidence remains unknown. This fixes no historical report and certifies no complete route, deadline, native client or hosted effect. Keep the earlier separate handoff failure's unknown lower cause distinct.

The unprofiled 210bb03 rehearsal then passes every stage and observes its single ready PR in the local synthetic transport, but blocks the final endpoint after 663 seconds. Preserve failed report SHA-256 3b982a90cd99ad424ee0895ea9f0ce6a5979bd413f5bfdc4268d97040fee3e80, fourteen successful synthetic calls and both retired environments. Its generic reason does not isolate the endpoint failure; the roughly 63 seconds after passed handoff are a surrounding wall interval. ADR-0226 reduces measured journal query cost with a pinned physical directory and complete fresh bytes, preserving ownership and deadlines. Its 61 focused controls and single-store microbenchmark are not complete route or native acceptance. A new unmodified full rehearsal remains required before another paid attempt.

The seventh actual Codex implementation attempt on fa22c64 retains a failed report after 139 seconds, four successful native receipts and a rejected builder proposal. Its exact private diagnostic is proposal/invalid-or-unsafe-proposal; the workspace remains unchanged and nothing is published. ADR-0222 adds closed sub-boundary/schema-path metadata only for future failures. All nine failed native pilots and their original requirements remain intact; no retrospective field classification or campaign success is inferred.

The first actual Codex attempt on 2026-11-05 blocks at workspace allocation after one successful native acceptance-definition call. The live preparer persisted a null hooksPath that the unchanged assembly guard correctly refuses. Keep its original failed report and zero-publication result; the corrected checkout setup has a real Git red/green regression, and a fresh hosted attempt remains required. It does not count as a campaign pass. No original hosted base, guard or authority is weakened. The next attempt completes its native call but supplies a successor revision for current acceptance definitions. It remains a failed route with no publication. ADR-0217 pins response identity and declares installed observation inputs before generation; original produced bytes and strict refusal remain intact. New native acceptance is pending.

`npm run eval:live-implementation` runs one EVAL-09 attempt through the built public `wl delivery run`. It pins a fresh clone of the campaign repository's `main`, the source, rubric, environment recipe and declared suite, and delegates only build-plan approval and acceptance. The grant permits non-force publication and readying, with no merge. It checks the repository's exact private identity and initial fixture bytes before launching a worker.

The small application reads `status.txt` through its public HTTP endpoint. The initial value is `pending`; the requested value is `public fixture`. The unchanged suite must fail before implementation. Its code, the HTTP entrypoint, package and review rubric stay pinned. The CI fixture reuses this project's pinned checkout/setup-node actions and runs the same suite without dependencies. This small trial exercises transport and QA; complex feature delivery remains separate evidence.

From the wholeloop checkout:

```bash
# Local Git and real Docker, synthetic client and gh; no model or hosted service.
npm run eval:live-implementation -- --rehearse

# Prepare a disposable initial repository only; create/push nothing on GitHub.
npm run eval:live-implementation -- --seed
```

A hosted rehearsal keeps the synthetic client and model but runs everything else for real against `dreamingechoes/wholeloop-trials`: the clone, a non-force push, the owned pull request and its CI. It spends no model quota, writes a `wholeloop/rehearsal-trial@1` report that never counts as a campaign attempt, and needs its own confirmation:

```bash
WHOLELOOP_LIVE_CONFIRM=publish-without-model npm run eval:live-implementation -- --hosted-rehearsal
```

It leaves its branch and pull request on the trial repository, like a live attempt; close them by hand once inspected.

Each command prints its external retained directory. An attempt saves `results/report.json`, its immutable request/plan/grant and the store's original evidence. Reports include controller waits, every native receipt's status/provenance and client-reported usage, case statuses/reasons, exact base/core digests and sanitized effect observations. Failed attempts are retained without retry; their environments stay available for inspection. Successful runs retire only their own environments and retain the retirement observations. Rehearsal reports use `wholeloop/rehearsal-trial@1`, which `eval:campaign` rejects; real attempts use `wholeloop/live-trial@1`.

For an already authorized live batch, first sign the dedicated client home in again. Resolve the pinned native executable and `gh` to absolute paths, then supply the same non-secret client/model/home variables used by the research trials. Claude's pinned binary is `$HOME/.local/share/claude/versions/2.1.316`, its model is `claude-opus-5-5`; Codex uses `gpt-6.1-sol`. A default home resolves beneath `$HOME/.local/state/wholeloop-native/<target>`.

```bash
# WHOLELOOP_LIVE_TARGET, _MODEL and _CLIENT must already be set.
# Optional _HOME and _GH select the dedicated home and absolute gh executable.
WHOLELOOP_LIVE_CONFIRM=spend-quota-and-publish npm run eval:live-implementation
```

Observed on macOS arm64/Node 24.22.0: the 2026-11-04 repeat exits zero in 931 s with `ready-pr`, thirteen passed stages, fourteen successful synthetic-client launches, zero controller input waits, all three unit/product cases passed and both environments retired. Timed QA ran without another evaluation or gate; the later fast gate overlaps publication/handoff inspection only. An earlier concurrent rehearsal had HTTP PASS but a cancelled integration suite at the unchanged thirty-second case limit; it stays retained, and its two environments were explicitly retired. This establishes the model-free public route, not a native client or GitHub endpoint.

A live invocation reads/clones only `dreamingechoes/wholeloop-trials` and may publish the run's owned PR there. It spends quota and does not sign in, create the hosted repository, alter protection, merge, retry or clean failed resources. Branch protection acceptance and native isolation remain separately observed checks. Score real attempt directories in order with the existing `eval:campaign -- --require EVAL-09:claude,EVAL-09:codex` command.

## Pull request publication checks (2026-11-01)

P6-20 publishes accepted candidates as owned PRs on a stub code host, and P6-21 evaluates revision-bound CI observations; both GitHub CLI hosts are checked only with a stub executor. That evidence certifies no hosted code host.

- [ ] On a disposable GitHub repository, a public `to-pr` run pushes without force, opens one owned draft, readies it when granted, and refuses a competing writer and a foreign PR without overwriting (REL-01, REL-06).
- [ ] With separate merge authorization, a disposable protected repository rejects a merge whose head or base moved and accepts the exact-SHA merge, observed once (REL-10, EVAL-05, EVAL-08).
- [ ] On the same repository, CI reads paginate real check runs, keep a same-name check from another app as `wrong-issuer` and report protection unknown for a token that cannot read it (REL-02, REL-04).

## Unattended research checks (2026-11-01)

P6-33's research host completes a none-policy research route on the synthetic native transport: plan, sources, independent refuters, stored brief and delegated source decision, with no prompt. That evidence certifies no native client, real source provider or model.

- [ ] A reference client completes a none-policy research route against real sources with zero interactive tool events (RSR-01, EVAL-10). Claude Code: four of ten campaign attempts passed on 2026-11-03 and 2026-11-04, with no human wait (`npm run eval:campaign` verdict `three-passes`; see the campaign inputs above). Codex: the 2026-11-05 pilot completes two authenticated model calls and then blocks on missing concrete research-plan evidence; the next pilot accepts that concrete plan but rejects a retained statement whose minority counterevidence was not surfaced as an open question; ADR-0216 corrects that projection and the three-run candidate campaign remains pending. Claude Code completed one diagnostic run on 2026-11-03 ([ADR-0206](../docs/decisions/0206-live-research-pilot-findings.md)); Codex's three required trials remain open, while Claude Code's accepted three-pass campaign is recorded below. The first three campaign trials on 2026-11-03 (code 183b4a0) did not reach the model: the first exited `permission-denied` with zero tokens while the client wrote `.credentials.json` into its client home, and the observer refused the other two for that file ([ADR-0203](../docs/decisions/0203-contained-claude-code-boundary.md#token-refresh-inside-the-profile)). They count as failed trials. The profile now denies that file. The file is removed and the client home signed in again before the trials are repeated. After a fresh sign-in, the repeated batch on code 6809993 gave one pass and two failed trials. Trial 1 completed with outcome `completed-with-unknowns`: 867 s, no human wait, 29 launches, both delegated decisions accepted and supported, a brief of twelve cited claims, no refutation, and four open questions. Its client-reported usage was 58,123 output tokens, a 6.28 USD API-rate estimate. Trial 2 passed its plan after 721 s, then its research launches exited `permission-denied` and the route ended blocked. Trial 3 ended blocked after 3 s with zero tokens. The account's Claude Pro usage limit was reached during trial 2; the operator's interactive session shares that limit. That is the likely cause, but the client output is retained only as hashes, so it is unverified. No credential file appeared. Failed trials are reported, not retried silently. A third, fresh batch on code 71650ac started with a fresh five-hour usage window. Trial 1 completed with unknowns (1113 s, no human wait, 32 launches, 71,677 output tokens, 7.48 USD API-rate estimate). Trial 2 completed with unknowns (995 s, no human wait, 29 launches, 64,972 output tokens, 6.80 USD). Trial 3 was not started: at 80% of the window, the remaining budget would not have covered it. That leaves two of the three required passes in this batch, and the third will run in the next window. Trial 3 ran on code c0de26a in the next window. It was admitted, then exited `permission-denied` after 6 s with zero tokens, the same signature as the earlier refresh failure. `auth status` still reported a sign-in, which shows the login exists, not that its token is valid. The likely cause, unverified, is a token that expired overnight. No credential file was written, so the deny worked. It counts as a failed trial; the batch stands at two passes and one infrastructure failure. After a fresh sign-in, a replacement trial on code 5fa691e completed with unknowns: 969 s, no human wait, 29 launches, 64,384 output tokens (6.65 USD API-rate estimate), both delegated decisions accepted and supported, nine cited claims, no refutation and three open questions. Claude Code therefore has four passing EVAL-10 research trials out of ten campaign attempts, counted by `npm run eval:campaign`; the second batch's first trial (867 s) also passed. The failed attempts stay reported above: a token refresh, the usage window, and an expired token.

The three-run report (`npm run eval:campaign -- --require EVAL-10:claude,EVAL-10:codex,EVAL-09:claude,EVAL-09:codex <retained trial directories>`) gives, on 2026-11-04:

| Scenario | Client | Passed | Attempted | Infrastructure | Verdict | Failure causes |
| --- | --- | --- | --- | --- | --- | --- |
| EVAL-09 | Claude Code | 0 | 0 | 0 | pending | — |
| EVAL-09 | Codex | 0 | 0 | 0 | pending | — |
| EVAL-10 | Claude Code 2.1.316 | 4 | 10 | 6 | three-passes | launch-unavailable:runtime-unobserved, launch-failed:permission-denied |
| EVAL-10 | Codex | 0 | 0 | 0 | pending | — |

The verdict follows the 2026-11-04 rule ([validation spec](./specifications/autonomous-delivery/09-validation-and-acceptance.md)): the six infrastructure failures are set aside, and the first three remaining attempts all passed.

- [ ] A reference-client research route with an unsatisfiable mandatory prerequisite returns a terminal blocked receipt within its deadline (EVAL-11). The 2026-11-05 public-CLI control with the actual Codex binding and deliberately undelegated research-plan decision returns blocked/exit 3 in less than one second, releases ownership and records zero model calls and human waits. Its ten-second deadline is unchanged. This verifies the pre-model policy boundary; actual native human/external-prerequisite observations remain open.

## Delegated machine decision checks (2026-10-25)

P6-34 implements the [decision controller guide](../docs/tutorials/delivery-decisions.md): original private plan/envelope grants, exact purpose-specific rubric pins, required current artifact/evidence bytes, independently completed planner/challenger identities and explicit machine provenance. Ten supported decisions cover framing, specs/scopes/build plans, research, acceptance, learning and ramp assessment. A profile or source/worker payload creates no delegation. No legacy human approval, failed gate, effect grant, external human-review requirement or production flag changes. Fixture observations cannot enable actual derived-plan execution. None-policy prerequisites and unknown policies emit no hidden human prompt or waiting-input state; policy-only preflight certifies no runtime capability.

Forty-nine new explicit regressions pass, covering exact bindings, independent identities, unsupported/negative evidence, preserved unknowns, supersession/races, changed bases/revisions/bytes, revocation, unknown/crashed hosts, original deadlines, artifact exhaustion, hard-metering refusal and compiled contracts. The earlier expanded eight-file run passes 602 cases with actual host process observation. Its preceding sandbox run passes 595/602: seven unchanged assembly tests return unknown because native groups cannot be observed. Preserve that result and repeat with observation available; do not weaken assertions. Initial type/format/Markdown failures remain recorded.

The first complete macOS run passes 2861 tests in 129 files (355.93 seconds), but an independently injected final-locator write interruption then demonstrates current with accepted false and two host calls. Repeating the same request fails to repair its missing plan locator. Correct recovery so an already published immutable exact record repairs only its own missing key/plan indices without invoking a host, changing a head, reviving a superseded record or treating an unpublished result as complete. The actual probe then returns current with accepted true and the same two calls. Three added crash regressions verify both published locator boundaries and the still-unknown unpublished intent. Retain both probe logs; no skipped checks or timeout increases occur.

Final complete checks pass 2864 tests in 129 files on macOS arm64/Node 24.22.0 (359.64 seconds) and isolated Debian Linux arm64/Node 24.22.0 (100.72 seconds), plus lint/types/build/smoke, offline package, 339-file docs, references, 149-file harness, 338-file Markdown and 36 diagrams. Linux is nonroot/read-only/network-free, without credentials or a Docker socket. Five final disposable Git/control-store observations pass on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5, with identical inert schema output. They use normalized fixture hosts; they do not certify an actual native client's model, tool denial, independent assignments or hosted effects. Full native research/implementation remains separate P6-10/P6-27/P6-33 work and acceptance.

Final pre-evidence archive: f03e50f00dff9b1b9170c84cfb3889db096f5aa1594700546625055ac9e55921; copied core: fe5c110c7b0b72123af6ac55d21255f6cdc7b61560c925e661f3f6c7135a3962. macOS/Linux offline package receipts: eef48d024db91b8bb58c5bf9a07c61a1340d2e6ad0d665ac8ab148c9a8fca909 and a99bba4d225c3755b5e1a9d3afa31553354413c5bb8ae139c2f614462bf84650. Final macOS control report: 7934cac8f82b6a781e5a53ee54648f0d37d6c15e4bd064596152c697b93e89bb; Linux Node 20 report: c9f7d466d271951de9a10dab87010b77ce05f645d4628816c537c3f99438529d; runner: d75d2ba392cf6e15ee7c29ce3a6a402864e00fd9e87043be6f0efe3dc4ea4860. Initial/fixed locator probe logs: e6b30be7f3ca87a8780a1b69cd4fd3ae58099614538a57e25113545510b69595 and 401b65b26fbd53cd1c4b60f64bdee15db574cb410237d076fbe4933dd7e18b8a. Each hash identifies its own execution. Final evidence-only local package: 0a5990a61e4217e417bb49bd76159e9f9c8b25438be2cbc150587ecc97fef2a4. Rechecked docs/Markdown pass; continue P6-10 without waiting for unrelated manual checks. No model, account, hosted write or project merge occurs.

## Original delivery evaluation checks (2026-10-25)

P6-26 implements the [original fixture guide](../docs/tutorials/delivery-evaluation-fixtures.md): four MIT scenarios with exact reviewed byte baselines, private requirements/oracles pinned before external committed application seeds, immutable receipts and public metadata without expected bodies. Inspection never runs worker-owned Git configuration; repeated requests preserve edits, conflicting keys refuse and incomplete existing workspaces remain unknown. Installed commands grant no runtime authority and execute no application/model.

Twenty-three new regressions and 568 focused checks pass. Complete checks pass 2799 tests in 127 files on macOS arm64/Node 24.22.0 (345.82 seconds) and isolated Debian Linux arm64/Node 24.22.0 (99.50 seconds), plus lint/types/build/smoke, offline package, 337-file docs, references, 149-file harness, 336-file Markdown and 36 diagrams. Linux is nonroot/read-only/network-free, without credentials or a Docker socket. Preserve initial type/format failures; no skips or timeout increases occur. The terminal tutorial's runtime commands and ShellCheck pass, including explicit receipt-to-digest capture and a new inspect process.

All eight trusted baseline/reference controls execute original Node/HTTP processes and real restart on macOS Node 24 and Linux Node 20.0.0/Git 2.39.5; the separately labelled broker controls observe deterministic denied requests and unchanged authority. Baseline success means expected relevant defects were detected while ordinary matching, empty query and no-match controls passed. Reference success is a known-good control, not a model repair. Four separate actual Chromium/private-MCP observations on this macOS controller/Linux aarch64 Docker daemon detect visible baseline data loss, verify reference restart/fresh-context/backend persistence, invalidate old evidence and preserve no-replay. Exact owned resources are retired with reports retained. Independent Linux Docker-host, native coding-client/model and hosted trials remain pending; fixtures do not close those rows.

Final catalog: e1da3b249be914b52eacf291844db9d24f11a46f7395c1b264dcfaab58d2219c. Pre-evidence archive: e28ea3039f399a2b0fec78bd240420f55d9664bd5d11891ed82e0c28f1a9f464; copied core: c2d0c5d1d0332e36dcc07e5fe500c85c3c26e2b6ffd3938b3e1cd5374bf2429c. macOS/Linux offline packages: 442a6c12f9d6ff9c73f049974bd75ee2b490863cc992cd10d0cc92c197174171 and 93b942145e6c3187b4e687db4bd1a5555793c20d70a67c370d6bb3fcdea6eab2. Trusted-control report: 041c1102ea9fc84a965b65811622c950a18e950f46617e9048f9b7be387eb55b; runner: 6e80c677f1f58ea2b4d8f8dac4817a0279b64e6dfe24697c4f9f4e7f616174d5. Browser report: db0df50464c863e7e3dfe6e809e3843d2700ed6cb23add35cc97054ada2c8848; runner: 338dc579bcbbd17ef23cc27595c9d15e44a8325be8586afe68c4abae38772a5a. Linux Node 20 control report: 1360b831a3b5f7a892737a8553703084f13954c0ba11b7157604f8a2461a80d3; inert schema parity passes. Each hash identifies its own observation. Final evidence-only local package: fe8199d5384baaa35dc43a5dac93426df890fae2683c710066138411cd8cc370. Rechecked docs/Markdown pass; continue P6-34 without waiting for unrelated manual checks. No account, model, hosted write or project merge occurs.

## Owned assembly and whole-milestone checks (2026-10-25)

P6-19 implements the [owned assembly and combined verification guide](../docs/tutorials/delivery-assembly.md). Require original private grants, complete committed parts, separate external topic worktrees and one effect per creation/merge. Merge in global dependency waves, preserve conflicts and ordinary failures, and consume the original repair counter for a fresh owned assembly. Accepted repairs fence prior assemblies; read-only reconciliation can observe already-issued steps after revocation without dispatch or restored authority. Match exact source parts plus actual assembled/environment vectors to pre-builder contract fingerprints and the approved combined procedure. Return pinned repair owners and retain complete bounded reports. This establishes milestone behavior/contract evidence, not independent review, whole-feature completion, publication or rollback authority.

Fifteen new Git/process/CLI/coverage regressions pass, including two repositories, global producer-first order despite reversed repository sorting, real conflicts and repair, zero repair budget, revocation, unchanged targets/workers, native completion and tampered receipts. The earlier expanded six-file run passes 46 cases. Final complete checks pass 2755 tests in 123 files on macOS arm64/Node 24.22.0 (367.32 seconds) and isolated Debian Linux arm64/Node 24.22.0 (96.83 seconds), plus lint/types/build/smoke, offline package, 329-file docs, references, 149-file harness, 328-file Markdown and 36 diagrams. The Linux full check has no network, credentials or Docker socket. Node 20.0.0 Linux/Git 2.39.5 also executes real two-repository assembly, idempotent preparation and read-only reconciliation after revocation; inert schema output matches macOS. These are runtime/Git observations, not independent Linux Docker-host or native-model certification.

The final opt-in Docker/Git evaluation passes eight observations on this macOS arm64 controller/Linux aarch64 Docker 29.9.2 daemon: independent green component units fail the actual combined API; completed keys do not repeat effects; a committed repair invalidates the old vector; the repaired complete vector passes unchanged CLI/contract/API cases; complete failed/passed private artifacts remain verifiable; personal targets and independent worker files remain unchanged; two-repository evidence claims no atomic delivery/rollback; exact owned retirement is observed. Retain all reports. The earlier seven-check successful run remains historical; the final run additionally verifies both complete report artifacts and current-source guards.

Preserve initial type/format/CLI schema-selection failures and genuine Git/path defects. The first assembly namespace collides with an existing wl/integration branch and exits 255; flat digest-bound topic names and prefix-collision preflight preserve existing refs. StoreFiles.path correctly refuses runtime-state paths inside an existing Git worktree; allocate/observe worktrees with canonical-path/containment checks and keep controller metadata elsewhere, without weakening assertExternal. The first combined trial reaches real green-unit/red-API evidence, then its fixture wrongly expects stopped instead of retained for owned volumes. Correct that assertion, positively observe stopped containers and retire only that failed environment with its report/history retained. Final evaluations pass. No skips or test-timeout increases occur.

Final pre-evidence archive: 7fca87ae238537cb979275386c6ad75dcd269e77d6a4134afab3423748de8b53; copied macOS core: 8a3f0728ec787d3574ccd8bd4fd3d8d685211fe56585c8de85d62233f9126076. macOS/Linux offline package receipts respectively: eb29b610aee3ae58860db8013a9175c3ff97d6573e0a8f4ddd8b0b7e73d95914 and 16ce9d1a435a5e7eb27202984b45f979cb35718391fe1f0af1f7b07fd7bb0937. Final actual evaluation report: 66eb5ccfac1eb3d1a6a8f4b5ee89ef5aee66ac546f527759ac5e1b4e447b4f78; runner: 0dcae741b417355842d4243ce25f2358020d0575ea96dd07f6ef73c3a2f55d6f. The shared Docker wrapper program remains byte-identical: aff209e74836ea58118da57a974cf65a5ebc492b8f9c462312ef3388d999c7c9. Each hash identifies its own execution; recheck later evidence-only docs/package separately. Final evidence-only local package: 181fb2b134981d50dc4bed2c50f906dfef24c206cdc90b49fc8747f54693ad82. P6-12 independent Linux-host acceptance remains open; continue the next ready task, P6-26. No model, account, hosted write, PR or project merge occurs.

## Integrated milestone candidate checks (2026-10-25)

P6-18 implements [exact read-only milestone candidates](../docs/tutorials/delivery-integration-candidates.md): derive required predecessor closure, observe registered clean committed part/assembly vectors and current named bases, and pin contracts, acceptance, recipes, data, gate-policy requirements, guidance and repair ownership. Current inspection detects changed bytes/commits/bases; comparison grants no execution reuse. Assembly provenance, combined application execution and whole-feature acceptance remain P6-19. No manual check blocks that implementation.

Twenty-three actual Git/graph/CLI cases and complete checks pass 2721 tests in 120 files on macOS arm64/Node 24.22.0 (348.37 seconds) and isolated Debian Linux arm64/Node 24.22.0 (76.91 seconds), plus lint/types/build/smoke, offline package, 327-file docs, references, 149-file harness, 326-file Markdown and 36 diagrams. Preserve the initial generic-union type error and two-repository fixture's obsolete workspace path; correct the fixture rather than weakening mount validation. The first full macOS run passes 2705/2721: one missing hard-rule declaration is corrected, while local socket EPERM and unobservable process groups require the existing unsandboxed test scope. Rerun all checks with those observations available; no skips or timeout increases occur.

The model-free two-repository evaluation passes eight actual observations on macOS Node 24/Git 2.49.0 and Linux Node 20.0.0/Git 2.39.5: committed vector, normalized idempotence, dirty predecessor, unknown contract, changed protected input, committed repair, preserved personal/worker files and moving base. Inert schema output matches. Cached Node 20's older Git 2.30.2 does not interpret the existing canonical --path-format option; use the Node 20 binary with the current Debian Git for the actual runtime trial. This is runtime/Git evidence, not native-client, account or containment certification. The installation minimum and doctor are now corrected to Git 2.36 under [ADR-0138](../docs/decisions/0138-unambiguous-git-worktree-runtime.md); the old Git 2.30 observation remains historical failure evidence. Common-directory reads no longer require path-format, while worktree ownership deliberately retains NUL-delimited output.

Final pre-evidence archive: 88c571074ccc6b935cb427608fe67998509f37327b9c3a8142fd6a6aed8aac89; copied macOS core: 180b5c4684a02aeeec56d0a860c5484a1831be01d30144cdc22ba337b235a258. macOS/Linux offline package receipts respectively: c95c17abb8dd29b87b738a9280a3a675cb23a47791407700b275db9aae57ed24 and dd2f9d2ed49367573a5ae5bef8fdb99213a1a490cd7f3fd3eb0fff75557d771e. Retained macOS evaluation report: d0b88911b0b7b0f5ad9dd48708e40b7f743f041f3df450536cb0e4e073a66954; retained Linux Node 20 report: 1a6bc51def7f816f23799165f9208e4cb1dbce1294a17d8b09c0d3264d154228. Each identifies its own execution; recheck later evidence-only docs/package separately. P6-12 independent Linux-host acceptance remains open. Final evidence-only local package: f18a519d3236a39880faf150428fdf5192c3586b348f104001aba85050bc0112. Continue P6-19; no model, vendor account, publication or project merge occurs.

## Private acceptance and sensitivity checks (2026-10-25)

P6-17 implements [private HTTP definitions and regression sensitivity](../docs/tutorials/delivery-private-acceptance.md). Pin controller-only inputs before builder admission; public inspection returns identity/counts rather than hidden values. A build-time embedded reviewed evaluator reuses complete HTTP/assertion code in an owned read-only mount, with no application workspace, controller store, native credentials or Docker socket. Existing native worker admission still requires actual containment/controller-store denial. The same-user controller filesystem remains trusted, not a private boundary.

Actual Docker observations deny application reads/writes of the private evaluator input and reads of the actual controller file. The unchanged empty-title case fails on the observed clean Git base and passes on the latest current candidate. Changed execution configuration, fixture data or dirty/untracked baselines cannot supply sensitivity. New-feature absence and missing mutation commands stay distinct; native synthetic counters are observed as repository-reported with semantic sensitivity unknown. Candidate changes invalidate proof, and candidate-only successes cannot bypass required red/green in aggregate or sealed acceptance. The evaluator actually exercises canonical HTTP port 80. These observations certify this owned Docker application/evaluator boundary on the macOS arm64 controller/Linux aarch64 Docker 29.9.2 daemon, not native model/accounts or an independent Linux controller.

Preserve initial type/format/command-registry insertion failures and the build-time 256-KiB helper-budget refusal: separating pure definitions from store/reducer imports removes unintended helper dependencies rather than widening its budget. The first native trial uses a network ID where the owned resource helper requires its name; it is interrupted/fenced and its exact resources are retired with evidence retained. Correct the reference without replaying that invocation. Subsequent real base/candidate, port 80, counter and aggregate trials pass. Default-port normalization fixes a genuine same-origin false refusal without allowing foreign or credential-bearing URLs. A later actual large Unicode case exposes per-chunk UTF-8 corruption: expected case SHA-256 684176f70e76ed0f81bf14b632a33f6c17d3be09a2aeac048ed0e8931b2a335f differs from copied df2a5ac64f9a3aa0eab04447f491af5129e7c8202aeddeaf5d94f075c7059e85. The existing hash guard refuses it; no corrupted case passes. Retain those hashes and the failed/fenced receipt, retire only its owned resources and switch to canonical byte encoding. Verify exact Unicode/escaped-byte roundtrip and worst-case one-MiB cases plus a 256-KiB program below the unchanged two-MiB pipe cap. Unit fixtures remain distinct from native privacy proof.

Final complete checks pass 2686 tests in 119 files on macOS arm64/Node 24.22.0 (340.60 seconds) and isolated Debian Linux arm64/Node 24.22.0 (76.69 seconds), plus lint/types/build/smoke, offline package, 325-file docs, references, 149-file harness, 324-file Markdown and 36 diagrams. No skips or test-timeout increases occur. The isolated Linux check is nonroot, read-only and network-free, without native credentials or a Docker socket. The minimum Node 20.0.0 Linux runtime also passes actual loopback HTTP and canonical-byte fixtures and emits the same inert private-schema output as the macOS bundle. These runtime fixtures establish no physical isolation certificate.

Final pre-evidence archive: 8ee8e996e5152492e1eca017b681f7464bc83a7482255a2d2f9dcee71e67f935; copied macOS core: 3e9232002d318df6524e15f2885d06a8025dcf460c49280efe02928be7b9ceab. macOS/Linux offline package receipts respectively: 7a64f6b56b6875651f99ffd0e8eea73daffa6f614bf2cfd486c07d4958a90121 and bb85449dbb5fd7f0bc620c9669d5e043e207494606eaeb5811778ff5a700ced1. The final actual private report is 5d96b84b860b052df9f1f26674c54ad05dae5972b01845e99476059ae6febe4c (nine observations, large Unicode input and exact retirement), runner 435b1fd70caf3170ca9742dcdfecf525530ecc70f2955e96a52427e6d2b06252. API/CLI regression report: 17564338862b716ee8cb7b677113a5fe14c958c13f51ab92c810b5bb723b7875 (nine observations); browser regression report: f93fc464d2344d42ad16cd79ccee94948bb9a862eb7605a1e60ec5a028c15000 (five observations), both exact-retired. Each hash identifies its own execution; later evidence-only docs/package are rechecked separately. Final local evidence-only package: 990789a00d77da4305f020f2a33b5ed36cc64ceb6ebab5be1d393295b386fc26. P6-12 independent Linux-host acceptance remains open; continue P6-18. No model, vendor account, hosted publication or merge occurs. Continue the next technically ready task without waiting for unrelated manual checks.

## Browser acceptance checks (2026-10-25)

P6-16 implements the [fixed browser host](../docs/tutorials/delivery-browsers.md), digest-pinned Playwright MCP tool constraints, grounded live references, exact owned page/tab context, native checks and labelled complete PNGs. The official SDK supplies protocol framing; a private registered Docker exec pipe supplies the control channel. The browser container has no MCP TCP listener, workspace/credential mounts or original user profile. The reference Chromium command disables its internal sandbox inside the required nonroot/read-only/capability-restricted Docker boundary; do not describe that as an independent browser sandbox.

The actual model-free evaluator observes a cosmetic UI successfully displaying/capturing a task while failing fresh-context persistence and backend identifiers. Its repaired app passes real form creation, owned service restart, fresh context and backend JSON checks. The app cannot connect to the browser probe from the application network; completed stable keys reuse receipts without repeating UI writes. Exact owned resources are explicitly retired while external evidence remains. This is actual Chromium/MCP execution on a macOS arm64 controller with Docker 29.9.2/Linux aarch64; it does not certify a coding client's tool registry, model/account, independent Linux controller or arbitrary website safety.

Preserve the failed HTTP prototype and all failed trials: HTTP MCP on the app network was rejected because the untrusted app could open its own session outside the controller whitelist. A private-stdio startup tool notification initially invalidated negotiation; bounded stable inventory rediscovery fixes it without repeating UI actions. The first evaluator was denied the Docker socket by the sandbox; the next exhausted concurrent compute capacity and the next expected the wrong lifecycle stop state. Release compute with exact owned stop, whose receipt is retained, before provisioning the repaired candidate. Keep the unchanged capacity policy. The first native unit invocation could not observe processes under the sandbox; its authorized rerun passes. Initial missing-import/optional-value type errors and baseline formatting failure are retained; do not change product logic to hide them.

The focused acceptance/environment/contracts run passes 558 tests in fifteen files. The original Node 20.0.0 Linux runtime passes an official SDK in-memory protocol fixture and emits identical inert browser-schema output to macOS Node 24; this fixture establishes protocol compatibility, not an actual browser roundtrip. The first full macOS run passes 2645 of 2646 tests but exposes an old registration assertion requiring every schema to end in @1. The core and compatibility policy already permit positive new versions while freezing all existing identities; align the registration test rather than changing the existing operation contract. Final complete checks pass 2646 tests in 116 files on macOS arm64/Node 24.22.0 (335.67 seconds) and isolated Debian Linux arm64/Node 24.22.0 (77.21 seconds), plus lint/types/build/smoke, offline package, 323-file docs, references, 149-file harness, 322-file Markdown and 36 diagrams. No skips or test-timeout increases occur. The Linux check is nonroot, read-only, network-free and has no Docker socket or credentials. The final actual browser evaluator passes all five observations and exact retirement; the API/CLI regression evaluator passes all nine and exact retirement.

Final pre-evidence archive SHA-256: 35dd7f3bd3ee1aa3fa918c7e0b390fc11b673f37907b80e82c8b4773a365c1ef; copied macOS core: 1b0de3d3ccafeaa0fe82023595b432fef9741d10c81f47d3b09389647b3f5e7d. macOS/Linux offline package receipts respectively: 4aaf6b527a3a5a316ed3abae369dd690731394ef0b3de1bc4b0bb173260d6a67 and 827f9c2c1a302d96a1b4bb2cdd196f019db6ff3ee1e2c843a5803bd26aa121b1. Actual browser report: 60d1f1a5597651d59b95462fe213db48f4ea87d26e124c0f875562886fe34677; API/CLI regression report: 11d4f71a297a70fd7fbe54e32dca5ff6a60c297806917c8f705f21f3d0be0a37. These identify their own executions; later evidence-only docs are rechecked separately. Final local evidence-only package: 99568be90d9a37851174f574475e425135e10e9d774b8c691c7086a25d082a82. P6-12 independent Linux-host acceptance remains open; continue P6-17. No model, account, publication, PR or project merge occurs.

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

P6-12 is complete: its implementation and ENV-07 now pass on macOS and an independent Linux host. Forty-one backend unit cases plus one compiled CLI canary cover capability/denial policy, actual-inspect-shaped fixtures, private-authority refusal, immutable ownership, image/index/manifest/platform bindings, output bounds, compatible bounded snapshots and preserved input-file planning contracts. The six focused files pass 504 environment/contract checks. Actual Docker observations below are separate from fixtures and native/model acceptance.

| Environment | Executed result |
| --- | --- |
| macOS arm64 / Node 24.22.0 | Complete check: 2461 tests in 106 files (334.74 seconds), lint/types/build/smoke, offline package, 314-file docs/references, 148-file harness, 313-file Markdown and 36 diagrams |
| Debian Linux arm64 / Node 24.22.0 | Same complete check: 2461 tests in 106 files (72.86 seconds), no skips; isolated non-root controller container without network, private history, credentials or Docker socket; backend execution there is fixture scope |
| macOS Node 24 and Linux Node 20.0.0/24.22.0 | Exact closed-runtime-schema guide assertions pass with ShellCheck; these launch no Docker/model |
| macOS arm64 controller / Linux aarch64 daemon / Docker 29.9.2 | Actual model-free evaluation passes ten observations: two app endpoints/data sets, copied read-only inputs/implementation, denied controller/home/credential/sibling/socket/environment access, denied setup/runtime egress, no effect reissue, stale candidate invalidation and setup exit 7 refusing readiness |
| Independent Linux x64 VM / Node 22.23.4 / local Linux x86_64 daemon / Docker 29.9.2 | 2026-10-31: the same evaluation passes seventeen checks across eleven controls, including denied controller/home/credential/sibling/socket/environment access, denied setup and application egress, setup exit 7, foreign same-name volume retention and killed-controller retirement recovery; exact owned absence observed. Controller and daemon share one ephemeral VM; no service/model account is used |

Frozen candidate archive f69f7e627d7396fab32b71f5301a14ea9a2155ac59c0ecfc4307b11765ffe619 is based on 2e229a2 plus P6-12 source/tests. Copied core: 9fe69a3d578dee041b8379c312e175796a1e728199ac595532ce9701055ab006. Pre-evidence package receipts: macOS eea7bfd7be62f2e687de943c8278061123b503a5c4dc7ad05ee9f1ae94f59b7f and Linux c09e633dfdebd167db5ca54f3be3915ddcd976c8cbb4dafd0020b2063e078d90. Preserve the existing dependency-path build distinction; final evidence-only docs receive another local package/docs check.

Actual final evaluation command: npm run eval:environments -- --retire-success. The retained final report has status pass, ten checks and exact-owned-absence-observed. Its actual controller/daemon scope does not establish a native model/tool permission guarantee or an independent Linux host. Versioned receipts retain current resource IDs, labels, creation fingerprints, original deadlines, exact copied bytes and image/platform identities; no raw image environment or credentials enter reports. The explicit fixture teardown observes absence; unexpected failures remain retained.

Preserve failures and corrections:

- The first actual app trial returns internal readiness but no allocated host port. Its evaluation fails. Fix the erroneous ready condition, keep application networking isolated and introduce the fixed-target controller publisher; the repeated actual endpoint returns HTTP 200.
- The first anonymized inspection fixture assigns volume names by array order. The positive policy comparison fails while its negative cases were already different. Correct names by mount destination and require baseline equality before each mutation; final negative cases now exercise the intended control independently.
- Precise platform image inspection exposes engine root ID sha256:925de64a85319052d6971ae81ef2417da956e8a3a2c4a0fac732327970f017f5 and selected arm64 manifest sha256:0e84a1a8a11b9a42374419513e0825262dfd6f072eeb4a724c52fc0aab3061d2. The first stricter run refuses startup. Preserve that failure, bind both IDs/platforms and pass the final actual input/setup/data/boundary trials. Retire the three reviewed failed-probe resources only after exact ownership/daemon checks and observed absence; retain their diagnostic history.
- Initial fixture TypeScript errors use mutable types for readonly tables and a null-only capability field. Correct fixture types, not product guards. No original native failure or service-unverified integration becomes passed.

The backend has no remaining P6-12 code blocker. P6-13 has since passed its own local/reference lifecycle checks above, under an explicit instruction to defer manual/host acceptance. ENV-07 is closed by the independent Linux run above; actual native clients/models remain P6-27, with original fourteen open tasks unchanged. No hosted publication, merge, production resource or account-bound service trial occurs.

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

**2026-11-08:** commit ae397c0, which includes the Phase 7 work, passes the complete check offline on Linux arm64 with Node 24.22.0 in a network-disabled container built from the current lockfile: CHECK PASS in 274s, 4619 tests plus the macOS-only Claude sandbox test skipped, 330 files. A container is not an independent Linux host, and Node 20 runtime and native clients on Linux remain separate checks.

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

Earlier per-component observations below remain historical. Their automated fixtures now also have the Linux arm64/Node 24 result above; references to other versions or real clients/services stay open. New technical defects found by native trials still require implementation rather than a maintainer acceptance waiver.

## Manually observed Claude framing and session recovery (2026-10-22)

Source-installed user-scope loose skills were exercised by hand in Claude Code; the session was then closed, a new one opened and status invoked again. The local CLI reports Claude Code 2.1.306 on macOS arm64 with Node 24.22.0; the installed source revision was f714820. These are interactive observations and independent read-only core checks, not a collected conformance-runner verdict.

- [x] Invoke wl-frame-problem from a sentence in the actual client. Observe the eight framing questions, explicit unknowns and a pause for the owner's decision.
- [x] Complete an explicitly fictitious scenario with the owner's on-hold outcome. Independently inspect the English external-store artifact and core state: framing completed, initiative closed, no next step, and the approved reason/reopen condition retained.
- [x] Close Claude, open a new session and invoke wl-status with the same initiative ID. The session reports the same closed initiative, completed framing, no next step and retained on-hold note.
- [ ] Repeat narrative decision fidelity on a new run using frame draft/finalize (ADR-0086): the stored artifact preserves the owner's reopen condition but also introduces stricter reopening requirements and drop rules without approval. The core now renders only explicitly approved decision data and rejects extra stop rules at finalization. Verify actual client behavior; retain the original artifact as historical defect evidence.
- [ ] Verify final semantic revision review in a new native run with frame finalize. The transcript reports two challenger rounds, followed by a third draft that received structural validation only; this does not establish final-content review or independent reviewer isolation. The core now rejects mismatched final digests and incomplete coverage; actual semantic truth and role isolation remain acceptance.

This observation does not close plugin installation/all-entrypoint discovery, actual hook denial, role isolation, authenticated providers, the go/spec path, the random-marker runner scenario or other clients/platforms. The unchecked aggregate checks below remain open for those broader requirements.

## Automatic native-client trials (2026-10-22)

Actual model-backed execution of the other installed clients is authorized. Run fresh disposable fixtures; retain earlier failures rather than relabelling them after a code change. All observations below are on macOS arm64/Node 24.22.0.

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

Technical remediation under ADR-0087 adds conformance diagnose with bounded, redacted event/error categories, a private OpenCode 2 server and documented AGY stream-only invocation. Actual no-tool probes on OpenCode 2.1.1, Copilot 1.0.83 and Antigravity 1.4.4 returned model responses, including piped Copilot and both AGY input variants. This is transport/model-access evidence only. A later full-trial host invocation was rejected by automatic approval review over possible private harness disclosure before native execution; it is not a new native failure. That disclosure was subsequently approved explicitly. Fresh execution on core 1237b1be created OpenCode's initiative but timed out; Copilot reported a permission denial. Antigravity's ERROR tool step and nonempty denied_actions inside a SUCCESS result initially escaped classification. Recognize both bounded structured fields without retaining parameters, actions or responses; an actual fresh run on core 40482b4d now reports permission-denied and remains FAIL. Earlier receipts are preserved. Do not promote these failures or no-tool probes to passes.

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

## Client MCP rollout operations (P4-05, P7-16)

The built-in HTTP flag readers and dashboard writers were retired before the first release; their per-service HTTP certification no longer exists. Flag reads and dashboard creation run only through the client's MCP connection.

- [ ] When Amplitude is actually needed, use client MCP discovery to capture its exact dashboard/chart write and readback contracts. Preserve only non-secret schemas/permissions. Until then, its dashboard operation stays a pending handoff. This is deferred service certification under ADR-0084, not a 1.0 blocker.

- [ ] When a flag service or dashboard service is actually needed, capture its client MCP tool schema and permissions in a disposable project, review a binding and run `wl provider read-flags` or `wl launch dispatch` with that inventory. Confirm the planned call matches the real tool, that complex targeting, missing access and failed calls stay unknown or pending, and that no flag changes. LaunchDarkly, Unleash and GrowthBook declare no MCP server yet; add one through a reviewed manifest override first.

- [ ] Repeat the remaining built-CLI/provider runtime scenarios across supported Node/platform versions. The complete check passes on macOS Node 22 and macOS/Linux Node 24; Node 20 Linux package/corpora/conformance simulations pass at the scoped surface above. Complete Node 20 behavior and actual native/server acceptance remain unverified.

## Explicit conformance collection (P5-04 component)

- [x] Deliver the explicitly selected nightly OpenCode model through the documented V1/V2 --model flag, validating before native startup. Keys remain environment-only; no native config is written or model/account chosen automatically (ADR-0090). Synthetic transport passes do not establish authenticated Actions/model access.
- [ ] Review the disabled nightly workflow and its [activation guide](../docs/contributing/conformance.md). Configure intended conformance/conformance-issues environment protection and native secrets, then explicitly enable collection only after checking access/model costs. Confirm source/core/artifact IDs/digests, separate selected key steps and no native upload of homes/journals/raw logs. Current tests parse YAML and simulate transports; they do not execute Actions.
- [ ] Dispatch the reviewed default-branch workflow against actual clients on Linux. Confirm missing credentials/model selection stay unconfigured/UNRUN; verify native authentication-mode settings, fresh per-channel homes, actual version/permission behavior, external owned-page artifacts and unchanged source. Review drafts before separately enabling issue delivery and test actual closed-marker/partial-outcome behavior in a disposable repository.

- [ ] On actual macOS and glibc Linux hosts, review test/conformance/pins.json and the printed native acquisition plan; install into a new absolute external prefix. Confirm exact package/native versions, private npm/config/cache paths, archive checksums/modes and no personal configuration changes. Cursor's digest is observed only. No actual native installation/model support follows from fake npm transports or logical platform mappings.
- [ ] Interrupt native acquisition after one completed client/channel and inspect the retained failed receipt/prefix without automatic retries. Confirm the collector probes exact versions again before scenarios; vendor self-updates and transitive/postinstall downloads are not frozen by the top-level acquisition pin.

- [ ] Review structural issue drafts from actual fresh comparable observations. Confirm exact versions/assertions, original timestamps and stable markers, with no raw native output, draft contents or journal paths. Simulation/stale/authentication/launch failures must produce no regression issue.
- [ ] In a maintainer-controlled disposable GitHub repository, preview the complete open/closed marker inventory, then explicitly authorize CI delivery. Verify intact closed markers suppress repeats, incomplete pagination/current-core/input checks prevent writes, stdin preserves body newlines, and partial failures retain actual outcomes. Serialize writers and inspect remote effects before retrying; all current service tests use local fake executables.
- [ ] Provision isolated pinned/latest native binaries and exact resolved versions for the intended host. Run only after native trust/auth/permissions setup; confirm selected paths and version probes cannot silently reuse a global channel. Current local tests use synthetic clients/simulation only.
- [ ] Repeat a live batch on macOS/Linux/supported Node versions; inspect journal verdicts, crashes, timeout/cancellation, native updater behavior and external effects. Feed actual timestamped results to the matrix without relabelling simulations or refreshing observation dates.
- [ ] Verify result artifacts expose structural IDs/versions/assertions but no journal paths, draft contents, raw stdout or credentials. Inspect interrupted external state before preparing a fresh run. Host resolution/acquisition is implemented locally; owner activation and actual native/service issue checks remain separate.

## Coinstalled entrypoints and slot guidance (P1-07/P1-13 regression)

- [ ] Upgrade unchanged owned older native output, then restart the intended clients. Confirm wholeloop skills/roles remain discoverable but do not compete as heuristic frame.template or review.rubric guidance. Routing markers are not native-loader or permission evidence.
- [ ] Add a genuine repository guide and verify it wins. Add two equally explicit guides and verify the real choice is still asked. Existing configured bindings remain user choices, including deliberate bindings to marked entrypoints.
- [ ] Repeat multi-client user/project framing and cache invalidation on Linux and supported Node/client versions. Current real core regression coverage runs on macOS arm64/Node 24; actual native model execution remains separate.

## Gemini adapter, overlays and conformance (P5-01 component)

- [ ] Exercise the new Gemini headless observer in a disposable native setup. Confirm the generated private core read-tool registry, disabled alternate surfaces and both built-in delegators, successful final JSON and exact assignment envelope. Actual 0.27.0 metadata/config/registry probes are model-free; no real headless model pass is claimed.
- [ ] Confirm an existing default or explicit managed system policy blocks launch; preserve its bytes and native authentication/trust/model. Verify original/custom absolute system-defaults paths remain selected and the worker never auto-trusts its directory. Repeat configuration merging, inherited include roots and external/log/update effects on Linux/current client versions.
- [ ] Review generated gemini-extension.json and native overlays, then load/link/install only in disposable native configurations. Enable preview subagents through explicit native setup, verify all seventeen skills/nine agents and actual invocation, and confirm inheritance/precedence. Actual 0.27.0 static loaders passed; that is not a model/runtime permission check.
- [ ] Verify observer tool isolation, no shell/write/memory/MCP/delegation route, sequential main-session handoffs, inherited models and exact plain-text questions when ask is unavailable. Repeat against the intended current version; 0.27.0 uses search_file_content while newer documentation also names grep_search.
- [ ] Exercise user/project install/uninstall, absolute GEMINI_CLI_HOME, external ownership/backups, relocation and special paths. --target all now includes Gemini; default doctor stays tier A, so select --target gemini explicitly.
- [ ] Run the shared framing scenario with a new --target gemini run and exact --pin, then explicit --live after native trust/auth/permissions setup. Keep FIXTURE_PASS separate from actual process/journal evidence and inspect native external/ignored effects.
- [ ] Review unapplied HTTP/stdio MCP snippets, exact live tools/arguments, OAuth discovery and header placeholders under the native credential store. Static detection observes declaration metadata only; no authenticated tool ran.
- [ ] Activate the generated extension explicitly and verify its BeforeTool hook environment binding, exact target/core checks, read allow and runtime-write/push denial. Actual 0.27.0 loader/runner APIs passed a disposable shell-special-path probe without models; full native activation and permission behavior remain unverified. Loose overlays retain the per-repository Git fallback and never rewrite shared settings.
- [ ] Repeat on Linux and supported Node/client versions. Current generator/launcher/static-loader execution is macOS arm64/Node 24/Gemini 0.27.0 only.

## Antigravity native activation (P5-01 component)

- [ ] Verify the conditional headless observer in a disposable real native setup: unique primary read-only agent, scoped hook, inherited model/auth and native sandbox. Confirm a read-only init is emitted before any assignment under request-review/strict permissions. Actual AGY 1.4.2 startup ordering is unverified; a client waiting for input first must remain unavailable, without a probe prompt or bypass.
- [ ] Inspect initial tool names/cwd, strict final JSONL conversation/one-turn success, native hook activation and external/startup effects. A broad/malformed/missing init must receive no assignment, and failed/timeout/cancelled workers must not count as refutations. Current proof uses local synthetic processes and authored hook payloads only; repeat on Linux/native versions.
- [ ] Load the generated plugin or owned overlays in disposable agy configuration. Confirm seventeen wl-agy- skills/nine agents, Codex coexistence, inherited models, observer tools/off execution policy, writer sandbox and sequential role handoffs. agy 1.4.2 version/help ran; listing could not bind a local port in this sandbox, so no native loader pass is claimed.
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
- [ ] Run maintainer-authorized OIDC publication and verify actual npm provenance, source/tag SHA, stable/prerelease labels, GitHub assets and native download/install. Test partial failure/reconciliation in a maintainer-controlled disposable publication project; never blindly retry or overwrite an existing release/tag/version. Local logging transports are simulation only.
- [ ] Register the exported relative marketplace in an isolated real Claude configuration, install wholeloop@wholeloop and confirm all seventeen skills/nine agents, copied core and hook activation after moving the delivery tree. Native strict validation passed locally; it is not installation/discovery.
- [ ] Test each exported native target with its real client and credential store. Repeat owned output/backup/unknown-file/dry-run/relocation checks on Linux and supported Node/client versions; current automated execution is macOS arm64 only.
- [ ] Choose public repository visibility and hosting explicitly, verify npm ownership and activate and verify the implemented trusted publication/provenance workflow. The local exporter changes neither repository visibility nor package privacy and performs no publication.
- [ ] Run release preflight from the actual source checkout with the intended built/package/lock version and genuine CI repository/event context. Inspect blocked reasons and masked index flags without silently clearing personal setup. A ready local consistency plan is neither authenticated context nor permission to publish; actual ownership/OIDC/provenance and release activation remain separate.
- [ ] Record actual fresh-machine installation time and review release notes without attribution after delivery activation. Run the local release notes draft against the intended exact range, check actual breaking intent/migration guidance and inspect identity-only rejections. Repeat complete-clone/range/refusal behavior on Linux and supported Node releases; draft impact alone does not verify compatibility. Publication automation is implemented locally; actual hosted/OIDC provenance remains manual verification. Optional compiled binaries remain optional future code work.
- [x] Repeat package:check on Linux arm64/Node 24.22.0/npm 11.19.1: actual offline archive/install/bin-links/managed-file execution passes, matching the macOS package hash. Package privacy stays true and no publication occurs.
- [ ] Repeat other supported development Node/npm/platform combinations and the complete installed-core Node 20 runtime surface. Inspect retained interrupted/failed fixtures before removal; native activation and fresh-machine timing remain separate.

## Generated references (P5-06 local controls)

- [ ] After changing source contracts, rebuild before running docs check. Follow the chosen client onboarding section and keep the selected absolute core path when changing projects; native file installation does not create a global alias. Confirm command/config/provider/adapter sections describe that build, not an older executable on PATH.
- [x] On Linux arm64/Node 24, repeat read-only drift detection, explicit selective/full regeneration, malformed-marker refusal and preservation of surrounding prose through the compiled fixtures and complete check.
- [ ] Repeat the generated-reference fixtures on other supported Node/platform combinations.
- [ ] If regeneration is interrupted during writes, inspect the affected pages/markers before rerunning. All selected markers are preflighted, but filesystem failures do not provide multi-file crash atomicity.

The generated provider and adapter tables record declarations only. Check that local engine changes retain unverified native status. Native capability-matrix collection/version resolution/issue automation remain P5-04 implementation work. The local P5-06 references/banner/onboarding deliverables are complete; real native discovery, activation, permissions and first-step checks remain in the client sections above. Overview pages retain native/host verification boundaries.

## Public contracts and v1 candidate (P5-07 component)

- [ ] On a disposable external copy of an older store, repeat gate/suite reads and projection rebuild after upgrade. Root schema metadata/wrappers must not rewrite journal envelopes or change payload acceptance. Exact prior rule hashes and local replay tests passed; physical upgrade/Linux/other supported Node execution remain manual checks.
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

Automated tier-A/Gemini/Antigravity/Cursor installed-launcher simulations report FIXTURE_PASS, never a native conformance PASS. Preparation launches no model; --live is an explicit maintainer action that can use authenticated models and incur cost. The interactive Claude observation above is separate from this unexecuted live runner scenario; actual observations remain separate from local fixture coverage.

## Native installation and observed diagnostics (P1-13)

- [ ] Run native user/project install/uninstall with explicit targets in disposable client configurations. Verify all seventeen wl-prefixed skills/eight roles, native discovery, restart/trust behavior, permission inheritance and compatibility precedence. Filesystem/transport fixtures do not establish actual client activation.
- [ ] Verify source-installed Claude scoped skill/agent hooks, Copilot dedicated user/project hooks, OpenCode helper import and Codex per-repository Git fallback. Generated plugins are a separate delivery format; no shared settings/MCP/auth store is rewritten.
- [ ] Repeat project relocation and user config overrides, including URL/shell-special paths. Inspect ownership receipts in the external store, backups of replaced/removed bytes, edited/unowned refusal and missing-file uninstall; no automatic adoption/force option exists.
- [ ] Interrupt actual installs/upgrades/uninstalls, inspect the pending receipt/lock and recover all pending targets together only after confirming the writer stopped. Synthetic mixed-version recovery is not physical-crash evidence; unknown staging files or edited backups need manual preservation/inspection.
- [ ] Run doctor with the actual installed clients and explicit artifact directories. Confirm each reported token comes from the intended executable/PATH and inspect vendor requirements separately; a version does not prove native skills, hooks, permissions or authentication.
- [ ] On each platform, exercise selected missing clients, failed/slow version commands, stale/copied artifact hashes/modes and malformed declarations. Failures must offer instructions and repair/diagnostic argv without exposing raw output or config values.
- [ ] Verify the atomic external-store probe and cleanup under real permissions/filesystems, including inaccessible and symlinked Git destinations. Inspect any failed cleanup; retain other state and do not repair permissions automatically.
- [ ] Repeat on Linux and supported Node releases. Current automated execution is macOS arm64/Node 24; npm recipes for current Claude/Copilot require Node 22 or newer even though the bundled core supports Node 20.

Native install/uninstall and managed doctor inspection are implemented. Actual activation and corrective commands requiring the maintainer's platform/configuration choices remain verification. Native conformance is tracked separately below.

## Common guards and Git fallback (P3-08)

- [x] Capture actual before-tool events on Claude/Codex/Copilot/OpenCode and compare schema, tool names, cwd and write paths with the authored fixtures (2026-11-08, `test/fixtures/hooks/tier-a-payloads.json`).
- [ ] Verify the Codex Git fallback in the actual CLI; wholeloop registers no native Codex hook because Codex needs the user's trust for each hook.
- [ ] In disposable clients, try wrong-checkout/default-branch Build commits with the returned WL_SUBJECT environment, extra/deleted/stale push refs and reserved runtime writes. Normal native reads/permissions must retain their ordinary behavior; synthetic transport tests do not establish client enforcement.
- [ ] Exercise inner/outer timeouts, inaccessible stores, managed policies and disabled hooks. Copilot outer hook timeouts can fail open; retain Git fallbacks and inspect real sandbox access to the external store.
- [ ] Inspect existing hooks before an explicit guard hooks install on a disposable project. Verify original execution/exit codes and changed-file/config refusal; uninstall must restore only prior local configuration and retain the returned backup. Relative/multiple effective and worktree-specific hook paths need manual chaining.
- [ ] Recover a physical interruption by inspecting the external ownership receipt/lock and current Git configuration. Do not delete prepared/changed files or steal locks. Reinstall after reviewing new original hook names or upgrading the pinned core.
- [ ] Repeat actual Git-hook chaining, local bare SSH-shaped pushes, native root expansion, symlinks and timing fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64/Node 24 only.

Native installation returns explicit per-repository Git activation/removal commands. No hooks were installed in this repository, no actual project push ran and no model session was executed by these synthetic/temporary tests.

## Additional tier-A artifacts (P1-11)

- [ ] Load generated Codex/Copilot portable skill packages and install the appropriate native agent overlays, including Codex project/user TOML agents. Verify all seventeen prefixed skills/nine agents and their actual invocation; a portable skill package does not prove Codex agent discovery.
- [ ] In actual clients, verify loaded skill-directory reporting, launcher execution, checked artifact roots and conductor handoff after relocation and symlinked installation. Missing context must ask rather than selecting another wl on PATH.
- [ ] Exercise disposable read-only sentinels and actual command/provider handoffs. Codex custom agents inherit the parent sandbox; verify the checked read-only parent/headless path rather than trusting instructions or an unsupported per-role sandbox override.
- [ ] Inspect OpenCode/Copilot native permission behavior, inherited repository instructions and native external-directory asks. Static mappings and partial/native listings do not prove runtime enforcement, complete isolation or independent workers.
- [ ] Repeat native discovery, launcher/symlink, permission and copied-runtime fixtures on Linux and supported Node versions.

Native guard bindings and the Codex Git fallback are implemented. Native/headless model conformance remains pending and does not block independent installation work.

## Generated Claude artifacts (P1-10)

- [ ] Install a generated plugin in an isolated real client configuration, list all seventeen skills/nine agents and invoke a unique marker. Static plugin validate passed locally; it does not establish discovery or execution.
- [ ] Confirm plugin-root substitution and conductor root handoff select the copied core in paths with spaces, including after moving the artifact tree away from the source checkout.
- [ ] Exercise read-only roles against a disposable sentinel, including roles with shell access and managed policy. Confirm model tier aliases and batched missing-context questions; no independent model session has been run.
- [ ] Repeat owned output, backup/mode/symlink and bundled runtime fixtures on Linux and supported Node versions. Current execution evidence is macOS arm64 only.

Native hook registration and the other tier-A renderers are implemented; actual hook capture and installed-client behavior remain manual checks.

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

OpenCode/Copilot recipes have local fixture coverage. Verify OpenCode native deny-default agent permissions, external-directory containment, completed-message JSONL and inherited managed configuration. Verify Copilot stdin/silent output, read-only available-tool filtering and non-interactive refusal without broad grants. Inspect custom MCP startup and trusted-folder hooks independently: tool restrictions do not prove that these startup effects are disabled. Keep credential stores in place; no copied tokens or permission bypasses are needed. Verify Cursor Ask/sandbox plus actual worker-local cli.json/hooks.json discovery, read/search-only hook activation, native denial precedence, no reused session and successful final JSON. Exercise shell, write/delete, web, MCP, unknown tools and missing Node against disposable sentinels; inspect native startup effects and logs. Gemini/Antigravity private observer recipes now have local fixture coverage. Verify actual positive read-only registry/private settings and init-before-assignment behavior; a client that waits for input before initialization remains unavailable. None of these manual checks blocks independent local roadmap work.

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

- [ ] In a real native client, inspect tools/schemas, review operation bindings and run provider plan against non-secret external metadata. Verify actual authentication, argument translation and normalized results for the chosen operation. Confirm a permission failure remains pending/unknown with no other transport. Routing, once-only dispatch and unknown handling are covered by synthetic tests; this checkbox is actual client/service certification.
- [ ] Capture actual dashboard-write tool schemas/permissions and target data-source requirements for PostHog/Mixpanel/Amplitude/Metabase/Grafana before reviewing any client MCP binding. Default local output remains a pending exact-metric handoff with createdRemotely=false, not a remote chart.
- [ ] Capture real MCP rosters/arguments, project/site/datasource IDs and permissions for Datadog/Grafana/Figma. Offline binding fixtures use synthetic normalized results and establish no remote compatibility.
- [ ] Pull/verify the pinned Grafana container and read-only categories on supported platforms; pass credentials from the host store, never literal secret arguments or plaintext config. No container was pulled or run locally.
- [ ] Review and manually post destination-labelled Slack/Teams/email drafts. Confirm no sending capability is present. Review/apply flag proposals externally; native proposal results are explicitly unapplied.
- [ ] Exercise config-file reads/proposals and external-store conflict/idempotency on Linux and supported Node versions. The native reader requires explicit flag/environment/enabled/exposure/audience and never changes repository bytes.

P4-05 implementation is complete under ADR-0085: remote operations run only through client MCP and failed calls do not switch transport. The unchecked service/account cases above are deferred certification under ADR-0084, not release blockers or executed live tests.

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

- [ ] Render-level launcher tests now cover all seven clients (2026-11-08). On Codex and Cursor, confirm with the native client whether a custom agent inherits MCP servers from the user's configuration; if it does, find a per-agent way to remove them. Then complete the adapter test for every target CLI: inspect the launcher's actual tool set and prove sending tools are unavailable. Canonical read-only metadata and synthetic typed hosts do not satisfy this acceptance criterion.
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
- [ ] Interrupt after the push and after remote creation, inspect what exists, and reconcile the observed matching draft URL. A request with no remote PR remains an explicit manual recovery case; do not clear intent or retry blindly.
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

## Maintainer actions still pending

| Task | Action | Current evidence |
| --- | --- | --- |
| P0-01 | Right before the first release, recreate the npm trusted publisher (`dreamingechoes/wholeloop`, `release.yml`, environment `release`, `npm publish` allowed, `npm dist-tag` not): npm validates it only through a publication within about two days | Name owned by `dreamingechoes`; `0.0.1` approved as `latest`; a trusted publisher created on 2026-11-08 expires unvalidated on 2026-11-10 |
| P0-03 | Follow the isolated-session [conformance checklist](../test/conformance/notes/README.md) for all four tier-A CLIs | Owner-observed Claude loose-skill framing/status and session recovery; broad discovery, permissions, hooks, MCP, plugin loading and other clients remain unverified |
| P0-06 | Optionally enable the local hook with `npm run hooks:install`; preserve any existing hook chain | A real hook was exercised in a temporary git repository; this checkout's Git configuration was not changed |
| CI | Run the updated workflow on Linux/macOS, including Node 20 runtime and a PR containing a rejected message | Local checks also passed on macOS arm64 / Node 24.22.0; no remote CI run or push was performed |
| P1-03 | Optionally exercise forced interruption during a store write, preserve the journal, inspect the lock owner and rebuild after recovery | Concurrent processes, failed batches, malformed journals, symlinks and byte-identical rebuild are tested; physical power loss is not |
| P6-29 | Decide whether a `none` run may continue after a repairable failure under its still-active envelope grant. The draft `docs/decisions/0198-envelope-grant-continuation.md` (status Proposed) would allow it inside the envelope and repair budget. Accept, amend or reject it, then set its status and index it | Every correction revision needs a new exact-plan grant from an operator; the journal refuses the failed run's grant and any envelope grant |

## Expanded delivery acceptance coverage

The [case map](../docs/reference/delivery-acceptance.md) now identifies concrete local tests and hard-rule enforcers for all 86 expanded specification cases. Required evidence levels and the current local-only results remain separate columns. The docs gate refuses removed accepted definitions, missing/duplicate/borrowed rows, invented test/enforcer references and downgraded native, hosted, backend or platform obligations. This is documentation coverage, not a native/service execution report.

P6-32's source-installable reconciliation retains P6-27's pending reference-client/hosted trials, P6-35's real account measurements and maintainer design decision, and every original seven-client/runtime/release obligation. P5-07 cannot close before P6-32 and its original prerequisites. No credential injection, hosted effect or unsupported public endpoint is enabled by the map.

## Provider validation still pending

MCP snippets for Claude, Codex, OpenCode and Copilot are golden-tested for HTTP and stdio. Merge a snippet into an isolated client configuration and verify an actual tool call and authentication before calling that integration supported. The eight destination providers have synthetic host-boundary transcripts, not live captured responses. Verify actual tool names/arguments, complete reads, rich-text preservation, revision conflicts and confirmed external links for each configured destination. Check Notion async results and aliases, GitLab version, Atlassian fields/permissions, and optional gws creation plus content insertion. No integration was installed. Registry detection only establishes declarations or executable presence. No live provider operation, model session or OAuth flow was executed here.

## Source validation still pending

For each configured source, verify the actual project/tenant, regional endpoint, live tool schema, permissions, pagination/truncation, query reference and exact window/timezone. All eleven source transcripts are synthetic. Replace Metabase's example endpoint and configure Zendesk's real tenant/host authentication. Verify PostHog tools mode and BigQuery read-only IAM/cost controls. For PostgreSQL, the client runs psql: use a restricted libpq service and verify server read-only rejection, function privileges and timeout behavior. Failed or incomplete access must produce an explicit unknown rather than a baseline.

## Worktree validation still pending

On a representative project, verify dependency/setup commands, actual port binding, submodules/LFS, platform-specific Git behavior and the explicit checkout opt-out. Local tests used Git 2.49.0 on macOS with real temporary repositories, concurrent CLI creation, dirty source checkouts, stacked branches, locks and conservative prune. These fixtures also pass on Linux arm64/Node 24/Git 2.39.5; other platforms/versions and physical process interruption remain unrun. After an interruption, inspect stale lock ownership before clearing it and retrying the recorded intent. Stop currently records a lease; no worker/dev-server process controller is implemented. Open does not count as the person's test-it approval.

## Slicing validation still pending

Exercise slice-work with real repository conventions and a challenger in slicing mode. Verify that the declared single outcome and demonstration describe a real vertical user journey, and that all slices together deliver the scope. Local fixtures validate shape, inherited criteria, stable IDs, dependencies and at most one part per repository. Contract-first routing is automated; actual contract implementation and builder execution are later tasks. Worktree lifecycle has separate real Git tests and the manual checks above. Remote tracker items/relationships remain pending host writes until linked.

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

Run the research skill with real source tools and independent challenger sessions once a host adapter is available. Verify source authentication, failure-to-open- question handling, read-only workers, actual native fan-out and the same result under sequential execution. Local tests use stubbed workers and fixture evidence; no real research claim or live provider call has been produced.

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

These core paths also have automated tests. Generated client adapters and later step workflows are implemented locally with separate fixtures; actual canonical skill sessions and authenticated provider/native acceptance remain unverified. Amplitude retains a pending dashboard handoff until a reviewed live MCP contract is supplied. Do not interpret this smoke scenario as those acceptance checks or as permission to publish.

[Roadmap](./README.md) · [Journal](./journal.md)
