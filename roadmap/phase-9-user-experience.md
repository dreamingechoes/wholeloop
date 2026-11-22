# Phase 9 — User experience for 1.2.0

> **Outcome** — A person who installs wholeloop and runs any step, in the terminal or in any supported client, gets a short, readable answer quickly and in proportion to the question: the step uses only the workers, calls, context and sources it needs, asks for the choices that are theirs (sources, providers, guidance), never picks unrelated tools on its own, shows what it costs before spending it, keeps the internal vocabulary to itself and finishes with the answer first. What the documentation shows is what the product does.

> [!NOTE]
> **Status: 🔄 in progress · added on 2026-11-18 for 1.2.0 · open phase.** The task list is not closed: tasks are added as the experience check (P9-20) and the per-client passes (P9-21) find more. The announcement of the package waits for this phase. 1.2.0 was the first factory release in [ADR-0247](../docs/decisions/0247-software-factory-phasing-after-1-0-0.md); the factory moves one minor version later (1.3.0–1.5.0) and keeps its order.

## Why this phase exists

A first trial of `wl-research` in Codex 0.167.0 on 2026-11-17, on a question about this repository's own code, took 14.6 minutes and about 9.3 million input tokens across nine workers. It queried PostgreSQL and Notion without asking, although neither related to the question, and it narrated internal terms (preflight, slots, quorum) to the person. The claims were correct. The cost, the noise and the unasked choices were not.

Inspecting the client's run logs and the code, and walking every step in an isolated store, located the causes:

- **Sequential workers with fixed sleeps.** The default profile says "Run one worker at a time", so the conductor started each worker after the previous one ended and waited with 45-second sleeps: 441 of 875 seconds.
- **Workers that could not do their job.** Codex read-only roles are rendered without a command tool, yet their instructions tell them to run `wl`. The only real researcher gave up in 21 seconds; the conductor replaced every later worker with a full-context copy of itself, which spent the tokens, lost the read-only role and ran the repository's tests.
- **Choices made for the person.** Every detected source becomes a research angle: an executable on `PATH`, or an MCP server declared in another client's configuration. Guidance discovery matches personal skills by a single word in their description, so in an ordinary repository `build-slice` refuses to start until the person picks a video-captions skill as backend guidance. A metric's provider is free text that is first checked after launch.
- **No display contract.** Every documented session uses one compact layout, but no skill or protocol defines it; each model improvises, and most `wl` commands print JSON even without `--json`.
- **Bookkeeping in view.** Each step has the agent hand-write several small JSON files, shown to the person as file diffs, and every `wl` call is a separate tool call; in Codex, approval reviews of those commands spent another 0.54 million tokens.
- **Cost that does not scale.** Three independent verifiers per claim or finding is a schema floor; every review lens runs on a four-line change; any finding, even cosmetic, fails a round.
- **A stated guarantee that does not hold.** Supervised `wl verify suite` runs the project's suite on the host with the caller's environment, while the README and ADR-0245 say project code runs only in Docker. Confirmed by execution on 2026-11-18.

## Principles for this phase

- **Ask what belongs to the person, once, and remember it.** Sources, providers, publication targets and guidance are choices; detection only orders the options.
- **The core writes what the person reads.** Deterministic text from `wl`, shown verbatim by every client, so the experience is identical on every platform.
- **Spend only what the step needs.** The fewest workers, tool calls, files, tokens and approval prompts that keep its guarantees; independent work runs together; nothing waits on a clock; each worker gets only its assignment.
- **Show the cost before spending it.** Workers, model and an estimate, before any fan-out.
- **Measure before and after.** The experience check (P9-20) records the current behaviour first, so every fix is judged by numbers rather than impressions.
- **Never trade a guarantee for speed silently.** Anything that reduces checks is an explicit rigor choice ([ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md)), recorded and visible in the result.
- **Every client, not only one.** Each fix lands in the canonical skill, the core or the adapter layer, with a conformance check for all seven clients.

## Decisions needed

| Topic | Options | Record |
| --- | --- | --- |
| Where project code runs | Decided 2026-11-21: every execution of project code in Docker by default, supervised or autonomous; steps that only read never need Docker; host execution only as an explicit, recorded choice for supervised steps, never for the runner | [ADR-0257](../docs/decisions/0257-where-project-code-runs.md) |
| Depth and cost against ADR-0010 | Decided 2026-11-21, all three parts: cost cuts that keep coverage (deterministic checks, cost preview, cheaper verifier model, applicability of optional lenses); severity of findings, so only blockers fail a round; and an explicit rigor choice (`quick`, `standard`, `deep`) per run, never set by the profile, whose reduced coverage is recorded and shown | [ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md) |
| Documented interactions that do not exist | Implement them (setup detection, codehost and analytics; Define publication target; `next` path) or remove them from the documentation | P9-18 |

Until a decision is accepted, its tasks wait and the current behaviour stays documented as it is.

