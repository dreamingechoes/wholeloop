# Phase 0 — Foundations

> **Outcome** — The repository builds, tests and checks itself from the first line of code, and every open question about the target CLIs is answered with evidence before we design around it.

---

## P0-01 · Names, package and repository hygiene

**Status:** ✅ · **Size:** S · **Depends on:** —

**Goal** — Settle the project's identity before anything depends on it.

**Deliverables** — npm package `wholeloop` reserved (free on 2026-10-14, chosen after `throughline` proved crowded — [ADR-0018](../docs/decisions/0018-project-name.md)); **private** GitHub repository created under the personal account — `github.com/dreamingechoes/wholeloop`, never an organisation — with `origin` set and `main` pushed; issue and PR templates; `SECURITY.md`; `CODE_OF_CONDUCT.md`.

**Acceptance criteria:**

- [x] The package name is recorded in [ADR-0015](../docs/decisions/0015-distribution.md) and every doc that mentions it.
- [x] A placeholder package is published (or the scope is owned) so the name cannot be taken.
- [x] `gh repo view dreamingechoes/wholeloop --json visibility,owner` reports `PRIVATE` and owner `dreamingechoes`.
- [x] `git remote get-url origin` points at `dreamingechoes/wholeloop` and `main` is pushed with its full history.
- [x] Templates exist and contain no tool attribution.

**Evidence (2026-11-08)** — The maintainer published a placeholder from a directory outside the repository, so no source was included. `npm view wholeloop` lists `dreamingechoes` as the only maintainer. The registry first shows `0.0.0-stage`, its placeholder for staged publishing, while the reviewed `0.0.1` (a README and package.json, 407 bytes) waits for the maintainer's approval.

**Docs** — README install snippet, platforms page, ADR-0015.

## P0-02 · TypeScript toolchain

**Status:** ✅ · **Size:** M · **Depends on:** P0-01

**Goal** — A fast, strict, boring toolchain everyone can run.

**Deliverables** — `package.json` (Node ≥ 20, npm), strict `tsconfig`, test runner (Vitest), linter and formatter (Biome), build to a single bundled `dist/wl.mjs`, `wl --version` working, CI workflow running install · lint · typecheck · test · build — choices recorded in [ADR-0019](../docs/decisions/0019-typescript-toolchain.md).

**Acceptance criteria:**

- [x] `npm run check` runs every local check in under 30 seconds on an empty project (≈ 2 s).
- [x] CI is green on Linux and macOS (run 38620731201: `check` on Ubuntu and macOS with Node 22, `runtime` running the bundle on Node 20).
- [x] `node dist/wl.mjs --version` prints the package version (`npm run smoke` asserts it).

**Docs** — CONTRIBUTING (commands), contributing/authoring.

## P0-03 · CLI conformance spike

**Status:** ✅ · **Size:** L · **Depends on:** —

**Goal** — Replace every ❓ in the platform matrix with a verified answer.

**Deliverables** — a throwaway fixture repo with one skill, one read-only subagent, one hook and one MCP server, exercised on Claude Code, Codex, OpenCode and Copilot CLI; notes per CLI under `test/conformance/notes/`.

**Acceptance criteria:**

- [x] Verified per CLI: skill discovery dirs, subagent format and parallelism, read-only enforcement, hook events and payload shape, structured question tool, MCP config dialect, headless flags and JSON output.
- [x] Specifically answered: Claude Code reading `.agents/skills` and Agent Plugins manifests; Codex `request_user_input` behaviour; Copilot reading Claude hooks.
- [x] Any finding that changes a design decision opens or amends an ADR.

**Evidence** — On 2026-11-08, macOS arm64, Node 24.22.0, a disposable fixture ran on Claude Code 2.1.319, Codex 0.166.0, OpenCode 2.2.5 and Copilot CLI 1.0.83. It held one marker skill per discovery directory, a read-only reader subagent in each client's format, logging hooks and a local MCP server returning a fixed marker. Per client, one headless run listed the skills, called the MCP tool, launched two readers in parallel and tried the question tool; an interactive tmux session then asked a real question. Results:

- **Skill discovery:** Claude reads `.claude/skills` only; Codex reads `.agents` and `.codex`; OpenCode reads `.opencode`, `.claude` and `.agents`; Copilot reads `.github`, `.agents` and `.claude`.
- **Subagents and read-only enforcement:** all four ran two subagents in parallel. Read-only enforcement comes from today's probes and P1-11.
- **Hooks:** payloads are the P3-08 fixtures; Claude and Copilot also logged their full event sets.
- **MCP:** works in each client's dialect, but Copilot does not read the repository's `.mcp.json`.
- **Questions:** asked natively in interactive Claude, OpenCode and Copilot sessions; no client answers one headless.
- **Specific questions:** Claude ignores `.agents/skills` and the Agent Plugins manifest, though it loads a package's `skills/`. Codex `exec` exposes `request_user_input_async`, which accepts a question and never answers. Copilot runs Claude's hooks, only in a trusted folder.
- **Also found:** Codex and Copilot install the Agent Plugins package from a Claude marketplace file, and Codex subagents fail under `exec --ephemeral`.

