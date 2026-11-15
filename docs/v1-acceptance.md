# V1 acceptance — what remains and who does it

> **TL;DR** — Expanded 1.0 now includes 38 accepted autonomous-delivery/research tasks authorized for implementation, alongside the original native/workflow/release acceptance. Existing observations stay valid at their recorded scope. Remote services remain experimental; accounts with every vendor are not required.

> [!NOTE]
> **Status: 🚧 partial.** This is the acceptance runbook for the defined roadmap. Procedures below describe expected results, not completed tests. Check off observations only after execution. The [manual backlog](../roadmap/manual-verification.md) preserves detailed cases; the [journal](../roadmap/journal.md) records actual results.

## Start with these distinctions

Autonomous delivery no longer blocks 1.0.0: it ships experimental, so its contracts keep versioned identities but may change in a minor release, and the native campaign below (P6-27) certifies it after the release ([ADR-0066](./decisions/0066-v1-compatibility-baseline-and-deprecation.md)). The supervised flow, the core and installation remain the 1.0.0 contract.

Runtime performance no longer blocks release. On 2026-11-07 the maintainer withdrew the initial five-second controller ceiling and closed P6-39 at the measured state: the complete model-free route takes 68–72 seconds, about 40 of them wholeloop overhead, down from about 175 ([ADR-0227](./decisions/0227-verified-read-observation-scopes.md), [audit ledger](../roadmap/performance-audit.md)). A future performance problem is an ordinary defect.

| Surface | Examples | What counts |
| --- | --- | --- |
| Local core | State, routing, gates, artifacts, worktrees | Executed automated tests and a representative real workflow |
| Native clients | Claude Code, Codex, OpenCode, Copilot, Gemini, Antigravity, Cursor | Actual discovery/execution, permissions and hook behavior on the named version |
| Remote integrations | Metabase, PostHog, Notion, Jira, flag services | Experimental, fixture-tested and service-unverified for 1.0; live certification is deferred |
| Release | npm, GitHub delivery, version/tag, announcement | Maintainer choices plus actual reviewed publication evidence |

The integration policy is accepted in [ADR-0084](./decisions/0084-experimental-integrations-and-scoped-live-verification.md). Do not turn unexecuted service checks into passed checks. Later promotion names the actual service/version, operations, permissions, date and limitations; it is not a claim that every vendor feature has been tested. Missing implementation is still missing implementation. Under [ADR-0085](./decisions/0085-client-owned-mcp-first-provider-transport.md), Amplitude's dashboard operation remains a pending handoff until a known MCP contract is supplied. wholeloop has no service client of its own: services are reached through the client's MCP connection or command-line clients the person installed.

The full roadmap includes all seven native clients. Accepting Claude alone would be a separate scope change, not a consequence of experimental service integrations.

## What is already confirmed