## Order

1. **Baseline:** the experience check's harness and a recorded run of the current behaviour (P9-20), so the fixes are measured against it.
2. **What broke the trial:** P9-01–P9-05. Parallel workers without sleeps, working roles and asked sources alone should take the 2026-11-17 question from 14.6 minutes to about three or four.
3. **What the person reads:** P9-06–P9-10 and P9-22.
4. **Cost and guarantees:** P9-11–P9-17.
5. **Truth and every client:** P9-18, P9-19 and P9-21, with the experience check passing its budgets.
6. **Additional findings:** P9-23 after the original task order; its private research endpoint shares the answer-first outcome without changing earlier task order.

## P9-01 · A store the client can write

**Status:** ✅ · **Size:** S · **Depends on:** — · **Release:** 1.2.0

**Goal** — The first command in a sandboxed client succeeds, or says in one sentence what to allow.

**Acceptance criteria:**

- [x] `EACCES` or `EPERM` on the store maps to exit 3 with a human message naming the store path and, per detected client, the setting that allows it (for Codex, the workspace-write writable roots).
- [x] `wl install --target codex` prints that snippet for review; `wl doctor --target codex` reports whether the Codex configuration allows the store.
- [x] Troubleshooting has an entry for a sandboxed client that cannot write the store.

**Evidence** — `CHECK PASS in 773s`, 4815 tests in 341 files. The focused store-access and existing doctor suites passed 45 tests. Both human and JSON subprocess cases returned exit 3 from a genuinely unwritable external-store fixture; synthetic `EACCES` and `EPERM` cases cover all seven client hints and wrapped errors. Configuration fixtures cover absent, matching, parent, sibling, read-only and malformed settings plus project overrides. Installation dry runs returned the review snippet without writing client configuration. The troubleshooting example was captured from the built CLI in a disposable home. ADR-0004 records the read-only configuration boundary; actual native policy remains in the existing per-client manual checks.

**Tests** — Unwritable-store fixture for the message and exit code; doctor fixture with and without the Codex setting.

## P9-02 · Guidance discovery that never picks unrelated skills

**Status:** ✅ · **Size:** M · **Depends on:** — · **Release:** 1.2.0 · **Decision:** amends [ADR-0009](../docs/decisions/0009-repo-first-capability-resolution.md)

**Goal** — A step uses the repository's guidance or wholeloop's default unless the person chose a personal skill.

**Acceptance criteria:**

- [x] A description-only match is never a candidate; a name match from a personal skill is offered, never selected automatically.
- [x] By default only the current client's personal skill folders are scanned; others are offered as "configured for another client".
- [x] Candidates are de-duplicated by content; "use wholeloop's default" is always the first option; answers are validated against the offered values; a run scope exists, and the answer says where a remembered choice is written.
- [x] In a fresh repository with a home holding unrelated skills (one mentions "backend", one "commits", one is named `*-research`), every build and research slot resolves to the default with no question.

**Evidence** — `CHECK PASS in 679s`, 4834 tests in 342 files; `CHECK PASS (fast) in 617s`. The focused affected-workflow suite passed 277 tests in 22 files; the completed personal-guidance suite passed 19 cases, including seven client identities, native/configured folders, opt-in other-client reads, duplicate contents and shared physical folders. A fresh fixture home with unrelated backend/commit descriptions and a research suffix leaves every build and research binding at the default without questions. Built-CLI tests validate offered values and anonymous run choices without project configuration writes. Consumer tests verify actual personal review content and the explicit default. The 13 autonomous guidance tests cover the same default-first choices without duplication. All 444 compatibility cases passed. ADR-0009 records whole-name personal matching, optional offers, external run configuration and preserved run identity. Native client startup evidence remains in the existing per-client manual checks.

**Tests** — Table-driven resolution cases for the fixture home above, duplicates and answer validation.

## P9-03 · Worker roles that can do their job, on every client

**Status:** ✅ · **Size:** M · **Depends on:** — · **Release:** 1.2.0

**Goal** — The worker a skill asks for exists in the client with the tools its instructions need, and is the one actually started.

**Acceptance criteria:**

- [x] A role rendered without a command tool returns its result in its final message and the conductor submits it; its instructions never ask it to run `wl`.
- [x] Skills name the role to start (`wl-researcher`, `wl-challenger`, …) and pass only its assignment; they forbid full-history copies of the conductor as workers.
- [x] Codex skills call the launcher without a separate `adapter root` step.
- [x] A conformance test fails for any adapter whose rendered agent instructions require a tool its rendered configuration disables, on all seven clients.

