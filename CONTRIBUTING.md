# Contributing to wholeloop

`wholeloop` is built in small, self-contained tasks. Start with the working agreement and current journal; the repository remains private until the maintainer explicitly approves public release.

To use wholeloop rather than change it, start with the [README](./README.md) and [getting started](./docs/getting-started.md). The agreement below concerns implementation of this repository.

## Before your first change

1. Read [docs/philosophy.md](./docs/philosophy.md) and [docs/concepts.md](./docs/concepts.md).
2. Read [AGENTS.md](./AGENTS.md) — the working agreement for humans and coding agents alike.
3. Pick a task from the [roadmap](./roadmap/README.md): the first ⬜ task whose dependencies are ✅. Comment on its issue (or open one) so nobody duplicates it.

## Making a change

- **One task, end to end.** Code, tests and documentation land in the same change. Follow the current bootstrap commit workflow below.
- **Determinism first.** Anything with one right answer goes into the core, with a test.
- **Keep harness files short.** Size budgets are enforced ([ADR-0011](./docs/decisions/0011-size-budgets-and-enforcement.md)).
- **Docs follow the style guide.** Status banner, TL;DR, templates, Mermaid palette, generated navigation ([docs-style](./docs/contributing/docs-style.md)).
- **Decisions get an ADR.** A change of design is a new ADR in the same change ([decisions](./docs/decisions/README.md)).

## Commits and pull requests

> [!NOTE]
> **Bootstrap phase:** while the foundations are being built, changes are committed directly to `main`. Branches and pull requests become the workflow once the switch is announced in the [journal](./roadmap/journal.md).

From the switch, every change reaches `main` through a pull request, and the same applies to coding agents through `AGENTS.md`:

- Branch from `main` and open a pull request; describe what changed, why, the roadmap task and how it was verified.
- The required checks are the CI jobs on Ubuntu and macOS and the Node 20 runtime job; the branch must be up to date with `main` before merging.
- Pull requests are squash-merged. The title becomes the commit subject on `main`, so CI validates it with the same rules as a commit; the commit messages, also validated, become its body.
- `.github/CODEOWNERS` requests the maintainer's review on every path. [`.github/rulesets/main.json`](./.github/rulesets/main.json) and [`.github/rulesets/release-tags.json`](./.github/rulesets/release-tags.json) define the branch and tag rules the maintainer applies to the hosted repository; release tags can be created once and never moved or deleted.

- [Conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:` — imperative subject, ≤ 72 characters, one concern per commit.
- **No tool attribution.** No `Co-Authored-By` trailers for AI assistants, no "generated with" footers — in commits, PR descriptions or anywhere else ([ADR-0017](./docs/decisions/0017-no-tool-attribution-in-history.md)). Use whatever tools you like; the history records people.
- PR description: what changed, why, the roadmap task, and how you verified it.

## Checks

Node ≥ 22 and npm for development (the published CLI runs on Node ≥ 20):

```bash
npm ci
npm run check      # lint · types · tests · offline package · docs · harness
npm run build      # dist/wl.mjs
npm run smoke      # the built CLI prints the package version
npm run maintainer:render  # re-render maintainer skills and agents after editing maintainer/
```

All checks must pass locally and in CI before review.

Install the local commit-message hook with `npm run hooks:install` (idempotent; an existing hooks path is preserved). Rebuild with `npm run build` after changing the validator. The hook requires a lowercase Conventional Commit subject, a body explaining why and what was verified, and no tool attribution or shell substitutions. Check a history range with `npm run commits:check -- base..head`; PR CI uses the pull request's base and head automatically, without rewriting existing history. Imperative wording is reviewed by people; syntax is checked by code.

## Maintainer skills and agents

The repository ships its own skills and agents for the work described here, rendered for every supported client and committed under `.claude/`, `.agents/`, `.codex/`, `.opencode/`, `.github/`, `.gemini/` and `.cursor/`. Your client finds them when you open the repository; you do not need `wl`. Their names start with `maint-`.

| Skill | Use it to |
| --- | --- |
| `maint-start-task` | Pick and prepare the next roadmap task as AGENTS.md prescribes |
| `maint-close-task` | Record evidence, journal, banners, counts and the final gate |
| `maint-amend-adr` | Amend the existing decision record instead of adding one per fix |
| `maint-extend` | Add a provider, a client adapter or a shipped skill |
| `maint-prepare-release` | Prepare a release locally and stop before publication |
| `maint-triage-issue` | Reproduce, classify and route an issue |
| `maint-investigate-performance` | Measure with `scripts/perf/` before changing a hot path |
| `maint-check` | Run the gates and read the final line |

| Agent | Reviews |
| --- | --- |
| `maint-convention-reviewer` | Docs style, no tool attribution, size budgets, Conventional Commits, English on disk |
| `maint-docs-auditor` | Status banners, TL;DRs, claims against code, links and generated references |
| `maint-security-auditor` | Secrets, network access, unsafe processes, dependency and workflow changes |
| `maint-release-manager` | Version, notes, changelog, checklist and blocking manual checks |

The agents are read-only and every finding cites the rule it comes from. Claude Code, OpenCode, Copilot, Gemini, Antigravity and Cursor enforce read-only from the agent file; Codex cannot sandbox a custom agent on its own, so run it from a read-only session, as the rendered agent itself says. `test/unit/maintainer/agents.test.ts` checks each client's mapping.

None of them commits, pushes, publishes or changes repository settings; `test/unit/maintainer/skills.test.ts` checks that, and that every script and path a skill names exists. The roadmap totals in `roadmap/README.md` are checked against the phase files by `npm run roadmap:check`.

Edit them only in `maintainer/` and run `npm run maintainer:render`; `npm run check` fails on a hand-edited rendered file or a stale render. Read-only agents are enforced where the client can do it from the agent file; `maintainer/rendered.json` records how each client enforces it, and Codex inherits its parent session's sandbox instead. See [ADR-0246](./docs/decisions/0246-dogfooded-maintainer-skills-and-agents.md).

## Dependencies

The published CLI declares no runtime dependencies: it bundles what it needs from devDependencies. `npm run check` runs `scripts/check-dependencies.mjs`, which reads esbuild's metafile to find the packages that end up in the bundle and requires a permissive licence for them; development tools may also use reviewed weak-copyleft licences they never redistribute. CI additionally fails on high or critical advisories in bundled packages and on missing registry signatures. Prefer what the project already uses before adding a dependency, and say what a new one buys and costs. Triage for every automated check is in [SECURITY.md](./SECURITY.md#automated-checks-and-their-triage).

## Extensions

New providers, lenses, templates and profiles are welcome as manifests — see [docs/extending](./docs/extending/README.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](./LICENSE).
