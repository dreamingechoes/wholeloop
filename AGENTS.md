# AGENTS.md — working on wholeloop

Instructions for any coding agent (and any human) working **on this repository**. This file is about building `wholeloop`, not about using it.

## What this is

`wholeloop` is a CLI-agnostic AI development harness: four blocks (Define · Build · Rollout · Learn), thirteen steps, each usable on its own. A deterministic TypeScript core (`wl`) owns state, flow, config, discovery, providers and gates; short canonical skills and agents are generated into each agentic CLI's format. Start with `docs/concepts.md` and `docs/architecture/README.md`.

## Where things are

| Path | Contents |
| --- | --- |
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
7. When a task needs a choice that counts as an implementation refinement (an internal design choice, which task owns a piece of work, a conservative default, a narrower scope), choose the most conservative option that keeps every safety and authority guarantee. Record it in an ADR, or in the journal if it is minor, and keep going. Stop only for: (a) choices that widen authority, containment, credentials or who can approve; (b) publication to npm, real pushes to external services, or real PR, CI or merge trials against a hosted service; (c) work that needs installed, signed-in native clients or real model accounts. For (a), apply the most conservative choice and leave the wider option as a Proposed ADR plus a row in manual verification. For (b) and (c), finish everything that can be built and tested with fixtures and leave only the acceptance evidence open in manual verification; neither is a reason to leave a task's implementation undone.

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

Node ≥ 22 and npm for development; the published CLI runs on Node ≥ 20 ([ADR-0019](docs/decisions/0019-typescript-toolchain.md)).

```bash
npm ci
npm run check      # lint · types · tests · offline npm package · docs · harness — must be green
npm run lint:fix   # apply Biome's safe fixes and formatting
npm run build      # dist/wl.mjs, one bundled ESM file
npm run smoke      # the built CLI prints the package version
npm run package:check  # verify actual offline npm archive/install in a disposable prefix
npm run docs:nav   # regenerate every docnav footer after editing docs/nav.yml
npm run harness:check  # budgets, front matter and enforcement.yml (also part of check)
```

## Style for code

- TypeScript strict; small pure modules; no hidden I/O in core logic.
- Every command supports `--json` with a versioned schema.
- Prefer table-driven tests and fixtures over mocks.