**Evidence** — `CHECK PASS in 678s`, 4887 tests in 344 files; `CHECK PASS (fast) in 479s`, 2243 related tests in 119 files. The focused adapter, installation and compatibility suites passed 817 tests in 14 files; the final role-tool suite passed 36 cases, with overlapping coverage. Real rendered roles for all seven clients are checked against their configured tools; an injected CLI requirement fails generation in every command-disabled role fixture. Skills render explicit callable names and fresh assignment boundaries, including Claude's plugin and loose-agent scopes and Antigravity's namespace. All seven full installed catalogs execute the first normal command with checked package context; ordinary output and client attribution remain intact. ADR-0002 and ADR-0047 record final-message return, observer tool restrictions and the optional new invocation envelope. Actual native role loading and context isolation remain explicitly open in manual verification; no native client or model call was made.

**Tests** — The cross-adapter conformance test; rendered-artifact snapshots per client.

## P9-04 · Fan-out that runs in parallel and waits properly

**Status:** ✅ · **Size:** M · **Depends on:** P9-03 · **Release:** 1.2.0 · **Decision:** amends [ADR-0010](../docs/decisions/0010-interaction-profile-never-changes-coverage.md) (what pace controls)

**Goal** — Independent read-only workers run together, and the conductor waits on them, not on a clock.

**Acceptance criteria:**

- [x] Pace gates decisions and writing workers, not independent read-only fan-out; the profile text says so and no longer reads "Run one worker at a time" for those steps.
- [x] Skills start all jobs of a fan-out, then wait with the client's own wait primitive; fixed sleeps are never prescribed.
- [x] Each job in a returned plan is a self-contained assignment (question, angle or unit, allowed source, result schema, where to return it).

**Evidence** — `CHECK PASS in 678s`, 4906 tests in 346 files; `CHECK PASS (fast) in 409s`, 1503 related tests in 115 files. Profile snapshots and 324-combination coverage checks preserve gate guarantees. Four assignment snapshots and workflow tests cover exact sources, response identities, independent refutations, current input and cached suite output. Promise barriers prove launch-before-join and complete joins after failure; all seven rendered clients retain native-wait instructions. Actual native overlap and wait behavior remain in [manual verification](./manual-verification.md). No live experience or model run was performed.

**Tests** — Profile rendering tests; plan assignment snapshots; the experience check (P9-20) measures concurrency.

## P9-05 · Research asks which sources to use

**Status:** ✅ · **Size:** M · **Depends on:** P9-03 · **Release:** 1.2.0 · **Decision:** amends [ADR-0021](../docs/decisions/0021-journaled-research-plans-and-refutations.md)

**Goal** — Research uses the sources the person chose, which are remembered, and nothing unrelated.

**Acceptance criteria:**

- [x] `wl research plan` returns candidates with an access label (native, available in this client, configured in another client, executable only) and pins only the chosen ones; `--sources` selects them; the choice is remembered per run, repository or user.
- [x] MCP declarations count only for the current client; an executable alone is never preselected; configured sources replace detection instead of adding to it.
- [x] MCP servers without a provider are listed once as "not usable yet" with the provider guide.
- [x] The research skill asks once, with this codebase and the web preselected, before any worker starts.

**Evidence** — `CHECK PASS in 678s`, 4941 tests in 347 files; `CHECK PASS (fast) in 307s`, 1795 related tests in 78 files. The focused source, provider, adoption and compatibility suites passed 662 tests in 12 files. Synthetic fixtures cover all seven clients, every access label, foreign Notion and PATH-only psql, no jobs before selection, explicit and configured choices, empty lists, run/project/user memory, cross-repository user preferences, idempotence, unknown MCP deduplication, provider replacements and actual CLI flags. Only the new choice schema/output fingerprints were added; existing fingerprints are unchanged. The illustrative research recording was regenerated and visually checked. Actual native source selection, MCP tool availability and authentication remain in [manual verification](./manual-verification.md); no live source or model call ran.

**Tests** — Plan tests for each access label and for configured-replaces-detected; a fixture home with `psql` on `PATH` and a Notion MCP declared only for another client.

## P9-06 · Research that stays read-only and answers first

**Status:** ✅ · **Size:** S · **Depends on:** P9-03 · **Release:** 1.2.0

**Goal** — A brief opens with the answer, and research never executes repository code.

**Acceptance criteria:**

- [ ] Research workers have read-only tools on every client, and the skill says research never runs repository code.
- [x] The brief has Answer and Recommendation sections written by the conductor and stored by `research complete`; the receipt shows the answer first, with how sure it is and what was not checked, and no separate synthesis outside the brief is needed.
- [x] Verifier results collapse to one line per claim unless they dispute it; the evidence label reads "Verifier evidence"; refutation counts read "refuted by N of M (drops at K)"; the title is short and the question sits in the body.

