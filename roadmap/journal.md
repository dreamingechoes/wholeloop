# Journal

> One entry per working session, newest first. What changed, what was decided, what is next. Short — the commits and ADRs hold the detail.

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
