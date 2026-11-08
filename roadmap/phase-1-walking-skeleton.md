# Phase 1 — Walking skeleton

> **Outcome** — One thin line through every layer: the core, the store, configuration, discovery, providers, adapters for all four tier-A CLIs, and one real step (`frame-problem`) running end to end — standalone and through `next` — from a single canonical source. Every later phase adds width, not new layers.

---

## P1-01 · `wl` command framework

**Status:** ✅ · **Size:** S · **Depends on:** P0-02

**Goal** — A command skeleton every later command plugs into.

**Deliverables** — command router with `--json` everywhere, versioned output schemas, exit-code conventions, error formatting, generated command reference.

**Acceptance criteria:**

- [x] Every command supports `--json`; schemas live in `src/cli/schemas/` with a version.
- [x] Exit codes 0 · 1 · 2 · 3 · 4 behave as documented, with tests.
- [x] `docs/architecture/core-cli.md` command table is generated from the definitions.

**Docs** — architecture/core-cli.

## P1-02 · Configuration schema and layered loading

**Status:** ✅ · **Size:** M · **Depends on:** P1-01

**Goal** — One schema, deterministic precedence, personal vs team keys.

**Deliverables** — JSON Schema for config, loader for user · project · initiative · run layers, key classification (personal / team), `wl config show --explain` (value + where it came from).

**Acceptance criteria:**