**Evidence** — `CHECK PASS in 694s`, 4981 tests in 348 files; `CHECK PASS (fast) in 359s`, 2096 related tests in 95 files. The focused suites passed 777 tests in 21 files, including all adapter renderers, exact conclusion binding, direct-core bypass rejection, replay, confidence, source quotations, compact verifier output, literal CLI arguments and short titles. Seven conclusion snapshots and two updated assignment snapshots were reviewed; the illustrative recording was regenerated and visually checked. Existing step/event/schema fingerprints stay frozen; only the new conclusion input and context output identities were added. Criterion 1 remains unchecked for actual native enforcement: canonical read/web-only capabilities, mutation-denial generation and no-code-execution instructions are implemented and tested, while observed native permissions, including Codex parent/external tools, remain in [manual verification](./manual-verification.md). Private controller conclusions are tracked separately by P9-23. No native model or source call ran.

**Tests** — Report rendering snapshots; rendered-role tool checks from P9-03.

## P9-07 · Person-facing display rendered by the core

**Status:** ✅ · **Size:** L · **Depends on:** — · **Release:** 1.2.0 · **Decision:** [ADR-0256](../docs/decisions/0256-person-facing-display-rendered-by-the-core.md)

**Goal** — Every client shows the same short, readable text for every step, written by `wl`.

**Acceptance criteria:**

- [x] Every step command's payload carries a versioned `display` block (header, rows, progress, produced, open questions, next) and its rendered text; the layout matches the documented sessions.
- [x] The output contract tells skills to show `display` verbatim and not to narrate internals; the preflight becomes one header line; the profile style block is never shown.
- [ ] Raw `wl` JSON is never shown to the person by a skill.
- [ ] While workers run, the person sees one short line as each finishes and the time so far, and nothing else; a long step is never silent and never chatty.

**Evidence** — `CHECK PASS in 705s`, 5119 tests in 349 files; `CHECK PASS (fast) in 12s`, 286 related tests in 7 files after the parsed-error repair. The earlier broad fast gate passed 1796 tests in 74 files in 248s. Focused suites passed 779 tests in 11 files, including actual local installation and Git-hook fixtures; 358 supplemental CLI tests checked error routing. Twenty-one display snapshots cover all thirteen steps using the core flow plan and valid synthetic events, completion states, evidence gaps and operational facts. All seven rendered clients load the same display policy; compiled terminal/JSON cases, single serialization and raw-JSON transcript detection pass. Only two new display identities were added; every previous compatibility fingerprint remains unchanged. The 3028603-byte core stays within the unchanged 4 MiB bound. Research and framing illustrative recordings were regenerated, matched to their pages and visually checked. Criteria 3 and 4 remain unchecked for actual native forwarding, JSON absence and completion timing in [manual verification](./manual-verification.md); fixtures prove the renderer and local process stream, not those client observations. No signed-in client, live evaluation or model call ran.

**Tests** — Snapshot tests of `display` for every step, including progress; schema registration; the experience check lints transcripts for raw JSON.

## P9-08 · Skills and protocols in plain language

**Status:** ✅ · **Size:** M · **Depends on:** P9-07 · **Release:** 1.2.0

**Goal** — Nothing a skill tells the agent makes it speak the core's vocabulary to the person.

**Acceptance criteria:**

- [x] A short protocol for speaking to the person, loaded by every skill, with the person-facing words for internal terms; a lint lists the banned terms.
- [x] Rules the core enforces are no longer loaded into skills; protocols keep only what the agent must do, and each skill loads only the protocols its step uses.
- [ ] A step reaches its first question, plan or answer in a bounded number of tool calls, set by the experience check's baseline.
- [x] Maintainer-facing caveats (conformance, Linux not run) leave the skills; stale ones are removed, including status's "checkpoints are not collected yet".
- [x] Shown commands use a short form instead of a 60-character launcher path wherever the client allows it.

**Evidence:** `test/unit/harness/communication.test.ts` checks all thirteen vocabulary mappings, negative speaking instructions, private command/data compatibility, step-specific reads and all seventeen skills rendered for seven clients. Policy declarations remain in enforcement with an 80-line bound; existing skill/agent/protocol/workflow budgets and public schemas are unchanged. Maintainer caveats and the stale status/next limits are removed. Short command notation preserves each checked launcher, including the plugin-root route. `CHECK PASS in 703s`, 5145 tests in 350 files; `CHECK PASS (fast) in 488s`, 2336 related tests in 122 files. Generated references: four current, none rewritten. Criterion 3 remains unchecked for the manual P9-20 baseline and native call-count calibration; no live run was performed.

**Tests** — The banned-term lint over rendered skills; size budgets unchanged.

## P9-09 · Human output for every person-facing command

**Status:** ✅ · **Size:** M · **Depends on:** P9-07 · **Release:** 1.2.0

**Goal** — Without `--json`, every command a person runs prints text meant for them.

**Acceptance criteria:**

