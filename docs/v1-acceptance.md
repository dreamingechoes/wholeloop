# V1 acceptance — what remains and who does it

> **TL;DR** — Native clients, remote integrations and publication are separate checks. The owner has verified Claude framing and recovery across sessions. Remote integrations ship experimentally with fixtures; accounts with every vendor are not required. Implementation defects, native compatibility and the actual release still need evidence.

> [!NOTE]
> **Status: 🚧 partial.** This is the acceptance runbook for the defined roadmap. Procedures below describe expected results, not completed tests. Check off observations only after execution. The [manual backlog](../roadmap/manual-verification.md) preserves detailed cases; the [journal](../roadmap/journal.md) records actual results.

## Start with these distinctions

| Surface | Examples | What counts |
| --- | --- | --- |
| Local core | State, routing, gates, artifacts, worktrees | Executed automated tests and a representative real workflow |
| Native clients | Claude Code, Codex, OpenCode, Copilot, Gemini, Antigravity, Cursor | Actual discovery/execution, permissions and hook behavior on the named version |
| Remote integrations | Metabase, PostHog, Notion, Jira, flag services | Experimental, fixture-tested and service-unverified for 1.0; live certification is deferred |
| Release | npm, GitHub delivery, version/tag, announcement | Owner choices plus actual reviewed publication evidence |

The owner accepted the integration policy in [ADR-0084](./decisions/0084-experimental-integrations-and-scoped-live-verification.md).
Do not turn unexecuted service checks into passed checks. Later promotion names
the actual service/version, operations, permissions, date and limitations; it is
not a claim that every vendor feature has been tested. Missing implementation is
still missing implementation. Under [ADR-0085](./decisions/0085-client-owned-mcp-first-provider-transport.md),
Amplitude's dashboard operation remains a pending handoff until a known MCP
contract is supplied; a dedicated HTTP bridge is not a 1.0 requirement.

The full roadmap includes all seven native clients. Accepting Claude alone would
be a separate scope change, not a consequence of experimental service integrations.

## What is already confirmed

