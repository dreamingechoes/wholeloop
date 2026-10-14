# 0018 — Project name: wholeloop

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The working name was `throughline`. Checking it for P0-01 showed it is crowded in exactly this space:

- the npm package `throughline` is an active tool for Claude Code, Codex and Cursor (memory hooks, about 4,000 weekly downloads, a `throughline` binary);
- a GitHub project of the same name describes itself as a Claude Code plugin going "from design to code";
- at least two more Claude-related repositories use the name.

Sharing a name with active tools for the same CLIs would confuse users, search results and package installs from day one.

## Decision

1. The project is named **`wholeloop`** — the whole loop: Define → Build → Rollout → Learn, and what is learned feeds the next idea.
2. The npm package is `wholeloop` (unscoped; free when checked on 2026-10-14). The binary is `wholeloop`, with the short alias **`wl`** used throughout the docs.
3. Generated names follow it: `/wholeloop:<step>` where the CLI has plugin namespaces, `wl-<step>` elsewhere; state under `$XDG_STATE_HOME/wholeloop`, config under `$XDG_CONFIG_HOME/wholeloop` and `<repo>/.wholeloop/`; `WL_WORKSPACE`; skill metadata keys `wholeloop.*`.
4. The repository is `github.com/dreamingechoes/wholeloop` (private, personal account — [ADR-0015](./0015-distribution.md)).

## Consequences

### Positive

- No collision on npm or GitHub with tools in the same space.
- The name states the project's distinctive promise: the loop closes after the merge, with measured impact.

### Negative

- The `wl` alias is short and generic; if a common tool claims it, the alias can be dropped and `wholeloop` remains.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep `throughline` under a personal npm scope | Avoids the npm clash but not the confusion with active projects of the same name |
| `fullarc`, `throughlane`, `impactline`, `harnessline` and others | All free; `wholeloop` was preferred for naming the loop the harness closes |

## Links

- [Distribution](./0015-distribution.md) · [P0-01](../../roadmap/phase-0-foundations.md#p0-01--names-package-and-repository-hygiene)

[◀ Decisions index](./README.md)