- [x] `next`, `setup`, `overview`, `resume`, `config show`, `profile show`, `open`, `worktree open`, `spec check` and every step command have a human form; JSON appears only with `--json`.
- [x] `wl --help` describes commands in plain sentences and hides repository and maintainer groups behind `--help --all`.
- [x] Doctor shows details only for failures and summarises optional checks in one line; an install dry run does not claim a written receipt; `spec check` lists one problem per line with its path.
- [x] `wl open` shows a readable header; front matter only with `--raw`.

**Evidence:** ordinary handlers consume structured observations through the shared emitter; named question/preference/resume/overview/workspace views and bounded inspection text replace implicit JSON. The existing next step contract gains display additively; --json fields, schema identities and exit codes stay compatible. `test/unit/display/commands.test.ts` runs compiled routes with NO_COLOR, preserves raw metadata only on explicit --raw, retains notes/links and real Markdown rules, checks no extra state events, and opens a real synthetic Git worktree without claiming human testing. Help snapshots cover ordinary/full/group pages at 80 columns. Doctor tests keep optional details and repairs out of the failure report, while installed records remain distinct from dry runs. Spec problems retain their supplied path. Native guard and private process wire protocols retain their exact machine formats, as ADR-0256 records. `CHECK PASS in 700s`, 5167 tests in 351 files; `CHECK PASS (fast) in 14s`, 1034 related tests in 16 files. The 233704-byte help and 174419-byte installation recordings were regenerated locally and inspected visually, with a temporary home and version-only client fixture; no model or native account ran.

**Tests** — Snapshot tests for each human form, at 80 columns and with `NO_COLOR`.

## P9-10 · Status and overview for many items

**Status:** ✅ · **Size:** M · **Depends on:** P9-09 · **Release:** 1.2.0

**Goal** — `wl status` stays readable with many initiatives, scopes and slices.

**Acceptance criteria:**

- [x] Status payloads gain the parent link and child counts (additive); the human form is a tree grouped by "Waiting on you", "Due", "In progress", sorted by attention then recency, with closed items behind `--all`.
- [x] One line per item, truncated to the terminal width; colour only on a terminal, honouring `NO_COLOR` and `FORCE_COLOR`.
- [x] Decisions are "upcoming" until their step completes and only actionable ones reach attention and "Waiting on you"; the overview never proposes a command the core will refuse.
- [x] The active gate (round, verdict, open findings), due checkpoints and worktrees appear per item; a standalone-created parent follows its active child.

**Evidence** — `test/unit/status/status.test.ts` covers nested fixture stores, direct child counts, an upcoming approval inherited by a child, the exact core-accepted suggested approval, a failed recorded review, due checkpoints, workspaces, active-child focus, recency, closed rows and unchanged JSON selection. It snapshots the tree, bounds subject-read growth at 100/400 items and checks all seven generated skills. Compiled CLI tests cover plain text, JSON, --all and empty stores; an actual local pseudo-terminal passed 40-column clipping and colour precedence. `CHECK PASS in 708s`: 5183 tests in 352 files; the initial related gate passed 2052 tests in 90 files in 270s and the bounded empty-store refinement passed in 11s. Three affected GIFs were regenerated and visually checked. [ADR-0256](../docs/decisions/0256-person-facing-display-rendered-by-the-core.md) records the conservative compatibility and readiness choices. No new manual evidence is required; native client forwarding remains in the existing per-client pass.

**Tests** — Fixture stores with nested items, upcoming decisions and a failed review round; snapshot tests.

## P9-11 · Metric providers asked and validated

**Status:** ✅ · **Size:** M · **Depends on:** P9-05 · **Release:** 1.2.0

**Goal** — A specification names a measurement tool the person chose and the registry knows.

**Acceptance criteria:**

- [x] `step begin write-spec` returns the providers offering each `source.*` capability with the access labels of P9-05; the skill asks where each metric lives and remembers it per repository.
- [x] `spec check` rejects a provider missing from the registry or lacking the metric's capability, and warns when it is not detected in the current client.

**Evidence** — `test/unit/spec/providers.test.ts` passes 23 provider, access, preference, completion/replay and seven-client rendering cases. The five targeted files pass 93 tests; the full gate passes 5222 tests in 354 files (`CHECK PASS in 699s`), with 1733 related tests in 65 files passing the fast gate in 225s. Four generated references remain current. [ADR-0023](../docs/decisions/0023-structured-spec-plans-and-revision-approval.md) records explicit preferences, registry checks, nonblocking access warnings and unchanged historical parsing. No live query or native-client pass ran.

**Tests** — Spec-check cases for an invented provider, a capability mismatch and an undetected provider.

## P9-12 · Suite start failures and readable gate output

**Status:** ✅ · **Size:** S · **Depends on:** — · **Release:** 1.2.0 · **Decision:** [ADR-0033](../docs/decisions/0033-once-per-round-suites-and-explicit-verification-inputs.md)

**Goal** — A suite that cannot start says why and does not spend a round.

**Acceptance criteria:**

