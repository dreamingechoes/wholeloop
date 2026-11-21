# Development — build, test and run wholeloop from source

> **TL;DR** — Clone, `npm ci`, `npm run build`, and run `node dist/wl.mjs` in place of `wl`. `npm run check` is the full gate and ends in `CHECK PASS` or `CHECK FAIL (<step>)`; `npm run check:fast` runs the same steps with only the related tests. Steps that execute project code need a local Docker daemon.

This page is for changing wholeloop. To use it, install the published package as the [README](../../README.md) describes.

## Contents

- [Requirements](#requirements)
- [Build from source](#build-from-source)
- [Use the source build](#use-the-source-build)
- [The gates](#the-gates)
- [Docker](#docker)
- [Commit hook](#commit-hook)
- [Other scripts](#other-scripts)

## Requirements

| Tool | Version | Why |
| --- | --- | --- |
| Node.js and npm | 22 or newer (22.23.1 and 24.22.0 are the checked versions) | Development tooling; the built CLI itself runs on Node 20 or newer |
| Git | 2.36 or newer | Unambiguous worktree ownership, including paths that contain newlines ([ADR-0138](../decisions/0138-unambiguous-git-worktree-runtime.md)) |
| Docker | Engine 28 or newer, local Linux daemon through a Unix socket | Steps and tests that execute project code never run it on the host ([execution isolation](../architecture/execution-isolation.md)) |

Prefer a checked Node version over an early minor release of a supported major: some development tools declare narrower engine ranges.

## Build from source

```bash
git clone https://github.com/dreamingechoes/wholeloop.git
cd wholeloop
npm ci
npm run build
node ./dist/wl.mjs --version
```

The build writes two bundled files, `dist/wl.mjs` (the CLI) and `dist/wl-runner.mjs` (the runner entry). Nothing is installed globally.

## Use the source build

Every `wl` command in the documentation works with the source build in its place. Keep an absolute path so it works from any directory:

```bash
export WHOLELOOP_CLI="$PWD/dist/wl.mjs"
node "$WHOLELOOP_CLI" install --target claude --scope user --dry-run --json
```

Export it again in a new terminal, and rebuild after pulling changes. To try the exact package that would be published, `npm run package:check` packs it and installs it offline into a disposable prefix.

## The gates

```bash
npm run check       # full gate: lint, types, all tests, offline package, docs, harness, maintainer tools, roadmap, dependencies, changelog, Markdown, Mermaid
npm run check:fast  # per-commit gate: same steps, only tests related to changed files, no offline install
npm run lint:fix    # apply Biome's safe fixes and formatting
npm run lint:md:fix # fix Markdown; prose uses one paragraph per source line
npm run docs:nav    # regenerate every docnav footer after editing docs/nav.yml
```

Trust only the last line: `CHECK PASS` or `CHECK FAIL (<step>)`. On a machine with few cores, `VITEST_MAX_WORKERS=2 npm run check` keeps the test step from starving Docker-backed tests. Run `check:fast` before each commit and the full gate before a push or when a task closes.

Generated references are checked by the gate; when it reports one as stale, regenerate it with `npm run docs:references`, `npm run docs:commands` or `npm run docs:config`. After editing `maintainer/`, run `npm run maintainer:render`.

## Docker

The verification, integration and acceptance paths build and run project code in containers through a Docker Engine reachable on a local Unix socket, with permission to create containers, local volumes and bridge networks. Remote, TCP and SSH contexts are refused. See [execution isolation](../architecture/execution-isolation.md).

## Commit hook

```bash
npm run hooks:install
```

The hook runs the built validator on every commit message: a lowercase Conventional Commit subject of at most 72 characters (a squash merge's `(#N)` suffix does not count), a body explaining why and what was verified, no tool attribution and no backticks or shell substitutions.

It is idempotent and preserves an existing hooks path. Check a range with `npm run commits:check -- base..head`; pull request CI also checks the title. Rebuild after changing the validator.

## Other scripts

The [experience evaluation](../../test/evals/experience/README.md) tests transcript parsers and budgets with synthetic fixtures in the ordinary suite. Its live entry point requires a dedicated signed-in client home and explicit quota confirmation; it never runs as part of the repository gate.

| Script | Purpose |
| --- | --- |
| `npm run eval:*` | Evaluation corpora and the Docker-backed delivery and runner checks; each prints its own result |
| `npm run perf:calibrate`, `npm run perf:route` | Measurement-only performance tools; see the maintainer skill `maint-investigate-performance` |
| `npm run scan:history` | Scan the published history for secrets with gitleaks in Docker ([release preparation](./releasing.md#audit-the-history-before-it-becomes-public)) |
| `npm run changelog` | Regenerate `CHANGELOG.md` from the release tags ([versions](./releasing.md#versions)) |
| `npm run docs:diagrams` | Render the README diagrams in `docs/assets/diagrams/` to SVG after editing their `.mmd` sources; needs Chrome or Chromium (`CHROME_PATH`) ([docs style](./docs-style.md#readme-diagrams)) |

How to work on a task, write commits and open pull requests is in the [contributing guide](../../CONTRIBUTING.md) and [AGENTS.md](../../AGENTS.md).

<!-- docnav -->
[◀ Decisions](../decisions/README.md)  ·  [📖 Docs index](../README.md)  ·  [🧭 Concepts](../concepts.md)  ·  [Authoring ▶](authoring.md)