ADR-0005 and ADR-0015 are amended; each client's note under `test/conformance/notes/` holds the invocations. Narrowed: Codex's interactive question was not exercised, because its TUI would save folder trust to the user's configuration. Linux was not run. The Gemini, Antigravity and Cursor ❓ marks stay with their adapter tasks.

**Earlier observations** — Claude loose-skill framing and session recovery were observed by hand, and Codex 0.163.0 passed the standalone framing scenario. The automatic trials from that time are kept in the [trial table](./manual-verification.md#automatic-native-client-trials-2026-10-22).

**Docs** — platforms (matrix), ADR-0005, ADR-0006.

## P0-04 · Documentation tooling

**Status:** ✅ · **Size:** M · **Depends on:** P0-02

**Goal** — Make the documentation conventions impossible to break silently.

**Deliverables** — `wl docs nav` (rewrites every docnav footer from `docs/nav.yml`), `wl docs check` (docnav drift, relative links, anchors, Mermaid parse with the official parser, status banner present), markdownlint (`.markdownlint-cli2.jsonc`, already in the repo) — all wired into `npm run check` and CI.

**Acceptance criteria:**

- [x] Changing the order in `nav.yml` and running `wl docs nav` rewrites all footers; `wl docs check` fails before that run and passes after.
- [x] A broken Mermaid diagram, a dead relative link or a missing anchor fails CI with file and line.
- [x] `markdownlint-cli2` reports zero errors on every `.md` file, locally and in CI.
- [x] All 35+ existing Mermaid diagrams parse with the official `mermaid` parser — `npm run lint:mermaid`, a dev-only script (mermaid and jsdom are too heavy for the bundled CLI); patched transitive versions forced via `overrides`.
- [x] The footers produced at bootstrap by a throwaway script are regenerated by `wl docs nav` with no diff.

**Docs** — contributing/docs-style (status → implemented).

## P0-05 · Size budgets and enforcement lint

**Status:** ✅ · **Size:** M · **Depends on:** P0-02

**Goal** — Keep every skill, agent and manifest short, and every hard rule executed.

**Deliverables** — budget lint for `harness/**` (lines, description length), Agent Skills front-matter schema check, `enforcement.yml` with its lint (missing enforcer · restatement-only · contradiction · stale entry) — all behind `wl harness check`.

**Acceptance criteria:**

- [x] A 121-line `SKILL.md` fails with the budget and the file.
- [x] A hard rule (⛔) in `harness/protocols/` with no entry in `enforcement.yml` fails.
- [x] Unit tests cover each failure mode with fixtures.

**Docs** — ADR-0011, contributing/authoring.

## P0-06 · Commit hygiene check

**Status:** ✅ · **Size:** S · **Depends on:** P0-02

**Goal** — Keep public history clean of tool attribution and inconsistent messages.

**Deliverables** — commit-msg check (conventional commit subject ≤ 72 chars; rejects `Co-Authored-By` trailers naming AI tools and "generated with" footers) as a local hook and a CI check over PR commits.

**Acceptance criteria:**

- [x] A commit with an AI co-author trailer is rejected locally and in CI.
- [x] A non-conventional subject is rejected with an example of the right shape.

**Docs** — ADR-0017, CONTRIBUTING.

## P0-07 · Review and accept the foundational ADRs

**Status:** ✅ · **Size:** S · **Depends on:** P0-03

**Goal** — Re-read ADR-0002 to ADR-0018 against what the spike learned, before code depends on them.

**Deliverables** — amended or superseded ADRs where the spike contradicted them; journal entry summarising changes.

**Acceptance criteria:**

- [x] No ADR contradicts the verified platform matrix.
- [x] Every ADR referenced from docs exists and is `Accepted` or explicitly `Superseded`.

**Evidence** — On 2026-11-08, ADR-0002 to ADR-0018 were re-read against the matrix the P0-03 spike verified. None contradicts it. ADR-0002's directory split holds: Claude reads `.claude/skills`, and the others read `.agents/skills`. ADR-0006's premises hold: subagents run in parallel on all four tier-A clients, and Codex cannot enforce a read-only agent. Two ADRs needed precision, not reversal. ADR-0005 now records that Copilot runs Claude's hooks only in trusted folders and that no client answers a structured question headless. ADR-0015's Agent Plugins claim was confirmed for Codex and Copilot and narrowed for Claude. ADR-0003, ADR-0004 and ADR-0007 to ADR-0018 make no platform claim. No ADR was superseded. The docs check validates status and references (`npm run check`).

**Local implementation:** the docs check validates referenced metadata, successor resolution and cycle refusal.

**Docs** — decisions index.

---

[◀ Roadmap](./README.md)  ·  [📓 Journal](./journal.md)  ·  [P1 ▶](./phase-1-walking-skeleton.md)