- [x] Exit 126 or 127, a missing executable or a spawn error name the command and cause, then stop before workers, a recorded code verdict or evaluation budget consumption. Retain the planned write-ahead intent for audit and at-most-once execution; a corrected environment gets a replacement plan with only the unused budget. Changed workspaces and already submitted criterion work cannot earn this exception.
- [x] Output hashes are named as hashes in a new result schema version; a failed suite finding carries a bounded tail of its output.

**Evidence** — `CHECK PASS in 696s`, 5248 tests in 355 files; the corrected fast gate passes 4046 tests in 261 files in 633s. Four targeted files pass 510 tests, including actual startup failures, compiled v1/v2/text routes, retained budgets, refusal of forged allowances and mismatched intents, signal handling, real workflow resumption and all seven rendered clients. The planned intent remains recorded instead of being erased; only unused code-evaluation budget is carried forward. Failure tails remain transient (20 lines, 2048 characters), with hashes retained in history. [ADR-0033](../docs/decisions/0033-once-per-round-suites-and-explicit-verification-inputs.md) records this conservative interpretation and the two additive contract identities. Four generated references are current.

**Tests** — Suite fixtures for a missing executable, a non-executable script and a failing test.

## P9-13 · Cost shown before every fan-out

**Status:** ✅ · **Size:** S · **Depends on:** P9-04 · **Release:** 1.2.0 · **Decision:** [ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md)

**Goal** — The person sees what a step will spend before it spends it.

**Acceptance criteria:**

- [x] Research, framing, verify and review plans return the number of workers, the model tier and an estimate, and `display` shows it before any worker starts.
- [x] The estimate comes from the plan, not from a model.

**Evidence** — `CHECK PASS in 697s`, 5265 tests in 356 files; the fast gate passes 1720 tests in 115 files in 416s, with an 8s scope refinement. Three targeted files pass 86 tests, including fifteen cost cases, persisted gate previews, unfinished votes, all seven rendered clients and real synthetic headless processes whose cost callback precedes any process log. Estimates count worker calls and declared payload bytes; requested tiers do not claim actual client models, and tokens/time/price remain unknown. [ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md) records the conservative units and exclusions. Four generated references remain current; native presentation remains in P9-21 manual verification.

**Tests** — Plan tests for the counts.

## P9-14 · Deterministic checks of code citations

**Status:** ✅ · **Size:** M · **Depends on:** — · **Release:** 1.2.0 · **Decision:** [ADR-0021](../docs/decisions/0021-journaled-research-plans-and-refutations.md)

**Goal** — A claim citing `file:lines@sha` is checked by the core, not only by model verifiers.

**Acceptance criteria:**

- [x] `research submit` verifies each code citation: the file exists at the commit, the range is valid and the excerpt matches; a failed citation is reported on the claim.
- [x] The check adds to the current verifiers; how it reduces verifier work follows point 1 of [ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md).

**Evidence** — `CHECK PASS in 715s`, 5301 tests in 357 files; `CHECK PASS (fast) in 636s`, 3863 related tests in 259 files, followed by 34 citation cases in a 12s fast gate. Four initial focused files passed 517 tests. Real disposable Git repositories cover valid, missing, out-of-range and edited quotations, SHA-1/SHA-256 commits, spaces/CRLF, historical revisions, replacement refs, symlinks, filters, binary files, bounded reads and fixed batch counts. Actual CLI failures identify the claim and leave no result; valid submissions retain structural receipts. Replay refuses changed, duplicate and future-linked receipts without Git, while old unproved results stay unchecked. All seven rendered clients retain independent semantic examinations and the configured quorum; no quota reduction is claimed. Four generated references remain current. No new manual evidence gap or task was added.

**Tests** — Citation fixtures: valid, missing file, wrong range, edited excerpt.

## P9-15 · Model tier per role and client

**Status:** ✅ · **Size:** M · **Depends on:** P9-03 · **Release:** 1.2.0 · **Decision:** [ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md)

**Goal** — Verifiers and challengers do not have to run on the most expensive model.

**Acceptance criteria:**

- [x] Configuration maps the canonical tiers to a model per client; setup asks once; the default stays "inherit".
- [x] Rendered agents carry the mapped model where the client supports it and say so in the cost preview.

**Evidence** — `CHECK PASS in 714s`, 5321 tests in 358 files; `CHECK PASS (fast) in 532s`, 3173 related tests in 161 files. `test/unit/workers/models.test.ts` passes 20 cases: identifier and choice validation, refusal of malformed remembered values, no configuration read without an executing client, the native model field and configured sentence for every role on all seven clients, byte-identical unmapped output, preview tiers and display rows, per-tier setup questions for the executing client only, refusals and run scope that write nothing, per-scope installation files, an installed Claude role, doctor current/stale comparison and the compiled `wl setup --models` command. Criterion 1 is met as refined in [ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md): unmapped tiers inherit the session model on six clients, while Claude Code keeps its existing aliases ([ADR-0048](../docs/decisions/0048-native-target-layouts-and-checked-launcher-roots.md)) rather than silently moving verifiers to the session model; mappings are remembered answers because the `config@1` declaration is frozen. Criterion 2 is checked for rendering and preview; whether each client loads the field and runs that model is in [manual verification](./manual-verification.md). One generated reference was regenerated; no recorded command output changed. No native client, model account or live evaluation was used.

