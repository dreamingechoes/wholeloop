# 0019 — TypeScript toolchain

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

[ADR-0003](./0003-deterministic-core-cli.md) chose TypeScript for the core. P0-02 needs the concrete toolchain: package manager, compiler, test runner, linter and formatter, bundler and CI. The criteria are speed (`npm run check` well under 30 seconds), few moving parts, a single bundled file that can ship inside plugins, and nothing a contributor has to install beyond Node.

## Decision

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | The published CLI supports **Node ≥ 20**; development needs **Node ≥ 22** (`.node-version`) | Dev-only tools (jsdom's HTTP client) need Node 22 APIs; the bundled CLI does not. CI builds on 22 and runs the bundle on 20 |
| Package manager | **npm** with a committed lockfile | One package, no workspaces: pnpm would add a tool without adding value. npm ships with Node, and supply-chain scanners that wrap npm keep working |
| Compiler / typecheck | TypeScript 7 (native compiler), `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` | Fast typecheck; strictness catches what tests would otherwise have to |
| Tests | Vitest | TypeScript without a build step, snapshots built in, fast |
| Lint and format | **Biome**, recommended preset | One fast tool and one config instead of ESLint + Prettier + plugins |
| Bundle | esbuild → `dist/wl.mjs`, one ESM file with a shebang | Plugins can ship the core as one self-contained file ([ADR-0015](./0015-distribution.md)) |
| Version | Injected at build time from `package.json` (`__WL_VERSION__`) | One source of truth; the smoke test compares the two |
| CI | GitHub Actions, pinned by commit SHA. `check` job (Ubuntu + macOS, Node 22): `npm ci` → `npm run check` → runtime audit. `runtime` job: build on 22, run the bundle on Node 20 | Reproducible, resistant to tag hijacking, and proves the support promise rather than assuming it |

Dependencies are pinned to **exact versions** that were published at least two weeks earlier, so a freshly compromised release has time to be caught before it reaches us.

## Consequences

### Positive

- `npm run check` (lint · typecheck · unit tests · markdownlint) runs in seconds.
- One command set for humans, agents and CI.

### Negative

- Known, documented dev-only advisories may exist at any time. Today: `braces` ≤ 3.0.3 (GHSA-vfj7-8cjw-p6xm, no fixed release yet) reaches us through `markdownlint-cli2`'s globbing, which only ever receives our own fixed patterns. CI audits runtime dependencies (none yet) at `high`; dev advisories are reviewed by hand.
- `overrides` force patched transitive versions where the parent pins a vulnerable one (`smol-toml` 1.9.0, `katex` 0.18.9 — the latter only used by markdownlint for math, which these docs do not contain — and `re2js` 2.8.7, which `markdownlint` 0.42.0 pins at 2.8.6 below its fix for quadratic-time lookbehind matching). Each override is removed once the parent catches up.

## Alternatives considered

| Option | Why not |
| --- | --- |
| pnpm | No workspaces to manage; one more tool to install |
| ESLint + Prettier | Two tools, several plugins, slower |
| tsup / Rollup | esbuild alone covers a single-entry CLI bundle |
| Bun as runtime | Not yet universal on contributor machines; stays an option for compiled binaries |

## Links

- [P0-02](../../roadmap/phase-0-foundations.md#p0-02--typescript-toolchain) · [ADR-0003](./0003-deterministic-core-cli.md) · [ADR-0015](./0015-distribution.md)

[◀ Decisions index](./README.md)
