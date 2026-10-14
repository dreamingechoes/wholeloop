# Phase 1 — Walking skeleton

> **Outcome** — One thin line through every layer: the core, the store, configuration, discovery, providers, adapters for all four tier-A CLIs, and one real step (`frame-problem`) running end to end — standalone and through `next` — from a single canonical source. Every later phase adds width, not new layers.

---

## P1-01 · `tl` command framework

**Status:** ⬜ · **Size:** S · **Depends on:** P0-02

**Goal** — A command skeleton every later command plugs into.

**Deliverables** — command router with `--json` everywhere, versioned output schemas, exit-code conventions, error formatting, generated command reference.

**Acceptance criteria:**

- [ ] Every command supports `--json`; schemas live in `src/cli/schemas/` with a version.
- [ ] Exit codes 0 · 1 · 2 · 3 · 4 behave as documented, with tests.
- [ ] `docs/architecture/core-cli.md` command table is generated from the definitions.

**Docs** — architecture/core-cli.

## P1-02 · Configuration schema and layered loading

**Status:** ⬜ · **Size:** M · **Depends on:** P1-01

**Goal** — One schema, deterministic precedence, personal vs team keys.

**Deliverables** — JSON Schema for config, loader for user · project · initiative · run layers, key classification (personal / team), `tl config show --explain` (value + where it came from).

**Acceptance criteria:**

