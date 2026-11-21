# 0009 — Repo-first capability resolution through slots

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

**Amended 2026-11-21 (P9-02).** Description-only matches and automatically selected personal skills could replace relevant repository guidance with unrelated instructions. Description matches are now excluded; exact personal method names or explicit tags are offers only. Copies with identical normalized content are deduplicated. Personal discovery reads only the executing client’s skill locations by default, including its declared directory overrides; other clients are listed without reading their skill files until requested. An unknown client scans no personal files.

**Amended 2026-11-07 (P6-40).** Autonomous runs apply the same resolution at each repository's pinned base and pin the result into the plan, so workers that cannot load repository skills natively still receive them ([ADR-0207](./0207-public-implementation-route-composition.md#repository-guidance-in-workers-p6-40)). User-level skills are not candidates there.

A repository often already knows how it wants to be worked on: an implementation skill for its backend, a design-system guide, a review checklist, a PR template, the one command that really runs its tests. A generic harness that ignores those writes generic code and gets rejected by the team that owns the repo. A harness that *guesses* which repo skill to use is worse: it follows the wrong guide with confidence.

Repos also mix CLIs: a team on Codex may have its best guidance in `.claude/skills/`.

## Decision

1. **Steps declare named slots** — `build.frontend`, `build.design-system`, `verify.suite`, `review.rubric`, `open-pr.convention`, `spec.template`, `comms.voice`, … — instead of hard-coding guidance.
2. **`wl discover`** scans the repository deterministically: skills and agents in every CLI's folders, instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Cursor and Copilot rules), conventions, scripts and task runners, quality-tool configs, design-system assets. The result is a cached capability map.
3. **Precedence**, highest first:
   1. explicit binding in `.wholeloop/config.yml`;
   2. a repo skill tagged `metadata.wholeloop.slot`;
   3. a repo asset matched by deterministic, tested rules;
   4. the harness default.

   A personal skill is an optional offer, never an automatic fallback. A person can select it explicitly at run, project or user scope; that remembered binding then takes precedence.
4. **Ambiguity is a question.** Distinct equally ranked repository candidates produce one required question. An optional personal offer keeps the default selected. Every choice list starts with wholeloop’s default, and answers are validated against the offered candidates before any configuration is written.
5. **Bindings are visible** in every preflight; `wl resolve <slot>` explains the choice.
6. **Inside its slot, the repo wins.** The harness keeps only what no slot can override: decision points, coverage, the output contract and *ask, never guess*.

7. **Run choices are external configuration.** A versioned run-guidance file under the store’s `config/run-guidance/` directory is bound to its repository and run. This parallels user/project configuration without changing frozen event or output declarations. An anonymous pre-step question can return a run ID; the answer and repeated begin use it without creating an incomplete item. A started run cannot be reassigned to another item. Consumers use the enclosing step’s choices and, where applicable, its gate’s more specific choices. The answer names the file it changed.

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
| --- | --- |
| Harness defaults only | Generic results that ignore the repo |
| Let the model pick repo skills freely | Stochastic, untestable, invisible to the person |
| Select a personal name match automatically | Detection is not a choice; it can turn a globally installed method into unrelated project instructions |
| Journal guidance through an existing answer type with a different meaning | It would change a frozen event contract; run-specific preference configuration keeps the original journal meanings |
| Only read the current CLI's folders | Loses guidance written for another CLI in the same repo |

## Verification

`test/unit/discovery/personal-guidance.test.ts` covers unrelated descriptions and research suffixes, the seven clients and native folder layouts, explicit other-client inspection, duplicates, offered-value validation, external run preference files, anonymous pre-step choices and actual guidance consumption. Existing discovery, build, verify, review and Rollout tests cover the shared consumers.

## Links

- [Repo skills and slots](../configuration/repo-skills.md)
- [P1-07 — discover v1](../../roadmap/phase-1-walking-skeleton.md#p1-07--discover-v1-and-slot-resolution)

[◀ Decisions index](./README.md)
