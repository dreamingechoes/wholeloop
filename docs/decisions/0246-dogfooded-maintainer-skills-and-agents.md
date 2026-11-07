# 0246 — Dogfooded maintainer skills and agents

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

The repository has a working agreement (AGENTS.md, the roadmap loop, docs style, ADR amendments, size budgets, the gates) that every contributor and coding agent must follow, and it supports seven coding clients. The maintainer decided that the repository's own tools are dogfooded: authored once in wholeloop's canonical format, rendered per client by the repository's own generator and committed, so a contributor who clones the repository uses them natively without installing `wl` (P7-01). They must never be confused with the harness wholeloop ships to users.

## Decision

- **Source.** Maintainer skills live in `maintainer/skills/<name>/` (a `SKILL.md` and any supporting files) and agents in `maintainer/agents/<name>.md`, in the same canonical format as `harness/`. The harness budgets (skills 120 lines, agents 60) and front-matter rules apply unchanged; names use the `maint-` prefix so they never collide with the shipped `wl-` entrypoints.
- **Rendering.** `npm run maintainer:render` renders every source into each supported client's project directories, as `installLocations` defines them for a project install: `.claude/`, `.agents/` (Codex skills and Antigravity), `.codex/agents/`, `.opencode/`, `.github/skills` and `.github/agents`, `.gemini/` and `.cursor/`. Skills are copied as written, because the Agent Skills format is the same for every supported client. Agents go through each client's adapter with the new `runtime: false` render option, which keeps the native tool, model and read-only mapping but drops the wholeloop runtime preamble and the `wl-` namespace.
- **Committed output and sync.** Rendered files are committed and carry a generated-file notice. `maintainer/rendered.json` records every rendered path with its digest and, per client, how read-only roles are enforced. `npm run maintainer:check`, a step of `npm run check`, fails on a hand-edited rendered file, a source changed without rendering, a missing file or a file no source renders any more. Rendering removes the files a previous render recorded and no source produces now, and never rewrites identical bytes.
- **Unsupported capabilities.** A client that cannot enforce a read-only role from the agent file (Codex inherits its parent's sandbox) is named in the manifest's `readOnly` mode and in the contributing guide; the agent text states the limitation as the shipped harness does.
- **Not shipped.** The renderer lives in `src/maintainer/` so it is typed and tested with the core, but no CLI entry point imports it, so the bundle never contains it; the script bundles it into a disposable directory. The package allowlist check publishes exactly the CLI, runner, LICENSE, README and package.json, and a test checks that the bundle contains no maintainer code.

## Alternatives rejected

- **Hand-written files per client.** Seven copies drift; the generator exists precisely to avoid that.
- **Generating at clone time with `wl`.** Contributors would need the built CLI before their client could see any repository tool.
- **A public `wl` command to render repository tools.** It would add a user-facing contract for a maintainer need; it can be designed later as a product feature if users ask for it.
- **Reusing the shipped skill renderers unchanged.** They inject the packaged-core launcher and protocol paths, which mean nothing in this repository.

## Consequences

A contributor's client discovers the maintainer tools on clone. Editing one means editing `maintainer/` and running `npm run maintainer:render`; the gate refuses anything else. The rendered directories also contain the client files, so a contributor's own local client settings must stay out of version control as before.

## Verification

`test/unit/maintainer/render.test.ts` renders a fixture skill and read-only agent for all seven clients, checks the runtime-free output and each client's read-only mapping, fails drift on a hand edit, an unrendered source change and a stale file, applies the budgets and front-matter rules to sources, and checks that the committed files are in sync and absent from the bundle.

[◀ Decisions index](./README.md)