- [x] Table-driven tests cover every precedence path in [configuration](../docs/configuration/README.md#who-wins).
- [x] Invalid config fails with path, value and expected type; it never half-loads.
- [x] The configuration reference page is generated from the schema.

**Docs** — configuration/README.

## P1-03 · State store — journal, ids, projections

**Status:** ✅ · **Size:** L · **Depends on:** P1-01

**Goal** — Durable, replayable, inspectable state outside every repository.

**Deliverables** — XDG store layout, `WL_WORKSPACE`, typed ids, append-only journal with event schemas, projection writer, write-then-rename, file locking, `wl state show|list|get|rebuild`, `wl note`, `wl link`, `wl open`.

**Acceptance criteria:**

- [x] `wl state rebuild` reproduces every projection byte for byte.
- [x] Two concurrent writers never corrupt the journal (stress test).
- [x] A guard refuses any store write that resolves inside a git repository.

**Docs** — architecture/state-and-messaging, ADR-0004.

## P1-04 · Mailbox and resume

**Status:** ✅ · **Size:** M · **Depends on:** P1-03

**Goal** — Agents and sessions can talk and pick up where others stopped, in any CLI.

**Deliverables** — threads, message kinds, per-reader cursors, `wl msg send|read`, `wl handoff`, `wl resume [<id>]` context pack with a size ceiling.

**Acceptance criteria:**

- [x] Unread semantics are per reader and survive restarts.
- [x] `wl resume` output stays under its size ceiling for an initiative with 50 items (snapshot test).

**Docs** — architecture/state-and-messaging.

## P1-05 · Flow engine and the step contract

**Status:** ✅ · **Size:** L · **Depends on:** P1-02, P1-03

**Goal** — The process lives in code.

**Deliverables** — step registry for all 13 steps (stubs where not yet implemented), `wl step begin|plan|complete|skip`, `have/missing` computation, question generation, `wl answer --remember`, shape-check framework, decision points, preflight and receipt rendering.

**Acceptance criteria:**

- [x] Each step's `begin` payload is snapshot-tested for: standalone with nothing, standalone with input, inside an initiative.
- [x] A remembered answer is never asked again at its scope (test).
- [x] `step skip` without `--reason` fails; with it, the reason appears in the journal and in later preflights.
- [x] Decision points cannot be removed via config (test).

**Docs** — concepts (step contract), architecture/core-cli.

## P1-06 · Interaction profile

**Status:** ✅ · **Size:** S · **Depends on:** P1-02

**Goal** — Personal dials rendered identically for every CLI.

**Deliverables** — dials, built-in presets, `wl profile show|set|preset`, style-block renderer (≤ 10 lines), natural-language override hooks for skills.

**Acceptance criteria:**

- [x] Every preset × verbosity renders a snapshot-tested style block.
- [x] No dial changes lens sets, decision points or the output contract (property test over all dial combinations).

**Docs** — configuration/profile, ADR-0010.

## P1-07 · Discover v1 and slot resolution

**Status:** ✅ · **Size:** L · **Depends on:** P1-02

**Goal** — Every step knows what the repository already provides.

**Deliverables** — scanner for skills, agents, rules and instruction files of every supported CLI; command detection (package scripts, Makefile, justfile, common runners); rule-based slot matching; `metadata.wholeloop.slot`; cached capability map; `wl discover`, `wl resolve <slot>`.

**Acceptance criteria:**

- [x] At least six fixture repositories (JS monorepo, Python, Go, Ruby, mixed with `.claude/` + `.agents/`, empty) produce snapshot-tested capability maps.
- [x] Ambiguous matches produce a question instead of a choice.
- [x] `wl resolve` explains why each candidate won or lost.

**Docs** — configuration/repo-skills, ADR-0009.

## P1-08 · Provider registry v1

**Status:** ✅ · **Size:** L · **Depends on:** P1-02

**Goal** — Capabilities resolve to providers; the flow works with zero integrations.

**Deliverables** — capability taxonomy as code, provider manifest schema, loader (repo › user › packages › built-in, `extends`), detection from CLI MCP configs and `PATH`, `wl provider list|show|test|scaffold`, `wl mcp add` renderers for the four tier-A CLIs, built-ins: native web, native code, local docs, local tracker.

**Acceptance criteria:**

- [x] A manifest mapping a verb outside the taxonomy fails validation.
- [x] `wl mcp add <id> --target <cli>` output is golden-tested for each tier-A CLI.
- [x] With no configuration, `docs.create` and `tracker.create-item` resolve to local providers.

**Docs** — configuration/providers, extending/providers, ADR-0008.

## P1-09 · Manifest loader for the other extension kinds

**Status:** ✅ · **Size:** S · **Depends on:** P1-08

**Goal** — Templates, profiles and lenses load the same way providers do.

**Deliverables** — shared loader and schema per kind, `wl <kind> list|test|scaffold`, template required-section check.

**Acceptance criteria:**

- [x] A template removing a required section fails with the section name and who depends on it.
- [x] Repo-level manifests override built-ins by `id`; `extends` merges.

**Docs** — extending/README, extending/lenses-templates-profiles.

## P1-10 · Adapter — Claude Code

**Status:** ⏸️ · **Size:** M · **Depends on:** P1-05, P0-03

**Goal** — The first generated target, shaped by the spike's findings.

**Deliverables** — adapter interface; Claude Code adapter for skills, agents, hooks (calling `wl guard`) and plugin manifest; bundled `wl` inside the plugin; golden files.

**Acceptance criteria:**

- [x] `wl build --target claude` output matches golden files.
- [ ] The generated plugin installs locally and lists every skill.

**Local implementation:** the adapter interface, pure Claude skill/agent renderer, embedded canonical resources, bundled core, owned output/backup writer and golden fixtures are implemented. The actual Claude 2.1.299 static plugin validator passed in an isolated directory. Native guard registration is now implemented through the shared core. User-scope loose-skill framing was exercised by hand through an on-hold closure and recovered status in a fresh Claude session; independent core reads confirmed persistence. See the [observation and content defects](./manual-verification.md#manually-observed-claude-framing-and-session-recovery-2026-10-22). Real hook capture, role isolation, plugin installation/all-skill discovery and the live runner remain manual checks. These gaps do not block independent installation implementation.

**Docs** — platforms, ADR-0047.

## P1-11 · Adapters — Codex, OpenCode, Copilot CLI

**Status:** ⏸️ · **Size:** L · **Depends on:** P1-10

**Goal** — Same harness, four tier-A targets.

**Deliverables** — three adapters, tool/permission mapping per CLI, hook registration (OpenCode via a thin JS plugin calling `wl guard`), Agent Plugins manifest, golden files.

**Acceptance criteria:**

- [x] Golden files for each adapter; one canonical change updates all four outputs.
- [ ] Read-only roles map to each CLI's strongest available restriction.

**Local implementation:** all three native renderers, namespaced skills/agents, portable Codex/Copilot manifests, checked launcher/root binding, role restrictions and cross-target goldens are implemented. Codex's inherited permission limitation is explicit; mappings are not a claimed isolated native sandbox. OpenCode/Copilot native hook bindings and the explicit Codex Git fallback now call the common guard. Actual payload capture, permission enforcement and model conformance remain manual verification; these checks do not block independent installation implementation.

**Docs** — platforms, ADR-0048.

## P1-12 · First skills — `next`, `status`, `setup`, `frame-problem`

**Status:** ✅ · **Size:** L · **Depends on:** P1-05, P1-06, P1-07, P1-08

**Goal** — Prove the step contract with a real step and the entry point.

**Deliverables** — four skills within budget, the `conductor` agent, shared protocols (ask-never-guess, output contract), `frame-problem` with the local providers.

**Acceptance criteria:**

- [x] `frame-problem` works standalone from a sentence and creates `init-xxxx` with an owner.
- [x] `next "idea"` runs `frame-problem` and stops at the right point with the right receipt.
- [x] `status` lists the initiative; `setup` sets a profile and a provider at a chosen scope.

**Docs** — flow/define/frame-problem, flow/utilities (status → partial).

## P1-13 · `wl install`, `wl uninstall`, `wl doctor`

**Status:** ✅ · **Size:** M · **Depends on:** P1-11

**Goal** — From zero to working on a new machine in minutes.

**Deliverables** — install per target and scope, clean uninstall, doctor checks (Node version, CLI versions, generated files current, store writable, providers detected).

**Acceptance criteria:**

- [x] Install then uninstall leaves no file behind (test in a temp HOME).
- [x] Doctor explains every failure with the command that fixes it.

**Evidence (2026-11-08)** — Every failing doctor check carries an instruction and a repair command. Exercising each failure against the real installed clients on macOS found two that did not fix anything: an unwritable default store suggested rerunning doctor on that same store, and an edited or deleted owned file got the instruction meant for an interrupted writer, without naming the file, while install and uninstall both refuse until it is restored. Doctor now restores write access with chmod on a directory the user owns or points at another external store, never the failing one, and names each changed file with whether it is edited or missing. Each repair was applied in a disposable home until doctor reported no failure. Physical crash recovery and Linux remain in manual verification.

**Local implementation:** four-target user/project native overlays, relative checked launchers, scoped/dedicated hooks, external ownership/backups, preflighted dry runs, semantic idempotency, upgrades, clean uninstall and recorded pending recovery are implemented. Full-package fixtures restore temporary HOME/project trees exactly; smaller catalogs exercise ownership edges. Doctor now checks owned scopes as well as versions, actual store writes and explicit standalone artifacts. Installed files remain distinct from native activation/authentication; Git hooks retain explicit per-repository activation/removal. Actual clients, physical recovery, Linux/other Node releases and corrective commands needing the maintainer's platform/configuration choices remain verification, so the second full-item criterion stays open. These checks do not block the local P1-14 conformance runner.

**Docs** — getting-started.

## P1-14 · Conformance harness v1

**Status:** ⏸️ · **Size:** M · **Depends on:** P1-12, P1-13

**Goal** — Prove the same scenario passes on all tier-A CLIs.

**Deliverables** — fixture repo, scripted scenario ("frame this idea" standalone), headless runner per CLI with pinned versions, structural assertions on the journal.

**Acceptance criteria:**

- [ ] The scenario passes on Claude Code, Codex, OpenCode and Copilot CLI.
- [x] A failure report names the CLI, the step and the missing journal event.

**Local implementation:** a bundled synthetic scenario, disposable seeded repositories, real project installer/launchers, four native headless recipes, exact version preflight, bounded execution/cancellation and a replay/projection/marker judge are implemented. Preparation, simulation and explicit live process evidence are distinct. Fixtures cannot close the real-client criterion. An authorized actual Codex 0.163.0 standalone run passed after correcting the exact-input prompt. Claude has separate owner-observed on-hold/session-recovery evidence; actual automatic trials of the other five clients failed. See the [native trial table](./manual-verification.md#automatic-native-client-trials-2026-10-22). Full four-client scenario acceptance, native permissions/hooks and Linux/other Node checks remain open. These checks do not block other implementation.

**Docs** — architecture/determinism-and-testing, platforms, ADR-0051.

---

[◀ P0](./phase-0-foundations.md)  ·  [Roadmap](./README.md)  ·  [P2 ▶](./phase-2-define.md)
