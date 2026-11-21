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

**Status:** ⬜ · **Size:** M · **Depends on:** — · **Release:** 1.2.0

**Goal** — The worker a skill asks for exists in the client with the tools its instructions need, and is the one actually started.

**Acceptance criteria:**

- [ ] A role rendered without a command tool returns its result in its final message and the conductor submits it; its instructions never ask it to run `wl`.
- [ ] Skills name the role to start (`wl-researcher`, `wl-challenger`, …) and pass only its assignment; they forbid full-history copies of the conductor as workers.
- [ ] Codex skills call the launcher without a separate `adapter root` step.
- [ ] A conformance test fails for any adapter whose rendered agent instructions require a tool its rendered configuration disables, on all seven clients.

**Tests** — The cross-adapter conformance test; rendered-artifact snapshots per client.

## P9-04 · Fan-out that runs in parallel and waits properly

**Status:** ⬜ · **Size:** M · **Depends on:** P9-03 · **Release:** 1.2.0 · **Decision:** amends [ADR-0010](../docs/decisions/0010-interaction-profile-never-changes-coverage.md) (what pace controls)

**Goal** — Independent read-only workers run together, and the conductor waits on them, not on a clock.

**Acceptance criteria:**

- [ ] Pace gates decisions and writing workers, not independent read-only fan-out; the profile text says so and no longer reads "Run one worker at a time" for those steps.
- [ ] Skills start all jobs of a fan-out, then wait with the client's own wait primitive; fixed sleeps are never prescribed.
- [ ] Each job in a returned plan is a self-contained assignment (question, angle or unit, allowed source, result schema, where to return it).

**Tests** — Profile rendering tests; plan assignment snapshots; the experience check (P9-20) measures concurrency.

## P9-05 · Research asks which sources to use

**Status:** ⬜ · **Size:** M · **Depends on:** P9-03 · **Release:** 1.2.0 · **Decision:** amends [ADR-0021](../docs/decisions/0021-journaled-research-plans-and-refutations.md)

**Goal** — Research uses the sources the person chose, which are remembered, and nothing unrelated.

**Acceptance criteria:**

- [ ] `wl research plan` returns candidates with an access label (native, available in this client, configured in another client, executable only) and pins only the chosen ones; `--sources` selects them; the choice is remembered per run, repository or user.
- [ ] MCP declarations count only for the current client; an executable alone is never preselected; configured sources replace detection instead of adding to it.
- [ ] MCP servers without a provider are listed once as "not usable yet" with the provider guide.
- [ ] The research skill asks once, with this codebase and the web preselected, before any worker starts.

**Tests** — Plan tests for each access label and for configured-replaces-detected; a fixture home with `psql` on `PATH` and a Notion MCP declared only for another client.

## P9-06 · Research that stays read-only and answers first

**Status:** ⬜ · **Size:** S · **Depends on:** P9-03 · **Release:** 1.2.0

**Goal** — A brief opens with the answer, and research never executes repository code.

**Acceptance criteria:**

- [ ] Research workers have read-only tools on every client, and the skill says research never runs repository code.
- [ ] The brief has Answer and Recommendation sections written by the conductor and stored by `research complete`; the receipt shows the answer first, with how sure it is and what was not checked, and no separate synthesis outside the brief is needed.
- [ ] Verifier results collapse to one line per claim unless they dispute it; the evidence label reads "Verifier evidence"; refutation counts read "refuted by N of M (drops at K)"; the title is short and the question sits in the body.

**Tests** — Report rendering snapshots; rendered-role tool checks from P9-03.

## P9-07 · Person-facing display rendered by the core

**Status:** ⬜ · **Size:** L · **Depends on:** — · **Release:** 1.2.0 · **Decision:** [ADR-0256](../docs/decisions/0256-person-facing-display-rendered-by-the-core.md)

**Goal** — Every client shows the same short, readable text for every step, written by `wl`.

**Acceptance criteria:**

- [ ] Every step command's payload carries a versioned `display` block (header, rows, progress, produced, open questions, next) and its rendered text; the layout matches the documented sessions.
- [ ] The output contract tells skills to show `display` verbatim and not to narrate internals; the preflight becomes one header line; the profile style block is never shown.
- [ ] Raw `wl` JSON is never shown to the person by a skill.
- [ ] While workers run, the person sees one short line as each finishes and the time so far, and nothing else; a long step is never silent and never chatty.

**Tests** — Snapshot tests of `display` for every step, including progress; schema registration; the experience check lints transcripts for raw JSON.

## P9-08 · Skills and protocols in plain language

**Status:** ⬜ · **Size:** M · **Depends on:** P9-07 · **Release:** 1.2.0

**Goal** — Nothing a skill tells the agent makes it speak the core's vocabulary to the person.

**Acceptance criteria:**

- [ ] A short protocol for speaking to the person, loaded by every skill, with the person-facing words for internal terms; a lint lists the banned terms.
- [ ] Rules the core enforces are no longer loaded into skills; protocols keep only what the agent must do, and each skill loads only the protocols its step uses.
- [ ] A step reaches its first question, plan or answer in a bounded number of tool calls, set by the experience check's baseline.
- [ ] Maintainer-facing caveats (conformance, Linux not run) leave the skills; stale ones are removed, including status's "checkpoints are not collected yet".
- [ ] Shown commands use a short form instead of a 60-character launcher path wherever the client allows it.

