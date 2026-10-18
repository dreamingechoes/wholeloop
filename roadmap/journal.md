# Journal

> One entry per working session, newest first. What changed, what was decided, what is next. Short — the commits and ADRs hold the detail.

---

## 2026-10-18 · P0-03 availability evidence; owner-only foundations parked

- Version/help probes passed for Claude 2.1.299, Codex 0.163.0, OpenCode 1.17.9 and Copilot 1.0.83 on macOS arm64.
- These probes do not establish skill discovery, permissions, hooks, questions, MCP or plugin conformance. Per-CLI notes and an isolated manual checklist preserve that distinction; P0-03 remains parked.
- P0-01 remains parked awaiting npm reservation. No publication or push was attempted.
- The existing local check suite passed before recording this evidence; Linux and live client sessions remain unverified in this session.

---

## 2026-10-14 · P0-02 done — CI green

### Done

- First CI run failed only on Node 20: `jsdom` 30 (Mermaid check) needs Node 22 APIs. CI now has a `check` job (Ubuntu + macOS, Node 22, full `npm run check`) and a `runtime` job that builds on 22 and runs the bundled CLI on Node 20. All green.
- Development requires Node ≥ 22; the published CLI supports Node ≥ 20 ([ADR-0019](../docs/decisions/0019-typescript-toolchain.md)).
- `origin` switched to SSH (the machine has no HTTPS credential helper; the SSH key authenticates as `dreamingechoes`).

### Open

- Agent sessions cannot push or edit `.github/workflows/` on this machine; the owner applies those.

---

## 2026-10-14 · P0-04 and P0-05 done — docs and harness checks

### Done

- `wl docs nav` regenerates every footer from `docs/nav.yml`; `wl docs check` verifies docnav drift, nav listing, status banners, relative links and anchors (GitHub slugs) across 71 Markdown files.
- `npm run lint:mermaid` parses all 35 diagrams with the official Mermaid parser (dev-only; too heavy for the bundled CLI).
- `wl harness check` enforces size budgets, portable skill and agent front matter, and `enforcement.yml` (missing enforcer · prose as enforcer · missing file or symbol · `forbid` contradictions · stale entries · documentation-only without reason).
- `npm run check` now runs lint · typecheck · 51 unit tests · build · smoke · docs check · harness check · markdownlint · Mermaid in about 4 seconds; CI runs the same command.

### Found by the new checks

- `docs/nav.yml` had an unquoted title with commas that YAML silently split; `parseNav` now rejects unknown keys.
- Glossary and FAQ had no status banner; added.

### Decided

- Bundled dependencies stay in `devDependencies`: `dist/wl.mjs` is self-contained, so the published package has no runtime dependencies.
- npm's optional-dependency bug left the lockfile without platform bindings for Vitest's bundler; the lockfile was regenerated from scratch. If `vitest` fails with a missing `rolldown` binding, regenerate the lockfile rather than adding the binding as a dependency.

---

## 2026-10-14 · P0-02 in progress — TypeScript toolchain

### Done

- `package.json` (npm, Node ≥ 20, exact dev dependencies published ≥ 2 weeks earlier), strict `tsconfig`, Biome (recommended preset), Vitest, esbuild bundle to `dist/wl.mjs` with the version injected from `package.json`.
- Minimal `wl`: `--version`, `--help`, unknown input → stderr + exit 1; 6 unit tests; `npm run smoke` checks the built binary.
- `npm run check` (lint · typecheck · tests · markdownlint) runs in about 2 seconds.
- CI workflow: Ubuntu (Node 20, 22) and macOS (Node 22), actions pinned by SHA, runtime-dependency audit.
- markdownlint upgraded to 0.23.3; its new table rule (MD060) required normalising every table delimiter row.
- Decisions in [ADR-0019](../docs/decisions/0019-typescript-toolchain.md): npm over pnpm, Biome over ESLint + Prettier, TypeScript 7.

### Decided

- Patched transitive versions forced through `overrides` (`smol-toml` 1.9.0, `katex` 0.18.9).
- `braces` ≤ 3.0.3 advisory (dev-only, no fix released) accepted and documented; it never sees untrusted input.
- Biome's `migrate` silently turned the recommended rules off (`preset: none`); fixed to `preset: recommended` and verified with a probe file. Worth remembering on future Biome upgrades.

### Open

- **CI green on Linux and macOS** cannot be verified until these commits are pushed (pushes from agent sessions are currently blocked on this machine — see the P0-01 entry).

---

## 2026-10-14 · P0-01 in progress — identity and repository

### Done

- `throughline` turned out to be crowded by active tools for the same CLIs; the project is now **wholeloop**, CLI alias `wl` ([ADR-0018](../docs/decisions/0018-project-name.md)). Docs, ADRs and roadmap renamed in one commit; local folder renamed.
- Private repository created at `github.com/dreamingechoes/wholeloop`; `main` pushed with full history at creation.
- Issue forms (bug, idea, provider request), PR template, `SECURITY.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).

### Open

- **npm reservation** — `wholeloop` is free on the registry, but nobody is logged in to npm on this machine, and publishing a placeholder makes the name public. Waiting on the owner: `npm login`, then approval to publish `0.0.0`.
- **Pushing from agent sessions** — a global push guard from another plugin on the owner's machine blocks `git push`; the owner pushes, or excludes this repository from that guard.
- GitHub private vulnerability reporting is unavailable while the repository is private; `SECURITY.md` points to email until then.

### Next

- Close P0-01 once the npm name is reserved. P0-02 and P0-03 do not depend on it and can start.

---

## 2026-10-14 · Repository bootstrapped

### Done

- Repository created: license, editor settings, README with the philosophy and the flow.
- Documentation skeleton: philosophy, concepts, the flow and every step page, configuration (profile, providers, repo skills), extending, platforms, architecture, contributing guides, glossary, FAQ.
- Foundational decisions recorded as ADR-0001 to ADR-0018.
- Roadmap: six phases, 54 session-sized tasks with acceptance criteria.

### Decided

- Name `wholeloop` (CLI `wl`), chosen after `throughline` turned out to be crowded by active tools for the same CLIs ([ADR-0018](../docs/decisions/0018-project-name.md)); TypeScript core; MIT; personal open-source project.
- State outside every repository; builds in git worktrees so slices run in parallel.
- Tier A: Claude Code, Codex, OpenCode, Copilot CLI. Tier B: Gemini CLI, Antigravity, Cursor.
- Every step usable on its own; the full flow is opt-in through `next`.
- Providers and other extensions are declarative manifests over a capability taxonomy with no dangerous verbs.
- Gate round budgets default to verify 4 / review 3 and are configurable per project and per run.
- No tool attribution anywhere in the history.
- Repository hosted privately at `github.com/dreamingechoes/wholeloop` (personal account).
- Bootstrap workflow: commits go straight to `main`, no branches or PRs, until the owner announces the switch.

### Next

- [P0-01](./phase-0-foundations.md#p0-01--names-package-and-repository-hygiene) — reserve the package name and push the repository.
- [P0-03](./phase-0-foundations.md#p0-03--cli-conformance-spike) can start in parallel: it needs no code from this repo.

---

[◀ Roadmap](./README.md)
