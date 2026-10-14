# Phase 5 — Reach & release

> **Outcome** — Tier B CLIs are supported, the headless engine makes parallel gates available everywhere, conformance runs every night against pinned CLI versions, and 1.0 is published with documentation generated from the code it describes.

---

## P5-01 · Adapters — Gemini CLI and Antigravity CLI

**Status:** ⬜ · **Size:** L · **Depends on:** P1-11

**Goal** — Cover both of Google's CLIs.

**Deliverables** — two adapters (extension manifest for Gemini CLI; `.agents/` layout, `serverUrl` MCP dialect and own hook schema for Antigravity), plain-text question fallback where no ask tool exists, golden files, conformance scenario.

**Acceptance criteria:**

- [ ] The P1 conformance scenario passes on both CLIs (sequential or headless engine where needed).

**Docs** — platforms.

## P5-02 · Adapter — Cursor CLI

**Status:** ⬜ · **Size:** M · **Depends on:** P1-11

**Goal** — Cover Cursor's terminal agent.

**Deliverables** — adapter (`.cursor/` agents, rules and hooks; Agent Plugins manifest with `CURSOR_PLUGIN_ROOT`), golden files, conformance scenario.

**Acceptance criteria:**

- [ ] The P1 conformance scenario passes; read-only roles use `readonly`.

**Docs** — platforms.

## P5-03 · Headless fan-out engine

**Status:** ⬜ · **Size:** L · **Depends on:** P3-03

**Goal** — Parallel, isolated gate lenses on any CLI with a headless mode.

**Deliverables** — `tl fanout run --engine headless`, per-CLI headless invocation from adapters, non-interactive read-only permissions, concurrency limit, timeouts, result collection into `tl gate submit`.

**Acceptance criteria:**

- [ ] The same gate run gives the same verdict under native, headless and sequential engines (stubbed workflow test + one real conformance run).
- [ ] A crashed worker is reported, never counted as a refutation.

**Docs** — architecture/orchestration-and-gates, ADR-0006.

## P5-04 · Nightly conformance and the generated matrix

**Status:** ⬜ · **Size:** M · **Depends on:** P1-14, P5-01, P5-02

**Goal** — Know the moment a CLI release breaks something.

**Deliverables** — scheduled CI job across all supported CLIs at pinned and latest versions, result artifact, generated capability matrix in `docs/platforms/README.md`.

**Acceptance criteria:**

- [ ] A regression on *latest* opens an issue naming the CLI version and the failing assertion.

**Docs** — platforms (generated).

## P5-05 · Distribution

**Status:** ⬜ · **Size:** M · **Depends on:** P1-13

**Goal** — One command to install, wherever you work.

**Deliverables** — npm release automation (conventional-commit changelog, provenance), Claude Code marketplace entry with bundled core, Agent Plugins root manifest, Gemini extension, optional compiled binaries in GitHub Releases.

**Acceptance criteria:**

- [ ] A fresh machine goes from nothing to `tl doctor` green in under five minutes for each tier-A CLI (documented run).
- [ ] Release notes contain no tool attribution.

**Docs** — getting-started, ADR-0015.

## P5-06 · Generated references and docs pass

**Status:** ⬜ · **Size:** M · **Depends on:** P5-04

**Goal** — Documentation that cannot drift from the code.

**Deliverables** — generated config reference, command reference, provider catalogue and capability matrix; every status banner reviewed; getting-started split per CLI where it helps.

**Acceptance criteria:**

- [ ] `tl docs check` verifies generated pages are current.
- [ ] No page says `📐 design` for behaviour that is released.

**Docs** — all.

## P5-07 · 1.0

**Status:** ⬜ · **Size:** S · **Depends on:** P5-05, P5-06

**Goal** — A stable contract others can build extensions against.

**Deliverables** — schema versions frozen at 1 (config, manifests, step contract, journal events), deprecation policy, release.

**Acceptance criteria:**

- [ ] Every schema has a version and a compatibility test.
- [ ] The 1.0 release is tagged and announced.

**Docs** — decisions (versioning ADR), README status note removed.

---

[◀ P4](./phase-4-rollout-learn.md)  ·  [Roadmap](./README.md)  ·  [📓 Journal](./journal.md)
