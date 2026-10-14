# 0009 — Repo-first capability resolution through slots

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

A repository often already knows how it wants to be worked on: an implementation skill for its backend, a design-system guide, a review checklist, a PR template, the one command that really runs its tests. A generic harness that ignores those writes generic code and gets rejected by the team that owns the repo. A harness that *guesses* which repo skill to use is worse: it follows the wrong guide with confidence.

Repos also mix CLIs: a team on Codex may have its best guidance in `.claude/skills/`.

## Decision

1. **Steps declare named slots** — `build.frontend`, `build.design-system`, `verify.suite`, `review.rubric`, `open-pr.convention`, `spec.template`, `comms.voice`, … — instead of hard-coding guidance.
2. **`tl discover`** scans the repository deterministically: skills and agents in every CLI's folders, instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Cursor and Copilot rules), conventions, scripts and task runners, quality-tool configs, design-system assets. The result is a cached capability map.
3. **Precedence**, highest first:
   1. explicit binding in `.throughline/config.yml`;
   2. a repo skill tagged `metadata.throughline.slot`;
   3. a repo asset matched by deterministic, tested rules;
   4. a skill the user installed;
   5. the harness default.
4. **Ambiguity is a question.** Two equal candidates or a low-confidence match produce one question; the answer becomes an explicit binding.
5. **Bindings are visible** in every preflight; `tl resolve <slot>` explains the choice.
6. **Inside its slot, the repo wins.** The harness keeps only what no slot can override: decision points, coverage, the output contract and *ask, never guess*.

## Consequences

### Positive

- Output follows the team's own conventions from the first run.
- Repo skills written for one CLI help users of every CLI.
- Deterministic matching is testable against fixture repositories.

### Negative

- Discovery rules need maintenance as CLIs add folders and formats.
- A repo with many overlapping skills may trigger a few questions on first use.

## Alternatives considered

| Option | Why not |
|---|---|
| Harness defaults only | Generic results that ignore the repo |
| Let the model pick repo skills freely | Stochastic, untestable, invisible to the person |
| Only read the current CLI's folders | Loses guidance written for another CLI in the same repo |

## Links

- [Repo skills and slots](../configuration/repo-skills.md)
- [P1-07 — discover v1](../../roadmap/phase-1-walking-skeleton.md#p1-07--discover-v1-and-slot-resolution)

[◀ Decisions index](./README.md)