- [x] Local check passed 1760 tests in 81 files on macOS arm64/Node 24.22.0, plus build, smoke, offline npm packaging and documentation/harness checks, before subsequent acceptance work.
- [x] The owner installed user-scope Claude loose skills and invoked framing with the eight questions and an explicit human stop.
- [x] An on-hold outcome retained the owner's reason and reopening condition in external core state.
- [x] After closing Claude and opening a new session, status recovered that same closed initiative with framing completed and no next step.
- [x] The automatic standalone framing scenario passed on actual Codex 0.163.0 after correcting the exact-input prompt. The other five attempted clients have failures recorded in [the native trial table](../roadmap/manual-verification.md#automatic-native-client-trials-2026-10-22).
- [x] The revised exact-final-approval scenario also passes on Codex 0.163.0, core 10cca6bc, run cf-ade63be4ab7e78074a428393. This source-API runner uses a temporary category-only observer; the installed core and matching final-review journal are real. An earlier revised run stopped before finalization and remains FAIL.

That does not establish a complete go/spec path, all skill/agent discovery,
native permission denial, plugin installation or the final-review scenario on every client.
The framing document added unapproved conditions and its final semantic revision
was not challenged; those are implementation/content defects to resolve before
calling the framing exercise fully accepted.

## Who must do the remaining work

The implementation side prepares fixtures, runs local tests, attempts installed
clients automatically, diagnoses failures, fixes code and updates evidence/docs.
The owner does not need to author schemas or run every low-level backlog item.

Owner involvement is needed for:

1. Native login/trust/model access when an automated client cannot proceed with its current setup. Use the client's own credential store; do not paste credentials into a report.
2. Human decisions in a representative workflow: framing outcome, spec approval, testing the built result and the final learning decision.
3. Review of observed permission boundaries, especially a read-only role or a guarded action that unexpectedly succeeds.
4. GitHub Actions protection/secrets and intended model spending for scheduled tests.
5. npm ownership and the explicit decision to make the repository public, publish 1.0 and announce it.

Accounts with every remote service are absent from this list deliberately.

## Practical order

### 1. Finish implementation defects first

Keep these separate from owner approval:

- [x] Render exact owner-approved stop/reopen conditions through frame draft; proposed rules are not silently adopted.
- [x] Bind finalization to the exact owner-approved and semantically reviewed bytes; stale or incomplete reviews refuse completion. Repeat actual client acceptance with a new run.
- [x] Add bounded, redacted native diagnosis and explicit version-appropriate invocations. New trials can distinguish structured native errors from an empty journal; exit zero remains insufficient.
- [x] Execute fresh OpenCode, Copilot and Antigravity trials after the owner's explicit private-harness disclosure approval. Preserve their failures: OpenCode reached framing begin before timeout and a longer diagnosis ended with a provider error mentioning HTTP 503; Copilot and Antigravity require native permission review. Recognize soft-denied tools and structured upstream availability errors without retaining native payloads.
- [ ] Obtain passing fresh actual client acceptance after resolving the recorded blockers. Execution and diagnosis alone do not close acceptance.
- [x] MCP-first routing is implemented and fixture-tested under ADR-0085. Keep unknown tool contracts pending; real-service certification stays deferred.
- [x] Add version-specific OpenCode V1/V2 render/guard/headless transports without changing the existing V1 pin. Actual V2 inspector discovery/read and user-scope native hook read/deny are observed; complete review attempts still fail and do not establish native gate parity. See ADR-0088 and the detailed trial record.

The existing stored fictitious framing is evidence of the defect; do not overwrite
its history to make the old trial appear to have passed.

### 2. Check source installation

Run from the wholeloop checkout. The current compatible development environment
was verified with Node 24.22.0. These commands do not require a global wl alias:

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

Restart the selected client. Use [local client setup](./platforms/local-onboarding.md)
for other targets and their exact native names. A doctor version/file observation
does not replace a model run; resolve actual reported required failures and retain
unknown optional integrations as unknown.

Each command above uses a direct path because separate shell-command executions
may not retain an earlier export. In one terminal, an absolute WHOLELOOP_CLI export
also works; exporting it does not install a global command.

### 3. Complete one representative human workflow

Use a disposable project with working tests and a small real change, not the
wholeloop implementation checkout. Start a fresh native session there. For Claude,
run claude in that project's terminal, then use these managed loose-skill names:

| In the client | Expected observation |
| --- | --- |
| /wl-setup | Choose pair, local-docs and local-tracker. No remote account is required. |
| /wl-frame-problem | Frame the small change with a named owner. Missing evidence stays TBD. Decide go only after reviewing the final artifact. |
| /wl-next | Continue by the returned ID; produce a spec, then stop for explicit approve-spec. Approve only the version actually shown. |
| /wl-next | Cut scopes and slices with traceable criteria. Resolve the metric baseline or explicitly approve the supported measurement exception; do not invent data. |
| /wl-build-slice | Show repository guidance and a plan, build in the allocated worktree, run verify and review, then stop for human testing. |
| /wl-status | Recover exact IDs, pending decisions and current gates. Restart the client and confirm the same work resumes. |

Supply the actual idea with the framing command. Do not reuse the already closed
trial title expecting a new initiative: identity reuse preserves its closure.
Standalone skills also work; next follows dependencies rather than silently
approving the intervening steps.

For the remaining flow, inspect [open-pr](./flow/build/open-pr.md),
[prepare-launch](./flow/rollout/prepare-launch.md),
[ramp-exposure](./flow/rollout/ramp-exposure.md),
[measure-impact](./flow/learn/measure-impact.md) and
[decide-next](./flow/learn/decide-next.md). Use a disposable code-host repository
for actual PR testing. Review the exact publication plan before its push; merge
remains human. Ramp requires an explicitly confirmed external change, and missing
measurements must remain unknown. Fixtures can exercise service handoffs, but are
not production traffic or a real measurement. Service certification stays optional.

### 4. Let the automatic runner cover the other clients

The owner authorized actual model-backed trials of installed clients. This can
use native accounts and model allowance. No permission bypass is part of the
recipe. Missing trust/authentication or unavailable models are blockers to report.

For example, from the wholeloop checkout:

```bash
claude --version
node ./dist/wl.mjs conformance prepare --target claude --pin 2.1.306 --json
```

Use the exact version token observed on your machine, not that example if it
differs. Preparation returns a fresh fixture root, prompt, recipe and cf ID; it
does not launch a model. Inspect those paths and arrange the native trust/login
through the client. Then substitute the complete returned ID:

```text
node ./dist/wl.mjs conformance run <returned-cf-id> --live --json
node ./dist/wl.mjs conformance report <returned-cf-id> --json
```

Repeat with target codex, opencode, copilot, gemini, antigravity and cursor and
their exact version tokens. Antigravity's executable is agy; Cursor's is agent.
A failed or interrupted fixture is consumed: retain it and prepare a fresh trial
after diagnosing the cause. Do not rerun it or change its evidence label.

Accept a structural trial only when status is PASS, evidence is
live-process-and-journal, the exact version matches and missing/problems are empty.
FIXTURE_PASS is simulation. Process exit zero with missing events is a failure.
This scenario deliberately uses go and a random installed-skill marker; the
owner's earlier on-hold exercise is useful separate evidence, not its substitute.

The bundled Fixture Owner is a scripted fictional actor. Its declaration approves
one exact final document hash and decision, supplied in the prepared prompt.
The client must preserve those bytes, perform the final challenger review and
use frame finalize. Changed bytes require a new declaration; an initial go does
not approve later edits. No real human approval or customer validation is claimed.
The judge checks review structure and byte identity; review quality and isolation
still need observation. --fixture uses a visibly simulated reviewer and remains
FIXTURE_PASS. See [ADR-0089](./decisions/0089-scripted-final-approval-in-framing-conformance.md).

### 5. Verify permissions, hooks and engine behavior separately

The implementation side prepares these probes in disposable repositories and
records native outcomes; the owner reviews any actual permission/trust decision:

| Probe | Passing result |
| --- | --- |
| Read-only analyst/reviewer tries to change a sentinel | Native permission refuses it and the sentinel remains unchanged; a role name or promise is insufficient |
| Build attempts a default-branch commit or wrong-worktree mutation | The active native/Git guard denies the prohibited action |
| A push occurs outside the tested open-pr plan | Guard denial; test against a disposable local remote |
| Harness runtime state is directed inside Git | Write is denied; normal reads remain allowed |
| Launcher sees available communication tools | It can draft, but no sending capability is available |
| Same pinned gate assignments use native/headless/sequential engines | Equivalent verdict, exact round/input and no crashed worker counted as a refutation |

Capture actual hook payload shape and read-only restrictions for each supported
client. Codex inherits parent restrictions; its synthetic SDK-shaped payload is
not proof of an installed CLI hook. Follow [the isolated spike](../test/conformance/notes/README.md)
and [guard cases](../roadmap/manual-verification.md#common-guards-and-git-fallback-p3-08).
Repeat supported platform claims on Linux; macOS evidence is not Linux evidence.

### 6. Review CI and publication when native acceptance is ready

The implementation side prepares the exact bundle, notes, test results and
commands before asking for activation. Owner confirmations are:

- Select native credentials/model access, environment protection and spending for [nightly conformance](./contributing/conformance.md). Verify an actual pinned/latest regression issue with exact version/assertion; synthetic issue drafts do not meet that criterion.
- Confirm npm ownership and the intended public repository/package identity.
- Approve public visibility and the exact reviewed [release bundle](./contributing/releasing.md), version, notes and distribution assets.
- Complete the timed fresh-machine install for each tier-A client; doctor must explain failures with actionable remedies.
- Verify actual provenance/publication/tag/announcement. The current private 0.0.0 package is a development build, not a released 1.0.

Optional compiled binaries are not a new mandatory release requirement. The full
defined roadmap still includes its explicit publication and client criteria.

## Map of remaining roadmap tasks

After the accepted P2-06 scope change and P4-05 MCP-first implementation:
39 of 54 tasks are complete; 15 remain open. These rows describe closure evidence,
not fifteen tests the owner must run alone.

| Task | What closes it | Owner involvement |
| --- | --- | --- |
| P0-01 | npm name/scope ownership | Account and identity choice |
| P0-03 | Actual four-client spike: discovery, questions, MCP, roles, hooks and headless behavior | Login/trust only where blocked; review findings |
| P0-07 | Decisions reconciled with the observed platform matrix | Review any changed design |
| P1-10 | Claude generated plugin installs and all skills are discovered | Isolated native trust/login if required |
| P1-11 | Codex/OpenCode/Copilot strongest available read-only mappings verified | Review native permission boundaries |
| P1-13 | Actual doctor failures have working corrective instructions | Platform/account-specific choices |
| P1-14 | Real standalone scenario passes all four tier-A clients | Native access when blocked |
| P3-08 | Actual tier-A hook payloads and guard behavior verified | Trust/permission decisions |
| P4-01 | Launcher lacks a sending tool in each adapter | Review actual capability inventory |
| P5-01 | Real scenario passes Gemini and Antigravity | Native access when blocked |
| P5-02 | Cursor real scenario and readonly behavior pass | Native access when blocked |
| P5-03 | One actual conformance run establishes engine verdict parity | Model access and allowance |
| P5-04 | Actual latest regression creates the expected issue | CI credentials/protection/activation |
| P5-05 | Reviewed distribution, approved visibility, fresh-machine timing and clean notes | Publication/ownership decision |
| P5-07 | Actual 1.0 tag and announcement after remaining acceptance | Final release approval |

P4-05 is complete with fixture-tested MCP priority, explicit HTTP selection and
no automatic fallback. Its unavailable service contracts retain pending handoffs.
Service-account certification is a deferred backlog, not one more
release gate for every vendor. Other robustness cases in the manual backlog
document limitations and follow-up scope rather than silently expanding the task
table into hundreds of owner-only release prerequisites.

## What evidence to return

For a human observation, send the command/skill, client version, observed outcome
and any relevant sanitized receipt. A screenshot or summary alone should not
claim an unseen core write; use status/report to cross-check it. Keep full runtime
records in the external store. A useful short handoff is:

```text
Client / version:
OS / architecture / Node:
Check attempted:
Expected result:
Observed result or blocker:
Relevant non-secret receipt fields:
Human decision, if any:
```

The implementation side updates the narrow checked observation, fixes failures,
records remaining limits and commits the evidence. It does not rewrite a failed
trial as passed or ask the owner to repeat already verified checks without cause.

<!-- docnav -->
[◀ Getting started](getting-started.md)  ·  [📖 Docs index](README.md)  ·  [Concepts ▶](concepts.md)