**Tests** — Rendering tests per client; configuration schema tests.

## P9-16 · Project code runs in Docker unless the person chooses otherwise

**Status:** ⬜ · **Size:** L · **Depends on:** P9-03 · **Release:** 1.2.0 · **Decision:** [ADR-0257](../docs/decisions/0257-where-project-code-runs.md)

**Goal** — What the README says about where project code runs is true on every route, and steps that only read never wait for Docker.

**Acceptance criteria:**

- [ ] `wl verify suite` runs through the observed Docker executor on the supervised path, as the runner does.
- [ ] Builder and verifier workers run project commands through a `wl` command that executes them in the slice's environment, kept warm for the life of the slice; their instructions never run project code through the client's own shell.
- [ ] Host execution is an explicit choice per run or per repository, shown before the step starts, recorded in the result and displayed as not isolated; the runner refuses it.
- [ ] Without Docker and without that choice, a step that executes code refuses before doing anything and names both remedies; research, framing, specification, scopes, slicing, review and Rollout steps never check for Docker.
- [ ] The README, execution isolation and ADR-0245 describe the default and the choice.

**Tests** — A fixture suite that reports its platform, through `wl verify suite` and the worker command; refusal without a daemon; the host choice recorded and displayed; the runner refusing it; no Docker check in read-only steps; a Docker rehearsal.

## P9-17 · Proportional depth and gate cost

**Status:** ⬜ · **Size:** L · **Depends on:** P9-13, P9-14 · **Release:** 1.2.0 · **Decision:** [ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md)

**Goal** — A small question or change costs little, and any reduced check is recorded and visible.

**Acceptance criteria:**