- [x] On 2026-11-14 the complete check passed with 4706 tests on macOS arm64. Hosted CI is green on Linux x64 and macOS now that the repository is public. Pull-request rulesets protect `main`.
- [x] The standalone framing scenario passes live on all seven clients, the last being Gemini 0.67.0 on 2026-11-14. Earlier failures below keep their dates.
- [x] Codex 0.166.0 reached `three-passes` in EVAL-10 research and EVAL-09 implementation to a ready pull request, with no human wait ([Codex campaign](../roadmap/manual-verification.md#codex-campaign-2026-11-14)). Claude Code reached it in EVAL-10.
- [x] The expanded delivery candidate passes the complete 2252-test check on macOS and Debian Linux arm64/Node 24.22.0, including actual local recovery fixtures and offline packaging. See [expanded platform evidence](../roadmap/manual-verification.md#expanded-delivery-platform-checks-2026-10-24) for exact candidate/layout hashes and the retained first Linux failure.
- [x] The earlier 1955-test check passes on macOS and Debian Linux arm64/Node 24.22.0, including the offline package, which has the same hash on both. The Linux source snapshot runs without network or native credentials; real Linux client/model/service and other Node/platform acceptance remain separate. See [automated platform checks](../roadmap/manual-verification.md#automated-platform-checks-2026-10-22).
- [x] The earlier complete 1925-test check passed on macOS arm64/Node 22.23.1, which also passes the new Markdown layout lint. The earlier built bundle passes scoped Linux arm64/Node 20.0.0 offline installation, smoke, docs, harness and three-corpus execution with exact Node 24 JSON parity. Eight adapter/dialect framing simulations pass as FIXTURE_PASS; no native client runs. CI now repeats the package and corpus runtime checks, with hosted execution still pending.
- [x] User-scope Claude loose skills were installed by hand and framing was invoked with the eight questions and an explicit human stop.
- [x] An on-hold outcome retained the owner's reason and reopening condition in external core state.
- [x] After closing Claude and opening a new session, status recovered that same closed initiative with framing completed and no next step.
- [x] The automatic standalone framing scenario passed on actual Codex 0.163.0 after correcting the exact-input prompt. The other five attempted clients have failures recorded in [the native trial table](../roadmap/manual-verification.md#automatic-native-client-trials-2026-10-22).
- [x] The revised exact-final-approval scenario also passes on Codex 0.163.0, core 10cca6bc, run cf-ade63be4ab7e78074a428393. This source-API runner uses a temporary category-only observer; the installed core and matching final-review journal are real. An earlier revised run stopped before finalization and remains FAIL.
- [x] The compiled CLI completes a real six-lens headless review in Codex 0.163.0 on core 9ea3a298: gate-35be1f516f42cb8c passes with every worker accepted and the repository unchanged. Alongside stubbed engine verdict/quorum parity, this closes P5-03's one-real-run criterion. Other native workflows and isolation checks remain separate.

That does not establish a complete go/spec path, all skill/agent discovery, native permission denial, plugin installation or the final-review scenario on every client. The framing document added unapproved conditions and its final semantic revision was not challenged; those are implementation/content defects to resolve before calling the framing exercise fully accepted.

## Who must do the remaining work

The implementation side prepares fixtures, runs local tests, attempts installed clients automatically, diagnoses failures, fixes code and updates evidence/docs. The maintainer does not need to author schemas or run every low-level backlog item.

Maintainer involvement is needed for:

1. Native login/trust/model access when an automated client cannot proceed with its current setup. Use the client's own credential store; do not paste credentials into a report.
2. Human decisions in a representative workflow: framing outcome, spec approval, testing the built result and the final learning decision.
3. Review of observed permission boundaries, especially a read-only role or a guarded action that unexpectedly succeeds.
4. GitHub Actions protection/secrets and intended model spending for scheduled tests.
5. npm ownership and the explicit decision to make the repository public, publish 1.0 and announce it.

Accounts with every remote service are absent from this list deliberately.

## Expanded delivery case coverage

The [expanded acceptance map](./reference/delivery-acceptance.md) links all 86 specification cases to concrete tests, registered enforcers and their required evidence classes. The docs gate checks coverage and prevents local controls from claiming pending native/hosted acceptance. Its source-installable boundary table separates intervention policy from installed endpoint support; a public runtime supplies neither supervised human-decision hosts nor SDK-only CI/merge authority.

The map records executable local coverage. Actual backend, platform, signed-in client and hosted-service observations keep their own evidence and failures. It does not waive the original seven-client obligations or permit the 1.0.0 release (P7-15, formerly P5-07) before P7-13 (formerly P6-32) and the original release prerequisites.

## Practical order

### 0. Review and implement expanded 1.0

The [specification index](../roadmap/specifications/autonomous-delivery/README.md) and [Phase 6](../roadmap/phase-6-autonomous-delivery.md) define new implementation work, including a selectable zero-human-intervention route and conditional merge. Every new task was accepted on 2026-10-24, with authorization for sequential implementation without further signals. P6-01–P6-09, P6-11 and P6-13–P6-19 are complete at their stated local contract boundaries. P6-12 implements and actually exercises the reference Docker application backend on macOS and on an independent Linux host. Actual native client/model execution remains separate and no old native failure becomes a pass.

Independent local implementation is authorized to proceed before the remaining original manual/account checks. Use the [new validation plan](../roadmap/specifications/autonomous-delivery/09-validation-and-acceptance.md) for the additional actual backend, native research/implementation and disposable code-host evidence. Production effects and release remain separately authorized.

### 1. Finish implementation defects first

The original implementation defects listed below are fixed and tested. Fourteen original tasks retain native/workflow acceptance, runtime/platform trials or external maintainer decisions. The [Phase 6 ledger](../roadmap/phase-6-autonomous-delivery.md) now records 33 completed tasks, four implemented tasks awaiting native or hosted acceptance, and two tasks with implementation or acceptance work remaining. P6-12 includes actual macOS and independent Linux-host backend acceptance; P6-36–P6-38 include attribution, the operator overview and a local read-only feed. Their model-free local and platform checks do not certify native clients, hosted services or the expanded release. If a trial exposes another code defect, return it to implementation instead of waiving it as manual work.

- [x] Render exact owner-approved stop/reopen conditions through frame draft; proposed rules are not silently adopted.
- [x] Bind finalization to the exact owner-approved and semantically reviewed bytes; stale or incomplete reviews refuse completion. Repeat actual client acceptance with a new run.
- [x] Add bounded, redacted native diagnosis and explicit version-appropriate invocations. New trials can distinguish structured native errors from an empty journal; exit zero remains insufficient.
- [x] Execute fresh OpenCode, Copilot and Antigravity trials after explicit approval of the private-harness disclosure. Preserve their failures: OpenCode reached framing begin before timeout and a longer diagnosis ended with a provider error mentioning HTTP 503; Copilot and Antigravity require native permission review. Recognize soft-denied tools and structured upstream availability errors without retaining native payloads.
- [x] MCP-first routing is implemented and fixture-tested under ADR-0085. Keep unknown tool contracts pending; real-service certification stays deferred.
- [x] Add version-specific OpenCode V1/V2 render/guard/headless transports without changing the existing V1 pin. Actual V2 inspector discovery/read and user-scope native hook read/deny are observed; complete review attempts still fail and do not establish native gate parity. See ADR-0088 and the detailed trial record.
- [x] Supply an exact scripted final-owner declaration for the automatic framing fixture and require the final review in its judge (ADR-0089). Keep fictional approval separate from real human acceptance.
- [x] Deliver the explicitly selected nightly OpenCode model through its documented native flag, leaving credentials environment-only (ADR-0090).
- [x] Constrain Codex headless replies to the exact response envelope and retain strict core validation (ADR-0091). A complete real six-lens review passes through the compiled CLI; earlier unbound replies remain failed.
- [x] Run the complete 1955-test check on macOS and isolated Linux arm64, including offline package execution and all documentation/harness checks.

The existing stored fictitious framing is evidence of the defect; do not overwrite its history to make the old trial appear to have passed.

### 2. Check source installation

Run from the wholeloop checkout. The current compatible development environment was verified with Node 22.23.1 and 24.22.0. These commands do not require a global wl alias:

```bash
npm ci
npm run build
node ./dist/wl.mjs --version
node ./dist/wl.mjs doctor --target claude --json
```

If not installed yet, inspect and perform the selected target's installation:

```bash
node ./dist/wl.mjs install --target claude --scope user --dry-run --json
node ./dist/wl.mjs install --target claude --scope user --json
```

Restart the selected client. Use [local client setup](./platforms/local-onboarding.md) for other targets and their exact native names. A doctor version/file observation does not replace a model run; resolve actual reported required failures and retain unknown optional integrations as unknown.

Each command above uses a direct path because separate shell-command executions may not retain an earlier export. In one terminal, an absolute WHOLELOOP_CLI export also works; exporting it does not install a global command.

### 3. Complete one representative human workflow

Use a disposable project with working tests and a small real change, not the wholeloop implementation checkout. Start a fresh native session there. For Claude, run claude in that project's terminal, then use these managed loose-skill names:

| In the client | Expected observation |
| --- | --- |
| /wl-setup | Choose pair, local-docs and local-tracker. No remote account is required. |
| /wl-frame-problem | Frame the small change with a named owner. Missing evidence stays TBD. Decide go only after reviewing the final artifact. |
| /wl-next | Continue by the returned ID; produce a spec, then stop for explicit approve-spec. Approve only the version actually shown. |
| /wl-next | Cut scopes and slices with traceable criteria. Resolve the metric baseline or explicitly approve the supported measurement exception; do not invent data. |
| /wl-build-slice | Show repository guidance and a plan, build in the allocated worktree, run verify and review, then stop for human testing. |
| /wl-status | Recover exact IDs, pending decisions and current gates. Restart the client and confirm the same work resumes. |

Supply the actual idea with the framing command. Do not reuse the already closed trial title expecting a new initiative: identity reuse preserves its closure. Standalone skills also work; next follows dependencies rather than silently approving the intervening steps.

For the remaining flow, inspect [open-pr](./flow/build/open-pr.md), [prepare-launch](./flow/rollout/prepare-launch.md), [ramp-exposure](./flow/rollout/ramp-exposure.md), [measure-impact](./flow/learn/measure-impact.md) and [decide-next](./flow/learn/decide-next.md). Use a disposable code-host repository for actual PR testing. Review the exact publication plan before its push; merge remains human. Ramp requires an explicitly confirmed external change, and missing measurements must remain unknown. Fixtures can exercise service handoffs, but are not production traffic or a real measurement. Service certification stays optional.

### 4. Let the automatic runner cover the other clients

- [ ] Obtain fresh actual client acceptance after resolving the recorded native blockers. Execution and diagnosis alone do not close acceptance. The recorded Codex passes cover their exact scenarios/cores; the remaining clients and wider workflow checks stay open.

Actual model-backed trials of installed clients are authorized. This can use native accounts and model allowance. No permission bypass is part of the recipe. Missing trust/authentication or unavailable models are blockers to report.

For example, from the wholeloop checkout:

```bash
claude --version
node ./dist/wl.mjs conformance prepare --target claude --pin 2.1.306 --json
```

Use the exact version token observed on your machine, not that example if it differs. Preparation returns a fresh fixture root, prompt, recipe and cf ID; it does not launch a model. Inspect those paths and arrange the native trust/login through the client. Then substitute the complete returned ID:

```text
node ./dist/wl.mjs conformance run <returned-cf-id> --live --json
node ./dist/wl.mjs conformance report <returned-cf-id> --json
```

To run the version check, the read-only probe and this scenario for one client with one command, use the per-client native check. Without `--live` it calls no model: it observes the version and lists what each probe would spend.

```bash
npm run native:check -- codex
npm run native:check -- codex --live
npm run native:check -- cursor --live --probe readonly
```

It writes `receipt.json` and `handoff.md` under `~/.local/state/wholeloop-native-checks/`; the handoff is the evidence to return, and neither file keeps native output. The read-only probe launches the client's own read-only headless recipe in a disposable repository and asks it to write. It passes only when the workspace is unchanged and the client reports every write as refused or without a tool; a client that declines to try is INCONCLUSIVE, and a changed workspace is FAIL.

Repeat with target codex, opencode, copilot, gemini, antigravity and cursor and their exact version tokens. Antigravity's executable is agy; Cursor's is agent. A failed or interrupted fixture is consumed: retain it and prepare a fresh trial after diagnosing the cause. Do not rerun it or change its evidence label.

Accept a structural trial only when status is PASS, evidence is live-process-and-journal, the exact version matches and missing/problems are empty. FIXTURE_PASS is simulation. Process exit zero with missing events is a failure. This scenario deliberately uses go and a random installed-skill marker; the earlier manual on-hold exercise is useful separate evidence, not its substitute.

The bundled Fixture Owner is a scripted fictional actor. Its declaration approves one exact final document hash and decision, supplied in the prepared prompt. The client must preserve those bytes, perform the final challenger review and use frame finalize. Changed bytes require a new declaration; an initial go does not approve later edits. No real human approval or customer validation is claimed. The judge checks review structure and byte identity; review quality and isolation still need observation. --fixture uses a visibly simulated reviewer and remains FIXTURE_PASS. See [ADR-0089](./decisions/0089-scripted-final-approval-in-framing-conformance.md).

### 5. Verify permissions, hooks and engine behavior separately

The implementation side prepares these probes in disposable repositories and records native outcomes; the maintainer reviews any actual permission/trust decision:

| Probe | Passing result |
| --- | --- |
| Read-only analyst/reviewer tries to change a sentinel | Native permission refuses it and the sentinel remains unchanged; a role name or promise is insufficient |
| Build attempts a default-branch commit or wrong-worktree mutation | The active native/Git guard denies the prohibited action |
| A push occurs outside the tested open-pr plan | Guard denial; test against a disposable local remote |
| Harness runtime state is directed inside Git | Write is denied; normal reads remain allowed |
| Launcher sees available communication tools | It can draft, but no sending capability is available |
| Same pinned gate assignments use native/headless/sequential engines | Equivalent verdict, exact round/input and no crashed worker counted as a refutation |

Capture actual hook payload shape and read-only restrictions for each supported client. Real payloads from Claude Code, Codex 0.166, Copilot and OpenCode are fixtures; Codex runs project hooks only after the user trusts them, so wholeloop keeps its Codex Git fallback. Follow [the isolated spike](../test/conformance/notes/README.md) and [guard cases](../roadmap/manual-verification.md#common-guards-and-git-fallback-p3-08). Repeat supported platform claims on Linux; macOS evidence is not Linux evidence.

### 6. Review CI and publication when native acceptance is ready

The implementation side prepares the exact bundle, notes, test results and commands before asking for activation. Maintainer confirmations are:

- Select native credentials/model access, environment protection and spending for [nightly conformance](./contributing/conformance.md). Verify an actual pinned/latest regression issue with exact version/assertion; synthetic issue drafts do not meet that criterion.
- Confirm npm ownership and the intended public repository/package identity.
- Approve public visibility and the exact reviewed [release bundle](./contributing/releasing.md), version, notes and distribution assets.
- Complete the timed fresh-machine install for each tier-A client; doctor must explain failures with actionable remedies.
- Verify actual provenance/publication/tag/announcement. The current 0.0.0 package is a development build, not a released 1.0; only the release workflow publishes it.

Optional compiled binaries are not a new mandatory release requirement. The full defined roadmap still includes its explicit publication and client criteria.

## Expanded Docker host trial

[The Docker guide](./tutorials/delivery-docker.md) provides the exact model-free evaluation. macOS arm64 with a Linux aarch64 daemon has actual passing application/data/filesystem/network/input/setup-failure observations. ENV-07 also passes on an independent Linux x86_64 host, closing P6-12; no vendor/model account was required. The isolated Linux full check has no Docker socket and proves its core/fixture scope only. P6-13 stop/recovery/retirement now also has actual passing reference observations. Native model/tool enforcement remains P6-27.

## Map of remaining roadmap tasks

On 2026-11-14 the roadmap has 116 tasks, 100 complete and 16 open (see the [roadmap](../roadmap/README.md) for the current breakdown). Before 1.0.0, P5-04 nightly conformance, P7-14 and P7-15 remain open. The breakdown below dates from the expansion and keeps its original wording; at that time Phases 6 and 7 brought the roadmap to 107 tasks, 73 complete and 34 open: P6-01–P6-21, P6-23, P6-25, P6-26, P6-28–P6-30, P6-31, P6-34 and P6-36–P6-39 are complete; P6-22, P6-24 and P6-33 are implemented and await native or hosted acceptance; P6-27 native evaluations, P6-35 worker credentials and P6-40 repository guidance in autonomous runs remain pending; and the sixteen [Phase 7](../roadmap/phase-7-release-readiness.md) release-readiness tasks are planned, including P7-13 (formerly P6-32), P7-14 (formerly P5-05) and P7-15 (formerly P5-07). The original rows below describe closure evidence, not fourteen tests the maintainer must run alone. P5-07 also waits for expanded Phase 6 closure.

| Task | What closes it | Maintainer involvement |
| --- | --- | --- |
| P0-01 | npm name/scope ownership | Account and identity choice |
| P0-03 ✅ | Actual four-client spike: discovery, questions, MCP, roles, hooks and headless behavior (done 2026-11-08) | — |
| P0-07 ✅ | Decisions reconciled with the observed platform matrix (done 2026-11-08) | — |
| P1-10 ✅ | Claude generated plugin installs and all skills are discovered (done 2026-11-08) | — |
| P1-11 ✅ | Codex/OpenCode/Copilot strongest available read-only mappings verified (done 2026-11-08) | — |
| P1-13 | Actual doctor failures have working corrective instructions | Platform/account-specific choices |
| P1-14 ✅ | Real standalone scenario passes all four tier-A clients (done 2026-11-08) | — |
| P3-08 ✅ | Actual tier-A hook payloads and guard behavior verified (done 2026-11-08) | — |
| P4-01 ✅ | Launcher lacks a sending tool in each adapter (done 2026-11-08) | — |
| P5-01 ✅ | Real scenario passes Gemini and Antigravity (done 2026-11-14) | — |
| P5-02 ✅ | Cursor real scenario and readonly behavior pass (done 2026-11-08) | — |
| P5-04 | Actual latest regression creates the expected issue | CI credentials/protection/activation |
| P7-14 (formerly P5-05) | History audit, approved visibility, published release candidate, fresh-machine timing and clean notes | Publication/ownership decision |
| P7-15 (formerly P5-07) | Actual 1.0.0 tag, publication and announcement after remaining acceptance | Final release approval |

P4-05 is complete with fixture-tested MCP priority and no transport switch on failure; the built-in HTTP bridges were retired by P7-16. Its unavailable service contracts retain pending handoffs. Service-account certification is a deferred backlog, not one more release gate for every vendor. Other robustness cases in the manual backlog document limitations and follow-up scope rather than silently expanding the task table into hundreds of maintainer-only release prerequisites.

The new [Phase 6 task groups](../roadmap/phase-6-autonomous-delivery.md#task-groups) separately cover inputs/authority, durable workers, environments, actual QA, integration, publication/CI/merge, operational evidence, requirement changes, learning, research and delegated decisions. Their checkboxes remain empty until implementation and the specified execution-level evidence exist. Native reference-client trials do not replace the original seven-client obligations.

## What evidence to return

For a human observation, send the command/skill, client version, observed outcome and any relevant sanitized receipt. A screenshot or summary alone should not claim an unseen core write; use status/report to cross-check it. Keep full runtime records in the external store. A useful short handoff is:

```text
Client / version:
OS / architecture / Node:
Check attempted:
Expected result:
Observed result or blocker:
Relevant non-secret receipt fields:
Human decision, if any:
```

The implementation side updates the narrow checked observation, fixes failures, records remaining limits and commits the evidence. It does not rewrite a failed trial as passed or ask the maintainer to repeat already verified checks without cause.

<!-- docnav -->
[◀ Troubleshooting](troubleshooting.md)  ·  [📖 Docs index](README.md)  ·  [Concepts ▶](concepts.md)
