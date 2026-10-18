# Contributing to wholeloop

Thanks for wanting to help. `wholeloop` is built in small, session-sized tasks, in the open.

## Before your first change

1. Read [docs/philosophy.md](./docs/philosophy.md) and [docs/concepts.md](./docs/concepts.md).
2. Read [AGENTS.md](./AGENTS.md) — the working agreement for humans and coding agents alike.
3. Pick a task from the [roadmap](./roadmap/README.md): the first ⬜ task whose dependencies are ✅. Comment on its issue (or open one) so nobody duplicates it.

## Making a change

- **One task, end to end.** Code, tests and documentation land in the same pull request.
- **Determinism first.** Anything with one right answer goes into the core, with a test.
- **Keep harness files short.** Size budgets are enforced ([ADR-0011](./docs/decisions/0011-size-budgets-and-enforcement.md)).
- **Docs follow the style guide.** Status banner, TL;DR, templates, Mermaid palette, generated navigation ([docs-style](./docs/contributing/docs-style.md)).
- **Decisions get an ADR.** A change of design is a new ADR in the same PR ([decisions](./docs/decisions/README.md)).

## Commits and pull requests

> [!NOTE]
> **Bootstrap phase:** while the foundations are being built, the owner commits directly to `main`. Branches and pull requests become the workflow once the switch is announced in the [journal](./roadmap/journal.md).

- [Conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:` — imperative subject, ≤ 72 characters, one concern per commit.
- **No tool attribution.** No `Co-Authored-By` trailers for AI assistants, no "generated with" footers — in commits, PR descriptions or anywhere else ([ADR-0017](./docs/decisions/0017-no-tool-attribution-in-history.md)). Use whatever tools you like; the history records people.
- PR description: what changed, why, the roadmap task, and how you verified it.

## Checks

Node ≥ 22 and npm for development (the published CLI runs on Node ≥ 20):

```bash
npm ci
npm run check      # lint · typecheck · unit tests · markdownlint
npm run build      # dist/wl.mjs
npm run smoke      # the built CLI prints the package version
```

All checks must pass locally and in CI before review.

Install the local commit-message hook with `npm run hooks:install` (idempotent;
an existing hooks path is preserved). Rebuild with `npm run build` after changing
the validator. The hook requires a lowercase Conventional Commit subject, a
body explaining why and what was verified, and no tool attribution or shell
substitutions. Check a history range with `npm run commits:check -- base..head`;
PR CI uses the pull request's base and head automatically, without rewriting
existing history. Imperative wording is reviewed by people; syntax is checked
by code.

## Extensions

New providers, lenses, templates and profiles are welcome as manifests — see [docs/extending](./docs/extending/README.md).

## License

By contributing you agree that your contributions are licensed under the [MIT License](./LICENSE).
