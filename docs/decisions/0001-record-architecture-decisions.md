# 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

`throughline` encodes a way of working. Almost every rule in it looks technical — a default, a path, a threshold — and is really a stance about how work should happen. Those stances are the first thing a newcomer wants to change and the last thing anyone remembers the reason for. A harness that cannot explain its own rules invites people to delete the useful ones and keep the leftovers.

The project is also built across many short sessions, by people and agents who did not take part in earlier conversations. Reasoning that lives only in a chat transcript is lost the moment the session ends.

## Decision

Every decision that is expensive to reverse, or that someone will plausibly want to undo, is recorded as a short ADR in `docs/decisions/`, using the template in the [index](./README.md#template).

- One decision per file, numbered, never renumbered.
- Prompts, skills and docs **link** to the ADR instead of repeating its reasoning, which keeps them short ([ADR-0011](./0011-size-budgets-and-enforcement.md)).
- Changing a decision means writing a new ADR that supersedes the old one, not editing the old one.

## Consequences

### Positive

- The *why* survives sessions, contributors and time.
- Skills stay small: history and justification live here, not in the prompt.
- Debates end with a written outcome, including rejected options.

### Negative

- A small writing cost on every significant change.
- The index must be kept current — mitigated by the docs check in [P0-04](../../roadmap/phase-0-foundations.md#p0-04--documentation-tooling).

## Alternatives considered

| Option | Why not |
|---|---|
| Reasoning in commit messages | Scattered, hard to find, not linkable from docs |
| A single "design" document | Grows into a wall nobody reads; edits silently overwrite past reasoning |
| Comments in skills and prompts | Costs context on every run and rots with the code around it |

## Links

- [Documentation style](../contributing/docs-style.md)
- [ADR-0016 — Documentation is part of the product](./0016-documentation-is-part-of-the-product.md)

[◀ Decisions index](./README.md)