- [ ] Research and gates take a rigor of `quick`, `standard` (default, today's coverage) or `deep`, proposed by the step from the question or change and confirmed by the person; the profile never sets it, and the chosen rigor and its coverage appear in the result.
- [ ] Findings carry a severity; only blockers fail a round; others reach the person in the hand-back; mandatory lenses keep fail-safe behaviour.
- [ ] Optional review lenses apply by change size and paths; verifier counts below three exist only under new schema versions.

**Tests** — Gate aggregation tables per severity; lens applicability tables; schema compatibility tests.

## P9-18 · Documented interactions that do not exist

**Status:** ⬜ · **Size:** M · **Depends on:** P9-05, P9-07 · **Release:** 1.2.0 · **Decision:** implement or remove, per interaction

**Goal** — Setup, Define publication and `next` behave as their pages show, or the pages stop showing it.

**Acceptance criteria:**

- [ ] Setup: per-option detection labels, a description per profile, codehost and analytics choices — or the session and page are corrected.
- [ ] Define: the first Define step of an initiative asks where its artifacts are published, remembered per repository — or the sessions are corrected.
- [ ] `next`: the planned path to the next human stop and one confirmation — or the session is corrected.

**Tests** — Contract tests for whichever interactions are implemented.

## P9-19 · Documentation that matches behaviour, with a check

**Status:** ⬜ · **Size:** M · **Depends on:** P9-07–P9-18 · **Release:** 1.2.0

**Goal** — No documented command, option or session line describes something the product does not do.

**Acceptance criteria:**

- [ ] A docs check parses every `wl` command line in the terminal sessions and step pages; `wl open --spec` and `--plan` are added or removed.
- [ ] Verify selects every declared check script by default (test, lint, typecheck) or the verify session is corrected.
- [ ] Sessions are re-recorded from the new `display` output where it exists.

**Tests** — The new docs check in `npm run check`.

## P9-20 · Experience check with budgets

**Status:** ✅ · **Size:** M · **Depends on:** — · **Release:** 1.2.0

**Goal** — The experience is measured the way a person meets it, and regressions fail a check.

**Acceptance criteria:**

- [ ] `npm run eval:experience` runs research, framing, spec, scopes, slicing and an ad-hoc build in a small fixture application outside this repository, through a client's headless mode, with fixture answers; it refuses without `WHOLELOOP_LIVE_CONFIRM=spend-quota`.
- [x] Per step it records wall time, time to the first question or plan, tokens, workers and whether they ran together, tool calls shown, approval prompts, lines of assistant text, raw JSON shown, banned terms, sources used that the person did not choose, and whether the documented questions were asked.
- [ ] A baseline of the current behaviour on Codex and Claude Code is recorded before the fixes of P9-01–P9-05 land.
- [x] Budgets fail the check (initially: quick research ≤ 3 minutes and ≤ 3 workers, each Define step ≤ 5 minutes, no source the person did not choose, no fixed sleeps, no raw JSON, no banned terms, final message ≤ 25 lines; budgets for tokens, the first question and the build gates are set from the baseline and only tighten); the transcript parsers are tested with recorded fixtures.

**Evidence** — `test/unit/experience/experience.test.ts`: 23 parser, budget, concurrency, provenance and refusal tests passed. Offline replay of the synthetic Codex trace reported the expected `Live baseline calibration pending` failure, without launching a client. The six-step runner, fixture application, both native recipes and external observation retention are implemented. Live execution, the current-behaviour baseline and its calibration remain unchecked above and open in [manual verification](./manual-verification.md#p9-20-baseline-capture); no live experience run was made. [ADR-0259](../docs/decisions/0259-observed-experience-budgets.md) records why missing calibration fails instead of using invented ceilings.

**Tests** — Parser and budget tests on recorded transcripts; the live runs go to manual verification.

## P9-21 · Agent experience on every supported client

**Status:** ⬜ · **Size:** L · **Depends on:** P9-03, P9-04, P9-07, P9-20 · **Release:** 1.2.0

**Goal** — Claude Code, Codex, OpenCode, Copilot, Gemini, Cursor and Antigravity give the same experience, each within its own limits.

**Acceptance criteria:**

- [ ] For each client, a written pass over rendered skills and agents: roles started, tools available, waiting primitive, sandbox and store access, approval prompts per step, launcher noise; gaps found become tasks in this phase.
- [ ] Install shows, for review, the narrowest rule that lets the client run the `wl` launcher without asking each time, per client that supports one; it never writes it on its own, because that widens what runs without approval.
- [ ] The experience check passes on both reference clients; the other clients' results are recorded in manual verification.

**Tests** — Rendered-artifact snapshots; allow-rule rendering per client; live results in manual verification.

## P9-22 · Fewer calls and files per step

**Status:** ✅ · **Size:** M · **Depends on:** P9-07 · **Release:** 1.2.0

**Goal** — A step does its bookkeeping in as few `wl` calls as possible, and the person does not watch the agent write JSON files.

**Acceptance criteria:**

- [x] Small decision and result payloads (frame decision, review answers, worker results, normalized responses) are accepted on standard input or as answers; files remain for large artifacts only.
- [x] Commands that always run together in a step are one call (for example beginning a step and returning its plan).
- [x] Skills write any remaining scratch files quietly in one scratch directory, never echoing their contents.

**Evidence** — Sixteen cases in `test/unit/cli/json-input.test.ts` exercise real stdin pipes and legacy files against the same framing decision/final-review, gate result/vote and normalized observation contracts; malformed/empty/oversize input, literal dash filenames and conflicting rationale input are refused without echoing contents or changing state. Research begin returns its first plan without bypassing questions; ready-only framing schemas are isolated from caller mutation, and scratch paths are outside repositories and the private store without eager creation. Canonical command flags and all seven renders are checked. The fixture-only experience counter records four bookkeeping calls reduced to two; live timing/quota calibration remains in the existing manual baseline. `CHECK PASS in 701s`: 5199 tests in 353 files; related fast gates passed 2852 tests in 140 files in 522s and 886 tests in 58 files in 223s. [ADR-0003](../docs/decisions/0003-deterministic-core-cli.md) records the explicit input mode, retained guards and artifact ownership. Four generated references remain current; existing human recordings are unchanged. No new manual gap or task was added.

**Tests** — Command tests for standard-input payloads against the same schemas as files; the experience check counts tool calls per step.

## P9-23 · Autonomous research includes an authored conclusion

**Status:** ⬜ · **Size:** M · **Depends on:** P9-06 · **Release:** 1.2.0 · **Decision:** amends [ADR-0021](../docs/decisions/0021-journaled-research-plans-and-refutations.md) and [ADR-0184](../docs/decisions/0184-unattended-research-host.md)

**Goal** — The private research-report endpoint returns an authored Answer and Recommendation, rather than only an evidence ledger.

**Acceptance criteria:**

- [ ] The research controller obtains a conclusion bound to its completed evidence aggregate, with no new source query, repository command or broader tool authority.
- [ ] Its report opens with the answer, recommendation, core-derived confidence and unchecked work, retaining every claim, refutation and source limitation.
- [ ] Conclusion generation, replay, failure, changed evidence and the added bounded call are covered by the existing budget and resumption machinery; missing prose never becomes an invented answer.
- [ ] Its plan/cost preview and documentation reflect the actual work; live quota evidence remains in manual verification.

**Tests** — Private research-host fixtures for a complete conclusion, unknowns, stale input, failed generation, exact replay, bounded calls and unchanged source reads.

---

[◀ P8](./phase-8-software-factory.md) · [Roadmap](./README.md) · [Journal](./journal.md)
