# 0015 — Distribution: npm, plugin marketplaces, binaries later

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

People should get `wholeloop` the way they already install things for their CLI: a plugin command in Claude Code, a plugin or skills folder in Codex, Copilot or Cursor, a package manager for everything else. The core needs Node.js ([ADR-0003](./0003-deterministic-core-cli.md)), which some machines will not have — Claude Code, for one, no longer requires it.

Bare names like `wholeloop` are already taken on npm.

## Decision

1. **npm package** providing the `wl` command. Package name `wholeloop`, binary `wholeloop` with the short alias `wl` ([ADR-0018](./0018-project-name.md)); reserved in [P0-01](../../roadmap/phase-0-foundations.md#p0-01--names-package-and-repository-hygiene).
   - `wl install --target <cli,…> --scope user|project` generates and installs adapters.
2. **Claude Code plugin** via a marketplace in this repository, with the core **bundled as one self-contained JS file** — no separate install.
3. **Agent Plugins 1.0** root `plugin.json` for Codex, Cursor and Copilot, which read that format (Codex and Copilot also read the Claude marketplace file).
4. **Gemini CLI extension** in Phase 5; Antigravity has its own closed native plugin format, refined in [ADR-0055](./0055-antigravity-native-overlays-and-pinned-hook-transport.md).
5. **Compiled binaries later** (`bun build --compile`), attached to releases, for machines without Node.
6. **Docs need no hosting.** They are written to render on GitHub; no third-party documentation host is required.
7. **Repository:** `github.com/dreamingechoes/wholeloop`, a personal repository (never an organisation), **private** until the owner decides to open it — at the latest as part of the first public release ([P5-05](../../roadmap/phase-5-reach-release.md#p5-05--distribution)). Install paths in the docs that rely on a public repository (the plugin marketplace) only work from then on.
8. **Semantic versioning** from the first release; the JSON contract and the capability taxonomy are versioned separately and treated as public API.

## Consequences

### Positive

- Each audience installs with the tool they already use.
- Plugin users get everything in one step.
- One source of truth: every channel is built from the same canonical harness.

### Negative

- Several release channels to keep in sync — automated in the release pipeline ([P5-05](../../roadmap/phase-5-reach-release.md#p5-05--distribution)).
- Until binaries exist, non-plugin installs need Node.js; `wl doctor` and the install docs must say so plainly.

## Alternatives considered

| Option | Why not |
| --- | --- |
| npm only | Plugin users would need two installs |
| Binaries only | Larger release burden from day one; no plugin integration |
| A docs site on a third-party host | Unnecessary — GitHub renders the docs, Mermaid included |

## Links

- [Platforms — installing](../platforms/README.md#installing)
- [P5-05 — distribution](../../roadmap/phase-5-reach-release.md#p5-05--distribution)

[◀ Decisions index](./README.md)