**Tests** — The banned-term lint over rendered skills; size budgets unchanged.

## P9-09 · Human output for every person-facing command

**Status:** ⬜ · **Size:** M · **Depends on:** P9-07 · **Release:** 1.2.0

**Goal** — Without `--json`, every command a person runs prints text meant for them.

**Acceptance criteria:**

- [ ] `next`, `setup`, `overview`, `resume`, `config show`, `profile show`, `open`, `worktree open`, `spec check` and every step command have a human form; JSON appears only with `--json`.
- [ ] `wl --help` describes commands in plain sentences and hides repository and maintainer groups behind `--help --all`.
- [ ] Doctor shows details only for failures and summarises optional checks in one line; an install dry run does not claim a written receipt; `spec check` lists one problem per line with its path.
- [ ] `wl open` shows a readable header; front matter only with `--raw`.

**Tests** — Snapshot tests for each human form, at 80 columns and with `NO_COLOR`.

## P9-10 · Status and overview for many items

**Status:** ⬜ · **Size:** M · **Depends on:** P9-09 · **Release:** 1.2.0

**Goal** — `wl status` stays readable with many initiatives, scopes and slices.

**Acceptance criteria:**

- [ ] Status payloads gain the parent link and child counts (additive); the human form is a tree grouped by "Waiting on you", "Due", "In progress", sorted by attention then recency, with closed items behind `--all`.
- [ ] One line per item, truncated to the terminal width; colour only on a terminal, honouring `NO_COLOR` and `FORCE_COLOR`.
- [ ] Decisions are "upcoming" until their step completes and only actionable ones reach attention and "Waiting on you"; the overview never proposes a command the core will refuse.
- [ ] The active gate (round, verdict, open findings), due checkpoints and worktrees appear per item; a standalone-created parent follows its active child.

**Tests** — Fixture stores with nested items, upcoming decisions and a failed review round; snapshot tests.

## P9-11 · Metric providers asked and validated

**Status:** ⬜ · **Size:** M · **Depends on:** P9-05 · **Release:** 1.2.0

**Goal** — A specification names a measurement tool the person chose and the registry knows.

**Acceptance criteria:**

- [ ] `step begin write-spec` returns the providers offering each `source.*` capability with the access labels of P9-05; the skill asks where each metric lives and remembers it per repository.
- [ ] `spec check` rejects a provider missing from the registry or lacking the metric's capability, and warns when it is not detected in the current client.

**Tests** — Spec-check cases for an invented provider, a capability mismatch and an undetected provider.

## P9-12 · Suite start failures and readable gate output

**Status:** ⬜ · **Size:** S · **Depends on:** — · **Release:** 1.2.0

**Goal** — A suite that cannot start says why and does not spend a round.

**Acceptance criteria:**

- [ ] Exit 126 or 127, a missing executable or a spawn error stop before a round is recorded and name the command and the cause.
- [ ] Output hashes are named as hashes in a new result schema version; a failed suite finding carries a bounded tail of its output.

**Tests** — Suite fixtures for a missing executable, a non-executable script and a failing test.

## P9-13 · Cost shown before every fan-out

**Status:** ⬜ · **Size:** S · **Depends on:** P9-04 · **Release:** 1.2.0

**Goal** — The person sees what a step will spend before it spends it.

**Acceptance criteria:**

- [ ] Research, framing, verify and review plans return the number of workers, the model tier and an estimate, and `display` shows it before any worker starts.
- [ ] The estimate comes from the plan, not from a model.

**Tests** — Plan tests for the counts.

## P9-14 · Deterministic checks of code citations

**Status:** ⬜ · **Size:** M · **Depends on:** — · **Release:** 1.2.0

**Goal** — A claim citing `file:lines@sha` is checked by the core, not only by model verifiers.

**Acceptance criteria:**

- [ ] `research submit` verifies each code citation: the file exists at the commit, the range is valid and the excerpt matches; a failed citation is reported on the claim.
- [ ] The check adds to the current verifiers; how it reduces verifier work follows point 1 of [ADR-0258](../docs/decisions/0258-proportional-depth-and-gate-cost.md).

**Tests** — Citation fixtures: valid, missing file, wrong range, edited excerpt.

## P9-15 · Model tier per role and client

**Status:** ⬜ · **Size:** M · **Depends on:** P9-03 · **Release:** 1.2.0

**Goal** — Verifiers and challengers do not have to run on the most expensive model.

**Acceptance criteria:**

- [ ] Configuration maps the canonical tiers to a model per client; setup asks once; the default stays "inherit".
- [ ] Rendered agents carry the mapped model where the client supports it and say so in the cost preview.

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

**Status:** ⬜ · **Size:** M · **Depends on:** P9-07 · **Release:** 1.2.0

**Goal** — A step does its bookkeeping in as few `wl` calls as possible, and the person does not watch the agent write JSON files.

**Acceptance criteria:**

- [ ] Small decision and result payloads (frame decision, review answers, worker results, normalized responses) are accepted on standard input or as answers; files remain for large artifacts only.
- [ ] Commands that always run together in a step are one call (for example beginning a step and returning its plan).
- [ ] Skills write any remaining scratch files quietly in one scratch directory, never echoing their contents.

**Tests** — Command tests for standard-input payloads against the same schemas as files; the experience check counts tool calls per step.

---

[◀ P8](./phase-8-software-factory.md) · [Roadmap](./README.md) · [Journal](./journal.md)
