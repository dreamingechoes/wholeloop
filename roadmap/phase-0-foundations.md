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

**Status:** ⏸️ · **Size:** L · **Depends on:** —

**Goal** — Replace every ❓ in the platform matrix with a verified answer.

**Deliverables** — a throwaway fixture repo with one skill, one read-only subagent, one hook and one MCP server, exercised on Claude Code, Codex, OpenCode and Copilot CLI; notes per CLI under `test/conformance/notes/`.

**Acceptance criteria:**

- [ ] Verified per CLI: skill discovery dirs, subagent format and parallelism, read-only enforcement, hook events and payload shape, structured question tool, MCP config dialect, headless flags and JSON output.
- [ ] Specifically answered: Claude Code reading `.agents/skills` and Agent Plugins manifests; Codex `request_user_input` behaviour; Copilot reading Claude hooks.
- [ ] Any finding that changes a design decision opens or amends an ADR.

**Pending manual verification** — Claude loose-skill framing and session recovery were observed by hand; an automatic Codex 0.163.0 standalone framing trial passed on macOS. Other automatic client trials failed. These narrow observations do not close the discovery, permissions, hooks, questions and MCP spike. See `test/conformance/notes/README.md` and the [actual trial table](./manual-verification.md#automatic-native-client-trials-2026-10-22). Help text alone is not conformance evidence.

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

**Status:** ⏸️ · **Size:** S · **Depends on:** P0-03

**Goal** — Re-read ADR-0002 to ADR-0018 against what the spike learned, before code depends on them.

**Deliverables** — amended or superseded ADRs where the spike contradicted them; journal entry summarising changes.

**Acceptance criteria:**

- [ ] No ADR contradicts the verified platform matrix.
- [x] Every ADR referenced from docs exists and is `Accepted` or explicitly `Superseded`.

**Local implementation:** docs check now validates referenced metadata, successor resolution and cycle refusal. Native/platform truth review still depends on the actual P0-03 spike; lifecycle validation does not close that criterion. Historical accepted ADRs remain intact until verified findings justify a superseding record.

**Docs** — decisions index.

---

[◀ Roadmap](./README.md)  ·  [📓 Journal](./journal.md)  ·  [P1 ▶](./phase-1-walking-skeleton.md)
