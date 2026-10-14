# Journal

> One entry per working session, newest first. What changed, what was decided, what is next. Short — the commits and ADRs hold the detail.

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