- [ ] Table-driven tests cover every precedence path in [configuration](../docs/configuration/README.md#who-wins).
- [ ] Invalid config fails with path, value and expected type; it never half-loads.
- [ ] The configuration reference page is generated from the schema.

**Docs** — configuration/README.

## P1-03 · State store — journal, ids, projections

**Status:** ⬜ · **Size:** L · **Depends on:** P1-01

**Goal** — Durable, replayable, inspectable state outside every repository.

**Deliverables** — XDG store layout, `TL_WORKSPACE`, typed ids, append-only journal with event schemas, projection writer, write-then-rename, file locking, `tl state show|list|get|rebuild`, `tl note`, `tl link`, `tl open`.

**Acceptance criteria:**

- [ ] `tl state rebuild` reproduces every projection byte for byte.
- [ ] Two concurrent writers never corrupt the journal (stress test).
- [ ] A guard refuses any store write that resolves inside a git repository.

**Docs** — architecture/state-and-messaging, ADR-0004.

## P1-04 · Mailbox and resume

**Status:** ⬜ · **Size:** M · **Depends on:** P1-03

**Goal** — Agents and sessions can talk and pick up where others stopped, in any CLI.

**Deliverables** — threads, message kinds, per-reader cursors, `tl msg send|read`, `tl handoff`, `tl resume [<id>]` context pack with a size ceiling.

**Acceptance criteria:**

- [ ] Unread semantics are per reader and survive restarts.
- [ ] `tl resume` output stays under its size ceiling for an initiative with 50 items (snapshot test).

**Docs** — architecture/state-and-messaging.

## P1-05 · Flow engine and the step contract

**Status:** ⬜ · **Size:** L · **Depends on:** P1-02, P1-03

**Goal** — The process lives in code.

**Deliverables** — step registry for all 13 steps (stubs where not yet implemented), `tl step begin|plan|complete|skip`, `have/missing` computation, question generation, `tl answer --remember`, shape-check framework, decision points, preflight and receipt rendering.

**Acceptance criteria:**

- [ ] Each step's `begin` payload is snapshot-tested for: standalone with nothing, standalone with input, inside an initiative.
- [ ] A remembered answer is never asked again at its scope (test).
- [ ] `step skip` without `--reason` fails; with it, the reason appears in the journal and in later preflights.
- [ ] Decision points cannot be removed via config (test).

**Docs** — concepts (step contract), architecture/core-cli.

## P1-06 · Interaction profile

**Status:** ⬜ · **Size:** S · **Depends on:** P1-02

**Goal** — Personal dials rendered identically for every CLI.

**Deliverables** — dials, built-in presets, `tl profile show|set|preset`, style-block renderer (≤ 10 lines), natural-language override hooks for skills.

**Acceptance criteria:**

- [ ] Every preset × verbosity renders a snapshot-tested style block.
- [ ] No dial changes lens sets, decision points or the output contract (property test over all dial combinations).

**Docs** — configuration/profile, ADR-0010.

## P1-07 · Discover v1 and slot resolution

**Status:** ⬜ · **Size:** L · **Depends on:** P1-02

**Goal** — Every step knows what the repository already provides.

**Deliverables** — scanner for skills, agents, rules and instruction files of every supported CLI; command detection (package scripts, Makefile, justfile, common runners); rule-based slot matching; `metadata.throughline.slot`; cached capability map; `tl discover`, `tl resolve <slot>`.

**Acceptance criteria:**

- [ ] At least six fixture repositories (JS monorepo, Python, Go, Ruby, mixed with `.claude/` + `.agents/`, empty) produce snapshot-tested capability maps.
- [ ] Ambiguous matches produce a question instead of a choice.
- [ ] `tl resolve` explains why each candidate won or lost.

**Docs** — configuration/repo-skills, ADR-0009.

## P1-08 · Provider registry v1

**Status:** ⬜ · **Size:** L · **Depends on:** P1-02

**Goal** — Capabilities resolve to providers; the flow works with zero integrations.

**Deliverables** — capability taxonomy as code, provider manifest schema, loader (repo › user › packages › built-in, `extends`), detection from CLI MCP configs and `PATH`, `tl provider list|show|test|scaffold`, `tl mcp add` renderers for the four tier-A CLIs, built-ins: native web, native code, local docs, local tracker.

**Acceptance criteria:**

- [ ] A manifest mapping a verb outside the taxonomy fails validation.
- [ ] `tl mcp add <id> --target <cli>` output is golden-tested for each tier-A CLI.
- [ ] With no configuration, `docs.create` and `tracker.create-item` resolve to local providers.

**Docs** — configuration/providers, extending/providers, ADR-0008.

## P1-09 · Manifest loader for the other extension kinds

**Status:** ⬜ · **Size:** S · **Depends on:** P1-08

**Goal** — Templates, profiles and lenses load the same way providers do.

**Deliverables** — shared loader and schema per kind, `tl <kind> list|test|scaffold`, template required-section check.

**Acceptance criteria:**

- [ ] A template removing a required section fails with the section name and who depends on it.
- [ ] Repo-level manifests override built-ins by `id`; `extends` merges.

**Docs** — extending/README, extending/lenses-templates-profiles.

## P1-10 · Adapter — Claude Code

**Status:** ⬜ · **Size:** M · **Depends on:** P1-05, P0-03

**Goal** — The first generated target, shaped by the spike's findings.

**Deliverables** — adapter interface; Claude Code adapter for skills, agents, hooks (calling `tl guard`) and plugin manifest; bundled `tl` inside the plugin; golden files.

**Acceptance criteria:**

- [ ] `tl build --target claude` output matches golden files.
- [ ] The generated plugin installs locally and lists every skill.

**Docs** — platforms.

## P1-11 · Adapters — Codex, OpenCode, Copilot CLI

**Status:** ⬜ · **Size:** L · **Depends on:** P1-10

**Goal** — Same harness, four tier-A targets.

**Deliverables** — three adapters, tool/permission mapping per CLI, hook registration (OpenCode via a thin JS plugin calling `tl guard`), Agent Plugins manifest, golden files.

**Acceptance criteria:**

- [ ] Golden files for each adapter; one canonical change updates all four outputs.
- [ ] Read-only roles map to each CLI's strongest available restriction.

**Docs** — platforms.

## P1-12 · First skills — `next`, `status`, `setup`, `frame-problem`

**Status:** ⬜ · **Size:** L · **Depends on:** P1-05, P1-06, P1-07, P1-08

**Goal** — Prove the step contract with a real step and the entry point.

**Deliverables** — four skills within budget, the `conductor` agent, shared protocols (ask-never-guess, output contract), `frame-problem` with the local providers.

**Acceptance criteria:**

- [ ] `frame-problem` works standalone from a sentence and creates `init-xxxx` with an owner.
- [ ] `next "idea"` runs `frame-problem` and stops at the right point with the right receipt.
- [ ] `status` lists the initiative; `setup` sets a profile and a provider at a chosen scope.

**Docs** — flow/define/frame-problem, flow/utilities (status → partial).

## P1-13 · `tl install`, `tl uninstall`, `tl doctor`

**Status:** ⬜ · **Size:** M · **Depends on:** P1-11

**Goal** — From zero to working on a new machine in minutes.

**Deliverables** — install per target and scope, clean uninstall, doctor checks (Node version, CLI versions, generated files current, store writable, providers detected).

**Acceptance criteria:**

- [ ] Install then uninstall leaves no file behind (test in a temp HOME).
- [ ] Doctor explains every failure with the command that fixes it.

**Docs** — getting-started.

## P1-14 · Conformance harness v1

**Status:** ⬜ · **Size:** M · **Depends on:** P1-12, P1-13

**Goal** — Prove the same scenario passes on all tier-A CLIs.

**Deliverables** — fixture repo, scripted scenario ("frame this idea" standalone), headless runner per CLI with pinned versions, structural assertions on the journal.

**Acceptance criteria:**

- [ ] The scenario passes on Claude Code, Codex, OpenCode and Copilot CLI.
- [ ] A failure report names the CLI, the step and the missing journal event.

**Docs** — architecture/determinism-and-testing, platforms.

---

[◀ P0](./phase-0-foundations.md)  ·  [Roadmap](./README.md)  ·  [P2 ▶](./phase-2-define.md)
