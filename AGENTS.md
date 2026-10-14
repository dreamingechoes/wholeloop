# AGENTS.md — working on wholeloop

Instructions for any coding agent (and any human) working **on this repository**. This file is about building `wholeloop`, not about using it.

## What this is

`wholeloop` is a CLI-agnostic AI development harness: four blocks (Define · Build · Rollout · Learn), thirteen steps, each usable on its own. A deterministic TypeScript core (`wl`) owns state, flow, config, discovery, providers and gates; short canonical skills and agents are generated into each agentic CLI's format. Start with `docs/concepts.md` and `docs/architecture/README.md`.

## Where things are

| Path | Contents |
|---|---|
| `docs/` | The documentation — product, architecture, decisions (`docs/decisions/`) |
| `roadmap/` | Phases, session-sized tasks, and the journal |
| `src/` | The `wl` core (from P0-02) |
| `harness/` | Canonical skills, agents, protocols, workflows, manifests (from P1) |
| `test/` | Unit, snapshot, workflow, conformance, evals |

## How to work a session

1. Read this file, the last three entries in `roadmap/journal.md`, and the current phase file.
2. Take the first ⬜ task whose dependencies are ✅; mark it 🔄.
3. Do it end to end — code, tests and docs in the same change.
4. Tick every acceptance criterion; run all local checks.
5. Mark it ✅, add a journal entry, update status banners in the docs.
6. A design change gets a new ADR in the same change.

## Non-negotiables

- **Bootstrap workflow: commit straight to `main`.** Until the owner explicitly announces the switch to branches and pull requests, every change is committed directly on `main` — no feature branches, no PRs. The switch, when it comes, is recorded in `roadmap/journal.md` and this line is replaced.
- **English** for everything written into the repository.
- **Conventional commits**, one concern each, subject ≤ 72 characters, imperative.
- **No tool attribution — ever.** No `Co-Authored-By` trailers for AI tools, no "generated with" footers, no mention of the assistant that helped, in commits, PRs, changelogs or docs (ADR-0017).
- **Size budgets** for harness files (ADR-0011): skills ≤ 120 lines, agents ≤ 60, protocols ≤ 80, workflows ≤ 150.
- **Every hard rule has an enforcer** — code, test or lint — listed in `enforcement.yml`.
- **Determinism first.** If it has one right answer, it belongs in `src/`, with a test — not in a prompt.
- **Docs are part of the change.** Follow `docs/contributing/docs-style.md`: status banner, TL;DR, template, Mermaid palette, generated docnav (`docs/nav.yml`).
- **Original work.** Design every behaviour for a generic, maximally capable harness. Do not port wording or behaviour from any other project.
- **Never write runtime state into a repository**; state lives in the user's store (ADR-0004).

## Commands

Until P0-02 lands there is no build. Available today:

```bash
npx markdownlint-cli2 "**/*.md"   # must report 0 errors
```

Expected once the toolchain exists:

```bash
pnpm install
pnpm check        # lint · typecheck · unit · snapshot · docs check
pnpm test
pnpm build        # dist/wl.mjs
```

## Style for code

- TypeScript strict; small pure modules; no hidden I/O in core logic.
- Every command supports `--json` with a versioned schema.
- Prefer table-driven tests and fixtures over mocks.
